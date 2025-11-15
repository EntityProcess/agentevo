import { AnthropicProvider, AzureProvider, GeminiProvider } from "./ax.js";
import { MockProvider } from "./mock.js";
import type { ResolvedTarget } from "./targets.js";
import { resolveTargetDefinition } from "./targets.js";
import type { EnvLookup, Provider, TargetDefinition } from "./types.js";
import { VSCodeProvider } from "./vscode.js";

export type {
  EnvLookup,
  Provider,
  ProviderKind,
  ProviderRequest,
  ProviderResponse,
  TargetDefinition,
} from "./types.js";

export type {
  AnthropicResolvedConfig,
  AzureResolvedConfig,
  GeminiResolvedConfig,
  MockResolvedConfig,
  ResolvedTarget,
  VSCodeResolvedConfig,
} from "./targets.js";

export { resolveTargetDefinition };
export { readTargetDefinitions, listTargetNames } from "./targets-file.js";
export { ensureVSCodeSubagents, type EnsureSubagentsOptions, type EnsureSubagentsResult } from "./vscode.js";

export function createProvider(target: ResolvedTarget): Provider {
  switch (target.kind) {
    case "azure":
      return new AzureProvider(target.name, target.config);
    case "anthropic":
      return new AnthropicProvider(target.name, target.config);
    case "gemini":
      return new GeminiProvider(target.name, target.config);
    case "mock":
      return new MockProvider(target.name, target.config);
    case "vscode":
    case "vscode-insiders":
      return new VSCodeProvider(target.name, target.config, target.kind);
    default: {
      // Exhaustive check
      const neverTarget: never = target;
      throw new Error(`Unsupported provider kind ${(neverTarget as { kind: string }).kind}`);
    }
  }
}

export function resolveAndCreateProvider(
  definition: TargetDefinition,
  env: EnvLookup = process.env,
): Provider {
  const resolved = resolveTargetDefinition(definition, env);
  return createProvider(resolved);
}
