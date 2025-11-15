import {
  runEvaluation as defaultRunEvaluation,
  type EvaluationCache,
  type EvaluationResult,
  type ProviderResponse,
  ensureVSCodeSubagents,
} from "@agentevo/core";
import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnvFromHierarchy } from "./env.js";
import {
  createOutputWriter,
  getDefaultExtension,
  type OutputFormat,
} from "./output-writer.js";
import { ProgressDisplay } from "./progress-display.js";
import { calculateEvaluationSummary, formatEvaluationSummary } from "./statistics.js";
import { selectTarget } from "./targets.js";

interface RunEvalCommandInput {
  readonly testFile: string;
  readonly rawOptions: Record<string, unknown>;
}

interface NormalizedOptions {
  readonly target?: string;
  readonly targetsPath?: string;
  readonly testId?: string;
  readonly workers?: number;
  readonly outPath?: string;
  readonly format: OutputFormat;
  readonly dryRun: boolean;
  readonly dryRunDelay: number;
  readonly dryRunDelayMin: number;
  readonly dryRunDelayMax: number;
  readonly agentTimeoutSeconds: number;
  readonly maxRetries: number;
  readonly cache: boolean;
  readonly verbose: boolean;
  readonly dumpPrompts?: string | boolean;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeOptions(rawOptions: Record<string, unknown>): NormalizedOptions {
  const formatStr = normalizeString(rawOptions.format) ?? "jsonl";
  const format: OutputFormat = formatStr === "yaml" ? "yaml" : "jsonl";

  const workers = normalizeNumber(rawOptions.workers, 0);

  return {
    target: normalizeString(rawOptions.target),
    targetsPath: normalizeString(rawOptions.targets),
    testId: normalizeString(rawOptions.testId),
    workers: workers > 0 ? workers : undefined,
    outPath: normalizeString(rawOptions.out),
    format,
    dryRun: normalizeBoolean(rawOptions.dryRun),
    dryRunDelay: normalizeNumber(rawOptions.dryRunDelay, 0),
    dryRunDelayMin: normalizeNumber(rawOptions.dryRunDelayMin, 0),
    dryRunDelayMax: normalizeNumber(rawOptions.dryRunDelayMax, 0),
    agentTimeoutSeconds: normalizeNumber(rawOptions.agentTimeout, 120),
    maxRetries: normalizeNumber(rawOptions.maxRetries, 2),
    cache: normalizeBoolean(rawOptions.cache),
    verbose: normalizeBoolean(rawOptions.verbose),
    dumpPrompts: rawOptions.dumpPrompts as string | boolean | undefined,
  } satisfies NormalizedOptions;
}

async function ensureFileExists(filePath: string, description: string): Promise<void> {
  try {
    await access(filePath, constants.F_OK);
  } catch {
    throw new Error(`${description} not found: ${filePath}`);
  }
}

async function findRepoRoot(start: string): Promise<string> {
  const fallback = path.resolve(start);
  let current: string | undefined = fallback;

  while (current !== undefined) {
    const candidate = path.join(current, ".git");
    try {
      await access(candidate, constants.F_OK);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return fallback;
}

function buildDefaultOutputPath(testFilePath: string, cwd: string, format: OutputFormat): string {
  const testFileName = path.basename(testFilePath);
  const withoutExtension = testFileName.replace(/\.test\.ya?ml$/i, "").replace(/\.ya?ml$/i, "");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = withoutExtension.length > 0 ? withoutExtension : "results";
  const extension = getDefaultExtension(format);
  return path.join(cwd, ".agentevo", "results", `${baseName}_${timestamp}${extension}`);
}

function resolvePromptDirectory(option: string | boolean | undefined, cwd: string): string | undefined {
  if (option === undefined) {
    return undefined;
  }
  if (typeof option === "string" && option.trim().length > 0) {
    return path.resolve(cwd, option);
  }
  return path.join(cwd, ".agentevo", "prompts");
}

function createEvaluationCache(): EvaluationCache {
  const store = new Map<string, ProviderResponse>();
  return {
    async get(key: string) {
      return store.get(key);
    },
    async set(key: string, value: ProviderResponse) {
      store.set(key, value);
    },
  } satisfies EvaluationCache;
}

export async function runEvalCommand(input: RunEvalCommandInput): Promise<void> {
  const options = normalizeOptions(input.rawOptions);
  const cwd = process.cwd();
  const testFilePath = path.resolve(input.testFile);

  await ensureFileExists(testFilePath, "Test file");

  const repoRoot = await findRepoRoot(cwd);

  if (options.verbose) {
    console.log(`Repository root: ${repoRoot}`);
  }

  await loadEnvFromHierarchy({
    testFilePath,
    repoRoot,
    verbose: options.verbose,
  });

  const targetSelection = await selectTarget({
    testFilePath,
    repoRoot,
    cwd,
    explicitTargetsPath: options.targetsPath,
    cliTargetName: options.target,
    dryRun: options.dryRun,
    dryRunDelay: options.dryRunDelay,
    dryRunDelayMin: options.dryRunDelayMin,
    dryRunDelayMax: options.dryRunDelayMax,
    env: process.env,
  });

  const providerLabel = options.dryRun ? `${targetSelection.resolvedTarget.kind} (dry-run)` : targetSelection.resolvedTarget.kind;
  const targetMessage = options.verbose
    ? `Using target (${targetSelection.targetSource}): ${targetSelection.targetName} [provider=${providerLabel}] via ${targetSelection.targetsFilePath}`
    : `Using target: ${targetSelection.targetName} [provider=${providerLabel}]`;
  console.log(targetMessage);
  const outputPath = options.outPath ? path.resolve(options.outPath) : buildDefaultOutputPath(testFilePath, cwd, options.format);
  console.log(`Output path: ${outputPath}`);

  const promptDumpDir = resolvePromptDirectory(options.dumpPrompts, cwd);
  if (promptDumpDir) {
    await mkdir(promptDumpDir, { recursive: true });
    if (options.verbose) {
      console.log(`Prompt dumps enabled at: ${promptDumpDir}`);
    }
  }

  const outputWriter = await createOutputWriter(outputPath, options.format);
  const cache = options.cache ? createEvaluationCache() : undefined;
  const agentTimeoutMs = Math.max(0, options.agentTimeoutSeconds) * 1000;

  // Resolve workers: CLI flag > target setting > default (1)
  let resolvedWorkers = options.workers ?? targetSelection.resolvedTarget.workers ?? 1;
  if (resolvedWorkers < 1 || resolvedWorkers > 50) {
    throw new Error(`Workers must be between 1 and 50, got: ${resolvedWorkers}`);
  }

  // VSCode providers require window focus, so only 1 worker is allowed
  const isVSCodeProvider = ["vscode", "vscode-insiders"].includes(
    targetSelection.resolvedTarget.kind
  );
  if (isVSCodeProvider && resolvedWorkers > 1) {
    console.warn(`Warning: VSCode providers require window focus. Limiting workers from ${resolvedWorkers} to 1 to prevent race conditions.`);
    resolvedWorkers = 1;
  }

  if (options.verbose) {
    const workersSource = options.workers
      ? "CLI flag"
      : targetSelection.resolvedTarget.workers
        ? "target setting"
        : "default";
    console.log(`Using ${resolvedWorkers} worker(s) (source: ${workersSource})`);
  }

  // Auto-provision subagents for VSCode targets
  if (isVSCodeProvider && !options.dryRun) {
    await ensureVSCodeSubagents({
      kind: targetSelection.resolvedTarget.kind as "vscode" | "vscode-insiders",
      count: resolvedWorkers,
      verbose: options.verbose,
    });
  }

  const evaluationRunner = await resolveEvaluationRunner();

  // Initialize progress display
  const progressDisplay = new ProgressDisplay(resolvedWorkers);
  progressDisplay.start();
  const pendingTests = new Set<number>();

  try {
    const results = await evaluationRunner({
      testFilePath,
      repoRoot,
      target: targetSelection.resolvedTarget,
      targets: targetSelection.definitions,
      env: process.env,
      maxRetries: Math.max(0, options.maxRetries),
      agentTimeoutMs,
      promptDumpDir,
      cache,
      useCache: options.cache,
      testId: options.testId,
      verbose: options.verbose,
      maxConcurrency: resolvedWorkers,
      onResult: async (result: EvaluationResult) => {
        await outputWriter.append(result);
      },
      onProgress: async (event) => {
        // Track pending events to determine total test count
        if (event.status === "pending") {
          pendingTests.add(event.workerId);
          progressDisplay.setTotalTests(pendingTests.size);
        }
        progressDisplay.updateWorker({
          workerId: event.workerId,
          testId: event.testId,
          status: event.status,
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          error: event.error,
        });
      },
    });

    progressDisplay.finish();

    await outputWriter.close();

    const summary = calculateEvaluationSummary(results);
    console.log(formatEvaluationSummary(summary));

    if (results.length > 0) {
      console.log(`\nResults written to: ${outputPath}`);
    }
    if (promptDumpDir && results.length > 0) {
      console.log(`Prompt payloads saved to: ${promptDumpDir}`);
    }
  } catch (error) {
    await outputWriter.close().catch(() => undefined);
    throw error;
  }
}

async function resolveEvaluationRunner(): Promise<typeof defaultRunEvaluation> {
  const overridePath = process.env.AGENTEVO_CLI_EVAL_RUNNER;
  if (!overridePath) {
    return defaultRunEvaluation;
  }

  const resolved = path.isAbsolute(overridePath)
    ? overridePath
    : path.resolve(process.cwd(), overridePath);

  const moduleUrl = pathToFileURL(resolved).href;
  const mod = await import(moduleUrl);
  const candidate = mod.runEvaluation;
  if (typeof candidate !== "function") {
    throw new Error(
      `Module '${resolved}' must export a 'runEvaluation' function to override the default implementation`,
    );
  }
  return candidate as typeof defaultRunEvaluation;
}
