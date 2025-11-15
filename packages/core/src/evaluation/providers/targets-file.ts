import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import type { TargetDefinition } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkVersion(parsed: Record<string, unknown>, absolutePath: string): void {
  const version = typeof parsed.version === 'number' ? parsed.version : 
                  typeof parsed.version === 'string' ? parseFloat(parsed.version) : 
                  undefined;

  if (version === undefined) {
    throw new Error(
      `Missing version field in targets.yaml at ${absolutePath}.\n` +
      `Please add 'version: 2.0' at the top of the file.`
    );
  }

  if (version < 2.0) {
    throw new Error(
      `Outdated targets.yaml format (version ${version}) at ${absolutePath}.\n` +
      `Please update to version 2.0 format with 'targets' array.`
    );
  }
}

function extractTargetsArray(parsed: Record<string, unknown>, absolutePath: string): unknown[] {
  const targets = parsed.targets;
  if (!Array.isArray(targets)) {
    throw new Error(`targets.yaml at ${absolutePath} must have a 'targets' array`);
  }
  return targets;
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

  if (!isRecord(parsed)) {
    throw new Error(`targets.yaml at ${absolutePath} must be a YAML object with 'version' and 'targets' fields`);
  }

  checkVersion(parsed, absolutePath);

  const targets = extractTargetsArray(parsed, absolutePath);
  const definitions = targets.map((entry, index) => assertTargetDefinition(entry, index, absolutePath));
  return definitions;
}

export function listTargetNames(definitions: readonly TargetDefinition[]): readonly string[] {
  return definitions.map((definition) => definition.name);
}
