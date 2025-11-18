import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeuristicGrader } from "../../src/evaluation/grading.js";
import { runTestCase, type EvaluationCache } from "../../src/evaluation/orchestrator.js";
import type { ResolvedTarget } from "../../src/evaluation/providers/targets.js";
import type { Provider, ProviderResponse } from "../../src/evaluation/providers/types.js";
import type { TestCase } from "../../src/evaluation/types.js";

class SequenceProvider implements Provider {
  readonly id: string;
  readonly kind = "mock" as const;
  readonly targetName: string;

  private readonly sequence: Array<() => ProviderResponse>;
  private readonly errors: Array<() => Error>;
  callIndex = 0;

  constructor(targetName: string, options: { responses?: ProviderResponse[]; errors?: Error[] }) {
    this.id = `mock:${targetName}`;
    this.targetName = targetName;
    this.sequence = (options.responses ?? []).map((response) => () => response);
    this.errors = (options.errors ?? []).map((error) => () => error);
  }

  async invoke(): Promise<ProviderResponse> {
    if (this.callIndex < this.errors.length) {
      const errorFactory = this.errors[this.callIndex];
      this.callIndex += 1;
      throw errorFactory();
    }
    if (this.callIndex - this.errors.length < this.sequence.length) {
      const responseFactory = this.sequence[this.callIndex - this.errors.length];
      this.callIndex += 1;
      return responseFactory();
    }
    throw new Error("No more responses configured");
  }
}

const baseTestCase: TestCase = {
  id: "case-1",
  task: "Explain logging improvements",
  user_segments: [{ type: "text", value: "Explain logging improvements" }],
  expected_assistant_raw: "- add structured logging\n- avoid global state",
  guideline_paths: [],
  code_snippets: [],
  outcome: "Logging improved",
  grader: "heuristic",
};

const baseTarget: ResolvedTarget = {
  kind: "mock",
  name: "mock",
  config: { response: "{}" },
};

const graderRegistry = {
  heuristic: new HeuristicGrader(),
};

describe("runTestCase", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces evaluation result using heuristic grader", async () => {
    const provider = new SequenceProvider("mock", {
      responses: [{ text: "You should add structured logging and avoid global state." }],
    });

    const result = await runTestCase({
      testCase: baseTestCase,
      provider,
      target: baseTarget,
      graders: graderRegistry,
      now: () => new Date("2024-01-01T00:00:00Z"),
    });

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.hits).toHaveLength(2);
    expect(result.misses).toHaveLength(0);
    expect(result.timestamp).toBe("2024-01-01T00:00:00.000Z");
  });

  it("reuses cached provider response when available", async () => {
    const provider = new SequenceProvider("mock", {
      responses: [{ text: "Use structured logging." }],
    });

    const cache: EvaluationCache = {
      store: new Map<string, ProviderResponse>(),
      async get(key: string) {
        return (this as unknown as { store: Map<string, ProviderResponse> }).store.get(key);
      },
      async set(key: string, value: ProviderResponse) {
        (this as unknown as { store: Map<string, ProviderResponse> }).store.set(key, value);
      },
    } as EvaluationCache & { store: Map<string, ProviderResponse> };

    const first = await runTestCase({
      testCase: baseTestCase,
      provider,
      target: baseTarget,
      graders: graderRegistry,
      cache,
      useCache: true,
    });

    expect(first.model_answer).toContain("structured logging");

    const second = await runTestCase({
      testCase: baseTestCase,
      provider,
      target: baseTarget,
      graders: graderRegistry,
      cache,
      useCache: true,
    });

    expect(second.model_answer).toContain("structured logging");
    expect(provider["callIndex"]).toBe(1);
  });

  it("retries timeout errors up to maxRetries", async () => {
    const provider = new SequenceProvider("mock", {
      errors: [new Error("Request timeout")],
      responses: [{ text: "Add structured logging." }],
    });

    const result = await runTestCase({
      testCase: baseTestCase,
      provider,
      target: baseTarget,
      graders: graderRegistry,
      maxRetries: 1,
    });

    expect(result.score).toBeGreaterThan(0);
  });

  it("returns error result on unrecoverable failure", async () => {
    const provider = new SequenceProvider("mock", {
      errors: [new Error("Provider failure")],
    });

    const result = await runTestCase({
      testCase: baseTestCase,
      provider,
      target: baseTarget,
      graders: graderRegistry,
    });

    expect(result.score).toBe(0);
    expect(result.misses[0]).toContain("Provider failure");
  });

  it("dumps prompt payloads when directory provided", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "agentv-prompts-"));
    const provider = new SequenceProvider("mock", {
      responses: [{ text: "Add structured logging." }],
    });

    await runTestCase({
      testCase: baseTestCase,
      provider,
      target: baseTarget,
      graders: graderRegistry,
      promptDumpDir: directory,
    });

    const files = readdirSync(directory);
    expect(files.length).toBeGreaterThan(0);

    const payload = JSON.parse(readFileSync(path.join(directory, files[0]), "utf8")) as {
      request: string;
      guideline_paths: unknown;
    };
    expect(payload.request).toContain("Explain logging improvements");
    expect(Array.isArray(payload.guideline_paths)).toBe(true);
  });
});
