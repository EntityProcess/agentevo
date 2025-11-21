# Spec: Evaluation Capability

## Purpose
Provides comprehensive AI agent evaluation capabilities including test case execution, multi-provider LLM integration, heuristic and LLM-based grading, configurable output formats, and statistical analysis of evaluation results.
## Requirements
### Requirement: Test Case Execution

The system SHALL execute evaluation test cases with configurable providers, retry logic, and optional parallel execution.

#### Scenario: Successful test execution

- **WHEN** a test case is executed with a valid provider configuration
- **THEN** the provider is invoked with the test request and guidelines
- **AND** the response is captured and returned
- **AND** execution may occur in parallel with other test cases if workers > 1

#### Scenario: Timeout with retry

- **WHEN** a test case execution times out
- **AND** retry limit has not been reached
- **THEN** the system retries the execution
- **AND** increments the retry counter
- **AND** the retry may execute in parallel with other test cases

#### Scenario: Maximum retries exceeded

- **WHEN** a test case execution fails after maximum retries
- **THEN** the system records a failure result with error details
- **AND** continues with the next test case or batch
- **AND** does not block other parallel workers

### Requirement: Heuristic Grading

The system SHALL calculate heuristic scores based on expected hits and misses in test responses.

#### Scenario: Calculate hits score

- **WHEN** a test response contains expected keywords
- **THEN** the system identifies matching keywords as hits
- **AND** calculates a hit ratio (hits / total expected)

#### Scenario: Calculate misses score

- **WHEN** a test response contains unexpected keywords
- **THEN** the system identifies matching keywords as misses
- **AND** calculates a miss ratio (misses / total forbidden)

#### Scenario: Error detection

- **WHEN** a test response contains error-like patterns (stack traces, error keywords)
- **THEN** the system flags the response as containing an error
- **AND** includes error detection in the grading result

### Requirement: LLM-Based Grading

The system SHALL provide optional LLM-based quality grading using structured outputs.

#### Scenario: LLM grading with reasoning

- **WHEN** LLM grading is enabled for a test case
- **THEN** the system invokes the LLM grader with the test context
- **AND** extracts a numeric score and reasoning from the response
- **AND** includes both in the evaluation result

#### Scenario: LLM grading failure fallback

- **WHEN** LLM grading fails to parse a valid score
- **THEN** the system logs a warning
- **AND** returns a null LLM score with the raw response for debugging

### Requirement: Quality Grader JSON Contract

The system SHALL instruct judge models to emit a single JSON object and validate responses against that contract.

#### Scenario: Enforce JSON prompt contract

- **WHEN** the quality grader builds the system prompt
- **THEN** it enumerates the required input fields (`expected_outcome`, `request`, `reference_answer`, `generated_answer`)
- **AND** specifies the JSON schema `{ "score": float, "hits": string[], "misses": string[], "reasoning": string }`
- **AND** instructs the model to return only that JSON object with `score` constrained to `[0.0, 1.0]` and at most four entries in `hits` and `misses`

#### Scenario: Parse JSON grader response

- **WHEN** a judge provider returns a response for quality grading
- **THEN** the system parses the first JSON object from the response body
- **AND** clamps the numeric score to the inclusive range `[0, 1]`
- **AND** filters `hits` and `misses` to non-empty trimmed strings, defaulting to empty arrays when parsing fails
- **AND** falls back to a score of `0` with empty feedback if no valid JSON object is present

### Requirement: Provider Integration

The system SHALL support multiple LLM providers with environment-based configuration.

#### Scenario: Azure OpenAI provider

- **WHEN** a test case uses the "azure-openai" provider
- **THEN** the system reads `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_DEPLOYMENT_NAME` from environment
- **AND** invokes Azure OpenAI with the configured settings

#### Scenario: Anthropic provider

- **WHEN** a test case uses the "anthropic" provider
- **THEN** the system reads `ANTHROPIC_API_KEY` from environment
- **AND** invokes Anthropic Claude with the configured settings

#### Scenario: Google Gemini provider

- **WHEN** a test case uses the "gemini" provider
- **THEN** the system reads `GOOGLE_API_KEY` from environment
- **AND** optionally reads `GOOGLE_GEMINI_MODEL` to override the default model
- **AND** invokes Google Gemini with the configured settings

#### Scenario: VS Code Copilot provider

- **WHEN** a test case uses the "vscode-copilot" provider
- **THEN** the system generates a structured prompt file with preread block and SHA tokens
- **AND** invokes the subagent library to execute the prompt
- **AND** captures the Copilot response

