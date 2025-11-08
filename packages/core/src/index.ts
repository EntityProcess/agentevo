export * from "./evaluation/types.js";
export * from "./evaluation/yaml-parser.js";
export * from "./evaluation/providers/index.js";

export type AgentKernel = {
  status: string;
};

export function createAgentKernel(): AgentKernel {
  return { status: "stub" };
}
