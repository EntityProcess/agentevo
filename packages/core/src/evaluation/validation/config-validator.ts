import { readFile } from "node:fs/promises";
import { parse } from "yaml";

import type { ValidationError, ValidationResult } from "./types.js";

const SCHEMA_CONFIG_V2 = "agentv-config-v2";

/**
 * Validate a config.yaml file for schema compliance and structural correctness.
 */
export async function validateConfigFile(filePath: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  try {
    const content = await readFile(filePath, "utf8");
    const parsed = parse(content) as unknown;

    // Check if parsed content is an object
    if (typeof parsed !== "object" || parsed === null) {
      errors.push({
        severity: "error",
        filePath,
        message: "Config file must contain a valid YAML object",
      });
      return { valid: false, filePath, fileType: "config", errors };
    }

    const config = parsed as Record<string, unknown>;

    // Validate $schema field
    const schema = config["$schema"];
    if (schema !== SCHEMA_CONFIG_V2) {
      const message =
        typeof schema === "string"
          ? `Invalid $schema value '${schema}'. Expected '${SCHEMA_CONFIG_V2}'`
          : `Missing required field '$schema'. Please add '$schema: ${SCHEMA_CONFIG_V2}' at the top of the file.`;
      errors.push({
        severity: "error",
        filePath,
        location: "$schema",
        message,
      });
    }

    // Validate guideline_patterns if present
    const guidelinePatterns = config["guideline_patterns"];
    if (guidelinePatterns !== undefined) {
      if (!Array.isArray(guidelinePatterns)) {
        errors.push({
          severity: "error",
          filePath,
          location: "guideline_patterns",
          message: "Field 'guideline_patterns' must be an array",
        });
      } else if (!guidelinePatterns.every((p) => typeof p === "string")) {
        errors.push({
          severity: "error",
          filePath,
          location: "guideline_patterns",
          message: "All entries in 'guideline_patterns' must be strings",
        });
      } else if (guidelinePatterns.length === 0) {
        errors.push({
          severity: "warning",
          filePath,
          location: "guideline_patterns",
          message: "Field 'guideline_patterns' is empty. Consider removing it or adding patterns.",
        });
      }
    }

    // Check for unexpected fields
    const allowedFields = new Set(["$schema", "guideline_patterns"]);
    const unexpectedFields = Object.keys(config).filter((key) => !allowedFields.has(key));
    
    if (unexpectedFields.length > 0) {
      errors.push({
        severity: "warning",
        filePath,
        message: `Unexpected fields: ${unexpectedFields.join(", ")}`,
      });
    }

    return {
      valid: errors.filter((e) => e.severity === "error").length === 0,
      filePath,
      fileType: "config",
      errors,
    };
  } catch (error) {
    errors.push({
      severity: "error",
      filePath,
      message: `Failed to parse config file: ${(error as Error).message}`,
    });
    return { valid: false, filePath, fileType: "config", errors };
  }
}
