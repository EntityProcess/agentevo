# Rename Grader to Evaluator - Refactoring Spec

## Overview
This change renames all "grader" terminology to "evaluator" throughout the codebase to align with industry standards (Promptflow, Langfuse, Ax) and create consistency between user-facing YAML configuration and internal implementation.

## Related Documents
- [Proposal](./proposal.md) - Detailed rationale and alternatives
- [Design](./design.md) - Architecture and implementation approach
- [Tasks](./tasks.md) - Step-by-step implementation checklist

## Quick Reference

### Type Renames
| Before | After |
|--------|-------|
| `Grader` | `Evaluator` |
| `GraderKind` | _(removed, use `EvaluatorKind`)_ |
| `QualityGrader` | `LlmJudgeEvaluator` |
| `GradeContext` | `EvaluationContext` |
| `GradeResult` | `EvaluationScore` |

### Method Renames
| Before | After |
|--------|-------|
| `grade(context)` | `evaluate(context)` |
| `runGradersForCase()` | `runEvaluatorsForCase()` |
| `buildGraderRegistry()` | `buildEvaluatorRegistry()` |

### Parameter Renames
| Before | After |
|--------|-------|
| `graders: Record<string, Grader>` | `evaluators: Record<string, Evaluator>` |
| `graderRegistry` | `evaluatorRegistry` |

### Field Renames
| Before | After | Notes |
|--------|-------|-------|
| `grader_raw_request` | `evaluator_raw_request` | In `EvaluationResult` |
| `grader` | `evaluator` | In `EvalCase` (legacy field deprecated) |

### File Renames
| Before | After |
|--------|-------|
| `src/evaluation/grading.ts` | `src/evaluation/evaluators.ts` |
| `test/evaluation/grading.test.ts` | `test/evaluation/evaluators.test.ts` |

## Implementation Status

**Status**: 📋 Proposed (not yet started)

**Target Branch**: `refactor/rename-grader-to-evaluator`

**Estimated Effort**: 4-6 hours

## Testing Strategy

### Before Starting
- [ ] All tests passing on current branch
- [ ] Clean git state

### During Implementation
- [ ] Run tests after each phase
- [ ] Verify type checking passes
- [ ] Check for lingering "grader" references

### Before Merging
- [ ] Full test suite passes
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Documentation updated
- [ ] Migration guide complete

## Rollout Plan

### Step 1: Create Branch
```bash
git checkout -b refactor/rename-grader-to-evaluator
```

### Step 2: Implement Phases 1-5
- Core types and classes
- Follow task checklist in tasks.md

### Step 3: Update Tests and Documentation
- Phases 6-8

### Step 4: Final Verification
- Phase 9

### Step 5: Prepare Release
- Phase 10

### Step 6: Create PR
- Link to this spec
- Include migration guide
- Tag as breaking change

## Success Criteria

- ✅ Zero references to "grader" in public API
- ✅ All evaluator types use class-based pattern
- ✅ YAML `evaluators` field maps directly to internal `Evaluator` classes
- ✅ Documentation consistently uses "evaluator"
- ✅ All tests pass
- ✅ Backward compatibility preserved for one release cycle
- ✅ Migration guide published

## Dependencies

**Blocks**: None

**Blocked By**: None (can be done in parallel with other features)

**Related**: 
- `feat/custom-evaluator` branch (already merged)
- Future: Implement additional evaluator types (e.g., `ComparisonEvaluator`)

## References

### External Research
- [Promptflow Evaluators](https://github.com/microsoft/promptflow/tree/main/src/promptflow-evals) - Class-based pattern
- [Langfuse Evaluation](https://langfuse.com/docs/evaluation/overview) - EvalTemplate + Score model
- [Ax Metrics](https://github.com/dosco/ax) - Functional metric approach

### Internal Docs
- `docs/examples/simple/README.md`
- `docs/openspec/changes/implement-custom-evaluators/`
- `packages/core/README.md`
