import { describe, expect, it, vi } from "vitest";

import { CliProvider, type CommandRunResult } from "../../../src/evaluation/providers/cli.js";
import type { CliResolvedConfig } from "../../../src/evaluation/providers/targets.js";
import type { ProviderRequest } from "../../../src/evaluation/providers/types.js";

const baseConfig: CliResolvedConfig = {
  commandTemplate: "agent-cli run {PROMPT} {ATTACHMENTS}",
  attachmentsFormat: "--file {path}",
  timeoutMs: 2000,
};

const baseRequest: ProviderRequest = {
  prompt: "Hello world",
  guidelines: "guideline text",
  attachments: ["./fixtures/spec.md"],
  evalCaseId: "case-1",
  attempt: 0,
};

describe("CliProvider", () => {
  it("renders placeholders and returns stdout on success", async () => {
    const runner = vi.fn(async (command: string, _options): Promise<CommandRunResult> => ({
      stdout: command,
      stderr: "",
      exitCode: 0,
      failed: false,
    }));

    const provider = new CliProvider("cli-target", baseConfig, runner);
    const response = await provider.invoke(baseRequest);

    expect(runner).toHaveBeenCalledTimes(1);
    expect(response.text).toContain("Hello world");
    expect(response.raw && (response.raw as Record<string, unknown>).command).toBeDefined();
    expect((runner.mock.calls[0]?.[0] as string) ?? "").toContain("--file");
  });

  it("throws on non-zero exit codes with stderr context", async () => {
    const runner = vi.fn(async (_command, _options): Promise<CommandRunResult> => ({
      stdout: "",
      stderr: "Something went wrong",
      exitCode: 2,
      failed: true,
    }));

    const provider = new CliProvider("cli-target", baseConfig, runner);

    await expect(provider.invoke(baseRequest)).rejects.toThrow(/exit code 2/i);
  });

  it("treats timed out commands as failures", async () => {
    const runner = vi.fn(async (_command, _options): Promise<CommandRunResult> => ({
      stdout: "",
      stderr: "",
      exitCode: null,
      failed: true,
      timedOut: true,
    }));

    const provider = new CliProvider("cli-target", baseConfig, runner);

    await expect(provider.invoke(baseRequest)).rejects.toThrow(/timed out/i);
  });
});
