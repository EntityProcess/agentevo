import { exec as execWithCallback, type ExecException, type ExecOptions } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { CliResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const execAsync = promisify(execWithCallback);
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB to accommodate verbose CLI output

export interface CommandRunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface CommandRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly failed: boolean;
  readonly timedOut?: boolean;
  readonly signal?: NodeJS.Signals | null;
}

export type CommandRunner = (command: string, options: CommandRunOptions) => Promise<CommandRunResult>;

async function defaultCommandRunner(
  command: string,
  options: CommandRunOptions,
): Promise<CommandRunResult> {
  const execOptions: ExecOptions = {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    signal: options.signal,
    maxBuffer: DEFAULT_MAX_BUFFER,
  };

  try {
    const { stdout, stderr } = await execAsync(command, execOptions);
    return {
      stdout,
      stderr,
      exitCode: 0,
      failed: false,
      timedOut: false,
      signal: null,
    };
  } catch (error) {
    const execError = error as ExecException & {
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
      killed?: boolean;
    };

    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: typeof execError.code === "number" ? execError.code : null,
      failed: true,
      timedOut: execError.timedOut === true || execError.killed === true,
      signal: execError.signal ?? null,
    };
  }
}

export class CliProvider implements Provider {
  readonly id: string;
  readonly kind = "cli";
  readonly targetName: string;
  readonly supportsBatch = false;

  private readonly config: CliResolvedConfig;
  private readonly runCommand: CommandRunner;
  private healthcheckPromise?: Promise<void>;

  constructor(targetName: string, config: CliResolvedConfig, runner: CommandRunner = defaultCommandRunner) {
    this.targetName = targetName;
    this.id = `cli:${targetName}`;
    this.config = config;
    this.runCommand = runner;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.signal?.aborted) {
      throw new Error("CLI provider request was aborted before execution");
    }

    await this.ensureHealthy(request.signal);

    const templateValues = buildTemplateValues(request, this.config);
    const renderedCommand = renderTemplate(this.config.commandTemplate, templateValues);

    const env = this.config.env ? { ...process.env, ...this.config.env } : process.env;
    const result = await this.runCommand(renderedCommand, {
      cwd: this.config.cwd,
      env,
      timeoutMs: this.config.timeoutMs,
      signal: request.signal,
    });

    if (result.failed || (result.exitCode ?? 0) !== 0) {
      if (request.signal?.aborted) {
        throw new Error("CLI provider request was aborted");
      }
      if (result.timedOut) {
        throw new Error(
          `CLI provider timed out${formatTimeoutSuffix(this.config.timeoutMs ?? undefined)}`,
        );
      }
      const codeText = result.exitCode !== null ? result.exitCode : "unknown";
      const detail = result.stderr.trim() || result.stdout.trim();
      const message = detail ? `${detail} (exit code ${codeText})` : `CLI exited with code ${codeText}`;
      throw new Error(message);
    }

    return {
      text: result.stdout,
      raw: {
        command: renderedCommand,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        cwd: this.config.cwd,
      },
    };
  }

  private async ensureHealthy(signal?: AbortSignal): Promise<void> {
    if (!this.config.healthcheck) {
      return;
    }
    if (!this.healthcheckPromise) {
      this.healthcheckPromise = this.runHealthcheck(this.config.healthcheck, signal);
    }
    return this.healthcheckPromise;
  }

  private async runHealthcheck(
    healthcheck: CliResolvedConfig["healthcheck"],
    signal?: AbortSignal,
  ): Promise<void> {
    if (!healthcheck) {
      return;
    }

    const timeoutMs = healthcheck.timeoutMs ?? this.config.timeoutMs;

    if (healthcheck.type === "http") {
      const controller = new AbortController();
      const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      signal?.addEventListener("abort", () => controller.abort(), { once: true });

      try {
        const response = await fetch(healthcheck.url, { method: "GET", signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`CLI healthcheck failed for '${this.targetName}': ${reason}`);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
      return;
    }

    const renderedCommand = renderTemplate(
      healthcheck.commandTemplate,
      buildTemplateValues(
        {
          prompt: "",
          guidelines: "",
          attachments: [],
          evalCaseId: "",
          attempt: 0,
        },
        this.config,
      ),
    );

    const env = this.config.env ? { ...process.env, ...this.config.env } : process.env;
    const result = await this.runCommand(renderedCommand, {
      cwd: healthcheck.cwd ?? this.config.cwd,
      env,
      timeoutMs,
      signal,
    });

    if (result.failed || (result.exitCode ?? 0) !== 0) {
      const codeText = result.exitCode !== null ? result.exitCode : "unknown";
      const detail = result.stderr.trim() || result.stdout.trim();
      const message = detail
        ? `${detail} (exit code ${codeText})`
        : `CLI healthcheck command exited with code ${codeText}`;
      throw new Error(`CLI healthcheck failed for '${this.targetName}': ${message}`);
    }
  }
}

function buildTemplateValues(
  request: Pick<
    ProviderRequest,
    "prompt" | "guidelines" | "attachments" | "evalCaseId" | "attempt"
  >,
  config: CliResolvedConfig,
): Record<string, string> {
  const attachments = normalizeAttachments(request.attachments);
  return {
    PROMPT: shellEscape(request.prompt ?? ""),
    GUIDELINES: shellEscape(request.guidelines ?? ""),
    EVAL_ID: shellEscape(request.evalCaseId ?? ""),
    ATTEMPT: shellEscape(String(request.attempt ?? 0)),
    ATTACHMENTS: formatFileList(attachments, config.attachmentsFormat),
    FILES: formatFileList(attachments, config.filesFormat),
  };
}

function normalizeAttachments(
  attachments: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
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

function formatFileList(
  files: readonly string[] | undefined,
  template: string | undefined,
): string {
  if (!files || files.length === 0) {
    return "";
  }

  const formatter = template ?? "{path}";
  return files
    .map((filePath) => {
      const escapedPath = shellEscape(filePath);
      const escapedName = shellEscape(path.basename(filePath));
      return formatter.replaceAll("{path}", escapedPath).replaceAll("{basename}", escapedName);
    })
    .join(" ");
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (match, key) => {
    const replacement = values[key];
    return replacement !== undefined ? replacement : match;
  });
}

function shellEscape(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  if (process.platform === "win32") {
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function formatTimeoutSuffix(timeoutMs: number | undefined): string {
  if (!timeoutMs || timeoutMs <= 0) {
    return "";
  }
  const seconds = Math.ceil(timeoutMs / 1000);
  return ` after ${seconds}s`;
}
