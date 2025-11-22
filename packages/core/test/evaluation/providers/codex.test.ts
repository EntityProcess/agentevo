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

  beforeEach(async () => {
    fixturesRoot = await createTempDir("codex-provider-");
  });

  afterEach(async () => {
    await rm(fixturesRoot, { recursive: true, force: true });
  });

  it("mirrors input files and composes preread block", async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ messages: [{ role: "assistant", content: "done" }] }),
      stderr: "",
      exitCode: 0,
    }));
    const provider = new CodexProvider(
      "codex-target",
      {
        executable: process.execPath,
        args: ["--profile", "default", "--model", "test"],
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
      inputFiles: [guidelineFile, attachmentFile],
      guideline_patterns: ["**/*.instructions.md"],
    };

    const response = await provider.invoke(request);

    expect(response.text).toBe("done");
    expect(runner).toHaveBeenCalledTimes(1);
    const invocation = runner.mock.calls[0]?.[0] as {
      prompt: string;
      args: string[];
    };
    expect(invocation.args.slice(0, 7)).toEqual([
      "--ask-for-approval",
      "never",
      "exec",
      "--json",
      "--color",
      "never",
      "--skip-git-repo-check",
    ]);
    expect(invocation.args).toContain("--profile");
    expect(invocation.args).toContain("default");
    expect(invocation.args).toContain("--model");
    expect(invocation.args).toContain("test");
    expect(invocation.args[invocation.args.length - 1]).toBe("-");
    expect(invocation.prompt).toContain("python.instructions.md");
    expect(invocation.prompt).toContain("main.py");
    expect(invocation.prompt).toContain("[[ ## user_query ## ]]");

    const raw = response.raw as Record<string, unknown>;
    const mirroredInputFiles = raw.inputFiles as readonly string[];
    expect(Array.isArray(mirroredInputFiles)).toBe(true);
    expect(mirroredInputFiles?.length).toBe(2);
    mirroredInputFiles?.forEach((filePath) => {
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

  it("parses JSONL output from codex exec", async () => {
    const jsonl = [
      { type: "thread.started" },
      { type: "item.completed", item: { type: "reasoning", text: "thinking" } },
      { type: "item.completed", item: { type: "agent_message", text: "final answer" } },
      { type: "turn.completed" },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const runner = vi.fn(async () => ({
      stdout: jsonl,
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
      prompt: "Use JSONL",
    };

    const response = await provider.invoke(request);
    expect(response.text).toBe("final answer");
  });
});
