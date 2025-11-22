import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import { CodexProvider } from "../../../src/evaluation/providers/codex.js";
import type { ProviderRequest } from "../../../src/evaluation/providers/types.js";

async function createTempDir(prefix: string): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

describe("CodexProvider", () => {
  let fixturesRoot: string;
  let codexConfigPath: string;

  beforeEach(async () => {
    fixturesRoot = await createTempDir("codex-provider-");
    codexConfigPath = path.join(fixturesRoot, "config");
    await writeFile(codexConfigPath, "profile: default\n", "utf8");
    process.env.CODEX_CONFIG_PATH = codexConfigPath;
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.CODEX_API_KEY;
  });

  afterEach(async () => {
    delete process.env.CODEX_CONFIG_PATH;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;
    await rm(fixturesRoot, { recursive: true, force: true });
  });

  it("mirrors attachments and composes preread block", async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ messages: [{ role: "assistant", content: "done" }] }),
      stderr: "",
      exitCode: 0,
    }));
    const provider = new CodexProvider(
      "codex-target",
      {
        executable: process.execPath,
        profile: "default",
        model: "test",
        approvalPreset: "auto",
        timeoutMs: 1000,
      },
      runner,
    );

    const guidelineFile = path.join(fixturesRoot, "prompts", "python.instructions.md");
    await mkdir(path.dirname(guidelineFile), { recursive: true });
    await writeFile(guidelineFile, "guideline", "utf8");

    const attachmentFile = path.join(fixturesRoot, "src", "main.py");
    await mkdir(path.dirname(attachmentFile), { recursive: true });
    await writeFile(attachmentFile, "print('hi')", "utf8");

    const request: ProviderRequest = {
      prompt: "Implement feature",
      attachments: [guidelineFile, attachmentFile],
      guideline_patterns: ["**/*.instructions.md"],
    };

    const response = await provider.invoke(request);

    expect(response.text).toBe("done");
    expect(runner).toHaveBeenCalledTimes(1);
    const invocation = runner.mock.calls[0]?.[0] as {
      prompt: string;
      args: string[];
    };
    expect(invocation.args).toContain("--quiet");
    expect(invocation.args).toContain("--json");
    expect(invocation.args).toContain("--profile");
    expect(invocation.prompt).toContain("python.instructions.md");
    expect(invocation.prompt).toContain("main.py");
    expect(invocation.prompt).toContain("[[ ## user_query ## ]]");

    const raw = response.raw as Record<string, unknown>;
    const mirroredAttachments = raw.attachments as readonly string[];
    expect(Array.isArray(mirroredAttachments)).toBe(true);
    expect(mirroredAttachments?.length).toBe(2);
    mirroredAttachments?.forEach((filePath) => {
      expect(filePath).toMatch(/agentv-codex-/);
    });
  });

  it("fails when Codex CLI emits invalid JSON", async () => {
    const runner = vi.fn(async () => ({
      stdout: "not json",
      stderr: "",
      exitCode: 0,
    }));
    const provider = new CodexProvider(
      "codex-target",
      {
        executable: process.execPath,
      },
      runner,
    );

    const request: ProviderRequest = {
      prompt: "Hello",
    };

    await expect(provider.invoke(request)).rejects.toThrow(/invalid JSON|assistant message/i);
  });

  it("fails fast when credentials are missing", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_API_KEY;

    const runner = vi.fn();
    const provider = new CodexProvider(
      "codex-target",
      {
        executable: process.execPath,
      },
      runner,
    );

    const request: ProviderRequest = {
      prompt: "Hello",
    };

    await expect(provider.invoke(request)).rejects.toThrow(/OPENAI_API_KEY/i);
    expect(runner).not.toHaveBeenCalled();
  });
});
