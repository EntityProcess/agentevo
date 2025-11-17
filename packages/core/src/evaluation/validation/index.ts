/**
 * Validation module for AgentEvo eval and targets files.
 */

export { detectFileType, isValidSchema, getExpectedSchema } from "./file-type.js";
export { validateEvalFile } from "./eval-validator.js";
export { validateTargetsFile } from "./targets-validator.js";
export { validateFileReferences } from "./file-reference-validator.js";
export type {
  FileType,
  ValidationSeverity,
  ValidationError,
  ValidationResult,
  ValidationSummary,
} from "./types.js";
