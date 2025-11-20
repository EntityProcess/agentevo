import micromatch from "micromatch";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import { buildDirectoryChain, buildSearchRoots, resolveFileReference } from "./file-utils.js";
import type { GraderKind, JsonObject, JsonValue, EvalCase, TestMessage } from "./types.js";
import { isGraderKind, isJsonObject, isTestMessage } from "./types.js";

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const ANSI_YELLOW = "\u001b[33m";
const ANSI_RESET = "\u001b[0m";
const SCHEMA_EVAL_V2 = "agentv-eval-v2";
const SCHEMA_CONFIG_V2 = "agentv-config-v2";

type AgentVConfig = {
  readonly $schema?: JsonValue;
  readonly guideline_patterns?: readonly string[];
};

/**
 * Load optional .agentv/config.yaml configuration file.
 * Searches from eval file directory up to repo root.
 */
async function loadConfig(evalFilePath: string, repoRoot: string): Promise<AgentVConfig | null> {
  const directories = buildDirectoryChain(evalFilePath, repoRoot);
  
  for (const directory of directories) {
    const configPath = path.join(directory, ".agentv", "config.yaml");
    
    if (!(await fileExists(configPath))) {
      continue;
    }
    
    try {
      const rawConfig = await readFile(configPath, "utf8");
      const parsed = parse(rawConfig) as unknown;
      
      if (!isJsonObject(parsed)) {
        logWarning(`Invalid .agentv/config.yaml format at ${configPath}`);
        continue;
      }
      
      const config = parsed as AgentVConfig;
      
      // Check $schema field to ensure V2 format
      const schema = config.$schema;
      
      if (schema !== SCHEMA_CONFIG_V2) {
        const message = typeof schema === 'string' 
          ? `Invalid $schema value '${schema}' in ${configPath}. Expected '${SCHEMA_CONFIG_V2}'`
          : `Missing required field '$schema' in ${configPath}.\nPlease add '$schema: ${SCHEMA_CONFIG_V2}' at the top of the file.`;
        logWarning(message);
        continue;
      }
      
      const guidelinePatterns = config.guideline_patterns;
      if (guidelinePatterns !== undefined && !Array.isArray(guidelinePatterns)) {
        logWarning(`Invalid guideline_patterns in ${configPath}, expected array`);
        continue;
      }
      
      if (Array.isArray(guidelinePatterns) && !guidelinePatterns.every((p) => typeof p === "string")) {
        logWarning(`Invalid guideline_patterns in ${configPath}, all entries must be strings`);
        continue;
      }
      
      return {
        guideline_patterns: guidelinePatterns as readonly string[] | undefined,
      };
    } catch (error) {
      logWarning(`Could not read .agentv/config.yaml at ${configPath}: ${(error as Error).message}`);
      continue;
    }
  }
  
  return null;
}

/**
 * Determine whether a path references guideline content (instructions or prompts).
 */
export function isGuidelineFile(filePath: string, patterns?: readonly string[]): boolean {
  const normalized = filePath.split("\\").join("/");
  const patternsToUse = patterns ?? [];
  
  return micromatch.isMatch(normalized, patternsToUse as string[]);
}

/**
 * Extract fenced code blocks from AgentV user segments.
 */
export function extractCodeBlocks(segments: readonly JsonObject[]): readonly string[] {
  const codeBlocks: string[] = [];
  for (const segment of segments) {
    const typeValue = segment["type"];
    if (typeof typeValue !== "string" || typeValue !== "text") {
      continue;
    }
    const textValue = segment["value"];
    if (typeof textValue !== "string") {
      continue;
    }
    const matches = textValue.match(CODE_BLOCK_PATTERN);
    if (matches) {
      codeBlocks.push(...matches);
    }
  }
  return codeBlocks;
}

type LoadOptions = {
  readonly verbose?: boolean;
};

type RawTestSuite = JsonObject & {
  readonly $schema?: JsonValue;
  readonly grader?: JsonValue;
  readonly evalcases?: JsonValue;
  readonly target?: JsonValue;
};

type RawEvalCase = JsonObject & {
  readonly id?: JsonValue;
  readonly conversation_id?: JsonValue;
  readonly outcome?: JsonValue;
  readonly input_messages?: JsonValue;
  readonly expected_messages?: JsonValue;
  readonly grader?: JsonValue;
  readonly execution?: JsonValue;
};

/**
 * Load eval cases from a AgentV YAML specification file.
 */
