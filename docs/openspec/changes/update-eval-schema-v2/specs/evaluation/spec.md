## ADDED Requirements

### Requirement: V2 Schema Format

The system SHALL support the V2 eval schema format as documented in `docs/examples/simple/evals/example-eval.yaml`.

#### Scenario: Parse V2 schema with all features

- **WHEN** an eval file uses the V2 schema format (top-level `evalcases` key)
- **THEN** the system parses all V2 features as demonstrated in the example file:
  - Schema version auto-detection via `evalcases` vs `testcases`
  - `conversation_id` for grouping related eval cases
  - `execution` block with `target`, `evaluators`, and `optimization` configuration
  - Multiple evaluators per case (each with unique `name`)
  - `input_messages` and `expected_messages` (replacing V1 `messages` structure)
  - Per-case target, evaluators, and optimization overrides
  - ACE optimization with playbook configuration
  - Multiple evaluator types: llm_judge and code-based

#### Scenario: V2 example file executes successfully

- **WHEN** the system runs `docs/examples/simple/evals/example-eval.yaml`
- **THEN** all four example eval cases execute without errors
- **AND** demonstrates simple eval, multi-turn conversation, ACE optimization, and code-based evaluation
- **AND** produces valid results in the specified output format

### Requirement: Multiple Evaluators per Eval Case

The system SHALL support multiple evaluators per eval case, each producing a separate named score.

#### Scenario: Execute multiple evaluators for single eval case

- **WHEN** an eval case has multiple evaluators in its `execution.evaluators` array
- **THEN** the system executes each evaluator independently
- **AND** each evaluator produces a score with its unique `name` as the key
- **AND** all scores are included in the result output

#### Scenario: Combine different evaluator types

- **WHEN** an eval case defines evaluators with different types (e.g., llm_judge, code)
- **THEN** the system executes all evaluator types correctly
- **AND** returns multiple scores (e.g., `{"semantic_quality": 0.85, "marker_check": 1.0, "regex_validation": 0.67}`)

#### Scenario: Empty evaluators array

- **WHEN** an eval case has `evaluators: []` or omits the evaluators field
- **THEN** the system falls back to file-level evaluator configuration
- **OR** uses default evaluator if no file-level config exists

### Requirement: V1 Format Rejection

The system SHALL reject V1 eval format with a clear error message and migration guidance.

#### Scenario: Detect and reject V1 format

- **WHEN** a YAML file contains a `testcases` top-level key (V1 format)
- **THEN** the system reports a schema version error
- **AND** displays a message: "V1 eval format is no longer supported. Please migrate to V2 format."
- **AND** provides a link to the migration guide

#### Scenario: Helpful error for missing evalcases key

- **WHEN** a YAML file contains neither `evalcases` nor `testcases` keys
- **THEN** the system reports a schema validation error
- **AND** indicates that `evalcases` is the required top-level key

## MODIFIED Requirements

### Requirement: CLI Interface

The system SHALL provide a command-line interface matching Python bbeval's UX **and supporting V2 schema features**.

#### Scenario: Positional test file argument

- **WHEN** the user runs `agentevo eval <test-file>`
- **THEN** the system loads and executes eval cases from the specified V2 format file
- **AND** reports an error if the file uses V1 format

#### Scenario: Target override flag

- **WHEN** the user provides `--target <name>`
- **THEN** the system uses the specified target for execution
- **AND** overrides case-level and file-level target configurations

#### Scenario: Test ID filter

- **WHEN** the user provides `--test-id <id>`
- **THEN** the system executes only the eval case with the matching ID

#### Scenario: Output file specification

- **WHEN** the user provides `--out <path>`
- **THEN** the system writes results to the specified path in the selected format
- **AND** includes conversation_id in V2 results

#### Scenario: Output format flag

- **WHEN** the user provides `--format <format>`
- **THEN** the system writes results in the specified format (jsonl or yaml)
- **AND** includes V2 fields (conversation_id, execution_config) in output
- **AND** defaults to jsonl when the flag is not provided

#### Scenario: Dry-run mode

- **WHEN** the user provides `--dry-run`
- **THEN** the system executes tests with the mock provider
- **AND** does not make external API calls

#### Scenario: Verbose logging

- **WHEN** the user provides `--verbose`
- **THEN** the system outputs detailed logging including provider calls and intermediate results
- **AND** logs schema version detection and execution config resolution

#### Scenario: Caching control

- **WHEN** the user provides `--cache`
- **THEN** the system enables LLM response caching
- **WHEN** the user does not provide `--cache`
- **THEN** caching is disabled by default

### Requirement: JSONL Output

The system SHALL write evaluation results incrementally to a newline-delimited JSON file including V2 schema fields.

#### Scenario: Incremental JSONL writing

- **WHEN** an evaluation completes an eval case
- **THEN** the system immediately appends the result as a JSON line to the output file
- **AND** flushes the write to disk
- **AND** includes `conversation_id` and `execution_config` fields

#### Scenario: JSONL format validation

- **WHEN** the system writes a result to the JSONL file
- **THEN** each line contains a complete JSON object
- **AND** each line is terminated with a newline character
- **AND** no trailing commas or array brackets are used
- **AND** V2 fields are properly serialized

### Requirement: Output Format Selection

The system SHALL support multiple output formats with JSONL as the default.

#### Scenario: JSONL output format (default)

- **WHEN** the user does not specify the `--format` flag
- **THEN** the system writes results in JSONL format (newline-delimited JSON)
- **AND** each result is appended immediately after eval case completion
- **AND** includes V2 fields: `conversation_id`, `execution_config`

#### Scenario: YAML output format

- **WHEN** the user specifies `--format yaml`
- **THEN** the system writes results in YAML format
- **AND** the output contains a well-formed YAML document with all results
- **AND** results are written incrementally as a YAML sequence
- **AND** includes V2 fields: `conversation_id`, `execution_config`

#### Scenario: Invalid format specification

- **WHEN** the user specifies an unsupported format value
- **THEN** the system reports an error listing valid format options (jsonl, yaml)
- **AND** exits without running the evaluation

### Requirement: Summary Statistics

The system SHALL calculate and display summary statistics for evaluation results with optional conversation-level aggregation.

#### Scenario: Statistical metrics

- **WHEN** all eval cases complete
- **THEN** the system calculates mean, median, min, max, and standard deviation of scores
- **AND** displays the statistics in the console output
- **AND** optionally groups statistics by `conversation_id`

#### Scenario: Score distribution

- **WHEN** all eval cases complete
- **THEN** the system generates a distribution histogram of scores
- **AND** includes the histogram in the console output
- **AND** optionally shows per-conversation distributions

### Requirement: Example Eval Validation

The system SHALL successfully execute the bundled V2 example evaluation file to validate end-to-end functionality.

#### Scenario: Execute V2 example demonstrating all features

- **WHEN** the system runs `docs/examples/simple/evals/example-eval.yaml` (V2 format)
- **THEN** all eval cases execute successfully as documented in the example file
- **AND** demonstrates all V2 features with inline YAML comments explaining each capability

## REMOVED Requirements

### Requirement: V1 Schema Support

The system SHALL NO LONGER support the V1 eval schema format (files with `testcases` top-level key).

#### Rationale

- Clean break enables simpler codebase without dual parser maintenance
- AgentEvo is early-stage with limited existing eval files to migrate
- Clear migration path with documentation minimizes user impact
- Breaking change is acceptable at this maturity level
