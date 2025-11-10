import type { EvaluationResult } from "@agentevo/core";

import { JsonlWriter } from "./jsonl-writer.js";
import { YamlWriter } from "./yaml-writer.js";

export type OutputFormat = "jsonl" | "yaml";

export interface OutputWriter {
  append(result: EvaluationResult): Promise<void>;
  close(): Promise<void>;
}

export async function createOutputWriter(
  filePath: string,
  format: OutputFormat,
): Promise<OutputWriter> {
  switch (format) {
    case "jsonl":
      return JsonlWriter.open(filePath);
    case "yaml":
      return YamlWriter.open(filePath);
    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unsupported output format: ${exhaustiveCheck}`);
    }
  }
}

export function getDefaultExtension(format: OutputFormat): string {
  switch (format) {
    case "jsonl":
      return ".jsonl";
    case "yaml":
      return ".yaml";
    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unsupported output format: ${exhaustiveCheck}`);
    }
  }
}