export async function loadEvalCases(
  evalFilePath: string,
  repoRoot: URL | string,
  options?: LoadOptions,
): Promise<readonly EvalCase[]> {
  const verbose = options?.verbose ?? false;
  const absoluteTestPath = path.resolve(evalFilePath);
  if (!(await fileExists(absoluteTestPath))) {
    throw new Error(`Test file not found: ${evalFilePath}`);
  }

  const repoRootPath = resolveToAbsolutePath(repoRoot);
  const searchRoots = buildSearchRoots(absoluteTestPath, repoRootPath);

  // Load configuration (walks up directory tree to repo root)
  const config = await loadConfig(absoluteTestPath, repoRootPath);
  const guidelinePatterns = config?.guideline_patterns;

  const rawFile = await readFile(absoluteTestPath, "utf8");
  const parsed = parse(rawFile) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error(`Invalid test file format: ${evalFilePath}`);
  }

  const suite = parsed as RawTestSuite;
  
  // Check $schema field to ensure V2 format
  const schema = suite.$schema;
  
  if (schema !== SCHEMA_EVAL_V2) {
    const message = typeof schema === 'string' 
      ? `Invalid $schema value '${schema}' in ${evalFilePath}. Expected '${SCHEMA_EVAL_V2}'`
      : `Missing required field '$schema' in ${evalFilePath}.\nPlease add '$schema: ${SCHEMA_EVAL_V2}' at the top of the file.`;
    throw new Error(message);
  }
  
  // V2 format: $schema is agentv-eval-v2
  const rawTestcases = suite.evalcases;
  if (!Array.isArray(rawTestcases)) {
    throw new Error(`Invalid test file format: ${evalFilePath} - missing 'evalcases' field`);
  }

  const globalGrader = coerceGrader(suite.grader) ?? "llm_judge";
  const results: EvalCase[] = [];

  for (const rawEvalcase of rawTestcases) {
    if (!isJsonObject(rawEvalcase)) {
      logWarning("Skipping invalid test case entry (expected object)");
      continue;
    }

    const evalcase = rawEvalcase as RawEvalCase;
    const id = asString(evalcase.id);
    const conversationId = asString(evalcase.conversation_id);
    const outcome = asString(evalcase.outcome);
    
    const inputMessagesValue = evalcase.input_messages;
    const expectedMessagesValue = evalcase.expected_messages;

    if (!id || !outcome || !Array.isArray(inputMessagesValue)) {
      logWarning(`Skipping incomplete test case: ${id ?? "unknown"}`);
      continue;
    }
    
    if (!Array.isArray(expectedMessagesValue)) {
      logWarning(`Test case '${id}' missing expected_messages array`);
      continue;
    }

    // V2 format: input_messages contains system/user, expected_messages contains assistant
    const inputMessages = inputMessagesValue.filter((msg): msg is TestMessage => isTestMessage(msg));
    const expectedMessages = expectedMessagesValue.filter((msg): msg is TestMessage => isTestMessage(msg));
    
    const assistantMessages = expectedMessages.filter((message) => message.role === "assistant");
    const userMessages = inputMessages.filter((message) => message.role === "user");
    const systemMessages = inputMessages.filter((message) => message.role === "system");

    if (assistantMessages.length === 0) {
      logWarning(`No assistant message found for test case: ${id}`);
      continue;
    }

    if (assistantMessages.length > 1) {
      logWarning(`Multiple assistant messages found for test case: ${id}, using first`);
    }

    if (systemMessages.length > 1) {
      logWarning(`Multiple system messages found for test case: ${id}, using first`);
    }

    // Extract system message content if present
    let systemMessageContent: string | undefined;
    if (systemMessages.length > 0) {
      const content = systemMessages[0]?.content;
      if (typeof content === "string") {
        systemMessageContent = content;
      } else if (Array.isArray(content)) {
        // For array content, extract text values
        const textParts: string[] = [];
        for (const segment of content) {
          if (isJsonObject(segment)) {
            const value = segment.value;
            if (typeof value === "string") {
              textParts.push(value);
            }
          }
        }
        if (textParts.length > 0) {
          systemMessageContent = textParts.join("\n\n");
        }
      }
    }

    const userSegments: JsonObject[] = [];
    const guidelinePaths: string[] = [];
    const userTextParts: string[] = [];

    for (const userMessage of userMessages) {
      const content = userMessage.content;
      if (typeof content === "string") {
        userSegments.push({ type: "text", value: content });
        userTextParts.push(content);
        continue;
      }

      for (const rawSegment of content) {
        if (!isJsonObject(rawSegment)) {
          continue;
        }

        const segmentType = asString(rawSegment.type);
        if (segmentType === "file") {
          const rawValue = asString(rawSegment.value);
          if (!rawValue) {
            continue;
          }

          const { displayPath, resolvedPath, attempted } = await resolveFileReference(
            rawValue,
            searchRoots,
          );

          if (!resolvedPath) {
            const attempts = attempted.length
              ? ["  Tried:", ...attempted.map((candidate) => `    ${candidate}`)]
              : undefined;
            logWarning(`File not found: ${displayPath}`, attempts);
            continue;
          }

          try {
            const fileContent = (await readFile(resolvedPath, "utf8")).replace(/\r\n/g, "\n");
            
            // Calculate path relative to repo root for matching to handle ".." in displayPath
            const relativeToRepo = path.relative(repoRootPath, resolvedPath);

            if (isGuidelineFile(relativeToRepo, guidelinePatterns)) {
              guidelinePaths.push(path.resolve(resolvedPath));
              if (verbose) {
                console.log(`  [Guideline] Found: ${displayPath}`);
                console.log(`    Resolved to: ${resolvedPath}`);
              }
            } else {
              userSegments.push({
                type: "file",
                path: displayPath,
                text: fileContent,
                resolvedPath: path.resolve(resolvedPath),
              });
              if (verbose) {
                console.log(`  [File] Found: ${displayPath}`);
                console.log(`    Resolved to: ${resolvedPath}`);
              }
            }
          } catch (error) {
            logWarning(`Could not read file ${resolvedPath}: ${(error as Error).message}`);
          }
          continue;
        }

        const clonedSegment = cloneJsonObject(rawSegment);
        userSegments.push(clonedSegment);
        const inlineValue = clonedSegment.value;
        if (typeof inlineValue === "string") {
          userTextParts.push(inlineValue);
        }
      }
    }

    const codeSnippets = extractCodeBlocks(userSegments);
    const assistantContent = assistantMessages[0]?.content;
    const expectedAssistantRaw = await resolveAssistantContent(assistantContent, searchRoots, verbose);
    const userTextPrompt = userTextParts
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(" ");

    const testCaseGrader = coerceGrader(evalcase.grader) ?? globalGrader;

    // Extract file paths from user_segments (non-guideline files)
    const userFilePaths: string[] = [];
    for (const segment of userSegments) {
      if (segment.type === "file" && typeof segment.resolvedPath === "string") {
        userFilePaths.push(segment.resolvedPath);
      }
    }

    // Combine all file paths (guidelines + regular files)
    const allFilePaths = [
      ...guidelinePaths.map((guidelinePath) => path.resolve(guidelinePath)),
      ...userFilePaths,
    ];

    const testCase: EvalCase = {
      id,
      conversation_id: conversationId,
      task: userTextPrompt,
      user_segments: userSegments,
      system_message: systemMessageContent,
      expected_assistant_raw: expectedAssistantRaw,
      guideline_paths: guidelinePaths.map((guidelinePath) => path.resolve(guidelinePath)),
      guideline_patterns: guidelinePatterns,
      file_paths: allFilePaths,
      code_snippets: codeSnippets,
      outcome,
      grader: testCaseGrader,
    };

    if (verbose) {
      console.log(`\n[Test Case: ${id}]`);
      if (testCase.guideline_paths.length > 0) {
        console.log(`  Guidelines used: ${testCase.guideline_paths.length}`);
        for (const guidelinePath of testCase.guideline_paths) {
          console.log(`    - ${guidelinePath}`);
        }
      } else {
        console.log("  No guidelines found");
      }
    }

    results.push(testCase);
  }

  return results;
}

