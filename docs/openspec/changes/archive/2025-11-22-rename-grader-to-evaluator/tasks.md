# Tasks: Rename Grader to Evaluator

## Phase 1: Core Type System (Foundation)

### 1.1 Update Type Definitions
- [ ] Rename `Grader` interface to `Evaluator` in `packages/core/src/evaluation/types.ts`
  - Update interface name and JSDoc comments
  - Change `grade()` method to `evaluate()`
- [ ] Rename `GradeContext` to `EvaluationContext` in `packages/core/src/evaluation/types.ts`
  - Update all field references
  - Update JSDoc comments
- [ ] Rename `GradeResult` to `EvaluationScore` in `packages/core/src/evaluation/types.ts`
  - Update all field references
  - Update JSDoc comments
- [ ] Update `EvalCase` interface in `packages/core/src/evaluation/types.ts`
  - Add `evaluator?: EvaluatorKind` field (new preferred field)
  - Mark `grader?: GraderKind` as deprecated with JSDoc `@deprecated`
- [ ] Update `EvaluationResult` interface in `packages/core/src/evaluation/types.ts`
  - Add `evaluator_raw_request?: JsonObject` field
  - Mark `grader_raw_request?: JsonObject` as deprecated
- [ ] Remove `GraderKind` type (merge into `EvaluatorKind`)
  - Remove `GRADER_KINDS` constant
  - Remove `isGraderKind()` guard

### 1.2 Update Type Exports
- [ ] Update `packages/core/src/index.ts` exports
  - Export `Evaluator` (remove `Grader`)
  - Export `EvaluationContext` (remove `GradeContext`)
  - Export `EvaluationScore` (remove `GradeResult`)
  - Update all JSDoc comments

## Phase 2: Evaluator Class Implementation

### 2.1 Rename and Refactor File
- [ ] Rename `packages/core/src/evaluation/grading.ts` to `evaluators.ts`
  - Update file header comments
  - Update all imports in other files

### 2.2 Refactor LlmJudgeEvaluator
- [ ] Rename `QualityGrader` class to `LlmJudgeEvaluator` in `evaluators.ts`
  - Update class name and JSDoc
  - Rename `QualityGraderOptions` to `LlmJudgeEvaluatorOptions`
  - Change `grade()` method to `evaluate()`
  - Update `kind` property value (keep as `"llm_judge"`)
  - Update all internal variable names (e.g., `graderRawRequest` → `evaluatorRawRequest`)
- [ ] Update method signature
  - Parameter: `context: EvaluationContext`
  - Return type: `Promise<EvaluationScore>`

### 2.3 Create CodeEvaluator Class
- [ ] Extract `runCodeEvaluator()` logic into new `CodeEvaluator` class in `evaluators.ts`
  - Create `CodeEvaluatorOptions` interface
  - Implement `Evaluator` interface
  - Set `kind = "code"`
  - Implement `evaluate()` method with current `runCodeEvaluator()` logic
  - Move helper functions (`executeScript`, `parseJsonSafe`, `clampScore`) to class or utils
- [ ] Remove standalone `runCodeEvaluator()` function from `orchestrator.ts`
- [ ] Export `CodeEvaluator` from `packages/core/src/index.ts`

## Phase 3: Orchestrator Refactoring

### 3.1 Update Function Names
- [ ] Rename `runGradersForCase()` to `runEvaluatorsForCase()` in `orchestrator.ts`
  - Update JSDoc comments
  - Update all call sites
- [ ] Rename `buildGraderRegistry()` to `buildEvaluatorRegistry()` in `orchestrator.ts`
  - Update parameter types
  - Update return type
  - Update all call sites

### 3.2 Update Function Parameters
- [ ] Update `RunEvalCaseOptions` interface
  - `graders` → `evaluators`
  - Update type to `Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator }`
- [ ] Update `runBatchEvaluation()` function
  - `graderRegistry` → `evaluatorRegistry`
  - Update all references
- [ ] Update `runEvaluation()` function
  - `graders` → `evaluators` in options
  - Update JSDoc

### 3.3 Update Variable Names
- [ ] In `runEvaluatorsForCase()`:
  - `graderKind` → `evaluatorKind`
  - `activeGrader` → `activeEvaluator`
  - Update fallback logic to check both `evalCase.evaluator` and `evalCase.grader` (deprecated)
- [ ] In `runEvaluatorList()`:
  - `graded` → `scored` (variable storing results)
  - Update all references
- [ ] In `buildEvaluatorRegistry()`:
  - Update all internal variable names

### 3.4 Instantiate CodeEvaluator
- [ ] Update `runEvaluatorList()` to instantiate `CodeEvaluator` class
  - Replace standalone function call with class instantiation
  - Pass options from `EvaluatorConfig`
  - Call `evaluate()` method

### 3.5 Update Result Building
- [ ] In `evaluateCandidate()`:
  - Build both `evaluator_raw_request` and `grader_raw_request` (deprecated) during transition
  - Update logic to prioritize `evaluator_raw_request`

## Phase 4: YAML Parser Updates

### 4.1 Update Field Parsing
- [ ] Update `loadEvalCases()` in `yaml-parser.ts`
  - Parse both `grader` and `evaluator` fields from YAML
  - Add deprecation warning if `grader` field is used
  - Prefer `evaluator` over `grader` if both present
- [ ] Update `coerceGrader()` function
  - Rename to `coerceEvaluator()`
  - Update to handle both field names
  - Return `EvaluatorKind` instead of `GraderKind`

