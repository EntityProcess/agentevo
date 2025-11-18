import { describe, it, expect } from "vitest";
import { validateFileReferences } from "../../../src/evaluation/validation/file-reference-validator.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("file-reference-validator", () => {
  const testDir = path.join(tmpdir(), `agentv-test-fileref-${Date.now()}`);

  async function createTestFile(filename: string, content: string): Promise<string> {
    await mkdir(testDir, { recursive: true });
    
    // Initialize git repo if not already done
    try {
      await execAsync("git rev-parse --git-dir", { cwd: testDir });
    } catch {
      // Git repo doesn't exist, initialize it
      await execAsync("git init", { cwd: testDir });
      await execAsync('git config user.email "test@example.com"', { cwd: testDir });
      await execAsync('git config user.name "Test User"', { cwd: testDir });
    }
    
    const filePath = path.join(testDir, filename);
    await writeFile(filePath, content, "utf8");
    return filePath;
  }

  async function cleanup() {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  describe("validateFileReferences", () => {
    it("should pass when referenced file exists", async () => {
      // Create a referenced file
      await createTestFile("referenced.md", "# Test content");

      const evalContent = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content:
          - type: file
            value: referenced.md
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("test.yaml", evalContent);
      const errors = await validateFileReferences(filePath);
      
      expect(errors).toHaveLength(0);
      
      await cleanup();
    });

    it("should error when referenced file does not exist", async () => {
      const evalContent = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content:
          - type: file
            value: nonexistent.md
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("test.yaml", evalContent);
      const errors = await validateFileReferences(filePath);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("not found"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should warn about empty files in strict mode", async () => {
      // Create an empty referenced file
      await createTestFile("empty.md", "");

      const evalContent = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content:
          - type: file
            value: empty.md
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("test.yaml", evalContent);
      const errors = await validateFileReferences(filePath);
      
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "warning",
            message: expect.stringContaining("empty"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should handle multiple file references", async () => {
      await createTestFile("file1.md", "Content 1");
      await createTestFile("file2.md", "Content 2");

      const evalContent = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content:
          - type: file
            value: file1.md
          - type: file
            value: file2.md
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("test.yaml", evalContent);
      const errors = await validateFileReferences(filePath);
      
      expect(errors).toHaveLength(0);
      
      await cleanup();
    });

    it("should handle mixed valid and invalid references", async () => {
      await createTestFile("exists.md", "Content");

      const evalContent = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content:
          - type: file
            value: exists.md
          - type: file
            value: missing.md
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("test.yaml", evalContent);
      const errors = await validateFileReferences(filePath);
      
      expect(errors.length).toBe(1);
      expect(errors[0]).toEqual(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("missing.md"),
        }),
      );
      
      await cleanup();
    });
  });
});
