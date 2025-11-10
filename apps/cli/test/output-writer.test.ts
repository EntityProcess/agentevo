import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { EvaluationResult } from "@agentevo/core";

import { createOutputWriter, getDefaultExtension } from "../src/commands/eval/output-writer.js";

describe("output-writer", () => {
  const tempDir = join(process.cwd(), ".tmp-output-writer-test");

  beforeEach(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("getDefaultExtension", () => {
    test("returns .jsonl for jsonl format", () => {
      expect(getDefaultExtension("jsonl")).toBe(".jsonl");
    });

    test("returns .yaml for yaml format", () => {
      expect(getDefaultExtension("yaml")).toBe(".yaml");
    });
  });

  describe("createOutputWriter", () => {
    test("creates JsonlWriter for jsonl format", async () => {
      const filePath = join(tempDir, "output.jsonl");
      const writer = await createOutputWriter(filePath, "jsonl");

      const result: EvaluationResult = {
        test_id: "test-001",
        score: 0.85,
        hits: ["aspect1"],
        misses: [],
        model_answer: "Answer",
        expected_aspect_count: 1,
        target: "azure",
        timestamp: "2024-01-01T00:00:00.000Z",
      };

      await writer.append(result);
      await writer.close();

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf-8");

      // JSONL format verification
      expect(content).toContain('"test_id":"test-001"');
      expect(content.endsWith("\n")).toBe(true);
    });

    test("creates YamlWriter for yaml format", async () => {
      const filePath = join(tempDir, "output.yaml");
      const writer = await createOutputWriter(filePath, "yaml");

      const result: EvaluationResult = {
        test_id: "test-002",
        score: 0.95,
        hits: ["aspect1", "aspect2"],
        misses: [],
        model_answer: "Answer",
        expected_aspect_count: 2,
        target: "anthropic",
        timestamp: "2024-01-01T00:00:00.000Z",
      };

      await writer.append(result);
      await writer.close();

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(filePath, "utf-8");

      // YAML format verification
      expect(content).toContain("---");
      expect(content).toContain("test_id: test-002");
    });

    test("both writers implement the same interface", async () => {
      const jsonlPath = join(tempDir, "test.jsonl");
      const yamlPath = join(tempDir, "test.yaml");

      const jsonlWriter = await createOutputWriter(jsonlPath, "jsonl");
      const yamlWriter = await createOutputWriter(yamlPath, "yaml");

      const result: EvaluationResult = {
        test_id: "interface-test",
        score: 0.5,
        hits: [],
        misses: [],
        model_answer: "Test",
        expected_aspect_count: 0,
        target: "mock",
        timestamp: "2024-01-01T00:00:00.000Z",
      };

      // Both should have append and close methods
      await jsonlWriter.append(result);
      await yamlWriter.append(result);

      await jsonlWriter.close();
      await yamlWriter.close();

      const { readFile } = await import("node:fs/promises");
      const jsonlContent = await readFile(jsonlPath, "utf-8");
      const yamlContent = await readFile(yamlPath, "utf-8");

      // Both should have written content
      expect(jsonlContent.length).toBeGreaterThan(0);
      expect(yamlContent.length).toBeGreaterThan(0);
    });
  });
});
