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

const CLI_PLACEHOLDERS = new Set(["PROMPT", "GUIDELINES", "EVAL_ID", "ATTEMPT", "FILES"]);

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

function validateCliSettings(
  settings: unknown,
  absolutePath: string,
  location: string,
  errors: ValidationError[],
): void {
  if (!isObject(settings)) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location,
      message: "CLI provider requires a 'settings' object",
    });
    return;
  }

  const commandTemplate = settings["command_template"] ?? settings["commandTemplate"];
  if (typeof commandTemplate !== "string" || commandTemplate.trim().length === 0) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.commandTemplate`,
      message: "CLI provider requires 'commandTemplate' as a non-empty string",
    });
  } else {
    recordUnknownPlaceholders(commandTemplate, absolutePath, `${location}.commandTemplate`, errors);
  }

  const attachmentsFormat = settings["attachments_format"] ?? settings["attachmentsFormat"];
  if (attachmentsFormat !== undefined && typeof attachmentsFormat !== "string") {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.attachmentsFormat`,
      message: "'attachmentsFormat' must be a string when provided",
    });
  }

  const filesFormat = settings["files_format"] ?? settings["filesFormat"];
  if (filesFormat !== undefined && typeof filesFormat !== "string") {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.filesFormat`,
      message: "'filesFormat' must be a string when provided",
    });
  }

  const cwd = settings["cwd"];
  if (cwd !== undefined && typeof cwd !== "string") {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.cwd`,
      message: "'cwd' must be a string when provided",
    });
  }

  const timeoutSeconds = settings["timeout_seconds"] ?? settings["timeoutSeconds"];
  if (timeoutSeconds !== undefined) {
    const numericTimeout = Number(timeoutSeconds);
    if (!Number.isFinite(numericTimeout) || numericTimeout <= 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.timeoutSeconds`,
        message: "'timeoutSeconds' must be a positive number when provided",
      });
    }
  }

  const envOverrides = settings["env"];
  if (envOverrides !== undefined) {
    if (!isObject(envOverrides)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.env`,
        message: "'env' must be an object with string values",
      });
    } else {
      for (const [key, value] of Object.entries(envOverrides)) {
        if (typeof value !== "string" || value.trim().length === 0) {
          errors.push({
            severity: "error",
            filePath: absolutePath,
            location: `${location}.env.${key}`,
            message: `Environment override '${key}' must be a non-empty string`,
          });
        }
      }
    }
  }

  const healthcheck = settings["healthcheck"];
  if (healthcheck !== undefined) {
    validateCliHealthcheck(healthcheck, absolutePath, `${location}.healthcheck`, errors);
  }
}

function validateCliHealthcheck(
  healthcheck: unknown,
  absolutePath: string,
  location: string,
  errors: ValidationError[],
): void {
  if (!isObject(healthcheck)) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location,
      message: "'healthcheck' must be an object when provided",
    });
    return;
  }

  const type = healthcheck["type"];
  if (type !== "http" && type !== "command") {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.type`,
      message: "healthcheck.type must be either 'http' or 'command'",
    });
    return;
  }

  const timeoutSeconds = healthcheck["timeout_seconds"] ?? healthcheck["timeoutSeconds"];
  if (timeoutSeconds !== undefined) {
    const numericTimeout = Number(timeoutSeconds);
    if (!Number.isFinite(numericTimeout) || numericTimeout <= 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.timeoutSeconds`,
        message: "healthcheck.timeoutSeconds must be a positive number when provided",
      });
    }
  }

  if (type === "http") {
    const url = healthcheck["url"];
    if (typeof url !== "string" || url.trim().length === 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.url`,
        message: "healthcheck.url must be a non-empty string for http checks",
      });
    }
    return;
  }

  const commandTemplate = healthcheck["command_template"] ?? healthcheck["commandTemplate"];
  if (typeof commandTemplate !== "string" || commandTemplate.trim().length === 0) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.commandTemplate`,
      message: "healthcheck.commandTemplate must be a non-empty string for command checks",
    });
  } else {
    recordUnknownPlaceholders(commandTemplate, absolutePath, `${location}.commandTemplate`, errors);
  }

  const cwd = healthcheck["cwd"];
  if (cwd !== undefined && typeof cwd !== "string") {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: `${location}.cwd`,
      message: "healthcheck.cwd must be a string when provided",
    });
  }
}

function recordUnknownPlaceholders(
  template: string,
  absolutePath: string,
  location: string,
  errors: ValidationError[],
): void {
  const placeholders = extractPlaceholders(template);
  for (const placeholder of placeholders) {
    if (!CLI_PLACEHOLDERS.has(placeholder)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location,
        message: `Unknown CLI placeholder '{${placeholder}}'. Supported placeholders: ${Array.from(CLI_PLACEHOLDERS).join(", ")}`,
      });
    }
  }
}

function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{([A-Z_]+)\}/g);
  const result: string[] = [];
  for (const match of matches) {
    const placeholder = match[1];
    if (placeholder) {
      result.push(placeholder);
    }
  }
  return result;
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
    const providerValue = typeof provider === "string" ? provider.trim().toLowerCase() : undefined;
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
    if (providerValue !== "cli" && settings !== undefined && !isObject(settings)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.settings`,
        message: "Invalid 'settings' field (must be an object)",
      });
    }

    if (providerValue === "cli") {
      validateCliSettings(settings, absolutePath, `${location}.settings`, errors);
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
