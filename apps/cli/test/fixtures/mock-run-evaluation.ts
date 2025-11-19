import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface ResolvedTargetLike {
  readonly name: string;
  readonly kind: string;
}

interface RunEvaluationOptionsLike {
  readonly testFilePath: string;
  readonly repoRoot: string | URL;
  readonly target: ResolvedTargetLike;
  readonly targets?: ReadonlyArray<unknown>;
  readonly promptDumpDir?: string;
  readonly cache?: unknown;
  readonly useCache?: boolean;
  readonly testId?: string;
  readonly verbose?: boolean;
  readonly onResult?: (result: EvaluationResultLike) => Promise<void> | void;
}

interface EvaluationResultLike {
  readonly eval_id: string;
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  readonly model_answer: string;
  readonly expected_aspect_count: number;
  readonly target: string;
  readonly timestamp: string;
  readonly reasoning?: string;
  readonly raw_aspects?: readonly string[];
}

function buildResults(targetName: string): EvaluationResultLike[] {
  const baseTime = new Date("2024-01-01T00:00:00.000Z");
  return [
    {
      eval_id: "case-alpha",
      score: 0.6,
      hits: ["alpha"],
      misses: [],
      model_answer: "Alpha answer",
      expected_aspect_count: 1,
      target: targetName,
      timestamp: baseTime.toISOString(),
      reasoning: "Alpha reasoning",
      raw_aspects: ["alpha"],
    },
    {
      eval_id: "case-beta",
      score: 0.9,
      hits: ["beta", "gamma"],
      misses: ["delta"],
      model_answer: "Beta answer",
      expected_aspect_count: 3,
      target: targetName,
      timestamp: new Date(baseTime.getTime() + 60_000).toISOString(),
      reasoning: "Beta reasoning",
      raw_aspects: ["beta", "gamma", "delta"],
    },
  ];
}

async function maybeWriteDiagnostics(
  options: RunEvaluationOptionsLike,
  results: readonly EvaluationResultLike[],
): Promise<void> {
  const diagnosticsPath = process.env.AGENTEVO_CLI_EVAL_RUNNER_OUTPUT;
  if (!diagnosticsPath) {
    return;
  }

  const payload = {
    target: options.target?.name,
    targetKind: options.target?.kind,
    promptDumpDir: options.promptDumpDir,
    testId: options.testId ?? null,
    useCache: options.useCache ?? false,
    envSample: process.env.CLI_ENV_SAMPLE ?? null,
    resultCount: results.length,
  } satisfies Record<string, unknown>;

  await writeFile(diagnosticsPath, JSON.stringify(payload, null, 2), "utf8");
}

async function maybeWritePromptDump(promptDumpDir: string | undefined, testIds: readonly string[]): Promise<void> {
  if (!promptDumpDir) {
    return;
  }
  await mkdir(promptDumpDir, { recursive: true });
  const payload = { source: "mock-run-evaluation" } satisfies Record<string, unknown>;
  for (const testId of testIds) {
    const filePath = path.join(promptDumpDir, `${testId}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}

export async function runEvaluation(
  options: RunEvaluationOptionsLike,
): Promise<readonly EvaluationResultLike[]> {
  const results = buildResults(options.target?.name ?? "unknown-target");

  await maybeWriteDiagnostics(options, results);
  await maybeWritePromptDump(options.promptDumpDir, results.map((result) => result.eval_id));

  for (const result of results) {
    if (options.onResult) {
      await options.onResult(result);
    }
  }

  return results;
}
