# Implementation Tasks

## 0. Completed Phases (Phases 1-3)

### Phase 1 – Parity Analysis (✓ Completed)

- [x] 0.1.1 Inventory Python modules (`cli.py`, `models.py`, `yaml_parser.py`, `grading.py`, `signatures.py`, etc.)
- [x] 0.1.2 Capture runtime behaviours (retry policy, prompt dumps, caching flag, VS Code focus best-effort)
- [x] 0.1.3 Gather env expectations from `docs/examples/simple/.env`

### Phase 2 – TypeScript Scaffolding (✓ Completed)

- [x] 0.2.1 Initialize pnpm/Turbo workspace
- [x] 0.2.2 Create `@agentevo/core` and `@agentevo/cli` packages with build/test scripts

### Phase 3 – Core Domain Translation (✓ Completed)

- [x] 0.3.1 Port data contracts (`TestCase`, `EvaluationResult`, etc.) to strict TypeScript types/interfaces
- [x] 0.3.2 Implement YAML loader with identical resolution order
  - [x] 0.3.2.1 Search path priority: test file dir → ancestors → repo root → `cwd`
  - [x] 0.3.2.2 Distinguish guideline files (`*.instructions.md`, `/instructions/` paths, etc.)
  - [x] 0.3.2.3 Maintain `code_snippets` extraction from fenced blocks
- [x] 0.3.3 Build prompt assembly helpers returning `{ request, guidelines }` payloads

### Phase 4 – Provider Layer (✓ Completed)

