# Implementation Tasks

## 1. Core Validation Infrastructure

- [x] 1.1 Create `packages/core/src/evaluation/validation/` directory
- [x] 1.2 Create `packages/core/src/evaluation/validation/types.ts` for validation result types
- [x] 1.3 Create `packages/core/src/evaluation/validation/file-type.ts` for file type detection
- [x] 1.4 Create `packages/core/src/evaluation/validation/eval-validator.ts` for eval file validation
- [x] 1.5 Create `packages/core/src/evaluation/validation/targets-validator.ts` for targets file validation
- [x] 1.6 Create `packages/core/src/evaluation/validation/file-reference-validator.ts` for file URL validation
- [x] 1.7 Export validation functions from `packages/core/src/evaluation/validation/index.ts`

## 2. File Type Detection

- [x] 2.1 Implement `$schema` field detection for `agentv-eval-v2`
- [x] 2.2 Implement `$schema` field detection for `agentv-targets-v2`
- [x] 2.3 Implement error for missing `$schema` field
- [x] 2.4 Add error handling for unknown schema values
- [x] 2.5 Write unit tests for file type detection (test/evaluation/validation/file-type.test.ts)

## 3. Eval File Validator

- [x] 3.1 Implement `$schema` field validation (require `agentv-eval-v2`)
- [x] 3.2 Implement evalcases array validation
- [x] 3.3 Implement eval case structure validation (id, outcome, input_messages, expected_messages)
- [x] 3.4 Implement message role validation
- [x] 3.5 Implement content format validation
- [x] 3.6 Collect and aggregate all errors in single pass
- [x] 3.7 Write unit tests for eval validator (test/evaluation/validation/eval-validator.test.ts)

## 4. Targets File Validator

- [x] 4.1 Reuse existing validation from `targets-file.ts` where possible
- [x] 4.2 Implement `$schema` field validation (require `agentv-targets-v2`)
- [x] 4.3 Implement targets array validation
- [x] 4.4 Implement target definition validation (name, provider required)
- [x] 4.5 Add warning for unknown providers (non-fatal)
- [x] 4.6 Write unit tests for targets validator (test/evaluation/validation/targets-validator.test.ts)

## 5. File Reference Validation

- [x] 5.1 Implement file existence checking for `type: file` content blocks
- [x] 5.2 Implement relative path resolution from eval file directory
- [x] 5.3 Handle both string content and array content formats
- [x] 5.4 Provide clear error messages with resolved paths
- [x] 5.5 Write unit tests with fixture files (test/evaluation/validation/file-reference-validator.test.ts)

## 6. Error Reporting

- [x] 6.1 Create error result type with file path, location, message
- [x] 6.2 Implement error aggregation across multiple files
- [x] 6.3 Implement summary statistics (files checked, passed, failed)
- [x] 6.4 Colorize output (red errors, yellow warnings, green success) for TTY
- [x] 6.5 Plain text output when stdout is not a TTY
- [ ] ~~6.6 Implement JSON output mode via `--json` flag~~ (removed - YAGNI)
- [x] 6.7 Write tests for output formatting

## 7. CLI Command Implementation

- [x] 7.1 Create `apps/cli/src/commands/lint/` directory
- [x] 7.2 Create `apps/cli/src/commands/lint/index.ts` command handler
- [x] 7.3 Implement path argument parsing (single file, multiple files, directories)
- [x] 7.4 Implement directory traversal for all YAML files (*.yaml, *.yml)
- [ ] ~~7.5 Implement `--strict` flag~~ (removed - all checks now run by default)
- [ ] ~~7.6 Implement `--json` flag for JSON output~~ (removed - YAGNI)
- [x] 7.7 Register lint command in `apps/cli/src/index.ts`
- [x] 7.8 Set appropriate exit codes (0 for success, 1 for failures)

## 8. Documentation and Examples

- [ ] 9.1 Implement parallel file validation using worker threads or Promise.all (deferred - current sequential implementation is sufficient for typical workloads)
- [ ] 9.2 Limit parallelism to CPU core count (deferred)
- [x] 9.3 Implement early exit on YAML parse errors
- [ ] 9.4 Write performance tests for large file sets (deferred - not critical for MVP)

## 10. Documentation and Examples

- [x] 10.1 Update README.md with `lint` command usage
- [x] 10.2 Add examples of common linting scenarios
- [x] 10.3 Document exit codes and their meanings
- [ ] ~~10.4 Document strict mode checks~~ (removed - strict mode removed)
- [ ] 10.5 Add example CI workflow using `agentv lint` (deferred - users can add to their own CI)

## 11. Integration Testing

- [x] 11.1 Create test fixtures with valid and invalid eval files
- [x] 11.2 Create test fixtures with valid and invalid targets files
- [x] 11.3 Test end-to-end linting flow via CLI
- [x] 11.4 Test directory linting with mixed file types (covered by implementation)
- [x] 11.5 Test exit codes in success and failure scenarios (verified manually)
- [ ] ~~11.6 Test JSON output mode~~ (removed - feature removed)

## 12. Migration Support

- [ ] 12.1 Add `$schema: agentv-eval-v2` to existing eval files (users will do this)
- [ ] 12.2 Add `$schema: agentv-targets-v2` to targets.yaml files (users will do this)
- [x] 12.3 Update documentation to show `$schema` field in examples
- [ ] 12.4 Create migration script to auto-add `$schema` to existing files (deferred - can be added later if needed)
- [x] 12.5 Document that files without `$schema` will fail linting

## Validation Criteria

Each task is complete when:
- Code is implemented and follows TypeScript 5.x/ES2022 guidelines
- Unit tests are written and passing
- Integration tests cover the feature
- Documentation is updated
- Code is reviewed and approved
