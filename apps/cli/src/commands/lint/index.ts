import type { Command } from "commander";
import { lintFiles } from "./lint-files.js";
import { formatSummary, isTTY } from "./format-output.js";

interface LintCommandOptions {
  // No options currently
}

async function runLintCommand(paths: readonly string[], options: LintCommandOptions): Promise<void> {
  if (paths.length === 0) {
    console.error("Error: No paths specified. Usage: agentevo lint <paths...>");
    process.exit(1);
  }

  const summary = await lintFiles(paths);

  // Output results
  const useColors = isTTY();
  console.log(formatSummary(summary, useColors));

  // Exit with appropriate code
  if (summary.invalidFiles > 0) {
    process.exit(1);
  }
}

export function registerLintCommand(program: Command): Command {
  program
    .command("lint")
    .description("Validate AgentEvo eval and targets YAML files")
    .argument("<paths...>", "Files or directories to lint")
    .action(async (paths: string[], options: LintCommandOptions) => {
      try {
        await runLintCommand(paths, options);
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return program;
}
