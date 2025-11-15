import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";

import {
  HeuristicGrader,
  QualityGrader,
  type GradeResult,
  type Grader,
} from "./grading.js";
import { createProvider } from "./providers/index.js";
import { resolveTargetDefinition, type ResolvedTarget } from "./providers/targets.js";
import type { EnvLookup, Provider, ProviderResponse, TargetDefinition } from "./providers/types.js";
import type { EvaluationResult, JsonObject, TestCase } from "./types.js";
import { buildPromptInputs, loadTestCases } from "./yaml-parser.js";

type MaybePromise<T> = T | Promise<T>;

export interface EvaluationCache {
  get(key: string): MaybePromise<ProviderResponse | undefined>;
  set(key: string, value: ProviderResponse): MaybePromise<void>;
}

export interface RunTestCaseOptions {
  readonly testCase: TestCase;
  readonly provider: Provider;
  readonly target: ResolvedTarget;
  readonly graders: Partial<Record<string, Grader>>;
  readonly now?: () => Date;
  readonly maxRetries?: number;
  readonly agentTimeoutMs?: number;
  readonly promptDumpDir?: string;
  readonly cache?: EvaluationCache;
  readonly useCache?: boolean;
  readonly signal?: AbortSignal;
  readonly judgeProvider?: Provider;
}

export interface ProgressEvent {
  readonly workerId: number;
  readonly testId: string;
  readonly status: "pending" | "running" | "completed" | "failed";
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly error?: string;
}

export interface RunEvaluationOptions {
  readonly testFilePath: string;
  readonly repoRoot: URL | string;
  readonly target: ResolvedTarget;
  readonly targets?: readonly TargetDefinition[];
  readonly env?: EnvLookup;
  readonly providerFactory?: (target: ResolvedTarget) => Provider;
  readonly graders?: Partial<Record<string, Grader>>;
  readonly maxRetries?: number;
  readonly agentTimeoutMs?: number;
  readonly promptDumpDir?: string;
  readonly cache?: EvaluationCache;
  readonly useCache?: boolean;
  readonly now?: () => Date;
  readonly testId?: string;
  readonly verbose?: boolean;
  readonly maxConcurrency?: number;
  readonly onResult?: (result: EvaluationResult) => MaybePromise<void>;
  readonly onProgress?: (event: ProgressEvent) => MaybePromise<void>;
}

