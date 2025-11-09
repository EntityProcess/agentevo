import { access } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { config as loadDotenv } from "dotenv";

interface LoadEnvOptions {
  readonly testFilePath: string;
  readonly repoRoot: string;
  readonly verbose: boolean;
}

function uniqueDirs(directories: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const dir of directories) {
    const absolute = path.resolve(dir);
    if (seen.has(absolute)) {
      continue;
    }
    seen.add(absolute);
    result.push(absolute);
  }
  return result;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function collectAncestorDirectories(start: string, boundary: string): readonly string[] {
  const directories: string[] = [];
  let current = path.resolve(start);
  const boundaryDir = path.resolve(boundary);

  while (true) {
    directories.push(current);
    if (current === boundaryDir) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return directories;
}

export async function loadEnvFromHierarchy(options: LoadEnvOptions): Promise<string | undefined> {
  const { testFilePath, repoRoot, verbose } = options;
  const testDir = path.dirname(path.resolve(testFilePath));
  const cwd = process.cwd();

  const searchDirs = uniqueDirs([
    ...collectAncestorDirectories(testDir, repoRoot),
    repoRoot,
    cwd,
  ]);

  for (const dir of searchDirs) {
    const candidate = path.join(dir, ".env");
    if (await fileExists(candidate)) {
      loadDotenv({ path: candidate, override: false });
      if (verbose) {
        console.log(`Loaded environment from: ${candidate}`);
      }
      return candidate;
    }
  }

  if (verbose) {
    console.log("No .env file found in hierarchy");
  }

  return undefined;
}
