# BbEval TypeScript Migration Guide

_Author: GitHub Copilot (GPT-5-Codex)_  
_Last updated: 2025-11-08_

## 1. Objective & Target Architecture

Port the Python `bbeval` evaluator into the new TypeScript pnpm workspace (`agentevo_1`). The end state is a parity-complete CLI and runtime implemented in TypeScript, published from this monorepo, and suitable for subagent execution. Maintain behaviour with respect to:

- CLI UX, flags, and logging (`bbeval` main entrypoint)
- Target resolution (`targets.yaml`, precedence rules, dry-run mocking)
- YAML parsing (guideline segregation, code block extraction, file search order)
- Evaluation loop (retry logic, caching toggle, target-specific handling)
- Provider integrations (Azure OpenAI, Anthropic, VS Code Copilot, Mock)
- Grading (heuristic aspect scoring and LLM judge)
- Prompt dumping and JSONL output
- Environment variable expectations (per sample `.env` in `bbeval/docs/examples/simple/.env`)

Deliver within the existing pnpm/turbo workspace (`@agentevo/core`, `@agentevo/cli`).

## 2. Workspace Layout (Current & Planned)

```
agentevo_1/
├── apps/
│   └── cli/                 → will house the TypeScript CLI replacement for `bbeval`
├── packages/
│   └── core/                → shared runtime utilities (config, models, grading, parsing)
├── docs/
│   └── bbeval-migration-guide.md (this file)
├── package.json             → pnpm workspace root scripts
├── pnpm-workspace.yaml
├── tsconfig*.json           → root and build configs (NodeNext, strict)
└── turbo.json               → orchestrated build/test pipeline
```

Expect additional subdirectories during migration:

- `packages/core/src/evaluation/` for domain models, parsing, evaluation, providers
- `apps/cli/src/commands/bbeval/` for CLI wiring
- `packages/core/test/evaluation/` and `apps/cli/test/evaluation/` for Vitest coverage
- `docs/vision/` updates referencing the TS port once CLI is complete

## 3. Migration Phases & Task Breakdown

### Phase 1 – Parity Analysis (Completed)
- [x] Inventory Python modules (`cli.py`, `models.py`, `yaml_parser.py`, `grading.py`, `signatures.py`, etc.)
- [x] Capture runtime behaviours (retry policy, prompt dumps, caching flag, VS Code focus best-effort)
- [x] Gather env expectations from `docs/examples/simple/.env`

### Phase 2 – TypeScript Scaffolding (Completed)
- [x] Initialize pnpm/Turbo workspace mirroring `subagent` & `WTG.Knowledge`
- [x] Create `@agentevo/core` and `@agentevo/cli` packages with build/test scripts

### Phase 3 – Core Domain Translation (Completed)
- [x] Port data contracts (`TestCase`, `EvaluationResult`, etc.) to strict TypeScript types/interfaces
- [x] Implement YAML loader with identical resolution order:
  - Search path priority: test file dir → ancestors → repo root → `cwd`
  - Distinguish guideline files (`*.instructions.md`, `/instructions/` paths, etc.)
  - Maintain `code_snippets` extraction from fenced blocks
- [x] Build prompt assembly helpers returning `{ request, guidelines }` payloads

### Phase 4 – Provider Layer
- [x] Wrap `@ax-llm/ax` connectors:
  - Azure OpenAI (`azure-openai` provider, env vars `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_DEPLOYMENT_NAME`)
  - Anthropic (`anthropic`, `ANTHROPIC_API_KEY` etc.)
  - Mock provider for `--dry-run`
- [x] Reimplement VS Code Copilot shell-out via the `subagent` programmatic API:
  - Write `.prompt.md` files per request and attach resolved workspace files
  - Poll for completion, surface non-zero exit codes, and respect dry-run mode
  - Optional focus remains best-effort: log warnings when dependencies absent
- [ ] Provide fallback connectors via `vercel-ai-sdk` only for simple completions where Ax is unnecessary
- [x] Apply schema validation (`zod`) for target settings & env parsing

### Phase 5 – Evaluation Pipeline
- [ ] Implement evaluation orchestrator mirroring `_run_test_case_grading` & `run_evaluation`
  - apply retry loop (timeouts only)
  - integrate caching toggle (default disabled unless `--cache` true)
  - create prompt dumping feature (JSON payloads per test)
- [ ] Port heuristic scoring (`grading.py`) verbatim with TypeScript utils
- [ ] Build Ax-powered `QualityGrader` signature; ensure safe JSON parsing of LLM output
- [ ] Ensure `EvaluationResult` includes optional `reasoning`, `raw_request`, `grader_raw_request`

