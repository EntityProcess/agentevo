# Change: Add Codex CLI provider for evals

## Why
- Evaluators need parity between the VS Code Copilot provider and OpenAI's Codex CLI so we can compare agent behaviours in identical YAML panels.
- Codex already exposes a headless `codex exec --json` mode (see `codex-cli/README.md` lines 218-231) and configurable provider profiles (`docs/config.md` lines 61-191), so AgentV can drive it non-interactively.
- Without first-class support we currently have to fall back to the generic CLI provider, which cannot stage guideline prereads or capture Codex JSON results reliably.

## What Changes
- Extend the evaluation spec's Provider Integration requirement with a Codex-specific scenario covering executable discovery, workspace staging, JSONL invocation, and structured result parsing.
- Define target settings (executable path, profile, model, approval preset, cwd) that map directly to Codex CLI knobs and lean on the CLI's existing configuration/credential handling.
- Ensure attachments and guideline files are mirrored into the Codex workspace with `file://` prereads similar to the VS Code provider so Codex can open them before answering.
- Surface actionable errors when Codex exits non-zero, times out, or emits invalid JSON to keep eval runs debuggable.

## Impact
- Affected specs: `openspec/specs/evaluation/spec.md` (Provider Integration requirement).
- Affected code: `packages/core/src/evaluation/providers`, provider factory/targets schema, CLI docs and example targets, regression tests under `packages/core/test/evaluation`.
