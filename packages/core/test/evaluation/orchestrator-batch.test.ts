import { afterEach, describe, expect, it, vi } from "vitest";

import { runEvaluation } from "../../src/evaluation/orchestrator.js";
import type { Provider, ProviderRequest, ProviderResponse } from "../../src/evaluation/providers/types.js";
import type { ResolvedTarget } from "../../src/evaluation/providers/targets.js";
import type { Grader } from "../../src/evaluation/grading.js";
import type { EvalCase } from "../../src/evaluation/types.js";
import * as yamlParser from "../../src/evaluation/yaml-parser.js";

class StubBatchProvider implements Provider {
  readonly id = "stub";
  readonly kind = "mock";
  readonly targetName: string;
  readonly supportsBatch = true;
  invokeCalls = 0;
  invokeBatchCalls = 0;

  constructor(targetName: string, private readonly batchShouldThrow = false) {
    this.targetName = targetName;
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    this.invokeCalls += 1;
    return { text: `single-${request.evalCaseId ?? "unknown"}` };
  }

  async invokeBatch(requests: readonly ProviderRequest[]): Promise<readonly ProviderResponse[]> {
    this.invokeBatchCalls += 1;
    if (this.batchShouldThrow) {
      throw new Error("batch failure");
    }
    return requests.map((request) => ({ text: `batch-${request.evalCaseId ?? "unknown"}` }));
  }
}

const stubGrader: Grader = {
  kind: "heuristic",
  async grade(context) {
    return {
      score: 1,
      hits: [`hit-${context.candidate}`],
      misses: [],
      expectedAspectCount: 0,
    };
  },
};

const evalCases: EvalCase[] = [
  {
    id: "one",
    task: "t1",
    user_segments: [],
    expected_assistant_raw: "",
    guideline_paths: [],
    file_paths: [],
    code_snippets: [],
    outcome: "",
    grader: "heuristic",
  },
  {
    id: "two",
    task: "t2",
    user_segments: [],
    expected_assistant_raw: "",
    guideline_paths: [],
    file_paths: [],
    code_snippets: [],
    outcome: "",
    grader: "heuristic",
  },
];

const target: ResolvedTarget = {
  kind: "mock",
  name: "batch-mock",
  judgeTarget: undefined,
  workers: 1,
  providerBatching: true,
  config: {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

function mockParsers(): void {
  vi.spyOn(yamlParser, "loadEvalCases").mockResolvedValue(evalCases);
  vi.spyOn(yamlParser, "buildPromptInputs").mockImplementation(async (testCase) => ({
    request: `req-${testCase.id}`,
    guidelines: "",
    systemMessage: undefined,
  }));
}

describe("runEvaluation provider batching", () => {
  it("uses provider-managed batching when enabled", async () => {
    mockParsers();
    const provider = new StubBatchProvider(target.name);

    const results = await runEvaluation({
      testFilePath: "dummy.yaml",
      repoRoot: ".",
      target,
      env: {},
      graders: { heuristic: stubGrader },
      providerFactory: () => provider,
      maxRetries: 0,
    });

    expect(provider.invokeBatchCalls).toBe(1);
    expect(provider.invokeCalls).toBe(0);
    expect(results.map((r) => r.model_answer)).toEqual(["batch-one", "batch-two"]);
  });

  it("falls back to per-case dispatch when batch fails", async () => {
    mockParsers();
    const provider = new StubBatchProvider(target.name, true);

    const results = await runEvaluation({
      testFilePath: "dummy.yaml",
      repoRoot: ".",
      target,
      env: {},
      graders: { heuristic: stubGrader },
      providerFactory: () => provider,
      maxRetries: 0,
    });

    expect(provider.invokeBatchCalls).toBe(1);
    expect(provider.invokeCalls).toBe(evalCases.length);
    expect(results.map((r) => r.model_answer)).toEqual(["single-one", "single-two"]);
  });
});
