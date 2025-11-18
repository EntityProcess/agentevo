import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import { buildSearchRoots, resolveFileReference } from "./file-utils.js";
import type { GraderKind, JsonObject, JsonValue, TestCase, TestMessage } from "./types.js";
import { isGraderKind, isJsonObject, isTestMessage } from "./types.js";

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const ANSI_YELLOW = "\u001b[33m";
const ANSI_RESET = "\u001b[0m";
const SCHEMA_EVAL_V2 = "agentv-eval-v2";

/**
 * Determine whether a path references guideline content (instructions or prompts).
 */
export function isGuidelineFile(filePath: string): boolean {
  const normalized = filePath.split("\\").join("/");
  return (
    normalized.endsWith(".instructions.md") ||
    normalized.includes("/instructions/") ||
    normalized.endsWith(".prompt.md") ||
    normalized.includes("/prompts/")
  );
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

type RawTestCase = JsonObject & {
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
export async function loadTestCases(
  testFilePath: string,
  repoRoot: URL | string,
  options?: LoadOptions,
): Promise<readonly TestCase[]> {
  const verbose = options?.verbose ?? false;
  const absoluteTestPath = path.resolve(testFilePath);
  if (!(await fileExists(absoluteTestPath))) {
    throw new Error(`Test file not found: ${testFilePath}`);
  }

  const repoRootPath = resolveToAbsolutePath(repoRoot);
  const searchRoots = buildSearchRoots(absoluteTestPath, repoRootPath);

  const rawFile = await readFile(absoluteTestPath, "utf8");
  const parsed = parse(rawFile) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error(`Invalid test file format: ${testFilePath}`);
  }

  const suite = parsed as RawTestSuite;
  
  // Check $schema field to ensure V2 format
  const schema = suite.$schema;
  
  if (schema !== SCHEMA_EVAL_V2) {
    const message = typeof schema === 'string' 
      ? `Invalid $schema value '${schema}' in ${testFilePath}. Expected '${SCHEMA_EVAL_V2}'`
      : `Missing required field '$schema' in ${testFilePath}.\nPlease add '$schema: ${SCHEMA_EVAL_V2}' at the top of the file.`;
    throw new Error(message);
  }
  
  // V2 format: $schema is agentv-eval-v2
  const rawTestcases = suite.evalcases;
  if (!Array.isArray(rawTestcases)) {
    throw new Error(`Invalid test file format: ${testFilePath} - missing 'evalcases' field`);
  }

  const globalGrader = coerceGrader(suite.grader) ?? "llm_judge";
  const results: TestCase[] = [];

  for (const rawTestcase of rawTestcases) {
    if (!isJsonObject(rawTestcase)) {
      logWarning("Skipping invalid test case entry (expected object)");
      continue;
    }

    const testcase = rawTestcase as RawTestCase;
    const id = asString(testcase.id);
    const conversationId = asString(testcase.conversation_id);
    const outcome = asString(testcase.outcome);
    
    const inputMessagesValue = testcase.input_messages;
    const expectedMessagesValue = testcase.expected_messages;

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

    if (assistantMessages.length === 0) {
      logWarning(`No assistant message found for test case: ${id}`);
      continue;
    }

    if (assistantMessages.length > 1) {
      logWarning(`Multiple assistant messages found for test case: ${id}, using first`);
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
            if (isGuidelineFile(displayPath)) {
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

    const testCaseGrader = coerceGrader(testcase.grader) ?? globalGrader;

    const testCase: TestCase = {
      id,
      conversation_id: conversationId,
      task: userTextPrompt,
      user_segments: userSegments,
      expected_assistant_raw: expectedAssistantRaw,
      guideline_paths: guidelinePaths.map((guidelinePath) => path.resolve(guidelinePath)),
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
  testCase: TestCase,
): Promise<{ request: string; guidelines: string }> {
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

  return { request, guidelines };
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

function normalizeAssistantContent(content: TestMessage["content"] | undefined): string {
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
    const textValue = asString(entry["text"]);
    if (typeof textValue === "string") {
      parts.push(textValue);
      continue;
    }
    const valueValue = asString(entry["value"]);
    if (typeof valueValue === "string") {
      parts.push(valueValue);
      continue;
    }
    parts.push(JSON.stringify(entry));
  }
  return parts.join(" ");
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
