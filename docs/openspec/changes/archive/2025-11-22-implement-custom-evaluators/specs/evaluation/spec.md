# Spec: Custom Evaluators

## REMOVED Requirements

### Requirement: Heuristic Grading
The system SHALL NO LONGER support the `HeuristicGrader` or the `heuristic` grader type.

**Reason**: The heuristic grader is confusing, rarely used, and provides limited value compared to LLM-based or code-based evaluation.
**Migration**: Users relying on heuristic grading should migrate to `llm_judge` or custom code evaluators.

## ADDED Requirements

### Requirement: Custom Evaluators
The system SHALL support defining multiple evaluators in the `evaluators` list, including custom LLM judges.

#### Scenario: User defines multiple evaluators in YAML
Given an eval file with an `evaluators` list containing a "code" check and an "llm_judge"
When the evaluation runs
Then both evaluators are executed
And the final result reflects the scores from both.

#### Scenario: User provides custom prompt for LLM judge
Given an eval file with an `llm_judge` evaluator specifying a `prompt` file
When the evaluation runs
Then the LLM judge uses the content of that prompt file instead of the default system prompt.

#### Scenario: Legacy fallback
Given an eval file with NO `evaluators` list but a `grader: llm_judge` field
When the evaluation runs
Then the system uses the default `QualityGrader` with the hardcoded prompt (preserving existing behavior).
