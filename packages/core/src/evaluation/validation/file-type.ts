import { readFile } from "node:fs/promises";
import { parse } from "yaml";

import type { FileType } from "./types.js";

const SCHEMA_EVAL_V2 = "agentv-eval-v2";
const SCHEMA_TARGETS_V2 = "agentv-targets-v2";
const SCHEMA_CONFIG_V2 = "agentv-config-v2";

/**
 * Detect file type by reading $schema field from YAML file.
 * Returns "unknown" if file cannot be read or $schema is missing/invalid.
 */
export async function detectFileType(filePath: string): Promise<FileType> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = parse(content) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return "unknown";
    }

    const record = parsed as Record<string, unknown>;
    const schema = record["$schema"];

    if (typeof schema !== "string") {
      return "unknown";
    }

    switch (schema) {
      case SCHEMA_EVAL_V2:
        return "eval";
      case SCHEMA_TARGETS_V2:
        return "targets";
      case SCHEMA_CONFIG_V2:
        return "config";
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}

/**
 * Check if a schema value is a valid AgentV schema identifier.
 */
export function isValidSchema(schema: unknown): boolean {
  return schema === SCHEMA_EVAL_V2 || schema === SCHEMA_TARGETS_V2 || schema === SCHEMA_CONFIG_V2;
}

/**
 * Get the expected schema for a file type.
 */
export function getExpectedSchema(fileType: FileType): string | undefined {
  switch (fileType) {
    case "eval":
      return SCHEMA_EVAL_V2;
    case "targets":
      return SCHEMA_TARGETS_V2;
    case "config":
      return SCHEMA_CONFIG_V2;
    default:
      return undefined;
  }
}