export async function runEvaluation(options: RunEvaluationOptions): Promise<readonly EvaluationResult[]> {
  const {
    testFilePath,
    repoRoot,
    target,
    targets,
    env,
    providerFactory,
    graders,
    maxRetries,
    agentTimeoutMs,
    promptDumpDir,
    cache,
    useCache,
    now,
    testId,
    verbose,
    onResult,
    onProgress,
  } = options;

  const load = loadTestCases;
  const testCases = await load(testFilePath, repoRoot, { verbose });

  const filteredTestCases = filterTestCases(testCases, testId);
  if (filteredTestCases.length === 0) {
    if (testId) {
      throw new Error(`Test case with id '${testId}' not found in ${testFilePath}`);
    }
    return [];
  }

  const resolvedTargetsByName = new Map<string, ResolvedTarget>();
  resolvedTargetsByName.set(target.name, target);

  const targetDefinitions = new Map<string, TargetDefinition>();
  for (const definition of targets ?? []) {
    targetDefinitions.set(definition.name, definition);
  }

  const envLookup: EnvLookup = env ?? process.env;
  const providerCache = new Map<string, Provider>();

  const getOrCreateProvider = (resolved: ResolvedTarget): Provider => {
    const existing = providerCache.get(resolved.name);
    if (existing) {
      return existing;
    }
    const factory = providerFactory ?? createProvider;
    const instance = factory(resolved);
    providerCache.set(resolved.name, instance);
    return instance;
  };

  const resolveTargetByName = (name: string): ResolvedTarget | undefined => {
    if (resolvedTargetsByName.has(name)) {
      return resolvedTargetsByName.get(name);
    }
    const definition = targetDefinitions.get(name);
    if (!definition) {
      return undefined;
    }
    const resolved = resolveTargetDefinition(definition, envLookup);
    resolvedTargetsByName.set(name, resolved);
    return resolved;
  };

  const resolveJudgeProvider = async (targetContext: ResolvedTarget): Promise<Provider | undefined> => {
    const judgeName = targetContext.judgeTarget ?? targetContext.name;
    const resolvedJudge = resolveTargetByName(judgeName);
    if (!resolvedJudge) {
      return getOrCreateProvider(targetContext);
    }
    return getOrCreateProvider(resolvedJudge);
  };

  const graderRegistry = buildGraderRegistry(graders, resolveJudgeProvider);

  const primaryProvider = getOrCreateProvider(target);

  // Notify about total test count before starting
  if (onProgress && filteredTestCases.length > 0) {
    // Emit initial pending events for all tests
    for (let i = 0; i < filteredTestCases.length; i++) {
      await onProgress({
        workerId: i + 1,
        testId: filteredTestCases[i].id,
        status: "pending",
      });
    }
  }

  // Resolve worker count: CLI option > target setting > default (1)
  const workers = options.maxConcurrency ?? target.workers ?? 1;
  const limit = pLimit(workers);

  // Track worker assignments for progress reporting
  let nextWorkerId = 1;
  const workerIdByTestId = new Map<string, number>();

  // Map test cases to limited promises for parallel execution
  const promises = filteredTestCases.map((testCase) =>
    limit(async () => {
      // Assign worker ID when test starts executing
      const workerId = nextWorkerId++;
      workerIdByTestId.set(testCase.id, workerId);

      if (onProgress) {
        await onProgress({
          workerId,
          testId: testCase.id,
          status: "running",
          startedAt: Date.now(),
        });
      }

      try {
        const judgeProvider = await resolveJudgeProvider(target);
        const result = await runTestCase({
          testCase,
          provider: primaryProvider,
          target,
          graders: graderRegistry,
          maxRetries,
          agentTimeoutMs,
          promptDumpDir,
          cache,
          useCache,
          now,
          judgeProvider,
        });

        if (onProgress) {
          await onProgress({
            workerId,
            testId: testCase.id,
            status: "completed",
            startedAt: 0, // Not used for completed status
            completedAt: Date.now(),
          });
        }

        if (onResult) {
          await onResult(result);
        }
        return result;
      } catch (error) {
        if (onProgress) {
          await onProgress({
            workerId,
            testId: testCase.id,
            status: "failed",
            completedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }
    }),
  );

  // Wait for all workers to complete
  const settled = await Promise.allSettled(promises);

  // Extract results, handling both fulfilled and rejected promises
  const results: EvaluationResult[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      // Build error result for rejected promise
      const testCase = filteredTestCases[i];
      const promptInputs = await buildPromptInputs(testCase);
      const errorResult = buildErrorResult(
        testCase,
        target.name,
        (now ?? (() => new Date()))(),
        outcome.reason,
        promptInputs,
      );
      results.push(errorResult);
      if (onResult) {
        await onResult(errorResult);
      }
    }
  }

  return results;
}

export async function runTestCase(options: RunTestCaseOptions): Promise<EvaluationResult> {
  const {
    testCase,
    provider,
    target,
    graders,
    now,
    maxRetries,
    agentTimeoutMs,
    promptDumpDir,
    cache,
    useCache,
    signal,
    judgeProvider,
  } = options;

  const promptInputs = await buildPromptInputs(testCase);
  if (promptDumpDir) {
    await dumpPrompt(promptDumpDir, testCase, promptInputs);
  }

  const cacheKey = useCache ? createCacheKey(provider, target, testCase, promptInputs) : undefined;
  let cachedResponse: ProviderResponse | undefined;
  if (cacheKey && cache) {
    cachedResponse = await cache.get(cacheKey);
  }

  const nowFn = now ?? (() => new Date());

  const attemptBudget = (maxRetries ?? 0) + 1;
  let attempt = 0;
  let providerResponse: ProviderResponse | undefined = cachedResponse;
  let lastError: unknown;

  while (!providerResponse && attempt < attemptBudget) {
    try {
      providerResponse = await invokeProvider(provider, {
        testCase,
        target,
        promptInputs,
        attempt,
        agentTimeoutMs,
        signal,
      });
    } catch (error) {
      lastError = error;
      if (isTimeoutLike(error) && attempt + 1 < attemptBudget) {
        attempt += 1;
        continue;
      }
      return buildErrorResult(testCase, target.name, nowFn(), error, promptInputs);
    }
  }

  if (!providerResponse) {
    return buildErrorResult(
      testCase,
      target.name,
      nowFn(),
      lastError ?? new Error("Provider did not return a response"),
      promptInputs,
    );
  }

  if (cacheKey && cache && !cachedResponse) {
    await cache.set(cacheKey, providerResponse);
  }

  const graderKind = testCase.grader ?? "heuristic";
  const activeGrader = graders[graderKind] ?? graders.heuristic;
  if (!activeGrader) {
    throw new Error(`No grader registered for kind '${graderKind}'`);
  }

  let grade: GradeResult;
  try {
    const gradeTimestamp = nowFn();
    grade = await activeGrader.grade({
      testCase,
      candidate: providerResponse.text ?? "",
      target,
      provider,
      attempt,
      promptInputs,
      now: gradeTimestamp,
      judgeProvider,
    });
  } catch (error) {
    return buildErrorResult(testCase, target.name, nowFn(), error, promptInputs);
  }

  const completedAt = nowFn();
  const rawRequest: JsonObject = {
    request: promptInputs.request,
    guidelines: promptInputs.guidelines,
    guideline_paths: testCase.guideline_paths,
  } as JsonObject;

  return {
    test_id: testCase.id,
    score: grade.score,
    hits: grade.hits,
    misses: grade.misses,
    model_answer: providerResponse.text ?? "",
    expected_aspect_count: grade.expectedAspectCount,
    target: target.name,
    timestamp: completedAt.toISOString(),
    reasoning: grade.reasoning,
    raw_aspects: grade.rawAspects,
    raw_request: rawRequest,
    grader_raw_request: grade.graderRawRequest,
  } satisfies EvaluationResult;
}

function filterTestCases(testCases: readonly TestCase[], testId?: string): readonly TestCase[] {
  if (!testId) {
    return testCases;
  }
  return testCases.filter((testCase) => testCase.id === testId);
}

function buildGraderRegistry(
  overrides: Partial<Record<string, Grader>> | undefined,
  resolveJudgeProvider: (target: ResolvedTarget) => Promise<Provider | undefined>,
): Partial<Record<string, Grader>> & { readonly heuristic: Grader } {
  const heuristic = overrides?.heuristic ?? new HeuristicGrader();
  const llmJudge =
    overrides?.llm_judge ??
    new QualityGrader({
      resolveJudgeProvider: async (context) => {
        if (context.judgeProvider) {
          return context.judgeProvider;
        }
        return resolveJudgeProvider(context.target);
      },
    });

  return {
    ...overrides,
    heuristic,
    llm_judge: llmJudge,
  };
}

async function dumpPrompt(
  directory: string,
  testCase: TestCase,
  promptInputs: { readonly request: string; readonly guidelines: string },
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}_${sanitizeFilename(testCase.id)}.json`;
  const filePath = path.resolve(directory, filename);

  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = {
    test_id: testCase.id,
    request: promptInputs.request,
    guidelines: promptInputs.guidelines,
    guideline_paths: testCase.guideline_paths,
  } satisfies Record<string, unknown>;

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function sanitizeFilename(value: string): string {
  if (!value) {
    return "prompt";
  }
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "_");
  return sanitized.length > 0 ? sanitized : randomUUID();
}

async function invokeProvider(
  provider: Provider,
  options: {
    readonly testCase: TestCase;
    readonly target: ResolvedTarget;
    readonly promptInputs: { readonly request: string; readonly guidelines: string };
    readonly attempt: number;
    readonly agentTimeoutMs?: number;
    readonly signal?: AbortSignal;
  },
): Promise<ProviderResponse> {
  const { testCase, target, promptInputs, attempt, agentTimeoutMs, signal } = options;

  const controller = new AbortController();
  const timeout = agentTimeoutMs
    ? setTimeout(() => controller.abort(), agentTimeoutMs)
    : undefined;

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await provider.invoke({
      prompt: promptInputs.request,
      guidelines: promptInputs.guidelines,
      attachments: testCase.guideline_paths,
      testCaseId: testCase.id,
      attempt,
      metadata: {
        target: target.name,
        grader: testCase.grader,
      },
      signal: controller.signal,
    });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function buildErrorResult(
  testCase: TestCase,
  targetName: string,
  timestamp: Date,
  error: unknown,
  promptInputs: { readonly request: string; readonly guidelines: string },
): EvaluationResult {
  const message = error instanceof Error ? error.message : String(error);

  const rawRequest: JsonObject = {
    request: promptInputs.request,
    guidelines: promptInputs.guidelines,
    guideline_paths: testCase.guideline_paths,
    error: message,
  } as JsonObject;

  return {
    test_id: testCase.id,
    score: 0,
    hits: [],
    misses: [`Error: ${message}`],
    model_answer: `Error occurred: ${message}`,
    expected_aspect_count: 0,
    target: targetName,
    timestamp: timestamp.toISOString(),
    raw_aspects: [],
    raw_request: rawRequest,
  } satisfies EvaluationResult;
}

function createCacheKey(
  provider: Provider,
  target: ResolvedTarget,
  testCase: TestCase,
  promptInputs: { readonly request: string; readonly guidelines: string },
): string {
  const hash = createHash("sha256");
  hash.update(provider.id);
  hash.update(target.name);
  hash.update(testCase.id);
  hash.update(promptInputs.request);
  hash.update(promptInputs.guidelines);
  return hash.digest("hex");
}

function isTimeoutLike(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error) {
    const name = error.name?.toLowerCase();
    const message = error.message?.toLowerCase();
    return name.includes("timeout") || message.includes("timeout");
  }
  const value = String(error).toLowerCase();
  return value.includes("timeout");
}
