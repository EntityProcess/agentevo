import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { isGuidelineFile, loadTestCases } from "../../src/evaluation/yaml-parser.js";

describe("isGuidelineFile", () => {
  describe("with default patterns", () => {
    it("matches .instructions.md files", () => {
      expect(isGuidelineFile("docs/coding.instructions.md")).toBe(true);
      expect(isGuidelineFile("path/to/api.instructions.md")).toBe(true);
    });

    it("matches files in /instructions/ directories", () => {
      expect(isGuidelineFile("docs/instructions/coding.md")).toBe(true);
      expect(isGuidelineFile("instructions/api-guide.md")).toBe(true);
    });

    it("matches .prompt.md files", () => {
      expect(isGuidelineFile("prompts/task.prompt.md")).toBe(true);
      expect(isGuidelineFile("src/prompts/guide.prompt.md")).toBe(true);
    });

    it("matches files in /prompts/ directories", () => {
      expect(isGuidelineFile("prompts/task.md")).toBe(true);
      expect(isGuidelineFile("src/prompts/guide.md")).toBe(true);
    });

    it("does not match regular files", () => {
      expect(isGuidelineFile("README.md")).toBe(false);
      expect(isGuidelineFile("src/utils/helper.ts")).toBe(false);
      expect(isGuidelineFile("docs/guide.md")).toBe(false);
    });

    it("normalizes Windows paths to forward slashes", () => {
      expect(isGuidelineFile("docs\\instructions\\guide.md")).toBe(true);
      expect(isGuidelineFile("src\\prompts\\task.prompt.md")).toBe(true);
      expect(isGuidelineFile("docs\\guide.md")).toBe(false);
    });
  });

  describe("with custom patterns", () => {
    it("matches custom glob patterns", () => {
      const patterns = ["**/*.guide.md", "**/guidelines/**"];
      expect(isGuidelineFile("docs/api.guide.md", patterns)).toBe(true);
      expect(isGuidelineFile("guidelines/coding.md", patterns)).toBe(true);
    });

    it("does not match files outside custom patterns", () => {
      const patterns = ["**/*.guide.md"];
      expect(isGuidelineFile("docs/instructions/api.instructions.md", patterns)).toBe(false);
      expect(isGuidelineFile("prompts/task.prompt.md", patterns)).toBe(false);
    });

    it("handles exact path patterns", () => {
      const patterns = ["docs/AGENTS.md", "**/*.rules.md"];
      expect(isGuidelineFile("docs/AGENTS.md", patterns)).toBe(true);
      expect(isGuidelineFile("src/typescript.rules.md", patterns)).toBe(true);
      expect(isGuidelineFile("docs/README.md", patterns)).toBe(false);
    });
  });
});

