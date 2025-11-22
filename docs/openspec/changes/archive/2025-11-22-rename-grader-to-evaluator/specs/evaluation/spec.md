# Evaluation API Specification

This spec defines the evaluation system API after renaming "grader" terminology to "evaluator" for industry alignment.

## MODIFIED Requirements

### Requirement: Evaluator Interface (REQ-EVAL-001)

The system SHALL provide an `Evaluator` interface that all evaluation implementations MUST implement.

**Previous**: Interface was named `Grader` with a `grade()` method.

**Current**: Interface is renamed to `Evaluator` with an `evaluate()` method.

#### Scenario: Implementing a custom evaluator

**Given** a developer wants to create a custom evaluation mechanism

**When** they implement the `Evaluator` interface

**Then** they must implement the `evaluate(context: EvaluationContext): Promise<EvaluationScore>` method

**And** they must provide a `kind: string` property identifying the evaluator type

```typescript
export interface Evaluator {
  readonly kind: string;
  evaluate(context: EvaluationContext): Promise<EvaluationScore> | EvaluationScore;
}
```

#### Scenario: Using an evaluator in the orchestrator

**Given** an evaluation is running

**When** the orchestrator needs to score a candidate response

**Then** it must call `evaluator.evaluate(context)` instead of `evaluator.grade(context)`

**And** the context parameter must be of type `EvaluationContext`

**And** the return value must be of type `EvaluationScore`

---

### Requirement: LLM Judge Evaluator (REQ-EVAL-002)

The system SHALL provide an `LlmJudgeEvaluator` class for LLM-based evaluation.

**Previous**: Class was named `QualityGrader`.

**Current**: Class is renamed to `LlmJudgeEvaluator` to match Promptflow naming conventions.

#### Scenario: Creating an LLM judge evaluator

**Given** a developer needs to evaluate outputs using an LLM

**When** they instantiate `LlmJudgeEvaluator`

**Then** they must provide `LlmJudgeEvaluatorOptions` including `resolveJudgeProvider`

**And** the evaluator must have `kind` set to `"llm_judge"`

```typescript
const evaluator = new LlmJudgeEvaluator({
  resolveJudgeProvider: async (context) => provider,
  maxOutputTokens: 1000,
  temperature: 0.0,
});
```

#### Scenario: Evaluating with custom prompt

**Given** an LLM judge evaluator with a custom prompt

**When** the evaluator's `evaluate()` method is called

**Then** it must use the custom prompt instead of the default system prompt

**And** the custom prompt must be included in `evaluatorRawRequest` in the result

---

### Requirement: Code Evaluator (REQ-EVAL-003)

The system SHALL provide a `CodeEvaluator` class for script-based evaluation.

**Previous**: Code evaluation was implemented as a standalone function `runCodeEvaluator()`.

**Current**: Code evaluation is implemented as a class `CodeEvaluator` implementing the `Evaluator` interface.

#### Scenario: Creating a code evaluator

**Given** a developer needs to evaluate outputs using a script

**When** they instantiate `CodeEvaluator`

**Then** they must provide `CodeEvaluatorOptions` including the `script` path

**And** the evaluator must have `kind` set to `"code"`

**And** they may optionally provide `cwd` and `agentTimeoutMs`

```typescript
const evaluator = new CodeEvaluator({
  script: "python check_output.py",
  cwd: "/path/to/scripts",
  agentTimeoutMs: 30000,
});
```

#### Scenario: Executing a code evaluator

**Given** a code evaluator is instantiated

**When** the `evaluate()` method is called

**Then** it must spawn the script process with the evaluation payload as JSON on stdin

**And** it must parse the stdout as JSON expecting `{score, hits, misses, reasoning}`

**And** it must return an `EvaluationScore` object

**And** if the script fails, it must return a score of 0 with the error in misses

---

### Requirement: Evaluation Context (REQ-EVAL-004)

The system SHALL provide an `EvaluationContext` type containing all data needed for evaluation.

**Previous**: Type was named `GradeContext`.

**Current**: Type is renamed to `EvaluationContext`.

#### Scenario: Passing context to evaluator

