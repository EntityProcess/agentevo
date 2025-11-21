import { Command } from "commander";
import { readFileSync } from "node:fs";

import { registerEvalCommand } from "./commands/eval/index.js";
import { initCommand } from "./commands/init/index.js";
import { registerValidateCommand } from "./commands/validate/index.js";
import { registerStatusCommand } from "./commands/status.js";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export function createProgram(): Command {
  const program = new Command();

  program.name("agentv").description("AgentV CLI scaffolding").version(packageJson.version);

  registerStatusCommand(program);
  registerEvalCommand(program);
  registerValidateCommand(program);

  // Init command
  program
    .command("init [path]")
    .description("Initialize AgentV in your project (installs prompt templates and schema to .github)")
    .action(async (targetPath?: string) => {
      try {
        await initCommand({ targetPath });
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<Command> {
  const program = createProgram();
  await program.parseAsync(argv);
  return program;
}


