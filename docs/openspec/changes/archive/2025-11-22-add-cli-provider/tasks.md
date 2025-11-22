## 1. Schema & Docs
- [x] 1.1 Extend targets schema with `provider: cli`, `commandTemplate`, optional placeholder formatters (attachments/files), cwd/env overrides, timeout, and optional health probes.
- [x] 1.2 Document a sample CLI target plus the supported placeholders/formatting rules in README + docs/examples.

## 2. Provider Implementation
- [x] 2.1 Add a lightweight `CliProvider` that renders the template per test case (simple token replacement), shells out via cross-platform process helper, captures stdout/stderr, and enforces timeout/exit semantics.
- [x] 2.2 Wire provider into the runner: reuse retry + timeout logic, disable batching, emit stderr as diagnostics, and surface exit codes in failure results.

## 3. Validation & Tooling
- [x] 3.1 Unit-test schema validation (valid template, missing command, bad placeholders) and provider behavior (success, timeout, non-zero exit) with mocked child processes.
- [x] 3.2 Add docs/troubleshooting for quoting, placeholder expansion, and healthcheck failures; update changelog once approved.
