import type { AxChatRequest } from "@ax-llm/ax";

import type { JsonObject } from "../types.js";

type ChatPrompt = AxChatRequest["chatPrompt"];

export type ProviderKind =
  | "azure"
  | "anthropic"
  | "gemini"
  | "mock"
  | "vscode"
  | "vscode-insiders";

/**
 * List of all supported provider kinds.
 * This is the source of truth for provider validation.
 */
export const KNOWN_PROVIDERS: readonly ProviderKind[] = [
  "azure",
  "anthropic",
  "gemini",
  "mock",
  "vscode",
  "vscode-insiders",
] as const;

/**
 * Provider aliases that are accepted in target definitions.
 * These map to the canonical ProviderKind values.
 */
export const PROVIDER_ALIASES: readonly string[] = [
  "azure-openai",    // alias for "azure"
  "google",          // alias for "gemini"
  "google-gemini",   // alias for "gemini"
  "openai",          // legacy/future support
  "bedrock",         // legacy/future support
  "vertex",          // legacy/future support
] as const;

/**
 * Schema identifier for targets.yaml files (version 2).
 */
export const TARGETS_SCHEMA_V2 = "agentv-targets-v2";

export interface ProviderRequest {
  readonly prompt: string;
  readonly guidelines?: string;
  readonly guideline_patterns?: readonly string[];
  readonly chatPrompt?: ChatPrompt;
  readonly attachments?: readonly string[];
  readonly evalCaseId?: string;
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
  readonly workers?: number | undefined;
}