#### Scenario: Mock provider for dry-run

- **WHEN** a test case uses the "mock" provider or dry-run is enabled
- **THEN** the system returns a predefined mock response
- **AND** does not make external API calls

#### Scenario: Missing provider credentials

- **WHEN** a provider is selected but required environment variables are missing
- **THEN** the system fails fast with a clear error message
- **AND** lists the missing environment variables

### Requirement: Target Resolution

The system SHALL resolve target providers using precedence: CLI override → test file → default.

#### Scenario: CLI target override

- **WHEN** a user specifies `--target <name>` on the CLI
- **AND** the target name is not "default"
- **THEN** the system uses the specified target for all test cases

#### Scenario: Test file target

- **WHEN** no CLI target override is provided (or override is "default")
- **AND** a test file specifies a target in its metadata
- **THEN** the system uses the test file's target

#### Scenario: Default target fallback

- **WHEN** no CLI target override is provided
- **AND** no test file target is specified
- **THEN** the system uses the "default" target from targets.yaml

#### Scenario: Targets file loading

- **WHEN** the system needs to load targets configuration
- **THEN** it searches in order: `--targets` flag path → test file directory → ancestors → repo root → cwd
- **AND** loads the first `targets.yaml` found

### Requirement: Prompt Dumping

The system SHALL optionally save request prompts to disk for debugging.

#### Scenario: Dump prompts enabled

- **WHEN** the `--dump-prompts` flag is provided
- **THEN** the system creates a `.agentv/prompts/` directory
- **AND** writes each request prompt as a separate file with test ID in the filename
- **AND** includes the full request, guidelines, and provider settings

#### Scenario: Dump prompts disabled

- **WHEN** the `--dump-prompts` flag is not provided
- **THEN** the system does not write prompt files

### Requirement: JSONL Output

The system SHALL write evaluation results incrementally to a newline-delimited JSON file.

#### Scenario: Incremental JSONL writing

- **WHEN** an evaluation completes a test case
- **THEN** the system immediately appends the result as a JSON line to the output file
- **AND** flushes the write to disk

#### Scenario: JSONL format validation

- **WHEN** the system writes a result to the JSONL file
- **THEN** each line contains a complete JSON object
- **AND** each line is terminated with a newline character
- **AND** no trailing commas or array brackets are used

### Requirement: Output Format Selection

The system SHALL support multiple output formats with JSONL as the default.

#### Scenario: JSONL output format (default)

- **WHEN** the user does not specify the `--format` flag
- **THEN** the system writes results in JSONL format (newline-delimited JSON)
- **AND** each result is appended immediately after test case completion

#### Scenario: YAML output format

- **WHEN** the user specifies `--format yaml`
- **THEN** the system writes results in YAML format
- **AND** the output contains a well-formed YAML document with all results
- **AND** results are written incrementally as a YAML sequence

#### Scenario: Invalid format specification

- **WHEN** the user specifies an unsupported format value
- **THEN** the system reports an error listing valid format options (jsonl, yaml)
- **AND** exits without running the evaluation

### Requirement: Summary Statistics

The system SHALL calculate and display summary statistics for evaluation results.

#### Scenario: Statistical metrics

- **WHEN** all test cases complete
- **THEN** the system calculates mean, median, min, max, and standard deviation of scores
- **AND** displays the statistics in the console output

#### Scenario: Score distribution

- **WHEN** all test cases complete
- **THEN** the system generates a distribution histogram of scores
- **AND** includes the histogram in the console output

### Requirement: CLI Interface

The system SHALL provide a command-line interface matching Python bbeval's UX.

#### Scenario: Positional test file argument

- **WHEN** the user runs `agentv eval <test-file>`
- **THEN** the system loads and executes test cases from the specified file
- **THEN** the system loads and executes test cases from the specified file

#### Scenario: Target override flag

- **WHEN** the user provides `--target <name>`
- **THEN** the system uses the specified target for execution

#### Scenario: Test ID filter

- **WHEN** the user provides `--eval-id <id>`
- **THEN** the system executes only the test case with the matching ID

#### Scenario: Output file specification

- **WHEN** the user provides `--out <path>`
- **THEN** the system writes results to the specified path in the selected format

#### Scenario: Output format flag

- **WHEN** the user provides `--format <format>`
- **THEN** the system writes results in the specified format (jsonl or yaml)
- **AND** defaults to jsonl when the flag is not provided

#### Scenario: Dry-run mode

