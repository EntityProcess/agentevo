# Implement Custom Evaluators

## Summary
Implement support for the `evaluators` list in the `EvalCase` schema, enabling multiple, custom-configured evaluators (including LLM judges with custom prompts) to run per test case.

## Problem
The current `agentv` implementation ignores the `evaluators` field defined in the V2 schema (as seen in `example-eval.yaml`). It relies solely on a single `grader` field (defaulting to "heuristic") and a hardcoded `QualityGrader` for LLM judging. This prevents users from:
1. Running multiple evaluators on a single test case.
2. Using custom prompts for LLM judges (e.g., for adversarial testing).
3. Using code-based evaluators (scripts).

## Solution
1.  **Update `EvalCase` Interface**: Add the `evaluators` field to the TypeScript definition.
2.  **Update `QualityGrader`**: Allow it to accept a custom prompt path/content.
3.  **Update Orchestrator**: Modify `runEvalCase` to iterate through the `evaluators` list and aggregate results, replacing the single-grader logic.

## Risks
- **Breaking Change**: If we remove the legacy `grader` field support immediately, it breaks existing tests. We should support both for now, with `evaluators` taking precedence.
- **Performance**: Running multiple LLM judges per test case increases cost and latency.
