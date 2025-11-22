import { randomUUID } from "node:crypto";

import type { ResolvedTarget } from "./providers/targets.js";
import type { Provider, ProviderResponse } from "./providers/types.js";
import type { EvaluatorConfig, JsonObject, EvalCase } from "./types.js";

export interface EvaluationContext {
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly attempt: number;
  readonly promptInputs: {
    readonly request: string;
    readonly guidelines: string;
    readonly systemMessage?: string;
  };
  readonly now: Date;
  readonly judgeProvider?: Provider;
  readonly systemPrompt?: string;
  readonly evaluator?: EvaluatorConfig;
  readonly judgeModel?: string;
}

export interface EvaluationScore {
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  readonly expectedAspectCount: number;
  readonly reasoning?: string;
  readonly rawAspects?: readonly string[];
  readonly evaluatorRawRequest?: JsonObject;
}

export interface Evaluator {
  readonly kind: string;
  evaluate(context: EvaluationContext): Promise<EvaluationScore> | EvaluationScore;
}

type JudgeProviderResolver = (context: EvaluationContext) => Promise<Provider | undefined>;

export interface LlmJudgeEvaluatorOptions {
  readonly resolveJudgeProvider: JudgeProviderResolver;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly customPrompt?: string;
}

export class LlmJudgeEvaluator implements Evaluator {
  readonly kind = "llm_judge";

  private readonly resolveJudgeProvider: JudgeProviderResolver;
  private readonly maxOutputTokens?: number;
  private readonly temperature?: number;
  private readonly customPrompt?: string;

  constructor(options: LlmJudgeEvaluatorOptions) {
    this.resolveJudgeProvider = options.resolveJudgeProvider;
    this.maxOutputTokens = options.maxOutputTokens;
    this.temperature = options.temperature;
    this.customPrompt = options.customPrompt;
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationScore> {
    const judgeProvider = await this.resolveJudgeProvider(context);
    if (!judgeProvider) {
      throw new Error("No judge provider available for LLM grading");
    }

    const prompt = buildQualityPrompt(context.evalCase, context.candidate);
    const systemPrompt = context.systemPrompt ?? this.customPrompt ?? QUALITY_SYSTEM_PROMPT;
    const metadata: JsonObject = {
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(context.judgeModel !== undefined ? { model: context.judgeModel } : {}),
    };

    const response = await judgeProvider.invoke({
      prompt,
      metadata,
      evalCaseId: context.evalCase.id,
      attempt: context.attempt,
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
    });

    const parsed = parseQualityResponse(response);
    const score = clampScore(parsed.score ?? 0);
    const hits = Array.isArray(parsed.hits)
      ? parsed.hits.filter(isNonEmptyString).slice(0, 4)
      : [];
    const misses = Array.isArray(parsed.misses)
      ? parsed.misses.filter(isNonEmptyString).slice(0, 4)
      : [];

    const reasoning = parsed.reasoning ?? response.reasoning;

    const evaluatorRawRequest: JsonObject = {
      id: randomUUID(),
      provider: judgeProvider.id,
      prompt,
      target: context.target.name,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(context.judgeModel !== undefined ? { model: context.judgeModel } : {}),
    };

    return {
      score,
      hits,
      misses,
      expectedAspectCount: hits.length + misses.length || 1,
      reasoning,
      evaluatorRawRequest,
    };
  }
}

const QUALITY_SYSTEM_PROMPT = [
  "You are an expert evaluator. Your goal is to grade the generated_answer based on how well it achieves the expected_outcome for the original task.",
  "",
  "Use the reference_answer as a gold standard for a high-quality response. The generated_answer does not need to match it verbatim, but it should capture the key points and follow the same spirit.",
  "",
  "Be concise and focused in your evaluation. Provide succinct, specific feedback rather than verbose explanations.",
  "",
  "You must respond with a single JSON object matching this schema:",
  "",
  "{",
  '  "score": <number between 0.0 and 1.0>,',
  '  "hits": [<array of strings, max 4 items, brief specific achievements>],',
  '  "misses": [<array of strings, max 4 items, brief specific failures or omissions, empty if none>],',
  '  "reasoning": "<string, concise explanation for the score, 1-2 sentences max>"',
  "}",
].join("\n");

function buildQualityPrompt(testCase: EvalCase, candidate: string): string {
  const parts = [
    "[[ ## expected_outcome ## ]]",
    testCase.outcome.trim(),
    "",
    "[[ ## request ## ]]",
    testCase.task.trim(),
    "",
    "[[ ## reference_answer ## ]]",
    testCase.expected_assistant_raw.trim(),
    "",
    "[[ ## generated_answer ## ]]",
    candidate.trim(),
    "",
    "Respond with a single JSON object matching the schema described in the system prompt.",
  ];
  return parts.join("\n");
}

function clampScore(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function parseQualityResponse(response: ProviderResponse): {
  readonly score?: number;
  readonly hits?: unknown;
  readonly misses?: unknown;
  readonly reasoning?: string;
} {
  const text = typeof response.text === "string" ? response.text.trim() : "";
  if (text.length === 0) {
    return {};
  }

  // Try parsing JSON directly
  const direct = attemptParseJson(text);
  if (direct && validateQualityJson(direct)) {
    return direct;
  }

  // Try extracting JSON from markdown code blocks or surrounding text
  const extracted = extractJsonBlob(text);
  if (extracted) {
    const parsed = attemptParseJson(extracted);
    if (parsed && validateQualityJson(parsed)) {
      return parsed;
    }
  }

  return {};
}

function attemptParseJson(text: string):
  | {
      readonly score?: number;
      readonly hits?: unknown;
      readonly misses?: unknown;
      readonly reasoning?: string;
    }
  | undefined {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const score = typeof parsed.score === "number" ? parsed.score : undefined;
    const hits = parsed.hits;
    const misses = parsed.misses;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : undefined;
    return { score, hits, misses, reasoning };
  } catch {
    return undefined;
  }
}

function validateQualityJson(parsed: {
  readonly score?: number;
  readonly hits?: unknown;
  readonly misses?: unknown;
  readonly reasoning?: string;
}): boolean {
  // Validate score is present and in valid range [0.0, 1.0]
  if (typeof parsed.score !== "number") {
    return false;
  }
  if (Number.isNaN(parsed.score) || !Number.isFinite(parsed.score)) {
    return false;
  }
  if (parsed.score < 0 || parsed.score > 1) {
    return false;
  }

  // Validate hits is an array of strings (max 4 will be enforced during extraction)
  if (parsed.hits !== undefined) {
    if (!Array.isArray(parsed.hits)) {
      return false;
    }
    if (!parsed.hits.every((item) => typeof item === "string")) {
      return false;
    }
  }

  // Validate misses is an array of strings (max 4 will be enforced during extraction)
  if (parsed.misses !== undefined) {
    if (!Array.isArray(parsed.misses)) {
      return false;
    }
    if (!parsed.misses.every((item) => typeof item === "string")) {
      return false;
    }
  }

  // Validate reasoning is a string if present
  if (parsed.reasoning !== undefined && typeof parsed.reasoning !== "string") {
    return false;
  }

  return true;
}

function extractJsonBlob(text: string): string | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  return match?.[0];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Code Evaluator

export interface CodeEvaluatorOptions {
  readonly script: string;
  readonly cwd?: string;
  readonly agentTimeoutMs?: number;
}

export class CodeEvaluator implements Evaluator {
  readonly kind = "code";

