import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find git repository root by walking up the directory tree.
 */
export async function findGitRoot(startPath: string): Promise<string | null> {
  let currentDir = path.dirname(path.resolve(startPath));
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const gitPath = path.join(currentDir, ".git");
    if (await fileExists(gitPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Build search roots for file resolution, matching yaml-parser behavior.
 * Searches from eval file directory up to repo root.
 */
export function buildSearchRoots(evalPath: string, repoRoot: string): readonly string[] {
  const uniqueRoots: string[] = [];
  const addRoot = (root: string): void => {
    const normalized = path.resolve(root);
    if (!uniqueRoots.includes(normalized)) {
      uniqueRoots.push(normalized);
    }
  };

  let currentDir = path.dirname(evalPath);
  let reachedBoundary = false;
  while (!reachedBoundary) {
    addRoot(currentDir);
    const parentDir = path.dirname(currentDir);
    if (currentDir === repoRoot || parentDir === currentDir) {
      reachedBoundary = true;
    } else {
      currentDir = parentDir;
    }
  }

  addRoot(repoRoot);
  addRoot(process.cwd());
  return uniqueRoots;
}

/**
 * Trim leading path separators for display.
 */
function trimLeadingSeparators(value: string): string {
  const trimmed = value.replace(/^[/\\]+/, "");
  return trimmed.length > 0 ? trimmed : value;
}

/**
 * Resolve a file reference using search roots, matching yaml-parser behavior.
 */
export async function resolveFileReference(
  rawValue: string,
  searchRoots: readonly string[],
): Promise<{
  readonly displayPath: string;
  readonly resolvedPath?: string;
  readonly attempted: readonly string[];
}> {
  const displayPath = trimLeadingSeparators(rawValue);
  const potentialPaths: string[] = [];

  if (path.isAbsolute(rawValue)) {
    potentialPaths.push(path.normalize(rawValue));
  }

  for (const base of searchRoots) {
    potentialPaths.push(path.resolve(base, displayPath));
  }

  const attempted: string[] = [];
  const seen = new Set<string>();
  for (const candidate of potentialPaths) {
    const absoluteCandidate = path.resolve(candidate);
    if (seen.has(absoluteCandidate)) {
      continue;
    }
    seen.add(absoluteCandidate);
    attempted.push(absoluteCandidate);
    if (await fileExists(absoluteCandidate)) {
      return { displayPath, resolvedPath: absoluteCandidate, attempted };
    }
  }

  return { displayPath, attempted };
}
