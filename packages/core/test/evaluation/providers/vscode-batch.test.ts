import { afterEach, describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";

import type { ProviderRequest } from "../../../src/evaluation/providers/types.js";

const dispatchBatchAgent = vi.fn();
vi.mock("subagent", () => ({
  dispatchBatchAgent,
  dispatchAgentSession: vi.fn(),
  getSubagentRoot: vi.fn(() => "/tmp/subagents"),
  provisionSubagents: vi.fn(),
}));

// Import after mocking subagent
// eslint-disable-next-line import/order
import { VSCodeProvider } from "../../../src/evaluation/providers/vscode.js";

const readFileSpy = vi.spyOn(fsPromises, "readFile");

afterEach(() => {
  vi.clearAllMocks();
});

describe("VSCodeProvider batching", () => {
  it("supports batch invocation when responses align and uses no direct attachments", async () => {
    dispatchBatchAgent.mockResolvedValue({
      exitCode: 0,
      responseFiles: ["/tmp/res1.md", "/tmp/res2.md"],
      queryCount: 2,
    });

    readFileSpy
      .mockResolvedValueOnce("resp-one")
      .mockResolvedValueOnce("resp-two");

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
    expect(dispatchBatchAgent).toHaveBeenCalledTimes(1);
    const call = dispatchBatchAgent.mock.calls[0]?.[0];
    expect(call.userQueries).toHaveLength(2);
    expect(call.extraAttachments).toBeUndefined();
  });

  it("returns empty texts in dry-run mode", async () => {
    dispatchBatchAgent.mockResolvedValue({
      exitCode: 0,
      responseFiles: ["/tmp/res1.md"],
      queryCount: 1,
    });

    readFileSpy.mockReset(); // Should not be called in dry-run

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
    expect(readFileSpy).not.toHaveBeenCalled();
  });
});
