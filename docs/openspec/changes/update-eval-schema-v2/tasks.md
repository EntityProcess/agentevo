# Implementation Tasks

## 1. Type System Updates

- [ ] 1.1 Define new `EvalCase` type with `conversation_id`, `execution`, `input_messages`, `expected_messages`
- [ ] 1.2 Define `ExecutionConfig` type with `target`, `evaluators`, `optimization`
- [ ] 1.3 Define `EvaluatorConfig` type with `name`, `type`, `prompt`, `model`, `script`
- [ ] 1.4 Define `OptimizationConfig` type with ACE parameters
- [ ] 1.5 Remove legacy `TestCase` type and V1 schema support

## 2. Schema Parser Updates

- [ ] 2.1 Replace V1 parser with V2-only implementation
- [ ] 2.2 Detect and reject V1 format (error if `testcases` found with migration guidance)
- [ ] 2.3 Parse `evalcases` structure (error if neither `evalcases` nor `testcases` found)
- [ ] 2.4 Parse `conversation_id` field (default to eval case id)
- [ ] 2.5 Parse `execution` block (target, evaluators array, optimization)
- [ ] 2.5.1 Validate evaluator names are unique within a case
- [ ] 2.5.2 Support different evaluator types (llm_judge, code)
- [ ] 2.6 Parse `input_messages` array
- [ ] 2.7 Parse `expected_messages` array

## 3. Execution Engine Updates

- [ ] 3.1 Update orchestrator to handle V2 schema
- [ ] 3.2 Support `conversation_id` for grouping eval cases
- [ ] 3.3 Implement execution block resolution (case-level → file-level → default)
- [ ] 3.4 Add support for multiple evaluators per case
- [ ] 3.4.1 Execute evaluators in parallel when possible
- [ ] 3.4.2 Collect scores from all evaluators with their unique names
- [ ] 3.5 Add evaluator prompt loading and rendering (llm_judge)
- [ ] 3.6 Add code evaluator execution (script-based, supports regex/keyword scripts)
- [ ] 3.7 Stub optimization framework integration points

## 4. Output Format Updates

- [ ] 4.1 Update `EvaluationResult` to include `conversation_id`
- [ ] 4.2 Add `execution_config` to result metadata
- [ ] 4.2.1 Support multiple scores from different evaluators (scores object with evaluator names as keys)
- [ ] 4.3 Update JSONL writer for new result structure
- [ ] 4.4 Update YAML writer for new result structure

## 5. CLI Updates

- [ ] 5.1 Update help text with V2 schema examples
- [ ] 5.2 Add validation for V2-specific features
- [ ] 5.3 Ensure clear error messages when V1 format detected

## 6. Documentation & Examples

- [ ] 6.1 Update example file to V2 format (`docs/examples/simple/evals/example-v2.test.yaml`)
- [ ] 6.2 Update README with V2 schema documentation
- [ ] 6.3 Create migration guide documenting: `testcases` → `evalcases`, `messages` → `input_messages` + `expected_messages`
- [ ] 6.4 Document ACE optimization features
- [ ] 6.5 Update all internal eval files to V2 format

## 7. Testing

- [ ] 7.1 Add V2 schema parsing tests
- [ ] 7.2 Add execution config resolution tests
- [ ] 7.3 Add conversation_id grouping tests
- [ ] 7.3.1 Add multiple evaluators execution tests
- [ ] 7.3.2 Add test for different evaluator types (llm_judge, code)
- [ ] 7.3.3 Add test for evaluator name uniqueness validation
- [ ] 7.4 Validate example-v2.test.yaml executes successfully
- [ ] 7.5 Add error test for V1 format (should fail with clear message)

## 8. Validation & Deployment

- [ ] 8.1 Run `openspec validate update-eval-schema-v2 --strict`
- [ ] 8.2 Run full test suite
- [ ] 8.3 Verify clear error message when V1 format detected
- [ ] 8.4 Create release notes documenting breaking changes
