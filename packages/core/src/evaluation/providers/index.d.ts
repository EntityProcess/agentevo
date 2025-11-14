import type { ResolvedTarget } from "./targets";
import { resolveTargetDefinition } from "./targets";
import type { EnvLookup, Provider, TargetDefinition } from "./types";
export type { EnvLookup, Provider, ProviderKind, ProviderRequest, ProviderResponse, TargetDefinition, } from "./types";
export type { AnthropicResolvedConfig, AzureResolvedConfig, GeminiResolvedConfig, MockResolvedConfig, ResolvedTarget, VSCodeResolvedConfig, } from "./targets";
export { resolveTargetDefinition };
export { readTargetDefinitions, listTargetNames } from "./targets-file";
export declare function createProvider(target: ResolvedTarget): Provider;
export declare function resolveAndCreateProvider(definition: TargetDefinition, env?: EnvLookup): Provider;
