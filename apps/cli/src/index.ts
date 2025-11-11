import { Command } from "commander";
import { readFileSync } from "node:fs";

import { registerEvalCommand } from "./commands/eval/index.js";
import { registerStatusCommand } from "./commands/status.js";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export function createProgram(): Command {
  const program = new Command();

  program.name("agentevo").description("AgentEvo CLI scaffolding").version(packageJson.version);

  registerStatusCommand(program);
  registerEvalCommand(program);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<Command> {
  const program = createProgram();
  await program.parseAsync(argv);
  return program;
}


