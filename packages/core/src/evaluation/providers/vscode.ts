import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchAgentSession, getSubagentRoot, provisionSubagents } from "subagent";

import type { VSCodeResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const PROMPT_FILE_PREFIX = "bbeval-vscode-";

export class VSCodeProvider implements Provider {
  readonly id: string;
  readonly kind: "vscode" | "vscode-insiders";
  readonly targetName: string;

  private readonly config: VSCodeResolvedConfig;

  constructor(
    targetName: string,
    config: VSCodeResolvedConfig,
    kind: "vscode" | "vscode-insiders",
  ) {
    this.id = `${kind}:${targetName}`;
    this.kind = kind;
    this.targetName = targetName;
    this.config = config;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.signal?.aborted) {
      throw new Error("VS Code provider request was aborted before dispatch");
    }

    const attachments = normalizeAttachments(request.attachments);
    const promptContent = buildPromptDocument(request, attachments);
    const directory = await mkdtemp(path.join(tmpdir(), PROMPT_FILE_PREFIX));
    const promptPath = path.join(directory, `${request.testCaseId ?? "request"}.prompt.md`);

    try {
      await writeFile(promptPath, promptContent, "utf8");

      const session = await dispatchAgentSession({
        userQuery: composeUserQuery(request),
        promptFile: promptPath,
        extraAttachments: attachments,
        wait: this.config.waitForResponse,
        dryRun: this.config.dryRun,
        vscodeCmd: this.config.command,
        subagentRoot: this.config.subagentRoot,
        workspaceTemplate: this.config.workspaceTemplate,
        silent: true,
      });

      if (session.exitCode !== 0 || !session.responseFile) {
        const failure = session.error ?? "VS Code subagent did not produce a response";
        throw new Error(failure);
      }

      if (this.config.dryRun) {
        return {
          text: "",
          raw: {
            session,
            promptFile: promptPath,
            attachments,
          },
        };
      }

      const responseText = await readFile(session.responseFile, "utf8");

      return {
        text: responseText,
        raw: {
          session,
          promptFile: promptPath,
          attachments,
        },
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function buildPromptDocument(
  request: ProviderRequest,
  attachments: readonly string[] | undefined,
): string {
  const parts: string[] = [];

  const instructionFiles = collectInstructionFiles(attachments);
  if (instructionFiles.length > 0) {
    parts.push(buildMandatoryPrereadBlock(instructionFiles));
  }

  parts.push(`# BbEval Request`);
  if (request.testCaseId) {
    parts.push(`- Test Case: ${request.testCaseId}`);
  }
  if (request.metadata?.target) {
    parts.push(`- Target: ${String(request.metadata.target)}`);
  }

  parts.push("\n## Task\n", request.prompt.trim());

  if (request.guidelines && request.guidelines.trim().length > 0) {
    parts.push("\n## Guidelines\n", request.guidelines.trim());
  }

  if (attachments && attachments.length > 0) {
    const attachmentList = attachments.map((item) => `- ${item}`).join("\n");
    parts.push("\n## Attachments\n", attachmentList);
  }

  return parts.join("\n").trim();
}

function buildMandatoryPrereadBlock(instructionFiles: readonly string[]): string {
  if (instructionFiles.length === 0) {
    return "";
  }

  const fileList: string[] = [];
  const tokenList: string[] = [];
  let counter = 0;

  for (const absolutePath of instructionFiles) {
    counter += 1;
    const fileName = path.basename(absolutePath);
    const fileUri = pathToFileUri(absolutePath);
    fileList.push(`[${fileName}](${fileUri})`);
    tokenList.push(`INSTRUCTIONS_READ: \`${fileName}\` i=${counter} SHA256=<hex>`);
  }

  const filesText = fileList.join(", ");
  const tokensText = tokenList.join("\n");

  const instruction = [
    `Read all instruction files: ${filesText}.`,
    `After reading each file, compute its SHA256 hash using this PowerShell command:`,
    "`Get-FileHash -Algorithm SHA256 -LiteralPath '<file-path>' | Select-Object -ExpandProperty Hash`.",
    `Then include, at the top of your reply, these exact tokens on separate lines:\n`,
    tokensText,
    `\nReplace \`<hex>\` with the actual SHA256 hash value computed from the PowerShell command.`,
    `If any file is missing, fail with ERROR: missing-file <filename> and stop.\n`,
    `Then fetch all documentation required by the instructions before proceeding with your task.`,
  ].join(" ");

  return `[[ ## mandatory_pre_read ## ]]\n\n${instruction}\n\n`;
}

function collectInstructionFiles(attachments: readonly string[] | undefined): string[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const unique = new Map<string, string>();
  for (const attachment of attachments) {
    if (!isInstructionPath(attachment)) {
      continue;
    }
    const absolutePath = path.resolve(attachment);
    if (!unique.has(absolutePath)) {
      unique.set(absolutePath, absolutePath);
    }
  }

  return Array.from(unique.values());
}

function isInstructionPath(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join("/");
  return (
    normalized.endsWith(".instructions.md") ||
    normalized.includes("/instructions/") ||
    normalized.endsWith(".prompt.md") ||
    normalized.includes("/prompts/")
  );
}

function pathToFileUri(filePath: string): string {
  // Convert to absolute path if relative
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

  // On Windows, convert backslashes to forward slashes
  const normalizedPath = absolutePath.replace(/\\/g, "/");

  // Handle Windows drive letters (e.g., C:/ becomes file:///C:/)
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${normalizedPath}`;
  }

  // Unix-like paths
  return `file://${normalizedPath}`;
}

function composeUserQuery(request: ProviderRequest): string {
  const segments: string[] = [];
  segments.push(request.prompt.trim());
  if (request.guidelines && request.guidelines.trim().length > 0) {
    segments.push("\nGuidelines:\n", request.guidelines.trim());
  }
  return segments.join("\n").trim();
}

function normalizeAttachments(attachments: readonly string[] | undefined): string[] | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }
  const deduped = new Set<string>();
  for (const attachment of attachments) {
    deduped.add(path.resolve(attachment));
  }
  return Array.from(deduped);
}

export interface EnsureSubagentsOptions {
  readonly kind: "vscode" | "vscode-insiders";
  readonly count: number;
  readonly verbose?: boolean;
}

export interface EnsureSubagentsResult {
  readonly provisioned: boolean;
  readonly message?: string;
}

/**
 * Ensures the required number of VSCode subagents are provisioned using the subagent package.
 * This guarantees version compatibility by using the same subagent package version.
 * 
 * @param options - Configuration for subagent provisioning
 * @returns Information about the provisioning result
 */
export async function ensureVSCodeSubagents(
  options: EnsureSubagentsOptions,
): Promise<EnsureSubagentsResult> {
  const { kind, count, verbose = false } = options;
  const vscodeCmd = kind === "vscode-insiders" ? "code-insiders" : "code";
  const subagentRoot = getSubagentRoot(vscodeCmd);
  
  try {
    if (verbose) {
      console.log(`Provisioning ${count} subagent(s) via: subagent ${vscodeCmd} provision`);
    }
    
    const result = await provisionSubagents({
      targetRoot: subagentRoot,
      subagents: count,
      dryRun: false,
    });
    
    if (verbose) {
      if (result.created.length > 0) {
        console.log(`Created ${result.created.length} new subagent(s)`);
      }
      if (result.skippedExisting.length > 0) {
        console.log(`Reusing ${result.skippedExisting.length} existing unlocked subagent(s)`);
      }
      console.log(`\ntotal unlocked subagents available: ${result.created.length + result.skippedExisting.length}`);
    }
    
    return {
      provisioned: true,
      message: `Provisioned ${count} subagent(s): ${result.created.length} created, ${result.skippedExisting.length} reused`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Don't fail if provisioning fails - agents might already exist
    if (verbose) {
      console.warn(`Provisioning failed (continuing anyway): ${errorMessage}`);
    }
    
    return {
      provisioned: false,
      message: `Provisioning failed: ${errorMessage}`,
    };
  }
}
