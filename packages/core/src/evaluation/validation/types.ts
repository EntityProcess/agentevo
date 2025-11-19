/**
 * Validation result types for AgentV file validation.
 */

export type FileType = "eval" | "targets" | "config" | "unknown";

export type ValidationSeverity = "error" | "warning";

export interface ValidationError {
  readonly severity: ValidationSeverity;
  readonly filePath: string;
  readonly location?: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly filePath: string;
  readonly fileType: FileType;
  readonly errors: readonly ValidationError[];
}

export interface ValidationSummary {
  readonly totalFiles: number;
  readonly validFiles: number;
  readonly invalidFiles: number;
  readonly results: readonly ValidationResult[];
}
