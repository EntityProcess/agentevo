## MODIFIED Requirements

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

#### Scenario: Codex CLI provider

- **WHEN** a test case uses the "codex" provider
- **THEN** the system locates the Codex CLI executable (default `codex`, overrideable via the target)
- **AND** it mirrors guideline and attachment files into a scratch workspace, emitting the same preread block links used by the VS Code provider so Codex opens every referenced file before answering
- **AND** it renders the eval prompt into a single string and launches `codex exec --json` plus any configured profile, model, approval preset, and working-directory overrides defined on the target
- **AND** it verifies the Codex executable is available while delegating profile/config resolution to the CLI itself
- **AND** it parses the emitted JSONL event stream to capture the final assistant message as the provider response, attaching stdout/stderr when the CLI exits non-zero or returns malformed JSON

#### Scenario: Mock provider for dry-run

- **WHEN** a test case uses the "mock" provider or dry-run is enabled
- **THEN** the system returns a predefined mock response
- **AND** does not make external API calls

#### Scenario: Missing provider credentials

- **WHEN** a provider is selected but required environment variables are missing
- **THEN** the system fails fast with a clear error message
- **AND** lists the missing environment variables
