## ADDED Requirements

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
