import { exec as execCallback, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { buildPromptDocument, collectGuidelineFiles, normalizeAttachments } from "./preread.js";
import type { CodexResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";

const execAsync = promisify(execCallback);
const WORKSPACE_PREFIX = "agentv-codex-";
const PROMPT_FILENAME = "prompt.md";
const FILES_DIR = "files";
const JSONL_TYPE_ITEM_COMPLETED = "item.completed";

interface CodexRunOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly prompt: string;
  readonly timeoutMs?: number;
  readonly env: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
}

interface CodexRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut?: boolean;
}

type CodexRunner = (options: CodexRunOptions) => Promise<CodexRunResult>;

export class CodexProvider implements Provider {
  readonly id: string;
  readonly kind = "codex" as const;
  readonly targetName: string;
  readonly supportsBatch = false;

  private readonly config: CodexResolvedConfig;
  private readonly runCodex: CodexRunner;
  private environmentCheck?: Promise<void>;
  private resolvedExecutable?: string;

  constructor(targetName: string, config: CodexResolvedConfig, runner: CodexRunner = defaultCodexRunner) {
    this.id = `codex:${targetName}`;
    this.targetName = targetName;
    this.config = config;
    this.runCodex = runner;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    if (request.signal?.aborted) {
      throw new Error("Codex provider request was aborted before execution");
    }

    await this.ensureEnvironmentReady();

    const attachments = normalizeAttachments(request.attachments);
    const originalGuidelines = new Set(
      collectGuidelineFiles(attachments, request.guideline_patterns).map((file) => path.resolve(file)),
    );

    const workspaceRoot = await this.createWorkspace();
    try {
      const { mirroredAttachments, guidelineMirrors } = await this.mirrorAttachments(
        attachments,
        workspaceRoot,
        originalGuidelines,
      );

      const promptContent = buildPromptDocument(request, mirroredAttachments, {
        guidelinePatterns: request.guideline_patterns,
        guidelineOverrides: guidelineMirrors,
      });
      const promptFile = path.join(workspaceRoot, PROMPT_FILENAME);
      await writeFile(promptFile, promptContent, "utf8");

      const args = this.buildCodexArgs();
      const cwd = this.resolveCwd(workspaceRoot);

      const result = await this.executeCodex(args, cwd, promptContent, request.signal);

      if (result.timedOut) {
        throw new Error(
          `Codex CLI timed out${formatTimeoutSuffix(this.config.timeoutMs ?? undefined)}`,
        );
      }

      if (result.exitCode !== 0) {
        const detail = pickDetail(result.stderr, result.stdout);
        const prefix = `Codex CLI exited with code ${result.exitCode}`;
        throw new Error(detail ? `${prefix}: ${detail}` : prefix);
      }

      const parsed = parseCodexJson(result.stdout);
      const assistantText = extractAssistantText(parsed);

      return {
        text: assistantText,
        raw: {
          response: parsed,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          args,
          executable: this.resolvedExecutable ?? this.config.executable,
          promptFile,
          workspace: workspaceRoot,
          attachments: mirroredAttachments,
        },
      };
    } finally {
      await this.cleanupWorkspace(workspaceRoot);
    }
  }

  private async ensureEnvironmentReady(): Promise<void> {
    if (!this.environmentCheck) {
      this.environmentCheck = this.validateEnvironment();
    }
    await this.environmentCheck;
  }

  private async validateEnvironment(): Promise<void> {
    this.resolvedExecutable = await locateExecutable(this.config.executable);
  }

  private resolveCwd(workspaceRoot: string): string {
    if (!this.config.cwd) {
      return workspaceRoot;
    }
    return path.resolve(this.config.cwd);
  }

  private buildCodexArgs(): string[] {
    const args = ["exec", "--json", "--color", "never", "--skip-git-repo-check"];
    // Default to 'never' for approval preset in unattended evaluation runs
    args.push("--ask-for-approval", "never");
    if (this.config.args && this.config.args.length > 0) {
      args.push(...this.config.args);
    }
    args.push("-");
    return args;
  }