**Given** an evaluation is in progress

**When** the orchestrator calls an evaluator

**Then** it must pass an `EvaluationContext` object containing:
- `evalCase: EvalCase` - the test case being evaluated
- `candidate: string` - the agent's response
- `target: ResolvedTarget` - the target being tested
- `provider: Provider` - the provider used
- `attempt: number` - retry attempt number
- `promptInputs` - the formatted prompt inputs
- `now: Date` - timestamp
- `judgeProvider?: Provider` - optional judge provider
- `systemPrompt?: string` - optional custom prompt
- `evaluator?: EvaluatorConfig` - optional evaluator config
- `judgeModel?: string` - optional model override

---

### Requirement: Evaluation Score (REQ-EVAL-005)

The system SHALL provide an `EvaluationScore` type for evaluation results.

**Previous**: Type was named `GradeResult`.

**Current**: Type is renamed to `EvaluationScore`.

#### Scenario: Returning evaluation results

**Given** an evaluator has completed evaluation

**When** it returns the result

**Then** the result must be of type `EvaluationScore` containing:
- `score: number` - numeric score between 0 and 1
- `hits: readonly string[]` - array of success criteria met
- `misses: readonly string[]` - array of failures or omissions
- `expectedAspectCount: number` - total aspects evaluated
- `reasoning?: string` - optional explanation
- `rawAspects?: readonly string[]` - optional raw aspect list
- `evaluatorRawRequest?: JsonObject` - optional request details

---

### Requirement: Evaluation Registry (REQ-EVAL-006)

The system SHALL maintain a registry of available evaluators.

**Previous**: Registry was called `graderRegistry` built by `buildGraderRegistry()`.

**Current**: Registry is called `evaluatorRegistry` built by `buildEvaluatorRegistry()`.

#### Scenario: Building evaluator registry

**Given** an evaluation is being set up

**When** the orchestrator builds the evaluator registry

**Then** it must call `buildEvaluatorRegistry(overrides, resolveJudgeProvider)`

**And** the registry must contain at minimum an `llm_judge` evaluator

**And** overrides may provide custom evaluator implementations

**And** the return type must be `Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator }`

```typescript
const evaluatorRegistry = buildEvaluatorRegistry(
  customEvaluators,
  resolveJudgeProvider
);
```

#### Scenario: Looking up evaluator by kind

**Given** an evaluator registry exists

**When** the system needs an evaluator of a specific kind

**Then** it must look up `evaluatorRegistry[evaluatorKind]`

**And** if not found, it must fall back to `evaluatorRegistry.llm_judge`

**And** if still not found, it must throw an error

---

### Requirement: Run Evaluators for Case (REQ-EVAL-007)

The system SHALL orchestrate running evaluators for a test case.

**Previous**: Function was named `runGradersForCase()`.

**Current**: Function is renamed to `runEvaluatorsForCase()`.

#### Scenario: Running evaluators for a test case

**Given** a test case needs to be evaluated

**When** `runEvaluatorsForCase()` is called

**Then** if `evalCase.evaluators` exists, it must run all configured evaluators

**And** if `evalCase.evaluators` is absent, it must use the legacy `evalCase.evaluator` or `evalCase.grader` field

**And** it must aggregate scores from multiple evaluators by averaging

**And** it must return both the aggregated `EvaluationScore` and individual `EvaluatorResult[]`

#### Scenario: Running multiple evaluators

**Given** a test case has multiple evaluators configured

**When** `runEvaluatorsForCase()` executes

**Then** it must run each evaluator sequentially

**And** for LLM judge evaluators, it must call `evaluatorRegistry.llm_judge.evaluate()` with custom prompt

**And** for code evaluators, it must instantiate a new `CodeEvaluator` and call `evaluate()`

**And** it must collect all results into `evaluatorResults` array

**And** it must compute aggregate score as average of all evaluator scores

---

### Requirement: Evaluation Result Output (REQ-EVAL-008)

The system SHALL output evaluation results with proper field naming.

**Previous**: Results contained `grader_raw_request` field.

**Current**: Results contain `evaluator_raw_request` field, with `grader_raw_request` deprecated.

