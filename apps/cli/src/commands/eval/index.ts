import type { Command } from "commander";

import { runEvalCommand } from "./run-eval.js";

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function registerEvalCommand(program: Command): Command {
  program
    .command("eval")
    .description("Run BbEval test suites and report results")
    .argument("<test-file>", "Path to the evaluation .test.yaml file")
    .option("--target <name>", "Override target name from targets.yaml", "default")
    .option("--targets <path>", "Path to targets.yaml (overrides discovery)")
    .option("--test-id <id>", "Run only the test case with this identifier")
    .option("--out <path>", "Write results to the specified path")
    .option("--format <format>", "Output format: 'jsonl' or 'yaml' (default: jsonl)", "jsonl")
    .option("--dry-run", "Use mock provider responses instead of real LLM calls", false)
    .option(
      "--agent-timeout <seconds>",
      "Timeout in seconds for provider responses (default: 120)",
      (value) => parseInteger(value, 120),
      120,
    )
    .option(
      "--max-retries <count>",
      "Retry count for timeout recoveries (default: 2)",
      (value) => parseInteger(value, 2),
      2,
    )
    .option("--cache", "Enable in-memory provider response cache", false)
    .option("--verbose", "Enable verbose logging", false)
    .option(
      "--dump-prompts [dir]",
      "Persist prompt payloads for debugging (optional custom directory)",
    )
    .action(async (testFile: string, rawOptions: Record<string, unknown>) => {
      await runEvalCommand({ testFile, rawOptions });
    });

  return program;
}