  private async executeCodex(
    args: readonly string[],
    cwd: string,
    promptContent: string,
    signal: AbortSignal | undefined,
  ): Promise<CodexRunResult> {
    try {
      return await this.runCodex({
        executable: this.resolvedExecutable ?? this.config.executable,
        args,
        cwd,
        prompt: promptContent,
        timeoutMs: this.config.timeoutMs,
        env: process.env,
        signal,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new Error(
          `Codex executable '${this.config.executable}' was not found. Update the target settings.executable or add it to PATH.`,
        );
      }
      throw error;
    }
  }

  private async mirrorAttachments(
    attachments: readonly string[] | undefined,
    workspaceRoot: string,
    guidelineOriginals: ReadonlySet<string>,
  ): Promise<{
    readonly mirroredAttachments: readonly string[] | undefined;
    readonly guidelineMirrors: ReadonlySet<string>;
  }> {
    if (!attachments || attachments.length === 0) {
      return {
        mirroredAttachments: undefined,
        guidelineMirrors: new Set<string>(),
      };
    }

    const filesRoot = path.join(workspaceRoot, FILES_DIR);
    await mkdir(filesRoot, { recursive: true });

    const mirrored: string[] = [];
    const guidelineMirrors = new Set<string>();
    const nameCounts = new Map<string, number>();

    for (const attachment of attachments) {
      const absoluteSource = path.resolve(attachment);
      const baseName = path.basename(absoluteSource);
      const count = nameCounts.get(baseName) ?? 0;
      nameCounts.set(baseName, count + 1);
      const finalName = count === 0 ? baseName : `${baseName}.${count}`;
      const destination = path.join(filesRoot, finalName);
      await copyFile(absoluteSource, destination);
      const resolvedDestination = path.resolve(destination);
      mirrored.push(resolvedDestination);
      if (guidelineOriginals.has(absoluteSource)) {
        guidelineMirrors.add(resolvedDestination);
      }
    }

    return {
      mirroredAttachments: mirrored,
      guidelineMirrors,
    };
  }

  private async createWorkspace(): Promise<string> {
    return await mkdtemp(path.join(tmpdir(), WORKSPACE_PREFIX));
  }

  private async cleanupWorkspace(workspaceRoot: string): Promise<void> {
    try {
      await rm(workspaceRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

async function locateExecutable(candidate: string): Promise<string> {
  const includesPathSeparator = candidate.includes("/") || candidate.includes("\\");
  if (includesPathSeparator) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
    const executablePath = await ensureWindowsExecutableVariant(resolved);
    await access(executablePath, constants.F_OK);
    return executablePath;
  }

  const locator = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execAsync(`${locator} ${candidate}`);
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const preferred = selectExecutableCandidate(lines);
    if (preferred) {
      const executablePath = await ensureWindowsExecutableVariant(preferred);
      await access(executablePath, constants.F_OK);
      return executablePath;
    }
  } catch {
    // ignore and fall back to error below
  }

  throw new Error(`Codex executable '${candidate}' was not found on PATH`);
}

function selectExecutableCandidate(candidates: readonly string[]): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  if (process.platform !== "win32") {
    return candidates[0];
  }
  const extensions = getWindowsExecutableExtensions();
  for (const ext of extensions) {
    const match = candidates.find((candidate) => candidate.toLowerCase().endsWith(ext));
    if (match) {
      return match;
    }
  }
  return candidates[0];
}

async function ensureWindowsExecutableVariant(candidate: string): Promise<string> {
  if (process.platform !== "win32") {
    return candidate;
  }
  if (hasExecutableExtension(candidate)) {
    return candidate;
  }

  const extensions = getWindowsExecutableExtensions();
  for (const ext of extensions) {
    const withExtension = `${candidate}${ext}`;
    try {
      await access(withExtension, constants.F_OK);
      return withExtension;
    } catch {
      // keep searching
    }
  }
  return candidate;
}

function hasExecutableExtension(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return getWindowsExecutableExtensions().some((ext) => lower.endsWith(ext));
}

const DEFAULT_WINDOWS_EXTENSIONS = [".com", ".exe", ".bat", ".cmd", ".ps1"] as const;

function getWindowsExecutableExtensions(): readonly string[] {
  if (process.platform !== "win32") {
    return [];
  }
  const fromEnv = process.env.PATHEXT?.split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.length > 0);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_WINDOWS_EXTENSIONS;
}

function parseCodexJson(output: string): unknown {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    throw new Error("Codex CLI produced no output in --json mode");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const lineObjects = parseJsonLines(trimmed);
    if (lineObjects) {
      return lineObjects;
    }
    const lastBrace = trimmed.lastIndexOf("{");
    if (lastBrace >= 0) {
      const candidate = trimmed.slice(lastBrace);
      try {
        return JSON.parse(candidate);
      } catch {
        // fallthrough
      }
    }
    const preview = trimmed.slice(0, 200);
    throw new Error(`Codex CLI emitted invalid JSON: ${preview}${trimmed.length > 200 ? "…" : ""}`);
  }
}

