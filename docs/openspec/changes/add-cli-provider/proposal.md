# Change: Add CLI provider for external agents

## Why

AgentV can target cloud LLM APIs and VS Code workspaces, but many teams already run agents through bespoke CLIs (`code chat`, MCP servers, wrappers from Rogue/Agent Lightning). Today users must hand-write glue code to plug those CLIs into AgentV. We want native support that shells out to existing binaries without forcing new protocols.

## What Changes

- Introduce a `cli` provider that renders a user-supplied command template (e.g., `code chat "{PROMPT}" {ATTACHMENTS}`) and executes it per eval case, capturing stdout as the model answer.
- Extend target schema with minimal fields: `commandTemplate`, optional per-value formatters (attachments, files), working directory/env overrides, timeout, and optional health probes.
- Update the eval runner to apply the same retry/timeout semantics as other providers, handle quoting/escaping for placeholders, and surface stderr diagnostics.
- Document how to configure template placeholders and how AgentV maps eval content → CLI arguments so teams can reuse their current tooling immediately.

## Impact

- **Specs:** `evaluation` capability gains requirements for template-based CLI invocation and schema validation.
- **Code:** Provider registry (`packages/core`), target/schema validation, placeholder rendering + process execution utilities, docs/readme.
- **Users:** Can point AgentV at any CLI-accessible agent (VS Code, MCP, Rogue scripts) with only targets.yaml edits—no wrapper CLI needed.
