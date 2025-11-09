import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { parse } from "yaml";

import type { TargetDefinition } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTargetDefinition(value: unknown, index: number, filePath: string): TargetDefinition {
  if (!isRecord(value)) {
    throw new Error(`targets.yaml entry at index ${index} in ${filePath} must be an object`);
  }

  const name = value.name;
  const provider = value.provider;
  const settings = value.settings;
  const judgeTarget = value.judge_target;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error(`targets.yaml entry at index ${index} in ${filePath} is missing a valid 'name'`);
  }

  if (typeof provider !== "string" || provider.trim().length === 0) {
    throw new Error(`targets.yaml entry '${name}' in ${filePath} is missing a valid 'provider'`);
  }

  return {
    name,
    provider,
    settings: isRecord(settings) ? settings : undefined,
    judge_target: typeof judgeTarget === "string" ? judgeTarget : undefined,
  } satisfies TargetDefinition;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTargetDefinitions(filePath: string): Promise<readonly TargetDefinition[]> {
  const absolutePath = path.resolve(filePath);
  if (!(await fileExists(absolutePath))) {
    throw new Error(`targets.yaml not found at ${absolutePath}`);
  }

  const raw = await readFile(absolutePath, "utf8");
  const parsed = parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`targets.yaml at ${absolutePath} must be a YAML list`);
  }

  const definitions = parsed.map((entry, index) => assertTargetDefinition(entry, index, absolutePath));
  return definitions;
}

export function listTargetNames(definitions: readonly TargetDefinition[]): readonly string[] {
  return definitions.map((definition) => definition.name);
}