  private readonly script: string;
  private readonly cwd?: string;
  private readonly agentTimeoutMs?: number;

  constructor(options: CodeEvaluatorOptions) {
    this.script = options.script;
    this.cwd = options.cwd;
    this.agentTimeoutMs = options.agentTimeoutMs;
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationScore> {
    const inputPayload = JSON.stringify(
      {
        task: context.evalCase.task,
        outcome: context.evalCase.outcome,
        expected: context.evalCase.expected_assistant_raw,
        output: context.candidate,
        system_message: context.promptInputs.systemMessage ?? "",
        guideline_paths: context.evalCase.guideline_paths,
        attachments: context.evalCase.file_paths,
        user_segments: context.evalCase.user_segments,
      },
      null,
      2,
    );

    try {
      const stdout = await executeScript(this.script, inputPayload, this.agentTimeoutMs, this.cwd);
      const parsed = parseJsonSafe(stdout);
      const score = clampScore(typeof parsed?.score === "number" ? parsed.score : 0);
      const hits = Array.isArray(parsed?.hits) ? parsed.hits.filter(isNonEmptyString) : [];
      const misses = Array.isArray(parsed?.misses) ? parsed.misses.filter(isNonEmptyString) : [];
      const reasoning = typeof parsed?.reasoning === "string" ? parsed.reasoning : undefined;

      return {
        score,
        hits,
        misses,
        expectedAspectCount: hits.length + misses.length || 1,
        reasoning,
        evaluatorRawRequest: {
          script: this.script,
          ...(this.cwd ? { cwd: this.cwd } : {}),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        score: 0,
        hits: [],
        misses: [`Code evaluator failed: ${message}`],
        expectedAspectCount: 1,
        reasoning: message,
        evaluatorRawRequest: {
          script: this.script,
          ...(this.cwd ? { cwd: this.cwd } : {}),
          error: message,
        },
      };
    }
  }
}

// Helper functions for CodeEvaluator

async function executeScript(
  scriptPath: string,
  input: string,
  agentTimeoutMs?: number,
  cwd?: string,
): Promise<string> {
  const { spawn } = await import("node:child_process");
  
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(scriptPath, {
      shell: true,
      cwd,
    });

    let stdout = "";
    let stderr = "";

    const timeout = agentTimeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`Code evaluator timed out after ${agentTimeoutMs}ms`));
        }, agentTimeoutMs)
      : undefined;

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on("exit", (code) => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      if (code && code !== 0 && stderr.length > 0) {
        reject(new Error(`Code evaluator exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin?.write(input);
    child.stdin?.end();
  });
}

function parseJsonSafe(payload: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
