import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";

import { LlmJudgeEvaluator, CodeEvaluator, type EvaluationScore, type Evaluator } from "./evaluators.js";
import { createProvider } from "./providers/index.js";
import { resolveTargetDefinition, type ResolvedTarget } from "./providers/targets.js";
import type {
  EnvLookup,
  Provider,
  ProviderRequest,
  ProviderResponse,
  TargetDefinition,
} from "./providers/types.js";
import type { EvalCase, EvaluationResult, EvaluatorConfig, EvaluatorResult, JsonObject } from "./types.js";
import { buildPromptInputs, loadEvalCases } from "./yaml-parser.js";

type MaybePromise<T> = T | Promise<T>;

export interface EvaluationCache {
  get(key: string): MaybePromise<ProviderResponse | undefined>;
  set(key: string, value: ProviderResponse): MaybePromise<void>;
}

export interface RunEvalCaseOptions {
  readonly evalCase: EvalCase;
  readonly provider: Provider;
  readonly target: ResolvedTarget;
  readonly evaluators: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
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
  readonly evalId: string;
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
  readonly evaluators?: Partial<Record<string, Evaluator>>;
  readonly maxRetries?: number;
  readonly agentTimeoutMs?: number;
  readonly promptDumpDir?: string;
  readonly cache?: EvaluationCache;
  readonly useCache?: boolean;
  readonly now?: () => Date;
  readonly evalId?: string;
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
    evaluators,
    maxRetries,
    agentTimeoutMs,
    promptDumpDir,
    cache,
    useCache,
    now,
    evalId,
    verbose,
    onResult,
    onProgress,
  } = options;

  const load = loadEvalCases;
  const evalCases = await load(testFilePath, repoRoot, { verbose });

  const filteredEvalCases = filterEvalCases(evalCases, evalId);
  if (filteredEvalCases.length === 0) {
    if (evalId) {
      throw new Error(`Test case with id '${evalId}' not found in ${testFilePath}`);
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

  const evaluatorRegistry = buildEvaluatorRegistry(evaluators, resolveJudgeProvider);

  const primaryProvider = getOrCreateProvider(target);
  const providerSupportsBatch =
    target.providerBatching === true &&
    primaryProvider.supportsBatch === true &&
    typeof primaryProvider.invokeBatch === "function";
  if (target.providerBatching && !providerSupportsBatch && verbose) {
    console.warn(
      `Provider batching requested for target '${target.name}', but provider does not advertise batch support. Using per-case dispatch.`,
    );
  }

  // Notify about total test count before starting
  if (onProgress && filteredEvalCases.length > 0) {
    // Emit initial pending events for all tests
    for (let i = 0; i < filteredEvalCases.length; i++) {
      await onProgress({
        workerId: i + 1,
        evalId: filteredEvalCases[i].id,
        status: "pending",
      });
    }
  }

  if (providerSupportsBatch) {
    try {
      return await runBatchEvaluation({
        evalCases: filteredEvalCases,
        provider: primaryProvider,
        target,
        evaluatorRegistry,
        promptDumpDir,
        nowFn: now ?? (() => new Date()),
        onProgress,
        onResult,
        verbose,
        resolveJudgeProvider,
        agentTimeoutMs,
      });
    } catch (error) {
      if (verbose) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Provider batch execution failed, falling back to per-case dispatch: ${message}`);
      }
    }
  }

  // Resolve worker count: CLI option > target setting > default (1)
  const workers = options.maxConcurrency ?? target.workers ?? 1;
  const limit = pLimit(workers);

  // Track worker assignments for progress reporting
  let nextWorkerId = 1;
  const workerIdByEvalId = new Map<string, number>();

  // Map test cases to limited promises for parallel execution
  const promises = filteredEvalCases.map((evalCase) =>
    limit(async () => {
      // Assign worker ID when test starts executing
      const workerId = nextWorkerId++;
      workerIdByEvalId.set(evalCase.id, workerId);

      if (onProgress) {
        await onProgress({
          workerId,
          evalId: evalCase.id,
          status: "running",
          startedAt: Date.now(),
        });
      }

      try {
        const judgeProvider = await resolveJudgeProvider(target);
        const result = await runEvalCase({
          evalCase: evalCase,
          provider: primaryProvider,
          target,
          evaluators: evaluatorRegistry,
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
            evalId: evalCase.id,
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
            evalId: evalCase.id,
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
      const evalCase = filteredEvalCases[i];
      const promptInputs = await buildPromptInputs(evalCase);
      const errorResult = buildErrorResult(
        evalCase,
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

async function runBatchEvaluation(options: {
  readonly evalCases: readonly EvalCase[];
  readonly provider: Provider;
  readonly target: ResolvedTarget;
  readonly evaluatorRegistry: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
  readonly promptDumpDir?: string;
  readonly nowFn: () => Date;
  readonly onProgress?: (event: ProgressEvent) => MaybePromise<void>;
  readonly onResult?: (result: EvaluationResult) => MaybePromise<void>;
  readonly verbose?: boolean;
  readonly resolveJudgeProvider: (target: ResolvedTarget) => Promise<Provider | undefined>;
  readonly agentTimeoutMs?: number;
}): Promise<readonly EvaluationResult[]> {
  const {
    evalCases,
    provider,
    target,
    evaluatorRegistry,
    promptDumpDir,
    nowFn,
    onProgress,
    onResult,
    resolveJudgeProvider,
    agentTimeoutMs,
  } = options;

  // Prepare prompt inputs up front so we can reuse them for grading.
  const promptInputsList: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string }[] =
    [];
  for (const evalCase of evalCases) {
    const promptInputs = await buildPromptInputs(evalCase);
    if (promptDumpDir) {
      await dumpPrompt(promptDumpDir, evalCase, promptInputs);
    }
    promptInputsList.push(promptInputs);
  }

  const batchRequests: ProviderRequest[] = evalCases.map((evalCase, index) => {
    const promptInputs = promptInputsList[index];
    return {
      prompt: promptInputs.request,
      guidelines: promptInputs.guidelines,
      guideline_patterns: evalCase.guideline_patterns,
      attachments: evalCase.file_paths,
      evalCaseId: evalCase.id,
      metadata: {
        systemPrompt: promptInputs.systemMessage ?? "",
      },
    };
  });

  const batchResponse = await provider.invokeBatch?.(batchRequests);
  if (!Array.isArray(batchResponse)) {
    throw new Error("Provider batching failed: invokeBatch did not return an array");
  }
  if (batchResponse.length !== evalCases.length) {
    throw new Error(
      `Provider batching failed: expected ${evalCases.length} responses, received ${batchResponse.length}`,
    );
  }

  if (onProgress) {
    const startedAt = Date.now();
    for (let i = 0; i < evalCases.length; i++) {
      await onProgress({
        workerId: 1,
        evalId: evalCases[i].id,
        status: "running",
        startedAt,
      });
    }
  }

  const results: EvaluationResult[] = [];
  for (let i = 0; i < evalCases.length; i++) {
    const evalCase = evalCases[i];
    const promptInputs = promptInputsList[i];
    const providerResponse = batchResponse[i];
    let result: EvaluationResult;
    try {
      result = await evaluateCandidate({
        evalCase,
        candidate: providerResponse.text ?? "",
        target,
        provider,
        evaluators: evaluatorRegistry,
        promptInputs,
        nowFn,
        attempt: 0,
        judgeProvider: await resolveJudgeProvider(target),
        agentTimeoutMs,
      });
    } catch (error) {
      const errorResult = buildErrorResult(evalCase, target.name, nowFn(), error, promptInputs);
      results.push(errorResult);
      if (onResult) {
        await onResult(errorResult);
      }
      if (onProgress) {
        await onProgress({
          workerId: 1,
          evalId: evalCase.id,
          status: "failed",
          completedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    results.push(result);
    if (onResult) {
      await onResult(result);
    }

    if (onProgress) {
      await onProgress({
        workerId: 1,
        evalId: evalCase.id,
        status: "completed",
        startedAt: 0,
        completedAt: Date.now(),
      });
    }
  }

  return results;
}

export async function runEvalCase(options: RunEvalCaseOptions): Promise<EvaluationResult> {
  const {
    evalCase: evalCase,
    provider,
    target,
    evaluators,
    now,
    maxRetries,
    agentTimeoutMs,
    promptDumpDir,
    cache,
    useCache,
    signal,
    judgeProvider,
  } = options;

  const promptInputs = await buildPromptInputs(evalCase);
  if (promptDumpDir) {
    await dumpPrompt(promptDumpDir, evalCase, promptInputs);
  }

  const cacheKey = useCache ? createCacheKey(provider, target, evalCase, promptInputs) : undefined;
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
        evalCase: evalCase,
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
      return buildErrorResult(evalCase, target.name, nowFn(), error, promptInputs);
    }
  }

  if (!providerResponse) {
    return buildErrorResult(
      evalCase,
      target.name,
      nowFn(),
      lastError ?? new Error("Provider did not return a response"),
      promptInputs,
    );
  }

  if (cacheKey && cache && !cachedResponse) {
    await cache.set(cacheKey, providerResponse);
  }

  try {
    return await evaluateCandidate({
      evalCase,
      candidate: providerResponse.text ?? "",
      target,
      provider,
      evaluators,
      promptInputs,
      nowFn,
      attempt,
      judgeProvider,
      agentTimeoutMs,
    });
  } catch (error) {
    return buildErrorResult(evalCase, target.name, nowFn(), error, promptInputs);
  }
}

async function evaluateCandidate(options: {
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly evaluators: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
  readonly promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string };
  readonly nowFn: () => Date;
  readonly attempt: number;
  readonly judgeProvider?: Provider;
  readonly agentTimeoutMs?: number;
}): Promise<EvaluationResult> {
  const {
    evalCase,
    candidate,
    target,
    provider,
    evaluators,
    promptInputs,
    nowFn,
    attempt,
    judgeProvider,
    agentTimeoutMs,
  } = options;

  const gradeTimestamp = nowFn();
  const { score, evaluatorResults } = await runEvaluatorsForCase({
    evalCase,
    candidate,
    target,
    provider,
    evaluators,
    attempt,
    promptInputs,
    now: gradeTimestamp,
    judgeProvider,
    agentTimeoutMs,
  });

  const completedAt = nowFn();
  const rawRequest: JsonObject = {
    request: promptInputs.request,
    guidelines: promptInputs.guidelines,
    guideline_paths: evalCase.guideline_paths,
    system_message: promptInputs.systemMessage ?? "",
  } as JsonObject;

  return {
    eval_id: evalCase.id,
    conversation_id: evalCase.conversation_id,
    score: score.score,
    hits: score.hits,
    misses: score.misses,
    model_answer: candidate,
    expected_aspect_count: score.expectedAspectCount,
    target: target.name,
    timestamp: completedAt.toISOString(),
    reasoning: score.reasoning,
    raw_aspects: score.rawAspects,
    raw_request: rawRequest,
    evaluator_raw_request: evaluatorResults ? undefined : score.evaluatorRawRequest,
    evaluator_results: evaluatorResults,
  };
}

async function runEvaluatorsForCase(options: {
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly evaluators: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
  readonly attempt: number;
  readonly promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string };
  readonly now: Date;
  readonly judgeProvider?: Provider;
  readonly agentTimeoutMs?: number;
}): Promise<{ score: EvaluationScore; evaluatorResults?: EvaluatorResult[] }> {
  const { evalCase, candidate, target, provider, evaluators, attempt, promptInputs, now, judgeProvider, agentTimeoutMs } =
    options;

  if (evalCase.evaluators && evalCase.evaluators.length > 0) {
    return runEvaluatorList({
      evalCase,
      evaluators: evalCase.evaluators,
      candidate,
      target,
      provider,
      evaluatorRegistry: evaluators,
      attempt,
      promptInputs,
      now,
      judgeProvider,
      agentTimeoutMs,
    });
  }

  const evaluatorKind = evalCase.evaluator ?? "llm_judge";
  const activeEvaluator = evaluators[evaluatorKind] ?? evaluators.llm_judge;
  if (!activeEvaluator) {
    throw new Error(`No evaluator registered for kind '${evaluatorKind}'`);
  }

  const score = await activeEvaluator.evaluate({
    evalCase,
    candidate,
    target,
    provider,
    attempt,
    promptInputs,
    now,
    judgeProvider,
  });

  return { score };
}

async function runEvaluatorList(options: {
  readonly evalCase: EvalCase;
  readonly evaluators: readonly EvaluatorConfig[];
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly evaluatorRegistry: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
  readonly attempt: number;
  readonly promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string };
  readonly now: Date;
  readonly judgeProvider?: Provider;
  readonly agentTimeoutMs?: number;
}): Promise<{ score: EvaluationScore; evaluatorResults: EvaluatorResult[] }> {
  const {
    evalCase,
    evaluators,
    candidate,
    target,
    provider,
    evaluatorRegistry,
    attempt,
    promptInputs,
    now,
    judgeProvider,
    agentTimeoutMs,
  } = options;

  const scored: Array<{ readonly score: EvaluationScore; readonly name: string; readonly type: string }> = [];
  const evaluatorResults: EvaluatorResult[] = [];

  for (const evaluator of evaluators ?? []) {
    try {
      if (evaluator.type === "llm_judge") {
        const score = await runLlmJudgeEvaluator({
          config: evaluator,
          evalCase,
          candidate,
          target,
          provider,
          evaluatorRegistry,
          attempt,
          promptInputs,
          now,
          judgeProvider,
        });
        scored.push({ score, name: evaluator.name, type: evaluator.type });
        evaluatorResults.push({
          name: evaluator.name,
          type: evaluator.type,
          score: score.score,
          hits: score.hits,
          misses: score.misses,
          reasoning: score.reasoning,
          evaluator_raw_request: score.evaluatorRawRequest,
        });
        continue;
      }

      if (evaluator.type === "code") {
        const codeEvaluator = new CodeEvaluator({
          script: evaluator.script,
          cwd: evaluator.resolvedCwd ?? evaluator.cwd,
          agentTimeoutMs,
        });
        const score = await codeEvaluator.evaluate({
          evalCase,
          candidate,
          target,
          provider,
          attempt,
          promptInputs,
          now,
        });
        scored.push({ score, name: evaluator.name, type: evaluator.type });
        evaluatorResults.push({
          name: evaluator.name,
          type: evaluator.type,
          score: score.score,
          hits: score.hits,
          misses: score.misses,
          reasoning: score.reasoning,
          evaluator_raw_request: score.evaluatorRawRequest,
        });
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackScore: EvaluationScore = {
        score: 0,
        hits: [],
        misses: [`Evaluator '${evaluator.name}' failed: ${message}`],
        expectedAspectCount: 1,
        reasoning: message,
      };
      scored.push({ score: fallbackScore, name: evaluator.name ?? "unknown", type: evaluator.type ?? "unknown" });
      evaluatorResults.push({
        name: evaluator.name ?? "unknown",
        type: evaluator.type ?? "unknown",
        score: 0,
        hits: [],
        misses: [`Evaluator '${evaluator.name ?? "unknown"}' failed: ${message}`],
        reasoning: message,
      });
    }
  }

  const aggregateScore =
    scored.length > 0 ? scored.reduce((total, entry) => total + entry.score.score, 0) / scored.length : 0;
  const hits = scored.flatMap((entry) => entry.score.hits);
  const misses = scored.flatMap((entry) => entry.score.misses);
  const expectedAspectCount = scored.reduce((total, entry) => total + (entry.score.expectedAspectCount ?? 0), 0);
  const rawAspects = scored.flatMap((entry) => entry.score.rawAspects ?? []);
  const reasoningParts = scored
    .map((entry) => (entry.score.reasoning ? `${entry.name}: ${entry.score.reasoning}` : undefined))
    .filter(isNonEmptyString);
  const reasoning = reasoningParts.length > 0 ? reasoningParts.join(" | ") : undefined;

  const score: EvaluationScore = {
    score: aggregateScore,
    hits,
    misses,
    expectedAspectCount,
    reasoning,
    rawAspects: rawAspects.length > 0 ? rawAspects : undefined,
  };

  return { score, evaluatorResults };
}

async function runLlmJudgeEvaluator(options: {
  readonly config: Exclude<NonNullable<EvalCase["evaluators"]>[number], { type: "code" }>;
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly evaluatorRegistry: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
  readonly attempt: number;
  readonly promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string };
  readonly now: Date;
  readonly judgeProvider?: Provider;
}): Promise<EvaluationScore> {
  const { config, evalCase, candidate, target, provider, evaluatorRegistry, attempt, promptInputs, now, judgeProvider } =
    options;
  const customPrompt = await resolveCustomPrompt(config);

  return evaluatorRegistry.llm_judge.evaluate({
    evalCase,
    candidate,
    target,
    provider,
    attempt,
    promptInputs,
    now,
    judgeProvider,
    systemPrompt: customPrompt,
    evaluator: config,
    judgeModel: config.model,
  });
}

async function resolveCustomPrompt(config: { readonly prompt?: string; readonly promptPath?: string }): Promise<string | undefined> {
  if (config.promptPath) {
    try {
      return await readFile(config.promptPath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not read custom prompt at ${config.promptPath}: ${message}`);
    }
  }
  return config.prompt;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function filterEvalCases(evalCases: readonly EvalCase[], evalId?: string): readonly EvalCase[] {
  if (!evalId) {
    return evalCases;
  }
  return evalCases.filter((evalCase) => evalCase.id === evalId);
}

function buildEvaluatorRegistry(
  overrides: Partial<Record<string, Evaluator>> | undefined,
  resolveJudgeProvider: (target: ResolvedTarget) => Promise<Provider | undefined>,
): Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator } {
  const llmJudge =
    overrides?.llm_judge ??
    new LlmJudgeEvaluator({
      resolveJudgeProvider: async (context) => {
        if (context.judgeProvider) {
          return context.judgeProvider;
        }
        return resolveJudgeProvider(context.target);
      },
    });

  return {
    ...overrides,
    llm_judge: llmJudge,
  };
}

