# Worker Progress Display

When running evaluations with parallel workers, AgentEvo displays real-time progress similar to Docker Compose or pnpm's parallel package installations.

## Quick Start

```bash
# Run with 4 parallel workers - shows progress display
pnpm agentevo eval tests/example.test.yaml --workers 4

# Sequential execution - no progress display
pnpm agentevo eval tests/example.test.yaml --workers 1
```

## Display Modes

### Interactive Mode (Terminal)

When running in a TTY terminal, you'll see a live-updating display:

```
[████████████░░░░░░░░] 60% 12/20 tests

Worker 1   🔄 simple-text-conversation (45s)
Worker 2   ✅ multi-turn-debugging-conversation
Worker 3   🔄 code-generation-with-constraints (12s)
Worker 4   ⏳ api-integration-test
```

The display updates automatically as workers pick up new tests and complete them.

### Non-Interactive Mode (CI/Logs)

When running in CI or with redirected output, you'll see simple line-by-line output:

```
✓ Test simple-text-conversation completed
✓ Test multi-turn-debugging-conversation completed
✗ Test code-generation-with-constraints failed: Timeout exceeded
✓ Test api-integration-test completed
```

## Status Indicators

| Icon | Status | Description |
|------|--------|-------------|
| ⏳ | Pending | Test is queued, waiting for an available worker |
| 🔄 | Running | Test is actively being executed |
| ✅ | Completed | Test finished successfully |
| ❌ | Failed | Test encountered an error |

## Configuration

### Enable Progress Display

Progress display is **automatically enabled** when:
- Using `--workers > 1` (parallel execution)
- Running in an interactive terminal (TTY)

### Disable Progress Display

Progress display is **automatically disabled** when:
- Using `--workers 1` (sequential execution - no need for parallel tracking)
- Running in CI environment (detected via `CI=true` environment variable)
- Output is redirected to a file or pipe (non-TTY)

## Examples

### Parallel Execution with Progress

```bash
# Run evaluation with 4 workers - shows live progress
pnpm agentevo eval docs/examples/simple/evals/example.test.yaml --workers 4
```

Output:
```
Using target: azure_base [provider=azure-openai]
Output path: .agentevo/results/example_2025-11-15T10-30-45.jsonl

[████████████████████] 100% 3/3 tests

Worker 1   ✅ simple-text-conversation
Worker 2   ✅ multi-turn-debugging-conversation
Worker 3   ✅ code-generation-with-constraints

Evaluation Summary:
  Total Tests:    3
  Passed:         3
  Failed:         0
  Success Rate:   100.0%
  Avg Score:      95.3%

Results written to: .agentevo/results/example_2025-11-15T10-30-45.jsonl
```

### Sequential Execution (No Progress Display)

```bash
# Run evaluation sequentially - no progress display needed
pnpm agentevo eval docs/examples/simple/evals/example.test.yaml --workers 1
```

Output:
```
Using target: azure_base [provider=azure-openai]
Output path: .agentevo/results/example_2025-11-15T10-30-45.jsonl

Evaluation Summary:
  Total Tests:    3
  Passed:         3
  Failed:         0
  Success Rate:   100.0%
  Avg Score:      95.3%

Results written to: .agentevo/results/example_2025-11-15T10-30-45.jsonl
```

### CI Environment (Non-Interactive)

```bash
# In CI, you get simple line-by-line output even with parallel workers
CI=true pnpm agentevo eval docs/examples/simple/evals/example.test.yaml --workers 4
```

Output:
```
Using target: azure_base [provider=azure-openai]
Output path: .agentevo/results/example_2025-11-15T10-30-45.jsonl
✓ Test simple-text-conversation completed
✓ Test multi-turn-debugging-conversation completed
✓ Test code-generation-with-constraints completed

Evaluation Summary:
  Total Tests:    3
  Passed:         3
  Failed:         0
  Success Rate:   100.0%
  Avg Score:      95.3%

Results written to: .agentevo/results/example_2025-11-15T10-30-45.jsonl
```

## Technical Details

### Implementation

The progress display is implemented in `apps/cli/src/commands/eval/progress-display.ts` and uses:

- **ANSI escape codes** for cursor manipulation in TTY mode
- **Debounced rendering** (100ms) to prevent flicker
- **Automatic environment detection** (TTY vs non-TTY)
- **Worker tracking** via unique IDs assigned to each test

### Performance

- **Minimal overhead:** Progress updates are debounced and rendered at most 10 times per second
- **Non-blocking:** All updates are asynchronous and don't slow down test execution
- **Memory efficient:** Only tracks status for active workers, not historical data

### Customization

Currently, the progress display automatically adapts to your environment. Future versions may include:

- `--no-progress` flag to force disable display
- `--progress-style=<style>` to choose different display formats
- Colored output based on test results
- Estimated time remaining

## Troubleshooting

### Progress display not showing

**Cause:** You're running with `--workers 1` or in a non-TTY environment.

**Solution:** 
- Use `--workers 2` or higher for parallel execution
- Ensure you're running in an interactive terminal (not CI or redirected output)

### Display is flickering or malformed

**Cause:** Terminal doesn't support ANSI escape codes or has limited capabilities.

**Solution:**
- Set `CI=true` to force non-interactive mode: `CI=true pnpm agentevo eval ...`
- Use sequential execution: `--workers 1`

### Want to see output in CI

**Cause:** CI mode uses simplified output by default.

**Solution:** This is the expected behavior. The simplified output is more suitable for CI logs. Each test completion is logged as it happens.

## Related Documentation

- [Parallel Execution](../add-parallel-execution/proposal.md) - Learn about the `--workers` flag
- [CLI Options](../../cli/options.md) - Full CLI reference
- [Targets Configuration](../../targets/configuration.md) - Configure default worker counts per target
