import { execa, execaNode } from "execa";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

interface EvalFixture {
  readonly baseDir: string;
  readonly suiteDir: string;
  readonly testFilePath: string;
  readonly diagnosticsPath: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const CLI_ENTRY = path.join(projectRoot, "apps/cli/src/cli.ts");
const MOCK_RUNNER = path.join(projectRoot, "apps/cli/test/fixtures/mock-run-evaluation.ts");
const require = createRequire(import.meta.url);
const TSX_LOADER = pathToFileURL(require.resolve("tsx")).href;
let coreBuilt = false;

beforeAll(async () => {
  if (!coreBuilt) {
    await execa("pnpm", ["--filter", "@agentevo/core", "build"], { cwd: projectRoot });
    coreBuilt = true;
  }
});

async function createFixture(): Promise<EvalFixture> {
  const baseDir = await mkdtemp(path.join(tmpdir(), "agentevo-cli-test-"));
  const suiteDir = path.join(baseDir, "suite");
  await mkdir(suiteDir, { recursive: true });

  const agentevoDir = path.join(suiteDir, ".agentevo");
  await mkdir(agentevoDir, { recursive: true });

  const targetsPath = path.join(agentevoDir, "targets.yaml");
  const targetsContent = `- name: default\n  provider: mock\n- name: file-target\n  provider: mock\n- name: cli-target\n  provider: mock\n`;
  await writeFile(targetsPath, targetsContent, "utf8");

  const testFilePath = path.join(suiteDir, "sample.test.yaml");
  const testFileContent = `description: CLI integration test\ngrader: heuristic\ntarget: file-target\n\ntestcases:\n  - id: greeting-case\n    outcome: System responds with a helpful greeting\n    messages:\n      - role: user\n        content: |
          Please say hello
      - role: assistant
        content: "Hello!"\n`;
  await writeFile(testFilePath, testFileContent, "utf8");

  const envPath = path.join(suiteDir, ".env");
  await writeFile(envPath, "CLI_ENV_SAMPLE=from-dotenv\n", "utf8");

  const diagnosticsPath = path.join(baseDir, "diagnostics.json");

  return { baseDir, suiteDir, testFilePath, diagnosticsPath } satisfies EvalFixture;
}

async function runCli(
  fixture: EvalFixture,
  args: readonly string[],
  extraEnv: Record<string, string | undefined> = {},
): Promise<{ stdout: string; stderr: string }> {
  const baseEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  delete baseEnv.CLI_ENV_SAMPLE;

  try {
    const result = await execaNode(CLI_ENTRY, args, {
      cwd: fixture.suiteDir,
      env: {
        ...baseEnv,
        AGENTEVO_CLI_EVAL_RUNNER: MOCK_RUNNER,
        AGENTEVO_CLI_EVAL_RUNNER_OUTPUT: fixture.diagnosticsPath,
        ...extraEnv,
      },
      nodeOptions: ["--import", TSX_LOADER],
      reject: false,
    });

    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    console.error("CLI execution failed:", error);
    throw error;
  }
}

function extractOutputPath(stdout: string): string {
  const lines = stdout.split(/\r?\n/);
  const outputLine = lines.find((line) => line.startsWith("Output path:"));
  if (!outputLine) {
    throw new Error(`Unable to parse output path from CLI output:\n${stdout}`);
  }
  return outputLine.replace("Output path:", "").trim();
}

async function readJsonLines(filePath: string): Promise<readonly unknown[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function readDiagnostics(fixture: EvalFixture): Promise<Record<string, unknown>> {
  const raw = await readFile(fixture.diagnosticsPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const fixtures: string[] = [];

afterEach(async () => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("agentevo eval CLI", () => {
  it("writes results, summary, and prompt dumps using default directories", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture.baseDir);

    const { stdout, stderr } = await runCli(fixture, [
      "eval",
      fixture.testFilePath,
      "--verbose",
      "--dump-prompts",
    ]);

    expect(stderr).toBe("");
    expect(stdout).toContain("Using target (test-file): file-target [provider=mock]");
    expect(stdout).toContain("Mean score: 0.750");
    expect(stdout).toContain("Std deviation: 0.212");

    const outputPath = extractOutputPath(stdout);
    expect(outputPath).toContain(`${path.sep}.agentevo${path.sep}results${path.sep}`);

    const results = await readJsonLines(outputPath);
    expect(results).toHaveLength(2);
    const [firstResult, secondResult] = results as Array<Record<string, unknown>>;
    expect(firstResult["test_id"]).toBe("case-alpha");
    expect(secondResult["test_id"]).toBe("case-beta");

    const diagnostics = await readDiagnostics(fixture);
    expect(diagnostics).toMatchObject({
      target: "file-target",
      promptDumpDir: expect.stringContaining(`${path.sep}.agentevo${path.sep}prompts`),
      envSample: "from-dotenv",
      resultCount: 2,
    });

    const promptsDir = diagnostics.promptDumpDir as string;
    const promptFiles = await readdir(promptsDir);
    expect(new Set(promptFiles)).toEqual(new Set(["case-alpha.json", "case-beta.json"]));
  });

  it("honors custom prompt dump directories", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture.baseDir);

    const customPromptDir = path.join(fixture.baseDir, "custom-prompts");

    await runCli(fixture, [
      "eval",
      fixture.testFilePath,
      "--dump-prompts",
      customPromptDir,
    ]);

    const diagnostics = await readDiagnostics(fixture);
    expect(diagnostics.promptDumpDir).toBe(path.resolve(customPromptDir));

    const files = await readdir(customPromptDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it("prefers CLI target overrides when provided", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture.baseDir);

    const { stdout } = await runCli(fixture, [
      "eval",
      fixture.testFilePath,
      "--verbose",
      "--target",
      "cli-target",
    ]);

    expect(stdout).toContain("Using target (cli): cli-target [provider=mock]");

    const diagnostics = await readDiagnostics(fixture);
    expect(diagnostics.target).toBe("cli-target");
  });

  it("falls back to default target when neither CLI nor file specifies one", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture.baseDir);

    // Rewrite test file without target key to force default fallback
    const testFileContent = `description: Default target test\ngrader: heuristic\n\ntestcases:\n  - id: fallback-case\n    outcome: Provide answer\n    messages:\n      - role: user\n        content: "Hello"\n      - role: assistant\n        content: "Hi"\n`;
    await writeFile(fixture.testFilePath, testFileContent, "utf8");

    const { stdout } = await runCli(fixture, ["eval", fixture.testFilePath, "--verbose"]);

    expect(stdout).toContain("Using target (default): default [provider=mock]");

    const diagnostics = await readDiagnostics(fixture);
    expect(diagnostics.target).toBe("default");
  });
});
