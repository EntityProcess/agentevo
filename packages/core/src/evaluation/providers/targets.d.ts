import type { EnvLookup, TargetDefinition } from "./types";
export interface AzureResolvedConfig {
    readonly resourceName: string;
    readonly deploymentName: string;
    readonly apiKey: string;
    readonly version?: string;
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
}
export interface AnthropicResolvedConfig {
    readonly apiKey: string;
    readonly model: string;
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
    readonly thinkingBudget?: number;
}
export interface GeminiResolvedConfig {
    readonly apiKey: string;
    readonly model: string;
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
}
export interface MockResolvedConfig {
    readonly response?: string;
}
export interface VSCodeResolvedConfig {
    readonly command: string;
    readonly waitForResponse: boolean;
    readonly dryRun: boolean;
    readonly subagentRoot?: string;
    readonly workspaceTemplate?: string;
}
export type ResolvedTarget = {
    readonly kind: "azure";
    readonly name: string;
    readonly judgeTarget?: string;
    readonly config: AzureResolvedConfig;
} | {
    readonly kind: "anthropic";
    readonly name: string;
    readonly judgeTarget?: string;
    readonly config: AnthropicResolvedConfig;
} | {
    readonly kind: "gemini";
    readonly name: string;
    readonly judgeTarget?: string;
    readonly config: GeminiResolvedConfig;
} | {
    readonly kind: "mock";
    readonly name: string;
    readonly judgeTarget?: string;
    readonly config: MockResolvedConfig;
} | {
    readonly kind: "vscode" | "vscode-insiders";
    readonly name: string;
    readonly judgeTarget?: string;
    readonly config: VSCodeResolvedConfig;
};
export declare function resolveTargetDefinition(definition: TargetDefinition, env?: EnvLookup): ResolvedTarget;
