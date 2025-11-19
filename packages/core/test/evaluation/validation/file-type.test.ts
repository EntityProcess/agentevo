import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { detectFileType, isValidSchema, getExpectedSchema } from "../../../src/evaluation/validation/file-type.js";

describe("file-type", () => {
  const testDir = path.join(tmpdir(), `agentv-test-${Date.now()}`);

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

  describe("detectFileType", () => {
    it("should detect eval file by $schema field", async () => {
      const filePath = await createTestFile(
        "test.yaml",
        "$schema: agentv-eval-v2\nevalcases: []",
      );
      const result = await detectFileType(filePath);
      expect(result).toBe("eval");
      await cleanup();
    });

    it("should detect targets file by $schema field", async () => {
      const filePath = await createTestFile(
        "targets.yaml",
        "$schema: agentv-targets-v2\ntargets: []",
      );
      const result = await detectFileType(filePath);
      expect(result).toBe("targets");
      await cleanup();
    });

    it("should return unknown for missing $schema", async () => {
      const filePath = await createTestFile("no-schema.yaml", "evalcases: []");
      const result = await detectFileType(filePath);
      expect(result).toBe("unknown");
      await cleanup();
    });

    it("should return unknown for invalid $schema", async () => {
      const filePath = await createTestFile(
        "invalid.yaml",
        "$schema: some-other-schema\nevalcases: []",
      );
      const result = await detectFileType(filePath);
      expect(result).toBe("unknown");
      await cleanup();
    });

    it("should return unknown for non-existent file", async () => {
      const result = await detectFileType("/nonexistent/file.yaml");
      expect(result).toBe("unknown");
    });

    it("should return unknown for invalid YAML", async () => {
      const filePath = await createTestFile("invalid.yaml", "{ invalid yaml");
      const result = await detectFileType(filePath);
      expect(result).toBe("unknown");
      await cleanup();
    });
  });

  describe("isValidSchema", () => {
    it("should return true for agentv-eval-v2", () => {
      expect(isValidSchema("agentv-eval-v2")).toBe(true);
    });

    it("should return true for agentv-targets-v2", () => {
      expect(isValidSchema("agentv-targets-v2")).toBe(true);
    });

    it("should return false for unknown schema", () => {
      expect(isValidSchema("unknown-schema")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidSchema(123)).toBe(false);
      expect(isValidSchema(null)).toBe(false);
      expect(isValidSchema(undefined)).toBe(false);
    });
  });

  describe("getExpectedSchema", () => {
    it("should return correct schema for eval", () => {
      expect(getExpectedSchema("eval")).toBe("agentv-eval-v2");
    });

    it("should return correct schema for targets", () => {
      expect(getExpectedSchema("targets")).toBe("agentv-targets-v2");
    });

    it("should return undefined for unknown", () => {
      expect(getExpectedSchema("unknown")).toBeUndefined();
    });
  });
});
