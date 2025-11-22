import { describe, expect, it } from "vitest";

import { LlmJudgeEvaluator } from "../../src/evaluation/evaluators.js";
import type { ResolvedTarget } from "../../src/evaluation/providers/targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "../../src/evaluation/providers/types.js";
import type { EvalCase, JsonObject } from "../../src/evaluation/types.js";

class StubProvider implements Provider {
  readonly id = "stub";
  readonly kind = "mock" as const;
  readonly targetName = "stub";

  constructor(private readonly response: ProviderResponse) {}

  async invoke(): Promise<ProviderResponse> {
    return this.response;
  }
}

const baseTestCase: EvalCase = {
  id: "case-1",
  task: "Improve the logging implementation",
  user_segments: [{ type: "text", value: "Please add logging" }],
  expected_assistant_raw: "- add structured logging\n- avoid global state",
  guideline_paths: [],
  file_paths: [],
  code_snippets: [],
  outcome: "Logging improvements applied",
  evaluator: "llm_judge",
};

const baseTarget: ResolvedTarget = {
  kind: "mock",
  name: "mock",
  config: { response: "{}" },
};

describe("LlmJudgeEvaluator", () => {
  it("parses JSON response and returns evaluation score", async () => {
    const judgeProvider = new StubProvider({
      text: JSON.stringify({
        score: 0.8,
        hits: ["Captured logging requirement"],
        misses: ["Did not mention tests"],
        reasoning: "Solid coverage with minor omissions",
      }),
    });

    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    expect(result.score).toBeCloseTo(0.8);
    expect(result.hits).toContain("Captured logging requirement");
    expect(result.misses).toContain("Did not mention tests");
    expect(result.reasoning).toBe("Solid coverage with minor omissions");
    expect(result.evaluatorRawRequest).toBeDefined();
  });

  it("parses JSON from markdown code block", async () => {
    const judgeProvider = new StubProvider({
      text: `Here is the evaluation:\n\n\`\`\`json\n${JSON.stringify({
        score: 0.75,
        hits: ["Clear structure", "Good examples"],
        misses: ["Missing edge cases"],
        reasoning: "Well done overall.",
      })}\n\`\`\``,
    });

    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    expect(result.score).toBeCloseTo(0.75);
    expect(result.hits).toHaveLength(2);
    expect(result.misses).toHaveLength(1);
  });

  it("validates score is in range [0.0, 1.0]", async () => {
    const judgeProvider = new StubProvider({
      text: JSON.stringify({
        score: 1.5, // Invalid: out of range
        hits: ["Good"],
        misses: [],
        reasoning: "Too high",
      }),
    });

    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    // Should fall back to defaults when validation fails
    expect(result.score).toBe(0);
    expect(result.hits).toHaveLength(0);
    expect(result.misses).toHaveLength(0);
  });

  it("enforces max 4 entries for hits and misses", async () => {
    const judgeProvider = new StubProvider({
      text: JSON.stringify({
        score: 0.9,
        hits: ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"],
        misses: ["Miss 1", "Miss 2", "Miss 3", "Miss 4", "Miss 5"],
        reasoning: "Too many items",
      }),
    });

    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    expect(result.score).toBeCloseTo(0.9);
    expect(result.hits).toHaveLength(4); // Truncated to max 4
    expect(result.misses).toHaveLength(4); // Truncated to max 4
  });

  it("uses a custom system prompt when provided", async () => {
    const customPrompt = "Custom grading system prompt";

    class CapturingProvider implements Provider {
      readonly id = "capturing";
      readonly kind = "mock" as const;
      readonly targetName = "capturing";
      metadata?: JsonObject;

      constructor(private readonly response: ProviderResponse) {}

      async invoke(request: ProviderRequest): Promise<ProviderResponse> {
        this.metadata = request.metadata;
        return this.response;
      }
    }

    const judgeProvider = new CapturingProvider({
      text: JSON.stringify({
        score: 0.7,
        hits: ["Used custom prompt"],
        misses: [],
      }),
    });

    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
      customPrompt,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    expect(result.score).toBeCloseTo(0.7);
    expect(judgeProvider.metadata?.systemPrompt).toBe(customPrompt);
    expect(result.evaluatorRawRequest?.systemPrompt).toBe(customPrompt);
  });

  it("rejects JSON with invalid hits/misses types", async () => {
    const judgeProvider = new StubProvider({
      text: JSON.stringify({
        score: 0.8,
        hits: "Not an array", // Invalid type
        misses: [],
        reasoning: "Invalid hits",
      }),
    });

    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    // Should fall back to defaults when validation fails
    expect(result.score).toBe(0);
    expect(result.hits).toHaveLength(0);
    expect(result.misses).toHaveLength(0);
  });

  it("tolerates non-JSON output by falling back to defaults", async () => {
    const judgeProvider = new StubProvider({ text: "Final score: 0.5" });
    const evaluator = new LlmJudgeEvaluator({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await evaluator.evaluate({
      evalCase: { ...baseTestCase, evaluator: "llm_judge" },
      candidate: "Answer",
      target: baseTarget,
      provider: judgeProvider,
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    expect(result.score).toBe(0);
    expect(result.hits).toHaveLength(0);
    expect(result.misses).toHaveLength(0);
  });
});
