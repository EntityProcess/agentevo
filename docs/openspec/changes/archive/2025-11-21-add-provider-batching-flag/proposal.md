# Change: Add provider-level batching flag in targets.yaml

## Why

Teams need a declarative way to tell AgentV to batch all eval queries through a single provider session (e.g., one VS Code run with multiple `-q` arguments) instead of per-case dispatch.

## What Changes

- Add a `provider_batching: true` setting to target schemas to request provider-level batching when supported.
- Implement provider-managed batching for VS Code providers (`supportsBatch` + `invokeBatch` using subagent multi-query dispatch) with ordered per-eval responses.
- Emit a verbose warning and fall back to per-case dispatch when batching is requested but unsupported or fails.

## Impact

- Affects: evaluation op (batch dispatch), target schema validation.
- Code: target resolution/validation, provider capability checks (e.g., VS Code).
