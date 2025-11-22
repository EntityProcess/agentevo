import { readFile } from "node:fs/promises";
import path from "node:path";
import { dispatchAgentSession, dispatchBatchAgent, getSubagentRoot, provisionSubagents } from "subagent";

import { buildPromptDocument, normalizeInputFiles } from "./preread.js";
import type { VSCodeResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

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

    const inputFiles = normalizeInputFiles(request.inputFiles);
    const promptContent = buildPromptDocument(request, inputFiles);

    const session = await dispatchAgentSession({
      userQuery: promptContent,  // Use full prompt content instead of just request.prompt
      extraAttachments: inputFiles,
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
          inputFiles,
        },
      };
    }

    const responseText = await readFile(session.responseFile, "utf8");

    return {
      text: responseText,
      raw: {
        session,
        inputFiles,
      },
    };
  }

  async invokeBatch(requests: readonly ProviderRequest[]): Promise<readonly ProviderResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    const normalizedRequests = requests.map((req) => ({
      request: req,
      inputFiles: normalizeInputFiles(req.inputFiles),
    }));

    const combinedInputFiles = mergeInputFiles(
      normalizedRequests.map(({ inputFiles }) => inputFiles),
    );
    const userQueries = normalizedRequests.map(({ request, inputFiles }) =>
      buildPromptDocument(request, inputFiles),
    );

    const session = await dispatchBatchAgent({
      userQueries,
      extraAttachments: combinedInputFiles,
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
      return normalizedRequests.map(({ inputFiles }) => ({
        text: "",
        raw: {
          session,
          inputFiles,
          allInputFiles: combinedInputFiles,
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
          inputFiles: normalizedRequests[index]?.inputFiles,
          allInputFiles: combinedInputFiles,
          responseFile,
        },
      });
    }

    return responses;
  }
}

function mergeInputFiles(all: readonly (readonly string[] | undefined)[]): string[] | undefined {
  const deduped = new Set<string>();
  for (const list of all) {
    if (!list) continue;
    for (const inputFile of list) {
      deduped.add(path.resolve(inputFile));
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
