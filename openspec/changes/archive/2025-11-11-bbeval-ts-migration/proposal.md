# Change: Complete bbeval TypeScript Migration

## Why

The TypeScript migration of bbeval from Python is partially complete. We have successfully completed:

- **Phase 1 (Parity Analysis)**: Inventoried Python modules, captured runtime behaviors, gathered environment expectations
- **Phase 2 (TypeScript Scaffolding)**: Initialized pnpm/Turbo workspace, created `@agentevo/core` and `@agentevo/cli` packages
- **Phase 3 (Core Domain Translation)**: Ported data contracts, implemented YAML loader with proper resolution order, built prompt assembly helpers
- **Phase 4 (Provider Layer - Partial)**: Wrapped Ax connectors for Azure/Anthropic/Mock, implemented VS Code Copilot via subagent, added Zod schema validation

However, the critical evaluation pipeline, grading logic, complete CLI implementation, and comprehensive testing remain unfinished. Phase 4 still needs VS Code prompt scaffolding improvements (preread blocks, SHA tokens) and vercel-ai-sdk fallback connectors. Without completing Phases 4-7, the system cannot execute end-to-end evaluations or replace the Python version.

## What Changes

- **Complete Provider Layer (Phase 4)**

  - Add Google Gemini provider support with configurable model selection
  - Implement VS Code Copilot prompt scaffolding matching Python behavior (mandatory preread block, SHA tokens, focus hints)
  - Add fallback connectors via vercel-ai-sdk for simple completions
  - Ensure schema validation for all target settings and environment parsing

- **Implement Evaluation Pipeline (Phase 5)**

  - Port evaluation orchestrator (`_run_test_case_grading`, `run_evaluation`)
  - Implement retry loop (timeouts only), caching toggle, and prompt dumping
  - Port heuristic scoring from `grading.py`
  - Build Ax-powered `QualityGrader` signature with safe JSON parsing
  - Ensure `EvaluationResult` includes optional reasoning and raw request fields
  - Add comprehensive Vitest coverage

- **Build CLI & Outputs (Phase 6)**

  - Extend `apps/cli` with complete `bbeval` command
  - Implement all CLI flags matching Python version
  - Add target precedence logic (CLI override → test file → 'default')
  - Implement `.env` lazy loading
  - Ensure incremental JSONL writing
  - Recreate summary statistics output

- **Quality & Documentation (Phase 7)**
  - Add YAML output format support as an alternative to JSONL (via `--format` flag)
  - Execute the simple evaluation example at `docs/examples/simple/evals/example.test.yaml`
  - Confirm the TypeScript pipeline handles all test cases in that file
  - Validate both JSONL and YAML output formats work correctly

- **Validation & Migration**
  - Compare outputs between the agentevo TypeScript pipeline, the Python `bbeval .\evals\example.test.yaml` direct LLM run, and the external agent run `bbeval .\evals\example.test.yaml --target vscode_projectx`
  - Document any intentional discrepancies and ensure parity targets are met

## Impact

- **Affected specs**: `evaluation` (new capability being formalized)
- **Affected packages**:
  - `@agentevo/core` - evaluation pipeline, grading, provider layer
  - `@agentevo/cli` - bbeval command implementation
- **New dependencies**: None (all required deps already in package.json)
- **Breaking changes**: None (this completes a new capability)

## Success Criteria

1. End-to-end bbeval tests execute successfully with all providers (Azure, Anthropic, VS Code, Mock)
2. CLI parity with Python version (all flags, output formats, target resolution)
3. `docs/examples/simple/evals/example.test.yaml` executes successfully with the TypeScript pipeline
4. Output comparisons across agentevo, Python `bbeval`, and `bbeval --target vscode_projectx` demonstrate parity or documented differences
5. All existing bbeval YAML test files work with TypeScript implementation