function extractAssistantText(parsed: unknown): string {
  if (Array.isArray(parsed)) {
    const text = extractFromEventStream(parsed);
    if (text) {
      return text;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Codex CLI JSON response did not include an assistant message");
  }

  const record = parsed as Record<string, unknown>;
  const eventText = extractFromEvent(record);
  if (eventText) {
    return eventText;
  }

  const messages = Array.isArray(record.messages) ? record.messages : undefined;
  if (messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const role = (entry as Record<string, unknown>).role;
      if (role !== "assistant") {
        continue;
      }
      const content = (entry as Record<string, unknown>).content;
      const flattened = flattenContent(content);
      if (flattened) {
        return flattened;
      }
    }
  }

  const response = record.response;
  if (response && typeof response === "object") {
    const content = (response as Record<string, unknown>).content;
    const flattened = flattenContent(content);
    if (flattened) {
      return flattened;
    }
  }

  const output = record.output;
  const flattenedOutput = flattenContent(output);
  if (flattenedOutput) {
    return flattenedOutput;
  }

  throw new Error("Codex CLI JSON response did not include an assistant message");
}

function extractFromEventStream(events: readonly unknown[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index];
    const text = extractFromEvent(candidate);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function extractFromEvent(event: unknown): string | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const record = event as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;
  if (type === JSONL_TYPE_ITEM_COMPLETED) {
    const item = record.item;
    const text = extractFromItem(item);
    if (text) {
      return text;
    }
  }
  const output = record.output ?? record.content;
  const flattened = flattenContent(output);
  if (flattened) {
    return flattened;
  }
  return undefined;
}

function extractFromItem(item: unknown): string | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const record = item as Record<string, unknown>;
  const itemType = typeof record.type === "string" ? record.type : undefined;
  if (itemType === "agent_message" || itemType === "response" || itemType === "output") {
    const text = flattenContent(record.text ?? record.content ?? record.output);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function flattenContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((segment) => {
        if (typeof segment === "string") {
          return segment;
        }
        if (segment && typeof segment === "object" && "text" in segment) {
          const text = (segment as Record<string, unknown>).text;
          return typeof text === "string" ? text : undefined;
        }
        return undefined;
      })
      .filter((part): part is string => typeof part === "string" && part.length > 0);
    return parts.length > 0 ? parts.join(" \n") : undefined;
  }
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as Record<string, unknown>).text;
    return typeof text === "string" ? text : undefined;
  }
  return undefined;
}

function parseJsonLines(output: string): unknown[] | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return undefined;
  }
  const parsed: unknown[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      return undefined;
    }
  }
  return parsed;
}

function pickDetail(stderr: string, stdout: string): string | undefined {
  const errorText = stderr.trim();
  if (errorText.length > 0) {
    return errorText;
  }
  const stdoutText = stdout.trim();
  return stdoutText.length > 0 ? stdoutText : undefined;
}

function formatTimeoutSuffix(timeoutMs: number | undefined): string {
  if (!timeoutMs || timeoutMs <= 0) {
    return "";
  }
  const seconds = Math.ceil(timeoutMs / 1000);
  return ` after ${seconds}s`;
}

async function defaultCodexRunner(options: CodexRunOptions): Promise<CodexRunResult> {
  return await new Promise<CodexRunResult>((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: shouldShellExecute(options.executable),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const onAbort = (): void => {
      child.kill("SIGTERM");
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
      timeoutHandle.unref?.();
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.stdin.end(options.prompt);

    const cleanup = (): void => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });

    child.on("close", (code) => {
      cleanup();
      resolve({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : -1,
        timedOut,
      });
    });
  });
}

function shouldShellExecute(executable: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  const lower = executable.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat") || lower.endsWith(".ps1");
}
