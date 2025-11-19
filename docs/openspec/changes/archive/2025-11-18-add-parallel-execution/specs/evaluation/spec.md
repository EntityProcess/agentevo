# Evaluation Spec Deltas

## ADDED Requirements

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

## MODIFIED Requirements

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
