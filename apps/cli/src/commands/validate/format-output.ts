import type { ValidationSummary, ValidationResult, ValidationError } from "@agentv/core/evaluation/validation";

const ANSI_RED = "\u001b[31m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_CYAN = "\u001b[36m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_RESET = "\u001b[0m";

/**
 * Format validation summary for console output.
 */
export function formatSummary(summary: ValidationSummary, useColors: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(formatHeader("Validation Summary", useColors));
  lines.push("");

  // Results for each file
  for (const result of summary.results) {
    lines.push(formatFileResult(result, useColors));
  }

  // Summary statistics
  lines.push("");
  lines.push(formatStats(summary, useColors));
  lines.push("");

  return lines.join("\n");
}

function formatHeader(text: string, useColors: boolean): string {
  if (useColors) {
    return `${ANSI_BOLD}${ANSI_CYAN}${text}${ANSI_RESET}`;
  }
  return text;
}

function formatFileResult(result: ValidationResult, useColors: boolean): string {
  const lines: string[] = [];
  
  const status = result.valid ? "✓" : "✗";
  const statusColor = result.valid ? ANSI_GREEN : ANSI_RED;
  const statusText = useColors ? `${statusColor}${status}${ANSI_RESET}` : status;

  const fileName = result.filePath;
  lines.push(`${statusText} ${fileName}`);

  // Show errors and warnings
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      lines.push(formatError(error, useColors));
    }
  }

  return lines.join("\n");
}

function formatError(error: ValidationError, useColors: boolean): string {
  const prefix = error.severity === "error" ? "  ✗" : "  ⚠";
  const color = error.severity === "error" ? ANSI_RED : ANSI_YELLOW;
  const coloredPrefix = useColors ? `${color}${prefix}${ANSI_RESET}` : prefix;

  const location = error.location ? ` [${error.location}]` : "";
  return `${coloredPrefix}${location} ${error.message}`;
}

function formatStats(summary: ValidationSummary, useColors: boolean): string {
  const lines: string[] = [];
  
  const totalText = `Total files: ${summary.totalFiles}`;
  const validText = `Valid: ${summary.validFiles}`;
  const invalidText = `Invalid: ${summary.invalidFiles}`;

  if (useColors) {
    lines.push(`${ANSI_BOLD}${totalText}${ANSI_RESET}`);
    lines.push(`${ANSI_GREEN}${validText}${ANSI_RESET}`);
    if (summary.invalidFiles > 0) {
      lines.push(`${ANSI_RED}${invalidText}${ANSI_RESET}`);
    } else {
      lines.push(invalidText);
    }
  } else {
    lines.push(totalText);
    lines.push(validText);
    lines.push(invalidText);
  }

  return lines.join("\n");
}

/**
 * Check if stdout is a TTY (supports colors).
 */
export function isTTY(): boolean {
  return process.stdout.isTTY ?? false;
}
