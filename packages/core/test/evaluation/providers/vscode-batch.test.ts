import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProviderRequest } from "../../../src/evaluation/providers/types.js";
import { VSCodeProvider } from "../../../src/evaluation/providers/vscode.js";

const subagentMocks = vi.hoisted(() => ({
  dispatchBatchAgent: vi.fn(),
  dispatchAgentSession: vi.fn(),
  getSubagentRoot: vi.fn(() => "/tmp/subagents"),
  provisionSubagents: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("subagent", () => subagentMocks);
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, readFile: fsMocks.readFile };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("VSCodeProvider batching", () => {
  it("supports batch invocation when responses align and forwards attachments", async () => {
    subagentMocks.dispatchBatchAgent.mockResolvedValue({
      exitCode: 0,
      responseFiles: ["/tmp/res1.md", "/tmp/res2.md"],
      queryCount: 2,
    });

    fsMocks.readFile.mockResolvedValueOnce("resp-one").mockResolvedValueOnce("resp-two");

    const provider = new VSCodeProvider(
      "vscode-target",
      {
        command: "code",
        waitForResponse: true,
        dryRun: false,
      },
      "vscode",
    );

    const requests: ProviderRequest[] = [
      { prompt: "first", attachments: ["a.txt"], evalCaseId: "one" },
      { prompt: "second", attachments: ["b.txt"], evalCaseId: "two" },
    ];

    const responses = await provider.invokeBatch?.(requests);

    expect(responses).toBeDefined();
    expect(responses?.map((r) => r.text)).toEqual(["resp-one", "resp-two"]);
    expect(subagentMocks.dispatchBatchAgent).toHaveBeenCalledTimes(1);
    const call = subagentMocks.dispatchBatchAgent.mock.calls[0]?.[0];
    expect(call.userQueries).toHaveLength(2);
    expect(call.extraAttachments).toEqual(
      expect.arrayContaining([expect.stringMatching(/a\.txt$/), expect.stringMatching(/b\.txt$/)]),
    );
  });

  it("returns empty texts in dry-run mode", async () => {
    subagentMocks.dispatchBatchAgent.mockResolvedValue({
      exitCode: 0,
      responseFiles: ["/tmp/res1.md"],
      queryCount: 1,
    });

    fsMocks.readFile.mockReset(); // Should not be called in dry-run

    const provider = new VSCodeProvider(
      "vscode-target",
      {
        command: "code",
        waitForResponse: true,
        dryRun: true,
      },
      "vscode",
    );

    const responses = await provider.invokeBatch?.([
      { prompt: "only", attachments: [], evalCaseId: "one" },
    ]);

    expect(responses).toBeDefined();
    expect(responses?.[0]?.text).toBe("");
    expect(fsMocks.readFile).not.toHaveBeenCalled();
  });
});
