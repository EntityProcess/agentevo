import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { validateEvalFile } from "../../../src/evaluation/validation/eval-validator.js";

describe("eval-validator", () => {
  const testDir = path.join(tmpdir(), `agentv-test-eval-${Date.now()}`);

  async function createTestFile(filename: string, content: string): Promise<string> {
    await mkdir(testDir, { recursive: true });
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

  describe("validateEvalFile", () => {
    it("should validate a correct eval file", async () => {
      const content = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content: "Test request"
    expected_messages:
      - role: assistant
        content: "Expected response"
`;
      const filePath = await createTestFile("valid.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(true);
      expect(result.fileType).toBe("eval");
      expect(result.errors).toHaveLength(0);
      
      await cleanup();
    });

    it("should reject file without $schema", async () => {
      const content = `
evalcases:
  - id: test-1
    outcome: pass
    input_messages: []
    expected_messages: []
`;
      const filePath = await createTestFile("no-schema.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            location: "$schema",
            message: expect.stringContaining("Missing required field '$schema'"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should reject file with wrong $schema", async () => {
      const content = `
$schema: wrong-schema
evalcases: []
`;
      const filePath = await createTestFile("wrong-schema.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            location: "$schema",
            message: expect.stringContaining("Invalid $schema value"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should reject file without evalcases array", async () => {
      const content = `
$schema: agentv-eval-v2
`;
      const filePath = await createTestFile("no-evalcases.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            location: "evalcases",
            message: expect.stringContaining("Missing or invalid 'evalcases'"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should reject eval case without required fields", async () => {
      const content = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
`;
      const filePath = await createTestFile("incomplete-case.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("outcome"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should validate message roles", async () => {
      const content = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: invalid-role
        content: "Test"
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("invalid-role.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("Invalid role"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should validate array content structure", async () => {
      const content = `
$schema: agentv-eval-v2
evalcases:
  - id: test-1
    outcome: pass
    input_messages:
      - role: user
        content:
          - type: text
            value: "Test request"
    expected_messages:
      - role: assistant
        content: "Response"
`;
      const filePath = await createTestFile("array-content.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      await cleanup();
    });

    it("should handle invalid YAML syntax", async () => {
      const content = `{ invalid yaml syntax`;
      const filePath = await createTestFile("invalid.yaml", content);
      const result = await validateEvalFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("Failed to parse YAML"),
          }),
        ]),
      );
      
      await cleanup();
    });
  });
});