async function dumpPrompt(
  directory: string,
  evalCase: EvalCase,
  promptInputs: { readonly request: string; readonly guidelines: string },
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}_${sanitizeFilename(evalCase.id)}.json`;
  const filePath = path.resolve(directory, filename);

  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = {
    eval_id: evalCase.id,
    request: promptInputs.request,
    guidelines: promptInputs.guidelines,
    guideline_paths: evalCase.guideline_paths,
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
    readonly evalCase: EvalCase;
    readonly target: ResolvedTarget;
    readonly promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string };
    readonly attempt: number;
    readonly agentTimeoutMs?: number;
    readonly signal?: AbortSignal;
  },
): Promise<ProviderResponse> {
  const { evalCase, promptInputs, attempt, agentTimeoutMs, signal } = options;

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
      guideline_patterns: evalCase.guideline_patterns,
      attachments: evalCase.file_paths,
      evalCaseId: evalCase.id,
      attempt,
      metadata: {
        systemPrompt: promptInputs.systemMessage ?? "",
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
  evalCase: EvalCase,
  targetName: string,
  timestamp: Date,
  error: unknown,
  promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string },
): EvaluationResult {
  const message = error instanceof Error ? error.message : String(error);

  const rawRequest: JsonObject = {
    request: promptInputs.request,
    guidelines: promptInputs.guidelines,
    guideline_paths: evalCase.guideline_paths,
    system_message: promptInputs.systemMessage ?? "",
    error: message,
  } as JsonObject;

  return {
    eval_id: evalCase.id,
    conversation_id: evalCase.conversation_id,
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
  evalCase: EvalCase,
  promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string },
): string {
  const hash = createHash("sha256");
  hash.update(provider.id);
  hash.update(target.name);
  hash.update(evalCase.id);
  hash.update(promptInputs.request);
  hash.update(promptInputs.guidelines);
  hash.update(promptInputs.systemMessage ?? "");
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