- [x] 0.4.1 Wrap `@ax-llm/ax` connectors
  - [x] 0.4.1.1 Azure OpenAI provider with env vars (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_DEPLOYMENT_NAME`)
  - [x] 0.4.1.2 Anthropic provider with `ANTHROPIC_API_KEY`
  - [x] 0.4.1.3 Mock provider for `--dry-run`
  - [x] 0.4.1.4 Google Gemini provider with env vars (`GOOGLE_API_KEY`, optional `GOOGLE_GEMINI_MODEL`)
- [x] 0.4.2 Reimplement VS Code Copilot shell-out via `subagent` programmatic API
  - [x] 0.4.2.1 Write `.prompt.md` files per request and attach resolved workspace files
  - [x] 0.4.2.2 Poll for completion, surface non-zero exit codes
  - [x] 0.4.2.3 Respect dry-run mode
  - [x] 0.4.2.4 Log warnings when dependencies absent (optional focus best-effort)
  - [x] 0.4.2.5 Add mandatory preread block generation with SHA tokens
  - [x] 0.4.2.6 Implement focus hints for workspace file suggestions
- [x] 0.4.3 Apply schema validation (`zod`) for target settings & env parsing

## 1. Complete Provider Layer (Phase 4 - ✓ Completed)

- [x] 1.1 Implement VS Code Copilot prompt scaffolding
  - [x] 1.1.1 Add mandatory preread block generation
  - [x] 1.1.2 Implement SHA token generation for audit trail
  - [x] 1.1.3 Add focus hints for workspace file suggestions
  - [x] 1.1.4 Write tests for prompt file generation
- [x] 1.2 Add Google Gemini provider support
  - [x] 1.2.1 Create GeminiProvider class with Ax integration
  - [x] 1.2.2 Add environment variable configuration (GOOGLE_API_KEY, GOOGLE_GEMINI_MODEL)
  - [x] 1.2.3 Write integration tests for Gemini provider
- [x] 1.3 Complete schema validation
  - [x] 1.3.1 Add Zod schemas for all target settings
  - [x] 1.3.2 Validate environment variables with clear error messages
  - [x] 1.3.3 Write validation tests

## 2. Implement Evaluation Pipeline (Phase 5)

- [x] 2.1 Port evaluation orchestrator
  - [x] 2.1.1 Implement `runTestCase` function matching `_run_test_case_grading`
  - [x] 2.1.2 Implement `runEvaluation` function matching `run_evaluation`
  - [x] 2.1.3 Add retry loop for timeout errors only
  - [x] 2.1.4 Integrate caching toggle (default disabled)
  - [x] 2.1.5 Implement prompt dumping to `.agentevo/prompts/` directory
  - [x] 2.1.6 Write orchestrator tests (happy path, retries, errors)
- [x] 2.2 Port heuristic scoring
  - [x] 2.2.1 Implement `calculateHits` function from `grading.py`
  - [x] 2.2.2 Implement `calculateMisses` function from `grading.py`
  - [x] 2.2.3 Port `is_error_like` helper
  - [x] 2.2.4 Write scoring tests with fixtures
- [x] 2.3 Build Ax-powered QualityGrader
  - [x] 2.3.1 Create `QualityGrader` signature/program using Ax
  - [x] 2.3.2 Implement safe JSON parsing with fallback
  - [x] 2.3.3 Add reasoning extraction from LLM output
  - [x] 2.3.4 Write grader integration tests with mock LLM
- [x] 2.4 Migrate QualityGrader from DSPy markers to JSON-first contract
  - [x] 2.4.1 Replace DSPy field markers `[[ ## field ## ]]` in system prompt with JSON schema specification
  - [x] 2.4.2 Update prompt to instruct models to emit single JSON object: `{ "score": float, "hits": string[], "misses": string[], "reasoning": string }`
  - [x] 2.4.3 Reorder parsing logic to parse JSON FIRST (primary), with DSPy marker parsing as deprecated fallback
  - [x] 2.4.4 Add JSON schema validation with clear error messages
  - [x] 2.4.5 Update tests to verify JSON-first parsing behavior
  - [x] 2.4.6 Add constraint enforcement: score in [0.0, 1.0], max 4 entries each in hits/misses
- [x] 2.5 Complete EvaluationResult structure
  - [x] 2.5.1 Add optional `reasoning` field
  - [x] 2.5.2 Add optional `raw_request` field
  - [x] 2.5.3 Add optional `grader_raw_request` field
  - [x] 2.5.4 Update type exports

## 3. Build CLI & Outputs (Phase 6)

- [x] 3.1 Extend CLI with eval command
  - [x] 3.1.1 Create `commands/eval/index.ts` with Commander.js setup
  - [x] 3.1.2 Add positional `test_file` argument
  - [x] 3.1.3 Implement all flags: `--target`, `--targets`, `--test-id`, `--out`, `--dry-run`, `--agent-timeout`, `--max-retries`, `--cache`, `--verbose`, `--dump-prompts`
  - [x] 3.1.4 Wire up to main CLI entry point
  - [x] 3.1.5 Write CLI integration tests using execa
- [x] 3.2 Implement target precedence
  - [x] 3.2.1 Parse CLI flags for target override
  - [x] 3.2.2 Parse test file for target setting
  - [x] 3.2.3 Apply precedence: CLI (unless 'default') → test file → 'default'
  - [x] 3.2.4 Write precedence tests
- [x] 3.3 Add environment loading
  - [x] 3.3.1 Implement lazy `.env` loading after CLI parsing
  - [x] 3.3.2 Add env validation with clear error messages
  - [x] 3.3.3 Write env loading tests
- [x] 3.4 Implement JSONL output
  - [x] 3.4.1 Create incremental JSONL writer
  - [x] 3.4.2 Ensure newline-delimited format
  - [x] 3.4.3 Add proper file handle management
  - [x] 3.4.4 Write output format tests
- [x] 3.5 Implement summary statistics
  - [x] 3.5.1 Calculate mean, median, min, max for scores
  - [x] 3.5.2 Calculate standard deviation
  - [x] 3.5.3 Generate distribution histograms
  - [x] 3.5.4 Format console output matching Python version
  - [x] 3.5.5 Write statistics tests

## 4. Quality & Documentation (Phase 7)

- [x] 4.1 Add YAML output format support
  - [x] 4.1.1 Add `--format <format>` CLI flag accepting 'jsonl' or 'yaml'
  - [x] 4.1.2 Create YamlWriter class for incremental YAML output
  - [x] 4.1.3 Update output writer selection logic based on format flag
  - [x] 4.1.4 Write tests for YAML format output
  - [x] 4.1.5 Validate YAML output is well-formed and parseable
- [x] 4.2 Verify simple example evaluation
  - [x] 4.2.1 Run `cd docs\examples\simple; bbeval .\evals\example.test.yaml --target vscode_projectx --test-id simple-text-conversation`
  - [x] 4.2.2 Run same command using TypeScript migration: `cd docs\examples\simple; agentevo eval .\evals\example.test.yaml --target vscode_projectx --test-id simple-text-conversation`
  - [x] 4.2.3 Confirm both implementations produce consistent results
  - [x] 4.2.4 Test YAML output format: `agentevo eval .\evals\example.test.yaml --format yaml`

## 5. Validation & Migration

- [x] 5.1 Validate against Python version
  - [x] 5.1.1 Run same test files with both implementations
  - [x] 5.1.2 Compare outputs for consistency
  - [x] 5.1.3 Document any intentional differences
- [x] 5.2 Update migration guide
  - [x] 5.2.1 Mark completed phases
  - [x] 5.2.2 Update outstanding decisions section
  - [x] 5.2.3 Add migration completion checklist
- [x] 5.3 Prepare for release
  - [x] 5.3.1 Update package versions
  - [x] 5.3.2 Add CHANGELOG entries
  - [x] 5.3.3 Tag release commit
