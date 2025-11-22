import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchAgentSession, dispatchBatchAgent, getSubagentRoot, provisionSubagents } from "subagent";

import { isGuidelineFile } from "../yaml-parser.js";
import type { VSCodeResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const PROMPT_FILE_PREFIX = "agentv-vscode-";

export class VSCodeProvider implements Provider {
  readonly id: string;
  readonly kind: "vscode" | "vscode-insiders";
  readonly targetName: string;
  readonly supportsBatch = true;

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
    const promptContent = buildPromptDocument(request, attachments, request.guideline_patterns);

    const session = await dispatchAgentSession({
      userQuery: promptContent,  // Use full prompt content instead of just request.prompt
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
          attachments,
        },
      };
    }

    const responseText = await readFile(session.responseFile, "utf8");

    return {
      text: responseText,
      raw: {
        session,
        attachments,
      },
    };
  }

  async invokeBatch(requests: readonly ProviderRequest[]): Promise<readonly ProviderResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    const normalizedRequests = requests.map((req) => ({
      request: req,
      attachments: normalizeAttachments(req.attachments),
    }));

    const combinedAttachments = mergeAttachments(
      normalizedRequests.map(({ attachments }) => attachments),
    );
    const userQueries = normalizedRequests.map(({ request, attachments }) =>
      buildPromptDocument(request, attachments, request.guideline_patterns),
    );

    const session = await dispatchBatchAgent({
      userQueries,
      extraAttachments: combinedAttachments,
      wait: this.config.waitForResponse,
      dryRun: this.config.dryRun,
      vscodeCmd: this.config.command,
      subagentRoot: this.config.subagentRoot,
      workspaceTemplate: this.config.workspaceTemplate,
      silent: true,
    });

    if (session.exitCode !== 0 || !session.responseFiles) {
      const failure = session.error ?? "VS Code subagent did not produce batch responses";
      throw new Error(failure);
    }

    if (this.config.dryRun) {
      return normalizedRequests.map(({ attachments }) => ({
        text: "",
        raw: {
          session,
          attachments,
          allAttachments: combinedAttachments,
        },
      }));
    }

    if (session.responseFiles.length !== requests.length) {
      throw new Error(
        `VS Code batch returned ${session.responseFiles.length} responses for ${requests.length} requests`,
      );
    }

    const responses: ProviderResponse[] = [];
    for (const [index, responseFile] of session.responseFiles.entries()) {
      const responseText = await readFile(responseFile, "utf8");
      responses.push({
        text: responseText,
        raw: {
          session,
          attachments: normalizedRequests[index]?.attachments,
          allAttachments: combinedAttachments,
          responseFile,
        },
      });
    }

    return responses;
  }
}

function buildPromptDocument(
  request: ProviderRequest,
  attachments: readonly string[] | undefined,
  guidelinePatterns: readonly string[] | undefined,
): string {
  const parts: string[] = [];

  const guidelineFiles = collectGuidelineFiles(attachments, guidelinePatterns);
  const attachmentFiles = collectAttachmentFiles(attachments);

  const nonGuidelineAttachments = attachmentFiles.filter(
    (file) => !guidelineFiles.includes(file),
  );

  const prereadBlock = buildMandatoryPrereadBlock(guidelineFiles, nonGuidelineAttachments);
  if (prereadBlock.length > 0) {
    parts.push("\n", prereadBlock);
  }

  parts.push("\n[[ ## user_query ## ]]\n", request.prompt.trim());

  return parts.join("\n").trim();
}

function buildMandatoryPrereadBlock(
  guidelineFiles: readonly string[],
  attachmentFiles: readonly string[],
): string {
  if (guidelineFiles.length === 0 && attachmentFiles.length === 0) {
    return "";
  }

  const buildList = (files: readonly string[]): string[] =>
    files.map((absolutePath) => {
      const fileName = path.basename(absolutePath);
      const fileUri = pathToFileUri(absolutePath);
      return `* [${fileName}](${fileUri})`;
    });

  const sections: string[] = [];
  if (guidelineFiles.length > 0) {
    sections.push(`Read all guideline files:\n${buildList(guidelineFiles).join("\n")}.`);
  }

  if (attachmentFiles.length > 0) {
    sections.push(`Read all attachment files:\n${buildList(attachmentFiles).join("\n")}.`);
  }

  sections.push(
    "If any file is missing, fail with ERROR: missing-file <filename> and stop.",
    "Then apply system_instructions on the user query below.",
  );

  return sections.join("\n");
}

function collectGuidelineFiles(
  attachments: readonly string[] | undefined,
  guidelinePatterns: readonly string[] | undefined,
): string[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const unique = new Map<string, string>();
  for (const attachment of attachments) {
    const absolutePath = path.resolve(attachment);
    const normalized = absolutePath.split(path.sep).join("/");
    
    if (isGuidelineFile(normalized, guidelinePatterns)) {
      if (!unique.has(absolutePath)) {
        unique.set(absolutePath, absolutePath);
      }
    }
  }

  return Array.from(unique.values());
}

function collectAttachmentFiles(
  attachments: readonly string[] | undefined,
): string[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  const unique = new Map<string, string>();
  for (const attachment of attachments) {
    const absolutePath = path.resolve(attachment);
    if (!unique.has(absolutePath)) {
      unique.set(absolutePath, absolutePath);
    }
  }
  return Array.from(unique.values());
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
  // For VS Code, guidelines are handled via file attachments
  // Do NOT include guideline content in the user query
  return request.prompt.trim();
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

function mergeAttachments(all: readonly (readonly string[] | undefined)[]): string[] | undefined {
  const deduped = new Set<string>();
  for (const list of all) {
    if (!list) continue;
    for (const attachment of list) {
      deduped.add(path.resolve(attachment));
    }
  }
  return deduped.size > 0 ? Array.from(deduped) : undefined;
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
