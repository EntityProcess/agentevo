# Rename Grader to Evaluator for Industry Alignment

## Summary
Rename all internal "grader" terminology to "evaluator" to align with industry standards (Promptflow, Langfuse, Ax) and eliminate confusion between user-facing configuration (`evaluators` in YAML) and internal implementation (`Grader` classes).

## Problem
The codebase has inconsistent naming that creates confusion:

1. **User-facing API uses "evaluator"**: YAML files have an `evaluators` field
2. **Internal implementation uses "grader"**: `Grader` interface, `QualityGrader` class, `runGradersForCase()` function
3. **Industry standard is "evaluator"**: None of the major frameworks (Promptflow, Langfuse, Ax) use "grader" as primary terminology

This dual-terminology creates:
- **Cognitive overhead**: Developers must mentally map "evaluators" (user config) to "graders" (implementation)
- **Non-standard API**: Diverges from well-established patterns in the LLM evaluation ecosystem
- **Onboarding friction**: New contributors familiar with Promptflow/Langfuse expect "evaluator" terminology

### Evidence from Industry Research

**Promptflow** (Microsoft):
```python
from promptflow.evals import F1ScoreEvaluator, CoherenceEvaluator, RelevanceEvaluator

class F1ScoreEvaluator:
    def __call__(self, *, answer: str, ground_truth: str, **kwargs):
        return {"f1_score": f1_result}
```

**Langfuse**:
```typescript
export type EvalTemplate = {
  id: string;
  name: string;
  prompt: string;  // The evaluation prompt
};

export const ScoreSource = {
  EVAL: "EVAL",   // From evaluator
};
```

**Ax** (DSPy-inspired):
```typescript
export type AxMetricFn = <T = any>(
  arg0: Readonly<{ prediction: T; example: AxExample }>
) => number | Promise<number>;
```

**None use "grader" as a primary concept.**

## Solution

### Phase 1: Core Renames (Breaking Changes)

#### 1.1 Interface and Type Renames

| Current | New | Rationale |
|---------|-----|-----------|
| `Grader` | `Evaluator` | Align with industry standard |
| `GraderKind` | `EvaluatorKind` | Keep parallel to existing `EvaluatorConfig` type |
| `QualityGrader` | `LlmJudgeEvaluator` | Matches Promptflow pattern, clearer intent |
| `HeuristicGrader` | _(removed)_ | Already removed in feat/custom-evaluator |
| `GradeContext` | `EvaluationContext` | Matches evaluator terminology |
| `GradeResult` | `EvaluationScore` | More descriptive, follows Langfuse pattern |

#### 1.2 Function and Variable Renames

| Current | New |
|---------|-----|
| `runGradersForCase()` | `runEvaluatorsForCase()` |
| `runLlmJudgeEvaluator()` | _(keep, already correct)_ |
| `runCodeEvaluator()` | _(keep, already correct)_ |
| `buildGraderRegistry()` | `buildEvaluatorRegistry()` |
| `graders` parameter | `evaluators` parameter |
| `activeGrader` variable | `activeEvaluator` variable |
| `graderKind` variable | `evaluatorKind` variable |
| `graderRegistry` | `evaluatorRegistry` |

#### 1.3 Field Renames in Data Types

| Current | New | Scope |
|---------|-----|-------|
| `grader_raw_request` | `evaluator_raw_request` | `EvaluationResult` interface |
| `grader` | `evaluator` | `EvalCase` interface (legacy field) |

**Note**: Keep `GradeResult` return type name OR rename to `EvaluationScore` (see design decision below).

### Phase 2: Create Evaluator Classes (Consistency)

Currently, `runCodeEvaluator()` is a standalone function while LLM judge uses a `QualityGrader` class. Create class-based evaluators for consistency:

```typescript
// packages/core/src/evaluation/evaluators.ts

export interface Evaluator {
  readonly kind: string;
  evaluate(context: EvaluationContext): Promise<EvaluationScore> | EvaluationScore;
}

export class LlmJudgeEvaluator implements Evaluator {
  readonly kind = "llm_judge";
  
  constructor(options: LlmJudgeEvaluatorOptions) { }
  
  async evaluate(context: EvaluationContext): Promise<EvaluationScore> {
    // Current QualityGrader.grade() logic
  }
}

export class CodeEvaluator implements Evaluator {
  readonly kind = "code";
  
  constructor(options: CodeEvaluatorOptions) { }
  
  async evaluate(context: EvaluationContext): Promise<EvaluationScore> {
    // Current runCodeEvaluator() logic
  }
}
```

**Benefits**:
- Unified interface for all evaluator types
- Matches Promptflow's class-based pattern
- Easier to add new evaluator types
- Better testability and mocking

### Phase 3: Update Documentation and Examples