/**
 * Build prompt inputs by consolidating user request context and guideline content.
 */
export async function buildPromptInputs(
  testCase: EvalCase,
): Promise<{ request: string; guidelines: string; systemMessage?: string }> {
  const guidelineContents: string[] = [];
  for (const rawPath of testCase.guideline_paths) {
    const absolutePath = path.resolve(rawPath);
    if (!(await fileExists(absolutePath))) {
      logWarning(`Could not read guideline file ${absolutePath}: file does not exist`);
      continue;
    }

    try {
      const content = (await readFile(absolutePath, "utf8")).replace(/\r\n/g, "\n");
      guidelineContents.push(`=== ${path.basename(absolutePath)} ===\n${content}`);
    } catch (error) {
      logWarning(`Could not read guideline file ${absolutePath}: ${(error as Error).message}`);
    }
  }

  const requestParts: string[] = [];
  for (const segment of testCase.user_segments) {
    const typeValue = segment.type;
    if (typeof typeValue === "string" && typeValue === "file") {
      const pathValue = segment.path;
      const textValue = segment.text;
      const label = typeof pathValue === "string" ? pathValue : "file";
      const body = typeof textValue === "string" ? textValue : "";
      requestParts.push(`=== ${label} ===\n${body}`);
      continue;
    }

    if (typeof typeValue === "string" && typeValue === "text") {
      const value = segment.value;
      if (typeof value === "string") {
        requestParts.push(value);
      }
      continue;
    }

    const genericValue = segment.value;
    if (typeof genericValue === "string") {
      requestParts.push(genericValue);
    }
  }

  if (testCase.code_snippets.length > 0) {
    requestParts.push(testCase.code_snippets.join("\n"));
  }

  const request = requestParts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");

  const guidelines = guidelineContents
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");

  return { request, guidelines, systemMessage: testCase.system_message };
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveToAbsolutePath(candidate: URL | string): string {
  if (candidate instanceof URL) {
    return fileURLToPath(candidate);
  }
  if (typeof candidate === "string") {
    if (candidate.startsWith("file://")) {
      return fileURLToPath(new URL(candidate));
    }
    return path.resolve(candidate);
  }
  throw new TypeError("Unsupported repoRoot value. Expected string or URL.");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function cloneJsonObject(source: JsonObject): JsonObject {
  const entries = Object.entries(source).map(([key, value]) => [key, cloneJsonValue(value)]);
  return Object.fromEntries(entries) as JsonObject;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as readonly JsonValue[];
  }
  return cloneJsonObject(value as JsonObject);
}

/**
 * Resolve assistant content including file references.
 * Similar to input message processing, but for expected assistant responses.
 */
async function resolveAssistantContent(
  content: TestMessage["content"] | undefined,
  searchRoots: readonly string[],
  verbose: boolean,
): Promise<string> {
  if (typeof content === "string") {
    return content;
  }
  if (!content) {
    return "";
  }
  
  const parts: string[] = [];
  for (const entry of content) {
    if (typeof entry === "string") {
      parts.push(entry);
      continue;
    }
    
    if (!isJsonObject(entry)) {
      continue;
    }
    
    const segmentType = asString(entry.type);
    
    // Handle file references
    if (segmentType === "file") {
      const rawValue = asString(entry.value);
      if (!rawValue) {
        continue;
      }
      
      const { displayPath, resolvedPath, attempted } = await resolveFileReference(
        rawValue,
        searchRoots,
      );
      
      if (!resolvedPath) {
        const attempts = attempted.length
          ? ["  Tried:", ...attempted.map((candidate) => `    ${candidate}`)]
          : undefined;
        logWarning(`File not found in expected_messages: ${displayPath}`, attempts);
        continue;
      }
      
      try {
        const fileContent = (await readFile(resolvedPath, "utf8")).replace(/\r\n/g, "\n");
        parts.push(fileContent);
        if (verbose) {
          console.log(`  [Expected Assistant File] Found: ${displayPath}`);
          console.log(`    Resolved to: ${resolvedPath}`);
        }
      } catch (error) {
        logWarning(`Could not read file ${resolvedPath}: ${(error as Error).message}`);
      }
      continue;
    }
    
    // Handle text segments
    const textValue = asString(entry.text);
    if (typeof textValue === "string") {
      parts.push(textValue);
      continue;
    }
    
    const valueValue = asString(entry.value);
    if (typeof valueValue === "string") {
      parts.push(valueValue);
      continue;
    }
    
    parts.push(JSON.stringify(entry));
  }
  return parts.join(" ");
}

function coerceGrader(candidate: JsonValue | undefined): GraderKind | undefined {
  if (typeof candidate !== "string") {
    return undefined;
  }
  if (isGraderKind(candidate)) {
    return candidate;
  }
  logWarning(`Unknown grader '${candidate}', falling back to default`);
  return undefined;
}

function logWarning(message: string, details?: readonly string[]): void {
  if (details && details.length > 0) {
    const detailBlock = details.join("\n");
    console.warn(`${ANSI_YELLOW}Warning: ${message}\n${detailBlock}${ANSI_RESET}`);
  } else {
    console.warn(`${ANSI_YELLOW}Warning: ${message}${ANSI_RESET}`);
  }
}
