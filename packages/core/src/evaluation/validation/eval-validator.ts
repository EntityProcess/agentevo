import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import type { ValidationError, ValidationResult } from "./types.js";

const SCHEMA_EVAL_V2 = "agentevo-eval-v2";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { readonly [key: string]: JsonValue };
type JsonArray = readonly JsonValue[];

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an eval file (agentevo-eval-v2 schema).
 */
export async function validateEvalFile(
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
      fileType: "eval",
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
      fileType: "eval",
      errors,
    };
  }

  // Validate $schema field
  const schema = parsed["$schema"];
  if (schema !== SCHEMA_EVAL_V2) {
    const message =
      typeof schema === "string"
        ? `Invalid $schema value '${schema}'. Expected '${SCHEMA_EVAL_V2}'`
        : `Missing required field '$schema'. Expected '${SCHEMA_EVAL_V2}'`;
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: "$schema",
      message,
    });
  }

  // Validate evalcases array
  const evalcases = parsed["evalcases"];
  if (!Array.isArray(evalcases)) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      location: "evalcases",
      message: "Missing or invalid 'evalcases' field (must be an array)",
    });
    return {
      valid: errors.length === 0,
      filePath: absolutePath,
      fileType: "eval",
      errors,
    };
  }

  // Validate each eval case
  for (let i = 0; i < evalcases.length; i++) {
    const evalCase = evalcases[i];
    const location = `evalcases[${i}]`;

    if (!isObject(evalCase)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location,
        message: "Eval case must be an object",
      });
      continue;
    }

    // Required fields: id, outcome, input_messages, expected_messages
    const id = evalCase["id"];
    if (typeof id !== "string" || id.trim().length === 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.id`,
        message: "Missing or invalid 'id' field (must be a non-empty string)",
      });
    }

    const outcome = evalCase["outcome"];
    if (typeof outcome !== "string" || outcome.trim().length === 0) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.outcome`,
        message: "Missing or invalid 'outcome' field (must be a non-empty string)",
      });
    }

    const inputMessages = evalCase["input_messages"];
    if (!Array.isArray(inputMessages)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.input_messages`,
        message: "Missing or invalid 'input_messages' field (must be an array)",
      });
    } else {
      validateMessages(inputMessages, `${location}.input_messages`, absolutePath, errors);
    }

    const expectedMessages = evalCase["expected_messages"];
    if (!Array.isArray(expectedMessages)) {
      errors.push({
        severity: "error",
        filePath: absolutePath,
        location: `${location}.expected_messages`,
        message: "Missing or invalid 'expected_messages' field (must be an array)",
      });
    } else {
      validateMessages(expectedMessages, `${location}.expected_messages`, absolutePath, errors);
    }
  }

  return {
    valid: errors.length === 0,
    filePath: absolutePath,
    fileType: "eval",
    errors,
  };
}

function validateMessages(
  messages: JsonArray,
  location: string,
  filePath: string,
  errors: ValidationError[],
): void {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const msgLocation = `${location}[${i}]`;

    if (!isObject(message)) {
      errors.push({
        severity: "error",
        filePath,
        location: msgLocation,
        message: "Message must be an object",
      });
      continue;
    }

    // Validate role field
    const role = message["role"];
    const validRoles = ["system", "user", "assistant"];
    if (!validRoles.includes(role as string)) {
      errors.push({
        severity: "error",
        filePath,
        location: `${msgLocation}.role`,
        message: `Invalid role '${role}'. Must be one of: ${validRoles.join(", ")}`,
      });
    }

    // Validate content field (can be string or array)
    const content = message["content"];
    if (typeof content === "string") {
      // String content is valid
    } else if (Array.isArray(content)) {
      // Array content - validate each element
      for (let j = 0; j < content.length; j++) {
        const contentItem = content[j];
        const contentLocation = `${msgLocation}.content[${j}]`;

        if (typeof contentItem === "string") {
          // String in array is valid
        } else if (isObject(contentItem)) {
          const type = contentItem["type"];
          if (typeof type !== "string") {
            errors.push({
              severity: "error",
              filePath,
              location: `${contentLocation}.type`,
              message: "Content object must have a 'type' field",
            });
          }

          // For 'file' type, we'll validate existence later in file-reference-validator
          // For 'text' type, require 'value' field
          if (type === "text") {
            const value = contentItem["value"];
            if (typeof value !== "string") {
              errors.push({
                severity: "error",
                filePath,
                location: `${contentLocation}.value`,
                message: "Content with type 'text' must have a 'value' field",
              });
            }
          }
        } else {
          errors.push({
            severity: "error",
            filePath,
            location: contentLocation,
            message: "Content array items must be strings or objects",
          });
        }
      }
    } else {
      errors.push({
        severity: "error",
        filePath,
        location: `${msgLocation}.content`,
        message: "Missing or invalid 'content' field (must be a string or array)",
      });
    }
  }
}
