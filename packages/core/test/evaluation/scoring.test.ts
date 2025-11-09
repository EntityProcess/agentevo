import { describe, expect, it } from "vitest";

import {
  calculateHits,
  calculateMisses,
  extractAspects,
  isErrorLike,
  scoreCandidateResponse,
} from "../../src/evaluation/scoring.js";

describe("extractAspects", () => {
  it("identifies bullet points and action lines", () => {
    const source = `- Use logging middleware
* Avoid global state
1. Add unit tests
Ensure configuration is validated`;

    const aspects = extractAspects(source);

    expect(aspects).toEqual([
      "use logging middleware",
      "avoid global state",
      "add unit tests",
      "ensure configuration is validated",
    ]);
  });
});

describe("heuristic scoring", () => {
  const expectedAspects = [
    "use logging middleware",
    "avoid global state",
    "add unit tests",
  ];

  it("scores hits when key terms match", () => {
    const candidate = "You should add logging middleware and remember to add unit tests.";
    const hits = calculateHits(candidate, expectedAspects);

    expect(hits).toContain("use logging middleware");
    expect(hits).toContain("add unit tests");
  });

  it("identifies misses when no match", () => {
    const candidate = "Consider focusing on documentation.";
    const misses = calculateMisses(candidate, expectedAspects);

    expect(misses).toStrictEqual(expectedAspects);
  });

  it("produces balanced score", () => {
    const candidate = "Add unit tests and avoid global state in the new module.";
    const result = scoreCandidateResponse(candidate, expectedAspects);

    expect(result.score).toBeCloseTo(2 / 3, 5);
    expect(result.hits).toHaveLength(2);
    expect(result.misses).toHaveLength(1);
  });

  it("treats error-like output as failure when no aspects", () => {
    const result = scoreCandidateResponse("Error: timed out", []);

    expect(result.score).toBe(0);
    expect(result.misses).toContain("Model produced an error instead of an answer.");
  });
});

describe("isErrorLike", () => {
  it("detects common error prefixes", () => {
    expect(isErrorLike("Error: no response file was generated")).toBe(true);
    expect(isErrorLike("Success")).toBe(false);
  });
});
