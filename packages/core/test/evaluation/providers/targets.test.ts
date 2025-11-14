import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { resolveTargetDefinition, createProvider } = providerModule;

describe("resolveTargetDefinition", () => {
  beforeEach(() => {
    createCalls.length = 0;
    chatMock.mockClear();
  });

  it("resolves azure settings from environment", () => {
    const env = {
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_API_KEY: "secret",
      AZURE_DEPLOYMENT_NAME: "gpt-4o",
    } satisfies Record<string, string>;

    const target = resolveTargetDefinition(
      {
        name: "default",
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
    expect(target.config).toMatchObject({
      resourceName: "https://example.openai.azure.com",
      deploymentName: "gpt-4o",
      apiKey: "secret",
      version: "2024-10-01-preview",
    });
  });

  it("normalizes azure api versions", () => {
    const env = {
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_API_KEY: "secret",
      AZURE_DEPLOYMENT_NAME: "gpt-4o",
      CUSTOM_VERSION: "api-version=2024-08-01-preview",
    } satisfies Record<string, string>;

    const target = resolveTargetDefinition(
      {
        name: "azure-version",
        provider: "azure",
        settings: {
          endpoint: "AZURE_OPENAI_ENDPOINT",
          api_key: "AZURE_OPENAI_API_KEY",
          model: "AZURE_DEPLOYMENT_NAME",
          version: "CUSTOM_VERSION",
        },
      },
      env,
    );

    expect(target.kind).toBe("azure");
    if (target.kind !== "azure") {
      throw new Error("expected azure target");
    }

    expect(target.config.version).toBe("2024-08-01-preview");
  });

  it("throws when required azure environment variables are missing", () => {
    const env = {
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
    } satisfies Record<string, string>;

    expect(() =>
      resolveTargetDefinition(
        {
          name: "broken",
          provider: "azure",
          settings: {
            endpoint: "AZURE_OPENAI_ENDPOINT",
            api_key: "AZURE_OPENAI_API_KEY",
            model: "AZURE_DEPLOYMENT_NAME",
          },
        },
        env,
      ),
    ).toThrow(/AZURE_OPENAI_API_KEY/i);
  });

  it("supports vscode configuration with optional workspace template from env var", () => {
    const env = {
      WORKSPACE_TEMPLATE_PATH: "/path/to/workspace.code-workspace",
    } satisfies Record<string, string>;

    const target = resolveTargetDefinition(
      {
        name: "editor",
        provider: "vscode",
        settings: {
          vscode_cmd: "code-insiders",
          wait: false,
          dry_run: true,
          workspace_template: "WORKSPACE_TEMPLATE_PATH",
        },
      },
      env,
    );

    expect(target.kind).toBe("vscode");
    if (target.kind !== "vscode") {
      throw new Error("expected vscode target");
    }

    expect(target.config.command).toBe("code-insiders");
    expect(target.config.waitForResponse).toBe(false);
    expect(target.config.dryRun).toBe(true);
    expect(target.config.workspaceTemplate).toBe("/path/to/workspace.code-workspace");
  });

  it("resolves gemini settings from environment with default model", () => {
    const env = {
      GOOGLE_API_KEY: "gemini-secret",
    } satisfies Record<string, string>;

    const target = resolveTargetDefinition(
      {
        name: "gemini-target",
        provider: "gemini",
        settings: {
          api_key: "GOOGLE_API_KEY",
        },
      },
      env,
    );

    expect(target.kind).toBe("gemini");
    if (target.kind !== "gemini") {
      throw new Error("expected gemini target");
    }

    expect(target.config).toMatchObject({
      apiKey: "gemini-secret",
      model: "gemini-2.5-flash",
    });
  });

  it("resolves gemini settings with custom model from environment", () => {
    const env = {
      GOOGLE_API_KEY: "gemini-secret",
      GOOGLE_GEMINI_MODEL: "gemini-2.5-pro",
    } satisfies Record<string, string>;

    const target = resolveTargetDefinition(
      {
        name: "gemini-pro",
        provider: "gemini",
        settings: {
          api_key: "GOOGLE_API_KEY",
          model: "GOOGLE_GEMINI_MODEL",
        },
      },
      env,
    );

    expect(target.kind).toBe("gemini");
    if (target.kind !== "gemini") {
      throw new Error("expected gemini target");
    }

    expect(target.config).toMatchObject({
      apiKey: "gemini-secret",
      model: "gemini-2.5-pro",
    });
  });

  it("resolves gemini with literal model string", () => {
    const env = {
      GOOGLE_API_KEY: "gemini-secret",
    } satisfies Record<string, string>;

    const target = resolveTargetDefinition(
      {
        name: "gemini-flash",
        provider: "google-gemini",
        settings: {
          api_key: "GOOGLE_API_KEY",
          model: "gemini-1.5-flash",
        },
      },
      env,
    );

    expect(target.kind).toBe("gemini");
    if (target.kind !== "gemini") {
      throw new Error("expected gemini target");
    }

    expect(target.config).toMatchObject({
      apiKey: "gemini-secret",
      model: "gemini-1.5-flash",
    });
  });

  it("throws when google api key is missing", () => {
    expect(() =>
      resolveTargetDefinition(
        {
          name: "broken-gemini",
          provider: "gemini",
          settings: {
            api_key: "GOOGLE_API_KEY",
          },
        },
        {},
      ),
    ).toThrow(/GOOGLE_API_KEY/i);
  });
});

describe("createProvider", () => {
  beforeEach(() => {
    createCalls.length = 0;
    chatMock.mockClear();
  });

  it("creates an azure provider that calls AxAI", async () => {
    const env = {
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_API_KEY: "key",
      AZURE_DEPLOYMENT_NAME: "gpt-4o",
    } satisfies Record<string, string>;

    const resolved = resolveTargetDefinition(
      {
        name: "azure-target",
        provider: "azure",
        settings: {
          endpoint: "AZURE_OPENAI_ENDPOINT",
          api_key: "AZURE_OPENAI_API_KEY",
          model: "AZURE_DEPLOYMENT_NAME",
        },
      },
      env,
    );

    const provider = createProvider(resolved);
    const response = await provider.invoke({ prompt: "Hello" });

    expect(createCalls).toHaveLength(1);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(response.text).toBe("ok");
  });
  it("creates a gemini provider that calls AxAI", async () => {
    const env = {
      GOOGLE_API_KEY: "gemini-key",
    } satisfies Record<string, string>;

    const resolved = resolveTargetDefinition(
      {
        name: "gemini-target",
        provider: "gemini",
        settings: {
          api_key: "GOOGLE_API_KEY",
        },
      },
      env,
    );

    const provider = createProvider(resolved);
    expect(provider.kind).toBe("gemini");
    expect(provider.targetName).toBe("gemini-target");

    const response = await provider.invoke({ prompt: "Test prompt" });

    expect(createCalls.length).toBeGreaterThan(0);
    expect(chatMock).toHaveBeenCalled();
    expect(response.text).toBe("ok");
  });
});
