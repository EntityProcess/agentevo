import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import type { ValidationError } from "./types.js";
import { buildSearchRoots, findGitRoot, resolveFileReference } from "../file-utils.js";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { readonly [key: string]: JsonValue };
type JsonArray = readonly JsonValue[];

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate that file references in eval file content exist.
 * Checks content blocks with type: "file" and validates the referenced file exists.
 * Also checks that referenced files are not empty.
 */
export async function validateFileReferences(
  evalFilePath: string,
): Promise<readonly ValidationError[]> {
  const errors: ValidationError[] = [];
  const absolutePath = path.resolve(evalFilePath);

  // Find git root and build search roots (same as yaml-parser does at runtime)
  const gitRoot = await findGitRoot(absolutePath);
  if (!gitRoot) {
    errors.push({
      severity: "error",
      filePath: absolutePath,
      message: "Cannot validate file references: git repository root not found",
    });
    return errors;
  }

  const searchRoots = buildSearchRoots(absolutePath, gitRoot);

  let parsed: unknown;
  try {
    const content = await readFile(absolutePath, "utf8");
    parsed = parse(content);
  } catch {
    // Parse errors are already caught by eval-validator
    return errors;
  }

  if (!isObject(parsed)) {
    return errors;
  }

  const evalcases = parsed["evalcases"];
  if (!Array.isArray(evalcases)) {
    return errors;
  }

  for (let i = 0; i < evalcases.length; i++) {
    const evalCase = evalcases[i];
    if (!isObject(evalCase)) {
      continue;
    }

    // Check input_messages
    const inputMessages = evalCase["input_messages"];
    if (Array.isArray(inputMessages)) {
      await validateMessagesFileRefs(inputMessages, `evalcases[${i}].input_messages`, searchRoots, absolutePath, errors);
    }

    // Check expected_messages
    const expectedMessages = evalCase["expected_messages"];
    if (Array.isArray(expectedMessages)) {
      await validateMessagesFileRefs(expectedMessages, `evalcases[${i}].expected_messages`, searchRoots, absolutePath, errors);
    }
  }

  return errors;
}

async function validateMessagesFileRefs(
  messages: JsonArray,
  location: string,
  searchRoots: readonly string[],
  filePath: string,
  errors: ValidationError[],
): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!isObject(message)) {
      continue;
    }

    const content = message["content"];
    if (typeof content === "string") {
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (let j = 0; j < content.length; j++) {
      const contentItem = content[j];
      if (!isObject(contentItem)) {
        continue;
      }

      const type = contentItem["type"];
      if (type !== "file") {
        continue;
      }

      const value = contentItem["value"];
      if (typeof value !== "string") {
        errors.push({
          severity: "error",
          filePath,
          location: `${location}[${i}].content[${j}].value`,
          message: "File reference must have a 'value' field with the file path",
        });
        continue;
      }

      // Use the same file resolution logic as yaml-parser at runtime
      const { resolvedPath } = await resolveFileReference(value, searchRoots);

      if (!resolvedPath) {
        errors.push({
          severity: "error",
          filePath,
          location: `${location}[${i}].content[${j}]`,
          message: `Referenced file not found: ${value}`,
        });
      } else {
        // Check that file is not empty
        try {
          const fileContent = await readFile(resolvedPath, "utf8");
          if (fileContent.trim().length === 0) {
            errors.push({
              severity: "warning",
              filePath,
              location: `${location}[${i}].content[${j}]`,
              message: `Referenced file is empty: ${value}`,
            });
          }
        } catch (error) {
          errors.push({
            severity: "error",
            filePath,
            location: `${location}[${i}].content[${j}]`,
            message: `Cannot read referenced file: ${value} (${(error as Error).message})`,
          });
        }
      }
    }
  }
}
