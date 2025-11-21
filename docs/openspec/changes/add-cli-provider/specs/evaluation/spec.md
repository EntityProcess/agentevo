## ADDED Requirements

### Requirement: CLI Template Execution

The system SHALL support a `cli` provider that renders a command template defined in targets, executes the resulting command for each eval case, and treats captured stdout as the model answer.

#### Scenario: Render and execute template
- **WHEN** a test case resolves to a target with `provider: cli`
- **THEN** the runner interpolates supported placeholders (e.g., `{PROMPT}`, `{EVAL_ID}`, `{ATTACHMENTS}`) into the target's `commandTemplate`
- **AND** executes the rendered command in the optional working directory with the configured environment variables
- **AND** collects `stdout` as the response body while forwarding `stderr` to verbose or diagnostic logs

#### Scenario: Timeout and retries
- **WHEN** the executed CLI command exceeds its timeout or exits with a non-zero code
- **THEN** the system terminates the process (graceful signal followed by forced kill if needed)
- **AND** records the failure with captured stderr/exit code
- **AND** applies the existing retry policy before giving up on the test case

#### Scenario: Optional health check
- **WHEN** a target defines a CLI health check (HTTP GET or probe command)
- **THEN** the system executes the probe before the first test case
- **AND** aborts the run with a descriptive error if the probe fails
- **AND** skips duplicate probes for subsequent cases unless the provider is reinitialized

### Requirement: CLI Template Configuration

The system SHALL validate CLI template targets so authors must specify the command string and optional placeholder formatters inside `.agentv/targets.yaml`.

#### Scenario: Required template fields
- **WHEN** `provider: cli` is parsed from targets
- **THEN** schema validation enforces `commandTemplate` as a non-empty string and optional fields such as `attachmentsFormat`, `filesFormat`, `cwd`, `env`, `timeoutSeconds`, and `healthcheck`
- **AND** validation errors list missing or invalid fields with actionable messages

#### Scenario: Placeholder substitution rules
- **WHEN** the template uses placeholders
- **THEN** the provider replaces `{PROMPT}` with the fully rendered eval prompt, `{EVAL_ID}` with the case identifier, and expands lists (attachments/files) using their formatter before command execution
- **AND** ensures values are shell-escaped so user-provided paths do not break the command line

#### Scenario: Health check schema
- **WHEN** a CLI target includes `healthcheck`
- **THEN** validation accepts `{ type: "http", url, timeoutSeconds? }` or `{ type: "command", commandTemplate }`
- **AND** rejects unsupported types or missing properties with specific errors
