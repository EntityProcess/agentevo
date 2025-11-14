import { z } from "zod";

import type { EnvLookup, TargetDefinition } from "./types.js";

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

export type ResolvedTarget =
  | {
      readonly kind: "azure";
      readonly name: string;
      readonly judgeTarget?: string;
      readonly config: AzureResolvedConfig;
    }
  | {
      readonly kind: "anthropic";
      readonly name: string;
      readonly judgeTarget?: string;
      readonly config: AnthropicResolvedConfig;
    }
  | {
      readonly kind: "gemini";
      readonly name: string;
      readonly judgeTarget?: string;
      readonly config: GeminiResolvedConfig;
    }
  | {
      readonly kind: "mock";
      readonly name: string;
      readonly judgeTarget?: string;
      readonly config: MockResolvedConfig;
    }
  | {
      readonly kind: "vscode" | "vscode-insiders";
      readonly name: string;
      readonly judgeTarget?: string;
      readonly config: VSCodeResolvedConfig;
    };

const BASE_TARGET_SCHEMA = z.object({
  name: z.string().min(1, "target name is required"),
  provider: z.string().min(1, "provider is required"),
  settings: z.record(z.unknown()).optional(),
  judge_target: z.string().optional(),
});

const DEFAULT_AZURE_API_VERSION = "2024-10-01-preview";

function normalizeAzureApiVersion(value: string | undefined): string {
  if (!value) {
    return DEFAULT_AZURE_API_VERSION;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_AZURE_API_VERSION;
  }

  const withoutPrefix = trimmed.replace(/^api[-_]?version\s*=\s*/i, "").trim();
  return withoutPrefix.length > 0 ? withoutPrefix : DEFAULT_AZURE_API_VERSION;
}

export function resolveTargetDefinition(
  definition: TargetDefinition,
  env: EnvLookup = process.env,
): ResolvedTarget {
  const parsed = BASE_TARGET_SCHEMA.parse(definition);
  const provider = parsed.provider.toLowerCase();

  switch (provider) {
    case "azure":
    case "azure-openai":
      return {
        kind: "azure",
        name: parsed.name,
        judgeTarget: parsed.judge_target,
        config: resolveAzureConfig(parsed, env),
      };
    case "anthropic":
      return {
        kind: "anthropic",
        name: parsed.name,
        judgeTarget: parsed.judge_target,
        config: resolveAnthropicConfig(parsed, env),
      };
    case "gemini":
    case "google":
    case "google-gemini":
      return {
        kind: "gemini",
        name: parsed.name,
        judgeTarget: parsed.judge_target,
        config: resolveGeminiConfig(parsed, env),
      };
    case "mock":
      return {
        kind: "mock",
        name: parsed.name,
        judgeTarget: parsed.judge_target,
        config: resolveMockConfig(parsed),
      };
    case "vscode":
    case "vscode-insiders":
      return {
        kind: provider as "vscode" | "vscode-insiders",
        name: parsed.name,
        judgeTarget: parsed.judge_target,
        config: resolveVSCodeConfig(parsed, env, provider === "vscode-insiders"),
      };
    default:
      throw new Error(`Unsupported provider '${parsed.provider}' in target '${parsed.name}'`);
  }
}

function resolveAzureConfig(
  target: z.infer<typeof BASE_TARGET_SCHEMA>,
  env: EnvLookup,
): AzureResolvedConfig {
  const settings = target.settings ?? {};
  const endpointSource = settings.endpoint ?? settings.resource ?? settings.resourceName;
  const apiKeySource = settings.api_key ?? settings.apiKey;
  const deploymentSource = settings.deployment ?? settings.deploymentName ?? settings.model;
  const versionSource = settings.version ?? settings.api_version;
  const temperatureSource = settings.temperature;
  const maxTokensSource = settings.max_output_tokens ?? settings.maxTokens;

  const resourceName = resolveString(endpointSource, env, `${target.name} endpoint`);
  const apiKey = resolveString(apiKeySource, env, `${target.name} api key`);
  const deploymentName = resolveString(deploymentSource, env, `${target.name} deployment`);
  const version = normalizeAzureApiVersion(
    resolveOptionalString(versionSource, env, `${target.name} api version`),
  );
  const temperature = resolveOptionalNumber(temperatureSource, `${target.name} temperature`);
  const maxOutputTokens = resolveOptionalNumber(
    maxTokensSource,
    `${target.name} max output tokens`,
  );

  return {
    resourceName,
    deploymentName,
    apiKey,
    version,
    temperature,
    maxOutputTokens,
  };
}

function resolveAnthropicConfig(
  target: z.infer<typeof BASE_TARGET_SCHEMA>,
  env: EnvLookup,
): AnthropicResolvedConfig {
  const settings = target.settings ?? {};
  const apiKeySource = settings.api_key ?? settings.apiKey;
  const modelSource = settings.model ?? settings.deployment ?? settings.variant;
  const temperatureSource = settings.temperature;
  const maxTokensSource = settings.max_output_tokens ?? settings.maxTokens;
  const thinkingBudgetSource = settings.thinking_budget ?? settings.thinkingBudget;

  const apiKey = resolveString(apiKeySource, env, `${target.name} Anthropic api key`);
  const model = resolveString(modelSource, env, `${target.name} Anthropic model`);

  return {
    apiKey,
    model,
    temperature: resolveOptionalNumber(temperatureSource, `${target.name} temperature`),
    maxOutputTokens: resolveOptionalNumber(maxTokensSource, `${target.name} max output tokens`),
    thinkingBudget: resolveOptionalNumber(thinkingBudgetSource, `${target.name} thinking budget`),
  };
}

