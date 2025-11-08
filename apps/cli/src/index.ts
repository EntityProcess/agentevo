import { Command } from "commander";
import { pathToFileURL } from "node:url";

import { registerStatusCommand } from "./commands/status.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("agentevo")
    .description("AgentEvo CLI scaffolding")
    .version("0.0.1");

  registerStatusCommand(program);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<Command> {
  const program = createProgram();
  await program.parseAsync(argv);
  return program;
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(process.argv[1]).href;

  if (import.meta.url === entryUrl) {
    void runCli();
  }
}
