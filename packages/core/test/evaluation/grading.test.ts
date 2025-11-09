import { describe, expect, it } from "vitest";

import type { Provider, ProviderResponse } from "../../src/evaluation/providers/types.js";
import type { ResolvedTarget } from "../../src/evaluation/providers/targets.js";
import type { TestCase } from "../../src/evaluation/types.js";
import { HeuristicGrader, QualityGrader } from "../../src/evaluation/grading.js";

class StubProvider implements Provider {
  readonly id = "stub";
  readonly kind = "mock" as const;
  readonly targetName = "stub";

  constructor(private readonly response: ProviderResponse) {}

  async invoke(): Promise<ProviderResponse> {
    return this.response;
  }
}

const baseTestCase: TestCase = {
  id: "case-1",
  task: "Improve the logging implementation",
  user_segments: [{ type: "text", value: "Please add logging" }],
  expected_assistant_raw: "- add structured logging\n- avoid global state",
  guideline_paths: [],
  code_snippets: [],
  outcome: "Logging improvements applied",
  grader: "heuristic",
};

const baseTarget: ResolvedTarget = {
  kind: "mock",
  name: "mock",
  config: { response: "{}" },
};

describe("HeuristicGrader", () => {
  it("scores candidate using extracted aspects", () => {
    const grader = new HeuristicGrader();
    const score = grader.grade({
      testCase: baseTestCase,
      candidate: "Please add structured logging and avoid global state",
      target: baseTarget,
      provider: new StubProvider({ text: "" }),
      attempt: 0,
      promptInputs: { request: "", guidelines: "" },
      now: new Date(),
    });

    expect(score.score).toBeGreaterThan(0.5);
    expect(score.hits).toContain("add structured logging");
  });
});

describe("QualityGrader", () => {
  it("parses JSON response and returns grade", async () => {
    const judgeProvider = new StubProvider({
      text: JSON.stringify({
        score: 0.8,
        hits: ["Captured logging requirement"],
        misses: ["Did not mention tests"],
        reasoning: "Solid coverage with minor omissions",
      }),
    });

    const grader = new QualityGrader({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await grader.grade({
      testCase: { ...baseTestCase, grader: "llm_judge" },
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
    expect(result.graderRawRequest).toBeDefined();
  });

  it("tolerates non-JSON output by falling back to defaults", async () => {
    const judgeProvider = new StubProvider({ text: "Final score: 0.5" });
    const grader = new QualityGrader({
      resolveJudgeProvider: async () => judgeProvider,
    });

    const result = await grader.grade({
      testCase: { ...baseTestCase, grader: "llm_judge" },
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