function resolveGeminiConfig(
  target: z.infer<typeof BASE_TARGET_SCHEMA>,
  env: EnvLookup,
): GeminiResolvedConfig {
  const settings = target.settings ?? {};
  const apiKeySource = settings.api_key ?? settings.apiKey;
  const modelSource = settings.model ?? settings.deployment ?? settings.variant;
  const temperatureSource = settings.temperature;
  const maxTokensSource = settings.max_output_tokens ?? settings.maxTokens;

  const apiKey = resolveString(apiKeySource, env, `${target.name} Google API key`);
  const model =
    resolveOptionalString(modelSource, env, `${target.name} Gemini model`, {
      allowLiteral: true,
      optionalEnv: true,
    }) ?? "gemini-2.5-flash";

  return {
    apiKey,
    model,
    temperature: resolveOptionalNumber(temperatureSource, `${target.name} temperature`),
    maxOutputTokens: resolveOptionalNumber(maxTokensSource, `${target.name} max output tokens`),
  };
}

function resolveMockConfig(target: z.infer<typeof BASE_TARGET_SCHEMA>): MockResolvedConfig {
  const settings = target.settings ?? {};
  const response = typeof settings.response === "string" ? settings.response : undefined;
  return { response };
}

function resolveVSCodeConfig(
  target: z.infer<typeof BASE_TARGET_SCHEMA>,
  env: EnvLookup,
  insiders: boolean,
): VSCodeResolvedConfig {
  const settings = target.settings ?? {};
  const workspaceTemplateEnvVar = resolveOptionalLiteralString(settings.workspace_template ?? settings.workspaceTemplate);
  const workspaceTemplate = workspaceTemplateEnvVar
    ? resolveOptionalString(workspaceTemplateEnvVar, env, `${target.name} workspace template path`, {
        allowLiteral: false,
        optionalEnv: true,
      })
    : undefined;

  const commandSource = settings.vscode_cmd ?? settings.command;
  const waitSource = settings.wait;
  const dryRunSource = settings.dry_run ?? settings.dryRun;
  const subagentRootSource = settings.subagent_root ?? settings.subagentRoot;

  const defaultCommand = insiders ? "code-insiders" : "code";
  const command = resolveOptionalLiteralString(commandSource) ?? defaultCommand;

  return {
    command,
    waitForResponse: resolveOptionalBoolean(waitSource) ?? true,
    dryRun: resolveOptionalBoolean(dryRunSource) ?? false,
    subagentRoot: resolveOptionalString(subagentRootSource, env, `${target.name} subagent root`, {
      allowLiteral: true,
      optionalEnv: true,
    }),
    workspaceTemplate,
  };
}

function resolveString(
  source: unknown,
  env: EnvLookup,
  description: string,
  allowLiteral = false,
): string {
  const value = resolveOptionalString(source, env, description, {
    allowLiteral,
    optionalEnv: false,
  });
  if (value === undefined) {
    throw new Error(`${description} is required`);
  }
  return value;
}

function resolveOptionalString(
  source: unknown,
  env: EnvLookup,
  description: string,
  options?: { allowLiteral?: boolean; optionalEnv?: boolean },
): string | undefined {
  if (source === undefined || source === null) {
    return undefined;
  }
  if (typeof source !== "string") {
    throw new Error(`${description} must be a string`);
  }
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const envValue = env[trimmed];
  if (envValue !== undefined) {
    if (envValue.trim().length === 0) {
      throw new Error(`Environment variable '${trimmed}' for ${description} is empty`);
    }
    return envValue;
  }
  const allowLiteral = options?.allowLiteral ?? false;
  const optionalEnv = options?.optionalEnv ?? false;
  if (!allowLiteral && isLikelyEnvReference(trimmed)) {
    if (optionalEnv) {
      return undefined;
    }
    throw new Error(`Environment variable '${trimmed}' required for ${description} is not set`);
  }
  return trimmed;
}

function resolveOptionalLiteralString(source: unknown): string | undefined {
  if (source === undefined || source === null) {
    return undefined;
  }
  if (typeof source !== "string") {
    throw new Error("expected string value");
  }
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveOptionalNumber(source: unknown, description: string): number | undefined {
  if (source === undefined || source === null || source === "") {
    return undefined;
  }
  if (typeof source === "number") {
    return Number.isFinite(source) ? source : undefined;
  }
  if (typeof source === "string") {
    const numeric = Number(source);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  throw new Error(`${description} must be a number`);
}

function resolveOptionalBoolean(source: unknown): boolean | undefined {
  if (source === undefined || source === null || source === "") {
    return undefined;
  }
  if (typeof source === "boolean") {
    return source;
  }
  if (typeof source === "string") {
    const lowered = source.trim().toLowerCase();
    if (lowered === "true" || lowered === "1") {
      return true;
    }
    if (lowered === "false" || lowered === "0") {
      return false;
    }
  }
  throw new Error("expected boolean value");
}

function isLikelyEnvReference(value: string): boolean {
  return /^[A-Z0-9_]+$/.test(value);
}
