import type { AxChatRequest } from "@ax-llm/ax";
import type { JsonObject } from "../types";
type ChatPrompt = AxChatRequest["chatPrompt"];
export type ProviderKind = "azure" | "anthropic" | "gemini" | "mock" | "vscode" | "vscode-insiders";
export interface ProviderRequest {
    readonly prompt: string;
    readonly guidelines?: string;
    readonly chatPrompt?: ChatPrompt;
    readonly attachments?: readonly string[];
    readonly testCaseId?: string;
    readonly attempt?: number;
    readonly maxOutputTokens?: number;
    readonly temperature?: number;
    readonly metadata?: JsonObject;
    readonly signal?: AbortSignal;
}
export interface ProviderResponse {
    readonly text: string;
    readonly reasoning?: string;
    readonly raw?: unknown;
    readonly usage?: JsonObject;
}
export interface Provider {
    readonly id: string;
    readonly kind: ProviderKind;
    readonly targetName: string;
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
}
export type EnvLookup = Readonly<Record<string, string | undefined>>;
export interface TargetDefinition {
    readonly name: string;
    readonly provider: ProviderKind | string;
    readonly settings?: Record<string, unknown> | undefined;
    readonly judge_target?: string | undefined;
}
export {};
