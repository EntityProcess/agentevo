import type { Command } from "commander";

import { formatSummary, isTTY } from "./format-output.js";
import { validateFiles } from "./validate-files.js";

interface ValidateCommandOptions {
  // No options currently
}

async function runValidateCommand(paths: readonly string[], _options: ValidateCommandOptions): Promise<void> {
  if (paths.length === 0) {
    console.error("Error: No paths specified. Usage: agentv validate <paths...>");
    process.exit(1);
  }

  const summary = await validateFiles(paths);

  // Output results
  const useColors = isTTY();
  console.log(formatSummary(summary, useColors));

  // Exit with appropriate code
  if (summary.invalidFiles > 0) {
    process.exit(1);
  }
}

export function registerValidateCommand(program: Command): Command {
  program
    .command("validate")
    .description("Validate AgentV eval and targets YAML files")
    .argument("<paths...>", "Files or directories to validate")
    .action(async (paths: string[], _options: ValidateCommandOptions) => {
      try {
        await runValidateCommand(paths, _options);
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return program;
}
