import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import type { ValidationError, ValidationResult } from "./types.js";
import { KNOWN_PROVIDERS, PROVIDER_ALIASES, TARGETS_SCHEMA_V2 } from "../providers/types.js";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { readonly [key: string]: JsonValue };
type JsonArray = readonly JsonValue[];

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a targets file (agentv-targets-v2 schema).
 */
export async function validateTargetsFile(
  filePath: string,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const absolutePath = path.resolve(filePath);

  let parsed: unknown;
  try {
    const content = await readFile(absolutePath, "utf8");
    parsed = parse(content);
  } catch (error) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      message: `Failed to parse YAML: ${(error as Error).message}`,
    });
    return {
      valid: false,
      filePath: absolutePath,
      fileType: "targets",
      errors,
    };
  }

  if (!isObject(parsed)) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      message: "File must contain a YAML object",
    });
    return {
      valid: false,
      filePath: absolutePath,
      fileType: "targets",
      errors,
    };
  }

  // Validate $schema field
  const schema = parsed["$schema"];
  if (schema !== TARGETS_SCHEMA_V2) {
    const message =
      typeof schema === "string"
        ? `Invalid $schema value '${schema}'. Expected '${TARGETS_SCHEMA_V2}'`
        : `Missing required field '$schema'. Expected '${TARGETS_SCHEMA_V2}'`;
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: "$schema",
      message,
    });
  }

  // Validate targets array
  const targets = parsed["targets"];
  if (!Array.isArray(targets)) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: "targets",
      message: "Missing or invalid 'targets' field (must be an array)",
    });
    return {
      valid: errors.length === 0,
      filePath: absolutePath,
      fileType: "targets",
      errors,
    };
  }

  // Validate each target definition
  const knownProviders = [...KNOWN_PROVIDERS, ...PROVIDER_ALIASES];
  
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const location = `targets[${i}]`;

    if (!isObject(target)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location,
        message: "Target must be an object",
      });
      continue;
    }

    // Required field: name
    const name = target["name"];
    if (typeof name !== "string" || name.trim().length === 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.name`,
        message: "Missing or invalid 'name' field (must be a non-empty string)",
      });
    }

    // Required field: provider
    const provider = target["provider"];
    if (typeof provider !== "string" || provider.trim().length === 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.provider`,
        message: "Missing or invalid 'provider' field (must be a non-empty string)",
      });
    } else if (!knownProviders.includes(provider)) {
      // Warning for unknown providers (non-fatal)
      errors.push({
        severity: "warning",
        filePath: absolutePath,
        location: `${location}.provider`,
        message: `Unknown provider '${provider}'. Known providers: ${knownProviders.join(", ")}`,
      });
    }

    // Optional field: settings (must be object if present)
    const settings = target["settings"];
    if (settings !== undefined && !isObject(settings)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.settings`,
        message: "Invalid 'settings' field (must be an object)",
      });
    }

    // Optional field: judge_target (must be string if present)
    const judgeTarget = target["judge_target"];
    if (judgeTarget !== undefined && typeof judgeTarget !== "string") {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.judge_target`,
        message: "Invalid 'judge_target' field (must be a string)",
      });
    }
  }

  return {
    valid: errors.filter((e) => e.severity === "error").length === 0,
    filePath: absolutePath,
    fileType: "targets",
    errors,
  };
}