- **WHEN** the user provides `--dry-run`
- **THEN** the system executes tests with the mock provider
- **AND** does not make external API calls

#### Scenario: Verbose logging

- **WHEN** the user provides `--verbose`
- **THEN** the system outputs detailed logging including provider calls and intermediate results

#### Scenario: Caching control

- **WHEN** the user provides `--cache`
- **THEN** the system enables LLM response caching
- **WHEN** the user does not provide `--cache`
- **THEN** caching is disabled by default

### Requirement: Environment Variable Loading

The system SHALL lazily load environment variables from `.env` files after CLI parsing.

#### Scenario: Lazy .env loading

- **WHEN** the CLI finishes parsing arguments
- **THEN** the system searches for a `.env` file in the test directory and ancestors
- **AND** loads environment variables from the first `.env` found

#### Scenario: Missing .env file

- **WHEN** no `.env` file is found
- **THEN** the system continues with environment variables from the process environment
- **AND** does not fail unless required provider credentials are missing

### Requirement: Configuration Validation

The system SHALL validate all configuration inputs with clear error messages.

#### Scenario: Schema validation for targets

- **WHEN** the system loads a targets.yaml file
- **THEN** it validates the file against the target configuration schema
- **AND** reports specific validation errors with line numbers if invalid

#### Scenario: Environment variable validation

- **WHEN** the system initializes a provider
- **THEN** it validates that all required environment variables are present and non-empty
- **AND** provides a helpful error message listing missing variables if validation fails

### Requirement: Example Eval Validation

The system SHALL successfully execute the bundled example evaluation file to validate end-to-end functionality.

#### Scenario: Execute example.test.yaml

- **WHEN** the system runs the example evaluation file at `docs/examples/simple/evals/example.test.yaml`
- **THEN** all test cases execute successfully
- **AND** the output includes evaluation results for each test case
- **AND** the results demonstrate correct behavior of text content, file references, and multi-turn conversations

#### Scenario: Validate file reference resolution

- **WHEN** the example eval references instruction files (e.g., `javascript.instructions.md`, `python.instructions.md`)
- **THEN** the system resolves the file paths relative to the test file directory
- **AND** includes the file contents in the request payload
- **AND** the AI response demonstrates awareness of the instruction content

#### Scenario: Multi-turn conversation handling

- **WHEN** the example eval includes multi-turn test cases
- **THEN** the system preserves conversation context across turns
- **AND** evaluates the final assistant response against the expected outcome
- **AND** demonstrates proper conversation flow in the results

### Requirement: Parallel Test Execution

The system SHALL support parallel execution of test cases using a configurable worker pool.

#### Scenario: Sequential execution (default)

- **WHEN** the user runs evaluation without specifying `--workers`
- **THEN** the system executes test cases sequentially (one at a time)
- **AND** results are written in execution order
- **AND** behavior matches the pre-parallel implementation

#### Scenario: Parallel execution with worker pool

- **WHEN** the user specifies `--workers <count>` with a value greater than 1
- **THEN** the system executes up to `<count>` test cases concurrently
- **AND** processes test cases using `p-limit` for optimal concurrency control
- **AND** results are written as workers complete (potentially out of order)

#### Scenario: Immediate work scheduling

- **WHEN** the system processes test cases with `--workers 4` and there are 10 test cases
- **THEN** the system maintains up to 4 concurrent workers at all times
- **AND** immediately starts a new test case when any worker completes
- **AND** continues until all test cases are processed
- **AND** does not wait for batch completion before scheduling new work

#### Scenario: Error isolation in parallel mode

- **WHEN** one test case fails during parallel execution
- **THEN** the system captures the error for that test case
- **AND** continues executing other test cases in the batch
- **AND** includes the failed result in the final output

#### Scenario: Partial batch completion

- **WHEN** executing a batch where some workers succeed and others fail
- **THEN** the system waits for all workers in the batch to settle
- **AND** collects both successful results and errors
- **AND** proceeds to the next batch regardless of failures

### Requirement: Thread-Safe Output Writing

The system SHALL ensure file writes are synchronized when running parallel workers.

#### Scenario: Mutex-protected JSONL writes

- **WHEN** multiple workers complete concurrently
- **AND** attempt to write results to the JSONL output file
- **THEN** the system acquires a mutex before each write operation
- **AND** ensures only one worker writes at a time
- **AND** releases the mutex after the write completes

#### Scenario: Write ordering with parallel execution

- **WHEN** test cases complete in parallel
- **THEN** results may be written to the output file in completion order (not test case order)
- **AND** each result includes its `eval_id` for identification
- **AND** the JSONL format remains valid with no corruption

