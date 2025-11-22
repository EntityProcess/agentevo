# Design: Custom Evaluators

## Architecture

### Data Model
The `EvalCase` interface will be expanded to include an `evaluators` array.

```typescript
interface EvalCase {
  // ... existing fields
  readonly evaluators?: readonly EvaluatorConfig[];
}

type EvaluatorConfig = 
  | { readonly name: string; readonly type: "code"; readonly script: string }
  | { readonly name: string; readonly type: "llm_judge"; readonly prompt?: string; readonly model?: string };
```

### Grading Logic
The `runEvalCase` function in `orchestrator.ts` currently instantiates a single grader. This will be refactored to:
1.  Check for `evaluators`.
2.  If present, loop through them.
3.  For each evaluator config:
    *   Instantiate the appropriate grader (Code or LLM).
    *   Run the grade.
    *   Collect the result.
4.  If `evaluators` is missing, fall back to the legacy `grader` field logic (Heuristic or Default Quality).

### Result Aggregation
The `EvaluationResult` interface needs to accommodate multiple scores.
*   **Current**: Single `score`, `hits`, `misses`.
*   **New**: We should probably keep the top-level score as an aggregate (e.g., average or min) but add a `details` field map.
    *   *Decision*: For this iteration, to minimize breaking changes, we will compute the top-level `score` as the average of all evaluators, and `hits`/`misses` will be concatenated. A future update can structure the result object more richly.

### LLM Judge Customization
The `QualityGrader` needs to accept a `prompt` option.
*   If `prompt` is provided (as a file path or string), it replaces the hardcoded `QUALITY_SYSTEM_PROMPT`.
*   The prompt template must support standard placeholders (e.g., `{{expected_outcome}}`, `{{generated_answer}}`).