## Phase 5: Test Updates

### 5.1 Unit Test Updates
- [ ] Update `packages/core/test/evaluation/grading.test.ts`
  - Rename file to `evaluators.test.ts`
  - Update all test descriptions
  - Replace `QualityGrader` with `LlmJudgeEvaluator`
  - Replace `Grader` with `Evaluator`
  - Replace `GradeResult` with `EvaluationScore`
  - Replace `GradeContext` with `EvaluationContext`
  
- [ ] Update `packages/core/test/evaluation/orchestrator.test.ts`
  - Update all test descriptions
  - Replace `graderRegistry` with `evaluatorRegistry`
  - Update `graders` parameter to `evaluators`
  - Update assertions checking result fields

- [ ] Update `packages/core/test/evaluation/orchestrator-batch.test.ts`
  - Same updates as orchestrator.test.ts

- [ ] Update `packages/core/test/evaluation/yaml-parser.test.ts`
  - Test both `grader` and `evaluator` field parsing
  - Verify deprecation warning for `grader` field
  - Test that `evaluator` takes precedence

### 5.2 Integration Test Updates
- [ ] Update any integration tests using old API
- [ ] Add tests for backward compatibility
  - Legacy `grader` field still works
  - Legacy `graders` parameter still works
  - Deprecation warnings appear

### 5.3 Add New Tests
- [ ] Test `CodeEvaluator` class in isolation
- [ ] Test `LlmJudgeEvaluator` with custom prompts
- [ ] Test evaluator registry building with overrides

## Phase 6: Documentation Updates

### 6.1 API Documentation
- [ ] Update `README.md` in repository root
  - Replace all "grader" references with "evaluator"
  - Update code examples
  - Update terminology section

- [ ] Update `packages/core/README.md`
  - Update API examples
  - Update type documentation

### 6.2 Example Updates
- [ ] Update `docs/examples/simple/README.md`
  - Update terminology
  - Update code examples

- [ ] Update `docs/examples/simple/evals/coding/example-eval.yaml`
  - Add comment showing both old and new syntax
  - Recommend new `evaluators` field

### 6.3 Migration Guide
- [ ] Create `docs/migration/grader-to-evaluator.md`
  - Document all breaking changes
  - Provide before/after examples
  - List automated migration steps
  - Include YAML schema changes

### 6.4 OpenSpec Documentation
- [ ] Update `docs/openspec/README.md` if it references graders
- [ ] Update any architecture diagrams

## Phase 7: Provider Updates

### 7.1 Provider Interface Updates
- [ ] Update `packages/core/src/evaluation/providers/vscode.ts`
  - Update any references to grader terminology
  - Update JSDoc comments

- [ ] Update other provider implementations if they reference graders

## Phase 8: CLI Updates (if applicable)

### 8.1 CLI Help Text
- [ ] Update `apps/cli/src/commands/eval.ts` (if exists)
  - Update help text and descriptions
  - Update parameter names

### 8.2 CLI Output
- [ ] Update any CLI output that displays "grader" terminology

## Phase 9: Final Verification

### 9.1 Type Checking
- [ ] Run `pnpm typecheck` in all packages
- [ ] Fix any type errors

### 9.2 Linting
- [ ] Run `pnpm lint` in all packages
- [ ] Fix any linting issues

### 9.3 Build
- [ ] Run `pnpm build` in all packages
- [ ] Verify no build errors

### 9.4 Test Suite
- [ ] Run `pnpm test` in all packages
- [ ] Verify all tests pass
- [ ] Check test coverage hasn't decreased

### 9.5 Search for Remnants
- [ ] Global search for "grader" (case-insensitive)
  - Exclude: `grader_raw_request` (deprecated field)
  - Exclude: "upgrade" and similar words
  - Verify all remaining uses are intentional (e.g., in migration docs)
- [ ] Global search for `Grader` (PascalCase)
  - Verify no type or class references remain
- [ ] Global search for `grading.ts`
  - Verify file is renamed to `evaluators.ts` everywhere

## Phase 10: Release Preparation

### 10.1 Changelog
- [ ] Update `CHANGELOG.md`
  - Add breaking changes section
  - List all renamed types and functions
  - Include migration guide link

### 10.2 Version Bump
- [ ] Update version in `package.json` (major bump for breaking changes)
- [ ] Update lock files

### 10.3 Release Notes
- [ ] Draft release notes highlighting:
  - Industry alignment with Promptflow/Langfuse
  - Breaking changes
  - Migration path
  - Benefits of new architecture

## Checklist Summary

**Foundation**: 8 tasks (Phase 1)
**Implementation**: 8 tasks (Phase 2)
**Orchestrator**: 15 tasks (Phase 3)
**Parser**: 3 tasks (Phase 4)
**Tests**: 10 tasks (Phase 5)
**Documentation**: 8 tasks (Phase 6)
**Providers**: 2 tasks (Phase 7)
**CLI**: 2 tasks (Phase 8)
**Verification**: 5 tasks (Phase 9)
**Release**: 3 tasks (Phase 10)

**Total**: 64 tasks

## Notes

- **Backward Compatibility**: During transition, support both old and new field names with deprecation warnings
- **Testing**: Run full test suite after each phase
- **Commits**: Make atomic commits for each phase to enable easy rollback
- **Review**: Each phase should be reviewed before proceeding to next
