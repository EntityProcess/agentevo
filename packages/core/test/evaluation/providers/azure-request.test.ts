import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const createCalls: unknown[] = [];
const chatMock = vi.fn(async () => ({ results: [{ content: "ok" }] }));

vi.mock("@ax-llm/ax", () => ({
  AxAI: {
    create: (options: unknown) => {
      createCalls.push(options);
      return {
        chat: chatMock,
      };
    },
  },
}));

const providerModule = await import("../../../src/evaluation/providers/index.js");
const { resolveTargetDefinition } = providerModule;

describe("Azure provider request diagnostics", () => {
  const env = {
    AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
    AZURE_OPENAI_API_KEY: "key",
    AZURE_DEPLOYMENT_NAME: "gpt-4o",
  } satisfies Record<string, string>;

  beforeEach(() => {
    createCalls.length = 0;
    chatMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes resolved Azure configuration", () => {
    const target = resolveTargetDefinition(
      {
        name: "azure",
        provider: "azure",
        settings: {
          endpoint: "AZURE_OPENAI_ENDPOINT",
          api_key: "AZURE_OPENAI_API_KEY",
          model: "AZURE_DEPLOYMENT_NAME",
        },
      },
      env,
    );

    expect(target.kind).toBe("azure");
    if (target.kind !== "azure") {
      throw new Error("expected azure target");
    }

    expect(target.config).toMatchObject({
      resourceName: "https://example.openai.azure.com",
      deploymentName: "gpt-4o",
      version: "2024-10-01-preview",
    });
  });
});
