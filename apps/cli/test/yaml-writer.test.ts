import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parse as parseYaml, parseAllDocuments } from "yaml";

import type { EvaluationResult } from "@agentevo/core";

import { YamlWriter } from "../src/commands/eval/yaml-writer.js";

describe("YamlWriter", () => {
  const tempDir = join(process.cwd(), ".tmp-yaml-writer-test");
  const testFilePath = join(tempDir, "test-output.yaml");

  beforeEach(async () => {
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates output file with parent directories", async () => {
    const nestedPath = join(tempDir, "nested", "deep", "output.yaml");
    const writer = await YamlWriter.open(nestedPath);
    await writer.close();

    const { stat } = await import("node:fs/promises");
    const stats = await stat(nestedPath);
    expect(stats.isFile()).toBe(true);
  });

  test("writes single evaluation result as YAML", async () => {
    const writer = await YamlWriter.open(testFilePath);

    const result: EvaluationResult = {
      test_id: "test-001",
      score: 0.85,
      hits: ["aspect1", "aspect2"],
      misses: ["aspect3"],
      model_answer: "This is a test answer",
      expected_aspect_count: 3,
      target: "azure",
      timestamp: "2024-01-01T00:00:00.000Z",
      reasoning: "Good coverage of key points",
    };

    await writer.append(result);
    await writer.close();

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(testFilePath, "utf-8");

    expect(content).toContain("---");
    expect(content).toContain("test_id: test-001");
    expect(content).toContain("score: 0.85");
    expect(content).toContain("- aspect1");
    expect(content).toContain("- aspect2");

    // Verify it's valid YAML
    const parsed = parseYaml(content);
    expect(parsed).toMatchObject({
      test_id: "test-001",
      score: 0.85,
      hits: ["aspect1", "aspect2"],
    });
  });

  test("writes multiple evaluation results as YAML documents", async () => {
    const writer = await YamlWriter.open(testFilePath);

    const results: EvaluationResult[] = [
      {
        test_id: "test-001",
        score: 0.85,
        hits: ["aspect1"],
        misses: [],
        model_answer: "Answer 1",
        expected_aspect_count: 1,
        target: "azure",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      {
        test_id: "test-002",
        score: 0.95,
        hits: ["aspect1", "aspect2"],
        misses: [],
        model_answer: "Answer 2",
        expected_aspect_count: 2,
        target: "anthropic",
        timestamp: "2024-01-01T00:01:00.000Z",
      },
    ];

    for (const result of results) {
      await writer.append(result);
    }
    await writer.close();

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(testFilePath, "utf-8");

    // Verify document separators
    const separatorCount = (content.match(/^---$/gm) || []).length;
    expect(separatorCount).toBe(2);

    // Parse all documents
    const docs = parseAllDocuments(content);
    expect(docs).toHaveLength(2);

    const parsed = docs.map((doc) => doc.toJSON());
    expect(parsed[0]).toMatchObject({ test_id: "test-001", score: 0.85 });
    expect(parsed[1]).toMatchObject({ test_id: "test-002", score: 0.95 });
  });

  test("handles multiline strings correctly", async () => {
    const writer = await YamlWriter.open(testFilePath);

    const result: EvaluationResult = {
      test_id: "test-multiline",
      score: 0.75,
      hits: [],
      misses: [],
      model_answer: "This is a long answer\nthat spans multiple lines\nand includes special characters: @#$%",
      expected_aspect_count: 0,
      target: "mock",
      timestamp: "2024-01-01T00:00:00.000Z",
      reasoning: "Reasoning with\nmultiple\nlines",
    };

    await writer.append(result);
    await writer.close();

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(testFilePath, "utf-8");

    // Verify it's valid YAML and preserves newlines
    const parsed = parseYaml(content) as EvaluationResult;
    expect(parsed.model_answer).toBe(result.model_answer);
    expect(parsed.reasoning).toBe(result.reasoning);
  });

  test("throws error when writing to closed writer", async () => {
    const writer = await YamlWriter.open(testFilePath);
    await writer.close();

    const result: EvaluationResult = {
      test_id: "test-closed",
      score: 0.5,
      hits: [],
      misses: [],
      model_answer: "Answer",
      expected_aspect_count: 0,
      target: "mock",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    await expect(writer.append(result)).rejects.toThrow("Cannot write to closed YAML writer");
  });

  test("allows multiple close calls safely", async () => {
    const writer = await YamlWriter.open(testFilePath);
    await writer.close();
    await expect(writer.close()).resolves.toBeUndefined();
  });

  test("handles empty hits and misses arrays", async () => {
    const writer = await YamlWriter.open(testFilePath);

    const result: EvaluationResult = {
      test_id: "test-empty-arrays",
      score: 0.0,
      hits: [],
      misses: [],
      model_answer: "Answer",
      expected_aspect_count: 0,
      target: "mock",
      timestamp: "2024-01-01T00:00:00.000Z",
    };

    await writer.append(result);
    await writer.close();

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(testFilePath, "utf-8");

    const parsed = parseYaml(content) as EvaluationResult;
    expect(parsed.hits).toEqual([]);
    expect(parsed.misses).toEqual([]);
  });
});
