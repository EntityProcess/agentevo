import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchAgentSession } from "subagent";

import type { VSCodeResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const PROMPT_FILE_PREFIX = "bbeval-vscode-";

export class VSCodeProvider implements Provider {
  readonly id: string;
  readonly kind: "vscode" | "vscode-insiders";
  readonly targetName: string;

  private readonly config: VSCodeResolvedConfig;

  constructor(targetName: string, config: VSCodeResolvedConfig, kind: "vscode" | "vscode-insiders") {
    this.id = `${kind}:${targetName}`;
    this.kind = kind;
    this.targetName = targetName;
    this.config = config;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.signal?.aborted) {
      throw new Error("VS Code provider request was aborted before dispatch");
    }

    const promptContent = buildPromptDocument(request);
    const directory = await mkdtemp(path.join(tmpdir(), PROMPT_FILE_PREFIX));
    const promptPath = path.join(directory, `${request.testCaseId ?? "request"}.prompt.md`);

    try {
      await writeFile(promptPath, promptContent, "utf8");

      const attachments = normalizeAttachments(request.attachments);
      const session = await dispatchAgentSession({
        userQuery: composeUserQuery(request),
        promptFile: promptPath,
        extraAttachments: attachments,
        wait: this.config.waitForResponse,
        dryRun: this.config.dryRun,
        vscodeCmd: this.config.command,
        subagentRoot: this.config.subagentRoot,
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

function buildPromptDocument(request: ProviderRequest): string {
  const parts: string[] = [];
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

  if (request.attachments && request.attachments.length > 0) {
    const attachmentList = request.attachments.map((item) => `- ${item}`).join("\n");
    parts.push("\n## Attachments\n", attachmentList);
  }

  return parts.join("\n").trim();
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