#### Scenario: Mutex error handling

- **WHEN** a write operation fails while holding the mutex
- **THEN** the system releases the mutex in a finally block
- **AND** allows other workers to continue writing
- **AND** reports the error for the failed write

### Requirement: Parallel Execution CLI

The system SHALL provide a command-line option to configure worker pool concurrency with priority over target settings.

#### Scenario: Workers flag specification

- **WHEN** the user provides `--workers <count>`
- **THEN** the system parses the count as a positive integer
- **AND** validates the count is at least 1
- **AND** uses the specified concurrency level for test execution
- **AND** overrides any workers setting in targets.yaml

#### Scenario: Workers from target configuration

- **WHEN** the user does not provide `--workers` flag
- **AND** the selected target in targets.yaml specifies `workers: <count>`
- **THEN** the system uses the target's workers value
- **AND** validates the count is at least 1

#### Scenario: Workers priority resolution

- **WHEN** resolving the workers value
- **THEN** the system uses CLI flag if provided
- **ELSE** uses target's workers setting if defined
- **ELSE** defaults to 1 (sequential execution)

#### Scenario: Workers flag validation

- **WHEN** the user provides `--workers` with a non-numeric value
- **THEN** the system reports an error
- **AND** exits without running the evaluation

#### Scenario: Workers flag with invalid range

- **WHEN** the user provides `--workers 0` or a negative value
- **THEN** the system reports an error indicating minimum value is 1
- **AND** exits without running the evaluation

#### Scenario: Workers flag help text

- **WHEN** the user runs `agentv eval --help`
- **THEN** the help output includes the `--workers <count>` option
- **AND** describes the default value (1)
- **AND** explains the effect on execution (parallel vs sequential)

### Requirement: Statistics After Parallel Completion

The system SHALL calculate statistics only after all parallel workers complete.

#### Scenario: Wait for all workers

- **WHEN** running evaluation with parallel workers
- **THEN** the system waits for all batches to complete
- **AND** collects all results before calculating statistics
- **AND** displays summary statistics with mean, median, min, max, and standard deviation

#### Scenario: Statistics match sequential execution

- **WHEN** the same test suite runs with `--workers 1` and `--workers 4`
- **THEN** the final statistics (mean, median, std dev) are identical
- **AND** only the execution time differs

### Requirement: Guideline Pattern Configuration

The system SHALL support an optional `.agentv.yaml` configuration file in the eval file directory for customizing guideline detection using glob patterns.

#### Scenario: Load custom guideline patterns

- **WHEN** a `.agentv.yaml` file exists in the same directory as the eval file
- **AND** it contains a `guideline_patterns` array with glob patterns
- **THEN** the system uses those patterns to identify guideline files
- **AND** treats files matching any pattern as guidelines (excluded from user segments)

#### Scenario: Use defaults when config absent

- **WHEN** no `.agentv.yaml` file exists in the eval file directory
- **THEN** the system uses default patterns: `**/*.instructions.md`, `**/instructions/**`, `**/*.prompt.md`, `**/prompts/**`
- **AND** continues evaluation normally

#### Scenario: Match files with glob patterns

- **WHEN** evaluating whether a file is a guideline
- **THEN** the system matches the normalized file path against each glob pattern
- **AND** supports `**` (recursive), `*` (wildcard), and literal path segments
- **AND** normalizes path separators to forward slashes for cross-platform compatibility

### Requirement: Provider-level batching flag

The system SHALL allow targets to request provider-level batching via `settings.provider_batching: true`, sending all eval queries through a single provider session when the provider supports batching, and otherwise falling back to normal per-case dispatch without failing schema validation.

#### Scenario: Enabled for batching-capable provider

- **WHEN** a target specifies `settings.provider_batching: true`
- **AND** the selected provider supports batching and exposes `invokeBatch` (e.g., VS Code multi-`-q`)
- **THEN** AgentV batches all eval case prompts into a single provider session
- **AND** keeps per-eval results mapped back to their original IDs
- **AND** emits verbose diagnostics indicating batch mode is being used

#### Scenario: Fallback when provider cannot batch

- **WHEN** a target specifies `settings.provider_batching: true`
- **AND** the provider does not support batching or a batch attempt fails
- **THEN** AgentV executes the eval cases using standard per-case dispatch
- **AND** the run does not fail schema validation because of the flag
- **AND** in verbose mode, AgentV logs that batch was requested but not applied

