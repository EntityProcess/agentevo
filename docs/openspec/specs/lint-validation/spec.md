# lint-validation Specification

## Purpose
TBD - created by archiving change add-eval-linter. Update Purpose after archive.
## Requirements
### Requirement: Lint Command

The system SHALL provide a `lint` command that validates AgentV YAML configuration files.

#### Scenario: Lint single eval file

- **WHEN** user runs `agentv lint path/to/test.yaml`
- **THEN** the file is validated against eval schema and all errors are reported

#### Scenario: Lint targets file

- **WHEN** user runs `agentv lint .agentv/targets.yaml`
- **THEN** the file is validated against targets schema and all errors are reported

#### Scenario: Lint entire directory

- **WHEN** user runs `agentv lint ./evals`
- **THEN** all YAML files in the directory (recursive) are validated based on their `$schema` field and results aggregated

#### Scenario: Multiple paths

- **WHEN** user runs `agentv lint file1.yaml file2.yaml targets.yaml`
- **THEN** each file is validated in order and all errors are collected

#### Scenario: Exit code on failure

- **WHEN** lint command finds validation errors
- **THEN** it exits with non-zero exit code for CI integration

#### Scenario: Exit code on success

- **WHEN** all linted files pass validation
- **THEN** it exits with zero exit code

### Requirement: File Type Detection

The system SHALL detect file types using the `$schema` field.

#### Scenario: Eval file detection via schema field

- **WHEN** file contains `$schema: agentv-eval-v2`
- **THEN** it is validated as an eval file using eval schema

#### Scenario: Targets file detection via schema field

- **WHEN** file contains `$schema: agentv-targets-v2`
- **THEN** it is validated as a targets configuration file

#### Scenario: Missing schema field

- **WHEN** file missing `$schema` field
- **THEN** error reports that `$schema` field is required

### Requirement: Eval File Schema Validation

The system SHALL validate eval files against the v2 schema.

#### Scenario: Schema field required

- **WHEN** eval file has `$schema: agentv-eval-v2`
- **THEN** validation proceeds with eval schema rules

#### Scenario: Evalcases field required

- **WHEN** eval file missing `evalcases` array
- **THEN** error reports missing evalcases field

#### Scenario: Eval case structure validation

- **WHEN** eval case missing required fields (id, outcome, input_messages, expected_messages)
- **THEN** error reports which field is missing and in which case (by id or index)

#### Scenario: Message role validation

- **WHEN** message has invalid role (not system/user/assistant/tool)
- **THEN** error reports invalid role value

#### Scenario: Content format validation

- **WHEN** message content is not string or array of content blocks
- **THEN** error reports invalid content format

### Requirement: Targets File Schema Validation

The system SHALL validate targets files against the v2 schema.

#### Scenario: Schema field required

- **WHEN** targets file has `$schema: agentv-targets-v2`
- **THEN** validation proceeds with targets schema rules

#### Scenario: Targets array required

- **WHEN** targets file missing `targets` array
- **THEN** error reports missing targets array

#### Scenario: Target definition validation

- **WHEN** target missing required fields (name, provider)
- **THEN** error reports which field is missing and which target (by name or index)

#### Scenario: Provider value validation

- **WHEN** target has unknown provider
- **THEN** warning issued about unknown provider (non-fatal)

### Requirement: File Reference Validation

The system SHALL validate that file URLs referenced in eval files exist.

#### Scenario: Instruction file exists

- **WHEN** eval file references `value: ../prompts/javascript.instructions.md`
- **THEN** linter verifies file exists relative to eval file directory

#### Scenario: Instruction file not found

- **WHEN** referenced file does not exist
- **THEN** error reports missing file with full resolved path

#### Scenario: File reference in content array

- **WHEN** content block has `type: file` and `value` field
- **THEN** linter validates the file exists

#### Scenario: Relative path resolution

- **WHEN** file reference is relative (e.g., `../prompts/file.md`)
- **THEN** path is resolved relative to the eval file's directory

#### Scenario: Empty file warning

- **WHEN** referenced file exists but is empty
- **THEN** warning is issued about empty file

### Requirement: Error Reporting

The system SHALL provide clear, actionable error messages.

#### Scenario: Error includes file path

- **WHEN** validation error occurs
- **THEN** error message includes full file path

#### Scenario: Error includes location context

- **WHEN** error is in specific eval case or target
- **THEN** error message includes case id or target name

#### Scenario: Multiple errors reported together

- **WHEN** file has multiple validation errors
- **THEN** all errors are collected and reported in single pass

#### Scenario: Summary statistics

- **WHEN** linting completes
- **THEN** summary shows total files checked, passed, failed

### Requirement: Output Formatting

The system SHALL format validation output for developer readability.

#### Scenario: Colorized terminal output

- **WHEN** running in interactive terminal
- **THEN** errors are red, warnings yellow, success green

#### Scenario: Plain output for CI

- **WHEN** stdout is not a TTY
- **THEN** output is plain text without ANSI codes

### Requirement: Performance

The system SHALL validate files efficiently for large codebases.

#### Scenario: Parallel validation

- **WHEN** linting directory with many files
- **THEN** files are validated in parallel up to CPU core count

#### Scenario: Early exit on critical error

- **WHEN** file cannot be parsed as YAML
- **THEN** validation stops for that file and reports parse error

#### Scenario: Fast feedback

- **WHEN** linting 100 eval files
- **THEN** validation completes in under 5 seconds on modern hardware

