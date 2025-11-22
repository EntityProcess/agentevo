## 1. Implementation
- [x] 1.1 Extend `targets.yaml` validation to accept `provider: codex` with settings for `executable`, `profile`, `model`, `approvalPreset`, `timeoutSeconds`, and optional working directory overrides.
- [x] 1.2 Add a Codex provider class that stages guideline + attachment files into a scratch workspace, builds the preread block (mirroring the VS Code provider), and renders the eval prompt into a single string Codex can ingest.
- [x] 1.3 Invoke the Codex CLI (`codex` by default) with `--quiet --json` plus settings-derived flags, stream stdout/stderr, and parse the emitted JSON to capture the final assistant response.
- [x] 1.4 Detect missing executables, API keys (`OPENAI_API_KEY`/`CODEX_API_KEY`), or `~/.codex` config early and emit actionable errors before dispatching eval cases.
- [x] 1.5 Register the provider in the factory so batching flags, dry-run mode, and retries behave consistently with other providers.
- [x] 1.6 Document the new provider in README/examples, including sample target entries and instructions for installing Codex CLI.

## 2. Validation
- [x] 2.1 Add unit tests that stub the Codex executable to ensure prompts, attachments, and CLI arguments are composed correctly.
- [x] 2.2 Add failure-path tests covering timeouts, malformed JSON, and missing credentials to guarantee clear error surfaces.
- [x] 2.3 Run `pnpm test packages/core/test/evaluation/providers/codex.test.ts` (new) plus the example eval to confirm Codex targets can execute end-to-end.
