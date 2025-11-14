import {
  listTargetNames,
  readTargetDefinitions,
  resolveTargetDefinition,
  type ResolvedTarget,
  type TargetDefinition,
} from "@agentevo/core";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const TARGET_FILE_CANDIDATES = [
  "targets.yaml",
  "targets.yml",
  path.join(".agentevo", "targets.yaml"),
  path.join(".agentevo", "targets.yml"),
  path.join(".bbeval", "targets.yaml"),
  path.join(".bbeval", "targets.yml"),
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTestSuiteTarget(testFilePath: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path.resolve(testFilePath), "utf8");
    const parsed = parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const targetValue = (parsed as Record<string, unknown>).target;
      if (typeof targetValue === "string" && targetValue.trim().length > 0) {
        return targetValue.trim();
      }
    }
  } catch {
    // Ignore parsing errors when probing for metadata; CLI will surface errors later.
  }
  return undefined;
}

function buildDirectoryChain(testFilePath: string, repoRoot: string, cwd: string): readonly string[] {
  const directories: string[] = [];
  const seen = new Set<string>();
  const boundary = path.resolve(repoRoot);
  let current: string | undefined = path.resolve(path.dirname(testFilePath));

  while (current !== undefined) {
    if (!seen.has(current)) {
      directories.push(current);
      seen.add(current);
    }
    if (current === boundary) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  if (!seen.has(boundary)) {
    directories.push(boundary);
    seen.add(boundary);
  }

  const resolvedCwd = path.resolve(cwd);
  if (!seen.has(resolvedCwd)) {
    directories.push(resolvedCwd);
    seen.add(resolvedCwd);
  }

  return directories;
}

async function discoverTargetsFile(options: {
  readonly explicitPath?: string;
  readonly testFilePath: string;
  readonly repoRoot: string;
  readonly cwd: string;
}): Promise<string> {
  const { explicitPath, testFilePath, repoRoot, cwd } = options;

  if (explicitPath) {
    const resolvedExplicit = path.resolve(explicitPath);
    if (await fileExists(resolvedExplicit)) {
      return resolvedExplicit;
    }

    for (const candidate of TARGET_FILE_CANDIDATES) {
      const nested = path.join(resolvedExplicit, candidate);
      if (await fileExists(nested)) {
        return nested;
      }
    }

    throw new Error(`targets.yaml not found at provided path: ${resolvedExplicit}`);
  }

  const directories = buildDirectoryChain(testFilePath, repoRoot, cwd);
  for (const directory of directories) {
    for (const candidate of TARGET_FILE_CANDIDATES) {
      const fullPath = path.join(directory, candidate);
      if (await fileExists(fullPath)) {
        return fullPath;
      }
    }
  }

  throw new Error("Unable to locate targets.yaml. Use --targets to specify the file explicitly.");
}

export interface TargetSelection {
  readonly definitions: readonly TargetDefinition[];
  readonly resolvedTarget: ResolvedTarget;
  readonly targetName: string;
  readonly targetSource: "cli" | "test-file" | "default";
  readonly targetsFilePath: string;
}

export interface TargetSelectionOptions {
  readonly testFilePath: string;
  readonly repoRoot: string;
  readonly cwd: string;
  readonly explicitTargetsPath?: string;
  readonly cliTargetName?: string;
  readonly dryRun: boolean;
  readonly env: NodeJS.ProcessEnv;
}

function pickTargetName(options: {
  readonly cliTargetName?: string;
  readonly fileTargetName?: string;
}): { readonly name: string; readonly source: "cli" | "test-file" | "default" } {
  const cliName = options.cliTargetName?.trim();
  if (cliName && cliName !== "default") {
    return { name: cliName, source: "cli" };
  }

  const fileName = options.fileTargetName?.trim();
  if (fileName && fileName.length > 0) {
    return { name: fileName, source: "test-file" };
  }

  return { name: "default", source: "default" };
}

export async function selectTarget(options: TargetSelectionOptions): Promise<TargetSelection> {
  const { testFilePath, repoRoot, cwd, explicitTargetsPath, cliTargetName, dryRun, env } = options;

  const targetsFilePath = await discoverTargetsFile({
    explicitPath: explicitTargetsPath,
    testFilePath,
    repoRoot,
    cwd,
  });

  const definitions = await readTargetDefinitions(targetsFilePath);
  const fileTargetName = await readTestSuiteTarget(testFilePath);
  const targetChoice = pickTargetName({ cliTargetName, fileTargetName });

  const targetDefinition = definitions.find((definition: TargetDefinition) => definition.name === targetChoice.name);
  if (!targetDefinition) {
    const available = listTargetNames(definitions).join(", ");
    throw new Error(
      `Target '${targetChoice.name}' not found in ${targetsFilePath}. Available targets: ${available}`,
    );
  }

  if (dryRun) {
    const mockTarget: ResolvedTarget = {
      kind: "mock",
      name: `${targetDefinition.name}-dry-run`,
      judgeTarget: undefined,
      config: { response: "{\"answer\":\"Mock dry-run response\"}" },
    };

    return {
      definitions,
      resolvedTarget: mockTarget,
      targetName: targetChoice.name,
      targetSource: targetChoice.source,
      targetsFilePath,
    };
  }

  try {
    const resolvedTarget = resolveTargetDefinition(targetDefinition, env);
    return {
      definitions,
      resolvedTarget,
      targetName: targetChoice.name,
      targetSource: targetChoice.source,
      targetsFilePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resolve target '${targetChoice.name}': ${message}`);
  }
}