describe("loadTestCases with .agentv/config.yaml", () => {
  let testDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `agentv-test-${Date.now()}`);
    repoRoot = testDir;
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it("uses custom guideline_patterns from .agentv/config.yaml", async () => {
    // Create .agentv directory and config file
    const agentvDir = path.join(testDir, ".agentv");
    await mkdir(agentvDir, { recursive: true });
    const configContent = `guideline_patterns:
  - "**/*.guide.md"
  - "**/rules/**"
`;
    await writeFile(path.join(agentvDir, "config.yaml"), configContent, "utf8");

    // Create test guideline file matching custom pattern
    const guidelineContent = "# Custom Guideline\nFollow these rules.";
    await writeFile(path.join(testDir, "api.guide.md"), guidelineContent, "utf8");

    // Create standard instruction file (should NOT match custom patterns)
    const instructionContent = "# Standard Instruction\nOld format.";
    await writeFile(path.join(testDir, "coding.instructions.md"), instructionContent, "utf8");

    // Create eval file
    const evalContent = `$schema: agentv-eval-v2
grader: heuristic
evalcases:
  - id: test-custom-patterns
    outcome: Success
    input_messages:
      - role: user
        content:
          - type: file
            value: api.guide.md
          - type: file
            value: coding.instructions.md
          - type: text
            value: Apply guidelines
    expected_messages:
      - role: assistant
        content: Done
`;
    const evalPath = path.join(testDir, "test.eval.yaml");
    await writeFile(evalPath, evalContent, "utf8");

    // Load test cases
    const testCases = await loadTestCases(evalPath, repoRoot);

    expect(testCases).toHaveLength(1);
    const testCase = testCases[0];

    // api.guide.md should be treated as guideline (matches custom pattern)
    expect(testCase.guideline_paths).toHaveLength(1);
    expect(testCase.guideline_paths[0]).toContain("api.guide.md");

    // coding.instructions.md should be treated as regular file (doesn't match custom pattern)
    expect(testCase.user_segments).toHaveLength(2); // file + text
    const fileSegment = testCase.user_segments.find(
      (seg) => seg.type === "file" && typeof seg.path === "string" && seg.path.includes("coding.instructions.md")
    );
    expect(fileSegment).toBeDefined();
  });

  it("uses default patterns when .agentv/config.yaml is absent", async () => {
    // Create standard instruction file
    const instructionContent = "# Standard Instruction\nDefault pattern.";
    await writeFile(path.join(testDir, "coding.instructions.md"), instructionContent, "utf8");

    // Create eval file
    const evalContent = `$schema: agentv-eval-v2
grader: heuristic
evalcases:
  - id: test-default-patterns
    outcome: Success
    input_messages:
      - role: user
        content:
          - type: file
            value: coding.instructions.md
          - type: text
            value: Apply guidelines
    expected_messages:
      - role: assistant
        content: Done
`;
    const evalPath = path.join(testDir, "test.eval.yaml");
    await writeFile(evalPath, evalContent, "utf8");

    // Load test cases
    const testCases = await loadTestCases(evalPath, repoRoot);

    expect(testCases).toHaveLength(1);
    const testCase = testCases[0];

    // coding.instructions.md should be treated as guideline (matches default pattern)
    expect(testCase.guideline_paths).toHaveLength(1);
    expect(testCase.guideline_paths[0]).toContain("coding.instructions.md");
  });

  it("walks up directory tree to find config at repo root", async () => {
    // Create config at repo root
    const agentvDir = path.join(testDir, ".agentv");
    await mkdir(agentvDir, { recursive: true });
    const configContent = `guideline_patterns:
  - "**/*.guide.md"
`;
    await writeFile(path.join(agentvDir, "config.yaml"), configContent, "utf8");

    // Create nested directory structure for eval file
    const evalsDir = path.join(testDir, "docs", "evals");
    await mkdir(evalsDir, { recursive: true });

    // Create guideline file in nested directory
    const guidelineContent = "# Nested Guideline\nShould use root config.";
    await writeFile(path.join(evalsDir, "api.guide.md"), guidelineContent, "utf8");

    // Create standard instruction (should NOT match custom pattern from root config)
    const instructionContent = "# Standard Instruction\nOld format.";
    await writeFile(path.join(evalsDir, "coding.instructions.md"), instructionContent, "utf8");

    // Create eval file in nested directory
    const evalContent = `$schema: agentv-eval-v2
grader: heuristic
evalcases:
  - id: test-walk-up
    outcome: Success
    input_messages:
      - role: user
        content:
          - type: file
            value: api.guide.md
          - type: file
            value: coding.instructions.md
          - type: text
            value: Apply guidelines
    expected_messages:
      - role: assistant
        content: Done
`;
    const evalPath = path.join(evalsDir, "test.eval.yaml");
    await writeFile(evalPath, evalContent, "utf8");

    // Load test cases
    const testCases = await loadTestCases(evalPath, repoRoot);

    expect(testCases).toHaveLength(1);
    const testCase = testCases[0];

    // api.guide.md should be treated as guideline (matches pattern from root config)
    expect(testCase.guideline_paths).toHaveLength(1);
    expect(testCase.guideline_paths[0]).toContain("api.guide.md");

    // coding.instructions.md should be treated as regular file (doesn't match root config pattern)
    expect(testCase.user_segments).toHaveLength(2); // file + text
    const fileSegment = testCase.user_segments.find(
      (seg) => seg.type === "file" && typeof seg.path === "string" && seg.path.includes("coding.instructions.md")
    );
    expect(fileSegment).toBeDefined();
  });

  it("handles cross-platform paths in patterns", async () => {
    // Create .agentv directory and config with patterns
    const agentvDir = path.join(testDir, ".agentv");
    await mkdir(agentvDir, { recursive: true });
    const configContent = `guideline_patterns:
  - "**/guidelines/**/*.md"
`;
    await writeFile(path.join(agentvDir, "config.yaml"), configContent, "utf8");

    // Create nested directory structure
    const guidelinesDir = path.join(testDir, "docs", "guidelines");
    await mkdir(guidelinesDir, { recursive: true });
    
    const guidelineContent = "# Nested Guideline\nCross-platform test.";
    await writeFile(path.join(guidelinesDir, "style.md"), guidelineContent, "utf8");

    // Create eval file
    const evalContent = `$schema: agentv-eval-v2
grader: heuristic
evalcases:
  - id: test-cross-platform
    outcome: Success
    input_messages:
      - role: user
        content:
          - type: file
            value: docs/guidelines/style.md
          - type: text
            value: Apply style guide
    expected_messages:
      - role: assistant
        content: Done
`;
    const evalPath = path.join(testDir, "test.eval.yaml");
    await writeFile(evalPath, evalContent, "utf8");

    // Load test cases
    const testCases = await loadTestCases(evalPath, repoRoot);

    expect(testCases).toHaveLength(1);
    const testCase = testCases[0];

    // Should match regardless of platform path separators
    expect(testCase.guideline_paths).toHaveLength(1);
    expect(testCase.guideline_paths[0]).toContain("style.md");
  });
});