#### Scenario: Single evaluator result

**Given** a test case was evaluated with a single evaluator (legacy mode)

**When** the evaluation result is created

**Then** it must include `evaluator_raw_request` with the evaluator's request details

**And** it must NOT include `grader_raw_request` (deprecated field)

**And** it must NOT include `evaluator_results` array

#### Scenario: Multiple evaluators result

**Given** a test case was evaluated with multiple evaluators

**When** the evaluation result is created

**Then** it must include `evaluator_results: EvaluatorResult[]` with one entry per evaluator

**And** each `EvaluatorResult` must contain:
- `name: string` - evaluator name
- `type: EvaluatorKind` - evaluator type
- `score: number` - individual score
- `hits: readonly string[]` - individual hits
- `misses: readonly string[]` - individual misses
- `reasoning?: string` - optional reasoning
- `evaluator_raw_request?: JsonObject` - request details

**And** the top-level score must be the average of all evaluator scores

---

### Requirement: YAML Configuration Parsing (REQ-EVAL-009)

The system SHALL parse evaluator configuration from YAML files.

**Previous**: Parsed `grader` field only.

**Current**: Parses both `evaluator` (preferred) and `grader` (deprecated) fields.

#### Scenario: Parsing new evaluator field

**Given** a YAML file contains `evaluator: llm_judge`

**When** the YAML is parsed

**Then** the `EvalCase` must have `evaluator` set to `"llm_judge"`

**And** the `grader` field must be undefined

#### Scenario: Parsing legacy grader field

**Given** a YAML file contains `grader: llm_judge`

**When** the YAML is parsed

**Then** the `EvalCase` must have `grader` set to `"llm_judge"`

**And** a deprecation warning must be logged

**And** the evaluator resolution logic must still work

#### Scenario: Parsing evaluators list

**Given** a YAML file contains an `evaluators` list

**When** the YAML is parsed

**Then** each evaluator config must be validated for required fields (`name`, `type`)

**And** for LLM judge evaluators, `prompt` and `model` are optional

**And** for code evaluators, `script` is required and `cwd` is optional

**And** the `EvalCase` must have `evaluators` array populated

---

## ADDED Requirements

### Requirement: Evaluator Type Exports (REQ-EVAL-010)

The system SHALL export all evaluator types from the main package entry point.

#### Scenario: Importing evaluator types

**Given** a developer is using the AgentV core package

**When** they import from `@agentv/core`

**Then** they must be able to import:
- `Evaluator` interface
- `EvaluationContext` type
- `EvaluationScore` type
- `LlmJudgeEvaluator` class
- `CodeEvaluator` class
- `EvaluatorKind` type
- `EvaluatorConfig` type

```typescript
import {
  Evaluator,
  EvaluationContext,
  EvaluationScore,
  LlmJudgeEvaluator,
  CodeEvaluator,
} from '@agentv/core';
```

---

## RENAMED Requirements

### Requirement: File Renames (REQ-EVAL-012)

The system SHALL rename files to match new terminology.

#### Scenario: Evaluators module file

**Given** the evaluator implementations exist

**When** a developer looks for the source file

**Then** it must be located at `packages/core/src/evaluation/evaluators.ts`

**And** NOT at the old path `packages/core/src/evaluation/grading.ts`

#### Scenario: Evaluators test file

**Given** the evaluator tests exist

**When** a developer looks for the test file

**Then** it must be located at `packages/core/test/evaluation/evaluators.test.ts`

**And** NOT at the old path `packages/core/test/evaluation/grading.test.ts`

---

## Implementation Notes

### Backward Compatibility

During the transition period (one release cycle):
- Support both `grader` and `evaluator` fields in YAML (with deprecation warning)
- Prefer `evaluator` field if both are present
- Write both `evaluator_raw_request` and `grader_raw_request` in results (mark latter as deprecated in types)

### Type Guards

Remove `isGraderKind()` type guard, keep only `isEvaluatorKind()`.

### Constants

Remove `GRADER_KINDS` constant, keep only `EVALUATOR_KINDS` (though it may already be defined as `EVALUATOR_KIND_VALUES`).
