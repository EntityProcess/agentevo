# Change: Add Parallel Test Execution with Worker Pool

## Why

AgentV currently executes test cases sequentially, which becomes inefficient for large test suites. Users need to wait for N test cases to complete one-by-one, even though most test cases are independent and could run concurrently. This is especially problematic when running evaluations against slow providers (e.g., VS Code Copilot with 120-second timeouts) or large test suites with dozens of test cases.

Parallel execution would dramatically reduce total evaluation time (potentially by a factor of N for N workers) while maintaining backward compatibility and safe file writing.

## What Changes

- Add `--workers <count>` CLI option to control concurrency level (default: 1 for sequential execution)
- Add `workers` setting to targets.yaml for per-target concurrency configuration
- Implement worker pool pattern in orchestrator using `p-limit` for optimal concurrency control
- Add thread-safe output writer using `async-mutex` to prevent file corruption
- Update documentation with parallel execution examples and best practices
- Add integration tests for parallel execution scenarios

**Configuration:**
- Default workers: 1 (backward compatible, sequential behavior)
- Configurable via:
  - targets.yaml: `workers: <count>` (per-target default)
  - CLI flag: `--workers <count>` (overrides target setting)
- Priority: CLI flag > target setting > global default (1)
- Results written incrementally as workers complete (thread-safe)
- Statistics calculated after all workers complete
- Uses `p-limit` for immediaet work-stealing (no batch-wait gaps)

## Impact

- Affected specs: `evaluation`
- Affected code:
  - `packages/core/src/evaluation/orchestrator.ts` - Add worker pool logic with p-limit
  - `packages/core/src/evaluation/providers/types.ts` - Add `workers` to `TargetDefinition`
  - `packages/core/src/evaluation/providers/targets.ts` - Add `workers` to `ResolvedTarget`
  - `apps/cli/src/commands/eval/output-writer.ts` - Add mutex for thread-safe writes
  - `apps/cli/src/commands/eval/index.ts` - Add `--workers` CLI option
  - `apps/cli/src/commands/eval/run-eval.ts` - Resolve workers from CLI > target > default
  - `package.json` - Add `p-limit` and `async-mutex` dependencies
- Breaking changes: None (default behavior unchanged)
- Performance impact: Significant speedup for large test suites with parallel workers
