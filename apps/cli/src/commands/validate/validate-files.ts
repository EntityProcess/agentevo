import {
  detectFileType,
  validateEvalFile,
  validateTargetsFile,
  validateConfigFile,
  validateFileReferences,
  type ValidationResult,
  type ValidationSummary,
} from "@agentv/core/evaluation/validation";
import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";


/**
 * Validate YAML files for AgentV schema compliance.
 */
export async function validateFiles(
  paths: readonly string[],
): Promise<ValidationSummary> {
  const filePaths = await expandPaths(paths);
  const results: ValidationResult[] = [];

  for (const filePath of filePaths) {
    const result = await validateSingleFile(filePath);
    results.push(result);
  }

  const validFiles = results.filter((r) => r.valid).length;
  const invalidFiles = results.filter((r) => !r.valid).length;

  return {
    totalFiles: results.length,
    validFiles,
    invalidFiles,
    results,
  };
}

async function validateSingleFile(
  filePath: string,
): Promise<ValidationResult> {
  const absolutePath = path.resolve(filePath);

  // Detect file type
  const fileType = await detectFileType(absolutePath);

  if (fileType === "unknown") {
    return {
      valid: false,
      filePath: absolutePath,
      fileType: "unknown",
      errors: [
        {
          severity: "error",
          filePath: absolutePath,
          message:
            "Missing or invalid $schema field. File must declare schema: 'agentv-eval-v2', 'agentv-targets-v2', or 'agentv-config-v2'",
        },
      ],
    };
  }

  // Validate based on file type
  let result: ValidationResult;
  
  if (fileType === "eval") {
    result = await validateEvalFile(absolutePath);
    
    // Also validate file references for eval files
    if (result.valid || result.errors.filter((e) => e.severity === "error").length === 0) {
      const fileRefErrors = await validateFileReferences(absolutePath);
      if (fileRefErrors.length > 0) {
        result = {
          ...result,
          errors: [...result.errors, ...fileRefErrors],
          valid: result.valid && fileRefErrors.filter((e) => e.severity === "error").length === 0,
        };
      }
    }
  } else if (fileType === "targets") {
    result = await validateTargetsFile(absolutePath);
  } else {
    result = await validateConfigFile(absolutePath);
  }

  return result;
}

async function expandPaths(paths: readonly string[]): Promise<readonly string[]> {
  const expanded: string[] = [];

  for (const inputPath of paths) {
    const absolutePath = path.resolve(inputPath);
    
    // Check if path exists
    try {
      await access(absolutePath, constants.F_OK);
    } catch {
      console.warn(`Warning: Path not found: ${inputPath}`);
      continue;
    }

    const stats = await stat(absolutePath);

    if (stats.isFile()) {
      // Only include YAML files
      if (isYamlFile(absolutePath)) {
        expanded.push(absolutePath);
      }
    } else if (stats.isDirectory()) {
      // Recursively find all YAML files in directory
      const yamlFiles = await findYamlFiles(absolutePath);
      expanded.push(...yamlFiles);
    }
  }

  return expanded;
}

async function findYamlFiles(dirPath: string): Promise<readonly string[]> {
  const results: string[] = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        const subFiles = await findYamlFiles(fullPath);
        results.push(...subFiles);
      } else if (entry.isFile() && isYamlFile(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dirPath}: ${(error as Error).message}`);
  }

  return results;
}

function isYamlFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".yaml" || ext === ".yml";
}
