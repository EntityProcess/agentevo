import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { validateTargetsFile } from "../../../src/evaluation/validation/targets-validator.js";

describe("targets-validator", () => {
  const testDir = path.join(tmpdir(), `agentv-test-targets-${Date.now()}`);

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

  describe("validateTargetsFile", () => {
    it("should validate a correct targets file", async () => {
      const content = `
$schema: agentv-targets-v2
targets:
  - name: default
    provider: azure
    settings:
      model: gpt-4
`;
      const filePath = await createTestFile("valid-targets.yaml", content);
      const result = await validateTargetsFile(filePath);
      
      expect(result.valid).toBe(true);
      expect(result.fileType).toBe("targets");
      expect(result.errors).toHaveLength(0);
      
      await cleanup();
    });

    it("should reject file without $schema", async () => {
      const content = `
targets:
  - name: default
    provider: azure
`;
      const filePath = await createTestFile("no-schema.yaml", content);
      const result = await validateTargetsFile(filePath);
      
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
$schema: agentv-eval-v2
targets: []
`;
      const filePath = await createTestFile("wrong-schema.yaml", content);
      const result = await validateTargetsFile(filePath);
      
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

    it("should reject target without name", async () => {
      const content = `
$schema: agentv-targets-v2
targets:
  - provider: azure
`;
      const filePath = await createTestFile("no-name.yaml", content);
      const result = await validateTargetsFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("name"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should reject target without provider", async () => {
      const content = `
$schema: agentv-targets-v2
targets:
  - name: test
`;
      const filePath = await createTestFile("no-provider.yaml", content);
      const result = await validateTargetsFile(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("provider"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should warn for unknown provider", async () => {
      const content = `
$schema: agentv-targets-v2
targets:
  - name: test
    provider: unknown-provider
`;
      const filePath = await createTestFile("unknown-provider.yaml", content);
      const result = await validateTargetsFile(filePath);
      
      // Should still be valid (warnings don't invalidate)
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "warning",
            message: expect.stringContaining("Unknown provider"),
          }),
        ]),
      );
      
      await cleanup();
    });

    it("should validate optional fields", async () => {
      const content = `
$schema: agentv-targets-v2
targets:
  - name: test
    provider: azure
    settings:
      model: gpt-4
    judge_target: judge
`;
      const filePath = await createTestFile("with-optionals.yaml", content);
      const result = await validateTargetsFile(filePath);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0); // No warnings for known provider
      
      await cleanup();
    });
  });
});
