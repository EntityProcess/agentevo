import { randomUUID } from "node:crypto";

import type { ResolvedTarget } from "./providers/targets.js";
import type { Provider, ProviderResponse } from "./providers/types.js";
import { extractAspects, isErrorLike, scoreCandidateResponse } from "./scoring.js";
import type { JsonObject, TestCase } from "./types.js";

export interface GradeContext {
  readonly testCase: TestCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly attempt: number;
  readonly promptInputs: {
    readonly request: string;
    readonly guidelines: string;
  };
  readonly now: Date;
  readonly judgeProvider?: Provider;
}

export interface GradeResult {
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  readonly expectedAspectCount: number;
  readonly reasoning?: string;
  readonly rawAspects?: readonly string[];
  readonly graderRawRequest?: JsonObject;
}

export interface Grader {
  readonly kind: string;
  grade(context: GradeContext): Promise<GradeResult> | GradeResult;
}

export class HeuristicGrader implements Grader {
  readonly kind = "heuristic";

  grade(context: GradeContext): GradeResult {
    const expectedAspects = extractAspects(context.testCase.expected_assistant_raw);
    const result = scoreCandidateResponse(context.candidate, expectedAspects);

    const misses = [...result.misses];
    if (expectedAspects.length === 0 && isErrorLike(context.candidate)) {
      const firstLine = context.candidate.split(/\r?\n/)[0]?.trim();
      if (firstLine && !misses.includes(firstLine)) {
        misses.unshift(firstLine);
      }
    }

    return {
      score: result.score,
      hits: result.hits,
      misses,
      expectedAspectCount: result.totalAspects,
      rawAspects: result.rawAspects,
    };
  }
}

type JudgeProviderResolver = (context: GradeContext) => Promise<Provider | undefined>;

export interface QualityGraderOptions {
  readonly resolveJudgeProvider: JudgeProviderResolver;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export class QualityGrader implements Grader {
  readonly kind = "llm_judge";

  private readonly resolveJudgeProvider: JudgeProviderResolver;
  private readonly maxOutputTokens?: number;
  private readonly temperature?: number;

  constructor(options: QualityGraderOptions) {
    this.resolveJudgeProvider = options.resolveJudgeProvider;
    this.maxOutputTokens = options.maxOutputTokens;
    this.temperature = options.temperature;
  }

  async grade(context: GradeContext): Promise<GradeResult> {
    const judgeProvider = await this.resolveJudgeProvider(context);
    if (!judgeProvider) {
      throw new Error("No judge provider available for LLM grading");
    }

    const prompt = buildQualityPrompt(context.testCase, context.candidate);
    const metadata: JsonObject = {
      systemPrompt: QUALITY_SYSTEM_PROMPT,
    };

    const response = await judgeProvider.invoke({
      prompt,
      metadata,
      testCaseId: context.testCase.id,
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

    const graderRawRequest: JsonObject = {
      id: randomUUID(),
      provider: judgeProvider.id,
      prompt,
      systemPrompt: QUALITY_SYSTEM_PROMPT,
      target: context.target.name,
    };

    return {
      score,
      hits,
      misses,
      expectedAspectCount: hits.length + misses.length || 1,
      reasoning,
      graderRawRequest,
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

function buildQualityPrompt(testCase: TestCase, candidate: string): string {
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