1. **README.md**: Update all references from "grader" to "evaluator"
2. **API Documentation**: Regenerate with new terminology
3. **Examples**: Update YAML files and code examples
4. **Migration Guide**: Document breaking changes for users

## Design Decisions

### Decision 1: Keep "Grade" as Verb or Rename to "Evaluate"?

**Option A**: Rename `GradeResult` → `EvaluationScore`
- **Pro**: Complete consistency with "evaluator" terminology
- **Pro**: Matches Langfuse pattern (`Score` objects)
- **Con**: "grade" is a valid English verb for scoring

**Option B**: Keep `GradeResult` unchanged
- **Pro**: "Grade" and "evaluate" are synonyms in this context
- **Pro**: Less churn in the codebase
- **Con**: Mixed terminology (evaluator returns grade)

**Recommendation**: Option A (`EvaluationScore`) for complete consistency.

### Decision 2: Backward Compatibility Strategy

**Option A**: Big-bang rename with major version bump
- **Pro**: Clean break, no technical debt
- **Con**: Breaks all existing code

**Option B**: Deprecation period with aliases
- **Pro**: Gradual migration path
- **Con**: Maintains dual terminology temporarily

**Recommendation**: Option A for a pre-1.0 project, Option B for post-1.0.

### Decision 3: File Structure

**Current**:
- `packages/core/src/evaluation/grading.ts`

**Option A**: Rename file to `evaluators.ts`
- **Pro**: Matches new terminology
- **Con**: Breaks imports

**Option B**: Keep filename, update exports
- **Pro**: Less disruptive
- **Con**: Filename doesn't match contents

**Recommendation**: Option A (rename to `evaluators.ts`) for consistency.

## Impact Analysis

### Breaking Changes
1. ✅ **Public API**: `Grader` interface → `Evaluator` interface
2. ✅ **Type exports**: All grader types in `index.ts`
3. ✅ **Function signatures**: All functions accepting `graders` parameter
4. ✅ **YAML schema**: `grader` field (already optional, can deprecate)
5. ✅ **Result fields**: `grader_raw_request` → `evaluator_raw_request`

### Non-Breaking Changes
1. ✅ **Internal functions**: Implementation details not in public API
2. ✅ **Test files**: Can update without user impact
3. ✅ **Documentation**: Pure documentation updates

### Migration Path for Users

```typescript
// Before
import { Grader, QualityGrader } from '@agentv/core';

const grader: Grader = new QualityGrader({ ... });
await runEvaluation({ graders: { llm_judge: grader } });

// After
import { Evaluator, LlmJudgeEvaluator } from '@agentv/core';

const evaluator: Evaluator = new LlmJudgeEvaluator({ ... });
await runEvaluation({ evaluators: { llm_judge: evaluator } });
```

## Risks

### High Priority
- **User disruption**: All existing code using the library will break
  - *Mitigation*: Clear migration guide, consider pre-1.0 status
  
### Medium Priority
- **Documentation drift**: Must update all docs simultaneously
  - *Mitigation*: Automated search/replace, comprehensive review
  
### Low Priority
- **Test coverage**: Need to verify all tests still pass
  - *Mitigation*: Existing test suite should catch issues

## Success Criteria

1. ✅ No references to "grader" in public API
2. ✅ All evaluator types use class-based pattern
3. ✅ YAML `evaluators` field maps directly to internal `Evaluator` classes
4. ✅ Documentation consistently uses "evaluator" terminology
5. ✅ All existing tests pass with new naming
6. ✅ Migration guide published

## Timeline

- **Phase 1** (Core Renames): 2-3 hours
  - Rename interfaces, types, and functions
  - Update all call sites
  
- **Phase 2** (Evaluator Classes): 1-2 hours
  - Extract `CodeEvaluator` class
  - Refactor instantiation logic
  
- **Phase 3** (Documentation): 1 hour
  - Update README, examples, API docs
  - Create migration guide

**Total Estimate**: 4-6 hours

## Alternatives Considered

### Alternative 1: Keep "Grader" Internally, Map at Boundaries
- Keep `Grader` classes but expose as `Evaluator` in API
- **Rejected**: Creates cognitive overhead and tech debt

### Alternative 2: Use "Scorer" (Ax terminology)
- Rename to `Scorer` instead of `Evaluator`
- **Rejected**: Promptflow and Langfuse use "evaluator", more common

### Alternative 3: Use "Judge" for LLM Evaluators
- `LlmJudge` instead of `LlmJudgeEvaluator`
- **Rejected**: Less consistent, "judge" is a descriptor not a noun

## References

- [Promptflow Evaluators](https://github.com/microsoft/promptflow/tree/main/src/promptflow-evals)
- [Langfuse Evaluation Documentation](https://langfuse.com/docs/evaluation/overview)
- [Ax Metrics](https://github.com/dosco/ax)
- Internal: `docs/openspec/changes/implement-custom-evaluators/`