### Phase 6 – CLI & Outputs
- [ ] Extend `apps/cli` with a `bbeval` command replicating Python CLI options:
  - positional `test_file`
  - flags: `--target`, `--targets`, `--test-id`, `--out`, `--dry-run`, `--agent-timeout`, `--max-retries`, `--cache`, `--verbose`, `--dump-prompts`
  - target precedence: CLI override (unless `'default'`) → test file `target` → `'default'`
- [ ] Implement `.env` lazy loading (only after parsing CLI flags)
- [ ] Ensure JSONL writing is incremental & newline-delimited
- [ ] Recreate summary statistics output (mean, median, min, max, std dev, distributions)

### Phase 7 – Quality & Documentation
- [ ] Add Vitest coverage for parser, grading, CLI flag precedence, provider mocks
- [ ] Document usage in `docs/vision/` (or new `docs/bbeval-ts.md`)
- [ ] Ensure ESLint/Prettier rules pass (`pnpm lint`, `pnpm format:check`)
- [ ] Provide example `targets.yaml` and updated `.env` notes if required

## 4. Technical Guidance & References

### 4.1 TypeScript & Build
- Use strict TypeScript (from `tsconfig.base.json`) with NodeNext module resolution.
- Build with `tsup` (esbuild-based) mirroring existing `tsup.config.ts` patterns.
- Tests via Vitest; prefer `describe`/`it` pattern; mock file system interactions with `memfs` or `tmp-promise` as needed.

### 4.2 Dependency Selection
- `@ax-llm/ax` for provider orchestration; follow patterns in `external/ax/docs/AI.md`.
- `zod` for schema validation of targets/environment.
- `yaml` or `js-yaml` for YAML parsing (ensure deterministic ordering and safe load).
- `commander` already available for CLI; extend with new subcommand.
- `chalk`/`colorette` optional for CLI color; maintain parity with Python prints if used.

### 4.3 File & Path Handling
- Use Node’s `fs/promises`, `path`, and `URL` APIs for robust cross-platform behaviour.
- Mirror Python’s path search order. Consider extracting a resolver utility that accepts the test path and candidate relative path list.

### 4.4 VS Code Copilot Integration Notes
- Persist prompt payloads under `.bbeval/vscode-copilot/SESSION_ID/`.
- Provide debug logging when CLI invocation fails; capture stderr to `last_cli_stderr.log`.
- Keep `AgentTimeoutError` semantics identical (includes message and target name in result `misses`).

## 5. Testing Strategy

| Area | Tests |
| --- | --- |
| YAML loader | Fixtures for mixed text/file/guideline content; ensures code block extraction and search order |
| Grading | Unit tests for heuristic scoring (hits/misses) & error detection (`is_error_like`) |
| CLI | Integration tests using `execa`/`node:test` to assert flag precedence and output file creation |
| Providers | Mock/test double verifying Azure/Anthropic config; unit tests for VS Code command builder (without invoking real CLI) |
| Retry logic | Simulate timeout errors to ensure retry counter & results |

Run via Turborepo pipeline: `pnpm typecheck`, `pnpm lint`, `pnpm test`, optionally `pnpm build` once features are in place.

## 6. Outstanding Decisions / Open Questions

1. **Package exposure** – final naming for the published CLI (stick with `@agentevo/cli` or create `@agentevo/bbeval` package?).
2. **Distribution Layout** – single CLI vs split packages (core runtime vs CLI binary). Current scaffold favours reuse across future agents.
3. **Ax vs Vercel** – default integration path: prefer Ax for all LLM interactions unless API requires vanilla completions.
4. **Workspace focus** – maintain Python-style best-effort `focus` flag; depends on optional Windows-only modules. Decide whether to leave stub or implement cross-platform fallback.

## 7. Next-Step Checklist for Subagents

- [x] Add domain models (`packages/core/src/evaluation/types.ts`).
- [x] Implement YAML parsing + tests.
- [x] Integrate provider adapters (Ax + VS Code dispatch) with environment validation.
- [ ] Port evaluation orchestrator and grading logic.
- [ ] Expand CLI command to fully mirror Python flags.
- [ ] Backfill documentation and test coverage.

Mark milestones via Git commits scoped per phase (e.g., `feat(core): add bbeval types and yaml parser`).

---

This guide should remain the source of truth for the migration. Update sections as phases complete or when architecture decisions shift.
