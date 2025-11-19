import type { EvaluationResult } from "@agentv/core";

export interface HistogramBin {
  readonly range: readonly [number, number];
  count: number;
}

export interface EvaluationSummary {
  readonly total: number;
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly standardDeviation?: number;
  readonly histogram: readonly HistogramBin[];
  readonly topResults: readonly EvaluationResult[];
  readonly bottomResults: readonly EvaluationResult[];
}

const HISTOGRAM_BREAKPOINTS = [0, 0.2, 0.4, 0.6, 0.8, 1];

function computeMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeStandardDeviation(values: readonly number[]): number | undefined {
  if (values.length < 2) {
    return undefined;
  }
  const mean = computeMean(values);
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildHistogram(values: readonly number[]): readonly HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let index = 0; index < HISTOGRAM_BREAKPOINTS.length - 1; index += 1) {
    bins.push({
      range: [HISTOGRAM_BREAKPOINTS[index], HISTOGRAM_BREAKPOINTS[index + 1]] as const,
      count: 0,
    });
  }

  for (const value of values) {
    for (const bin of bins) {
      const [start, end] = bin.range;
      const isLastBin = end === HISTOGRAM_BREAKPOINTS[HISTOGRAM_BREAKPOINTS.length - 1];
      const withinRange = isLastBin ? value >= start && value <= end : value >= start && value < end + 1e-9;
      if (withinRange) {
        bin.count += 1;
        break;
      }
    }
  }

  return bins;
}

export function calculateEvaluationSummary(results: readonly EvaluationResult[]): EvaluationSummary {
  const scores = results.map((result) => result.score);
  const total = results.length;

  if (total === 0) {
    return {
      total: 0,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      standardDeviation: undefined,
      histogram: buildHistogram([]),
      topResults: [],
      bottomResults: [],
    };
  }

  const mean = computeMean(scores);
  const median = computeMedian(scores);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const standardDeviation = computeStandardDeviation(scores);
  const histogram = buildHistogram(scores);

  const sortedResults = [...results].sort((a, b) => b.score - a.score);
  const topResults = sortedResults.slice(0, Math.min(3, sortedResults.length));
  const bottomResults = sortedResults.slice(-Math.min(3, sortedResults.length));

  return {
    total,
    mean,
    median,
    min,
    max,
    standardDeviation,
    histogram,
    topResults,
    bottomResults,
  };
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

export function formatEvaluationSummary(summary: EvaluationSummary): string {
  if (summary.total === 0) {
    return "\nNo results to summarize";
  }

  const lines: string[] = [];
  lines.push("\n==================================================");
  lines.push("EVALUATION SUMMARY");
  lines.push("==================================================");
  lines.push(`Total eval cases: ${summary.total}`);
  lines.push(`Mean score: ${formatScore(summary.mean)}`);
  lines.push(`Median score: ${formatScore(summary.median)}`);
  lines.push(`Min score: ${formatScore(summary.min)}`);
  lines.push(`Max score: ${formatScore(summary.max)}`);
  if (typeof summary.standardDeviation === "number") {
    lines.push(`Std deviation: ${formatScore(summary.standardDeviation)}`);
  }

  lines.push("\nScore distribution:");
  for (const bin of summary.histogram) {
    const [start, end] = bin.range;
    lines.push(`  ${start.toFixed(1)}-${end.toFixed(1)}: ${bin.count}`);
  }

  lines.push("\nTop performing eval cases:");
  summary.topResults.forEach((result, index) => {
    lines.push(`  ${index + 1}. ${result.eval_id}: ${formatScore(result.score)}`);
  });

  lines.push("\nLowest performing eval cases:");
  summary.bottomResults.forEach((result, index) => {
    lines.push(`  ${index + 1}. ${result.eval_id}: ${formatScore(result.score)}`);
  });

  return lines.join("\n");
}
