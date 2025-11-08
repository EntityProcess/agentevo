import { AxAI } from "@ax-llm/ax";
import type { AxChatRequest, AxChatResponse, AxModelConfig } from "@ax-llm/ax";

import type { AnthropicResolvedConfig, AzureResolvedConfig } from "./targets.js";
import type { Provider, ProviderRequest, ProviderResponse } from "./types.js";
import type { JsonObject } from "../types.js";

const DEFAULT_SYSTEM_PROMPT = "You are a careful assistant. Follow all provided instructions and do not fabricate results.";

type ChatPrompt = AxChatRequest["chatPrompt"];

type AxAiInstance = ReturnType<typeof AxAI.create>;

function buildChatPrompt(request: ProviderRequest): ChatPrompt {
  if (request.chatPrompt) {
    return request.chatPrompt;
  }

  const systemSegments: string[] = [];
  if (request.guidelines && request.guidelines.trim().length > 0) {
    systemSegments.push(`Guidelines:\n${request.guidelines.trim()}`);
  }

  const metadataSystemPrompt = typeof request.metadata?.systemPrompt === "string" ? request.metadata.systemPrompt : undefined;
  if (metadataSystemPrompt && metadataSystemPrompt.trim().length > 0) {
    systemSegments.push(metadataSystemPrompt.trim());
  }

  const systemContent = systemSegments.length > 0 ? systemSegments.join("\n\n") : DEFAULT_SYSTEM_PROMPT;
  const userContent = request.prompt.trim();

  const prompt: ChatPrompt = [
    {
      role: "system",
      content: systemContent,
    },
    {
      role: "user",
      content: userContent,
    },
  ];

  return prompt;
}

function extractModelConfig(
  request: ProviderRequest,
  defaults: { temperature?: number; maxOutputTokens?: number },
): AxModelConfig | undefined {
  const temperature = request.temperature ?? defaults.temperature;
  const maxTokens = request.maxOutputTokens ?? defaults.maxOutputTokens;
  const config: AxModelConfig = {};
  if (temperature !== undefined) {
    config.temperature = temperature;
  }
  if (maxTokens !== undefined) {
    config.maxTokens = maxTokens;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

function mapResponse(response: AxChatResponse): ProviderResponse {
  const primary = response.results[0];
  const text = typeof primary?.content === "string" ? primary.content : "";
  const reasoning = primary?.thought ?? primary?.thoughtBlock?.data;
  const usage = toJsonObject(response.modelUsage);

  return {
    text,
    reasoning,
    raw: response,
    usage,
  };
}

function toJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JsonObject;
  } catch {
    return undefined;
  }
}

function ensureChatResponse(result: unknown): AxChatResponse {
  if (typeof ReadableStream !== "undefined" && result instanceof ReadableStream) {
    throw new Error("Streaming responses are not supported for this provider");
  }
  if (!result || typeof result !== "object" || !("results" in result)) {
    throw new Error("Unexpected response type from AxAI provider");
  }
  return result as AxChatResponse;
}

export class AzureProvider implements Provider {
  readonly id: string;
  readonly kind = "azure" as const;
  readonly targetName: string;

  private readonly ai: AxAiInstance;
  private readonly defaults: { temperature?: number; maxOutputTokens?: number };

  constructor(targetName: string, private readonly config: AzureResolvedConfig) {
    this.id = `azure:${targetName}`;
    this.targetName = targetName;
    this.defaults = {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
    };

    this.ai = AxAI.create({
      name: "azure-openai",
      apiKey: config.apiKey,
      resourceName: config.resourceName,
      deploymentName: config.deploymentName,
      config: {
        model: config.deploymentName,
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        ...(config.maxOutputTokens !== undefined ? { maxTokens: config.maxOutputTokens } : {}),
      },
      version: config.version,
    });
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    const chatPrompt = buildChatPrompt(request);
    const modelConfig = extractModelConfig(request, this.defaults);

    const response = await this.ai.chat(
      {
        chatPrompt,
        model: this.config.deploymentName,
        ...(modelConfig ? { modelConfig } : {}),
      },
      request.signal ? { signal: request.signal } : undefined,
    );

    return mapResponse(ensureChatResponse(response));
  }
}

export class AnthropicProvider implements Provider {
  readonly id: string;
  readonly kind = "anthropic" as const;

  readonly targetName: string;
  private readonly ai: AxAiInstance;
  private readonly defaults: { temperature?: number; maxOutputTokens?: number; thinkingBudget?: number };

  constructor(targetName: string, private readonly config: AnthropicResolvedConfig) {
    this.id = `anthropic:${targetName}`;
    this.targetName = targetName;
    this.defaults = {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      thinkingBudget: config.thinkingBudget,
    };

    this.ai = AxAI.create({
      name: "anthropic",
      apiKey: config.apiKey,
      config: {
        model: config.model,
        ...(config.maxOutputTokens !== undefined ? { maxTokens: config.maxOutputTokens } : {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      },
    });
  }

  async invoke(request: ProviderRequest): Promise<ProviderResponse> {
    const chatPrompt = buildChatPrompt(request);
    const modelConfig = extractModelConfig(request, this.defaults);

    const response = await this.ai.chat(
      {
        chatPrompt,
        model: this.config.model,
        ...(modelConfig ? { modelConfig } : {}),
      },
      request.signal ? { signal: request.signal } : undefined,
    );

    return mapResponse(ensureChatResponse(response));
  }
}
