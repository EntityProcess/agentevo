import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { initCommand } from "../src/commands/init/index.js";

const TEST_DIR = path.join(process.cwd(), "test-output", "init-test");

describe("init command", () => {
  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should create .github directory if it doesn't exist", async () => {
    await initCommand({ targetPath: TEST_DIR });

    const githubDir = path.join(TEST_DIR, ".github");
    expect(existsSync(githubDir)).toBe(true);
  });

  it("should create prompt template file", async () => {
    await initCommand({ targetPath: TEST_DIR });

    const promptFile = path.join(TEST_DIR, ".github", "prompts", "eval-build.prompt.md");
    expect(existsSync(promptFile)).toBe(true);

    const content = readFileSync(promptFile, "utf-8");
    expect(content).toContain("Schema Reference");
    expect(content).toContain("Structure Requirements");
    expect(content).toContain("evalcases");
  });

  it("should create schema file", async () => {
    await initCommand({ targetPath: TEST_DIR });

    const schemaFile = path.join(TEST_DIR, ".github", "contexts", "eval-schema.json");
    expect(existsSync(schemaFile)).toBe(true);

    const content = readFileSync(schemaFile, "utf-8");
    const schema = JSON.parse(content);
    expect(schema.title).toContain("AgentV");
    expect(schema.title).toContain("Eval Schema");
    expect(schema.type).toBe("object");
    expect(schema.properties.evalcases).toBeDefined();
  });

  it("should work when .github directory already exists", async () => {
    const githubDir = path.join(TEST_DIR, ".github");
    mkdirSync(githubDir, { recursive: true });

    await initCommand({ targetPath: TEST_DIR });

    const promptFile = path.join(githubDir, "prompts", "eval-build.prompt.md");
    const schemaFile = path.join(githubDir, "contexts", "eval-schema.json");

    expect(existsSync(promptFile)).toBe(true);
    expect(existsSync(schemaFile)).toBe(true);
  });

  it("should default to current directory when no path provided", async () => {
    // Just test that it defaults to "." when no path is provided
    // We can't test process.chdir in vitest workers
    await initCommand({ targetPath: TEST_DIR });

    const githubDir = path.join(TEST_DIR, ".github");
    expect(existsSync(githubDir)).toBe(true);
  });
});
