# Change: Add Worker Progress Display for Parallel Execution

## Why

When running evaluations with parallel workers (e.g., `--workers 4`), users have no visibility into what each worker is doing. They see output only when tests complete, making it difficult to:
- Monitor progress of long-running evaluations
- Understand which tests are currently executing
- Identify slow or stuck tests
- Get feedback similar to familiar tools like Docker Compose or pnpm

This change provides a live progress display similar to Docker Compose's service status view, showing each worker's current status, test ID, and elapsed time.

## What Changes

### User Experience

**Interactive Mode (TTY):**
```
[████████████░░░░░░░░] 60% 12/20 tests

Worker 1   🔄 test-validate-customs-entry (45s)
Worker 2   ✅ test-tariff-classification
Worker 3   🔄 test-duty-calculation (12s)
Worker 4   ⏳ test-origin-verification
```

**Non-Interactive Mode (CI/logs):**
```
✓ Test test-validate-customs-entry completed
✓ Test test-tariff-classification completed
✗ Test test-duty-calculation failed: Timeout exceeded
```

### Technical Implementation

- **New Component:** `apps/cli/src/commands/eval/progress-display.ts`
  - `ProgressDisplay` class manages worker status display
  - Detects TTY vs non-TTY environments automatically
  - Debounced rendering (100ms) to avoid flicker
  - ANSI cursor manipulation for live updates in interactive mode
  - Fallback to simple line-by-line output in CI environments

- **Core Updates:** `packages/core/src/evaluation/orchestrator.ts`
  - New `ProgressEvent` interface for worker status updates
  - `onProgress` callback in `RunEvaluationOptions`
  - Emits events for: `pending`, `running`, `completed`, `failed` states
  - Worker ID assignment and tracking

- **CLI Integration:** `apps/cli/src/commands/eval/run-eval.ts`
  - Creates `ProgressDisplay` when `workers > 1`
  - Connects orchestrator progress events to display updates
  - Properly cleans up display on completion

### Status Icons
- ⏳ Pending - Test queued, waiting for worker
- 🔄 Running - Test actively executing
- ✅ Completed - Test passed successfully
- ❌ Failed - Test encountered an error

### Configuration

Progress display is **automatically enabled** when:
- `--workers > 1` (parallel execution)
- Running in interactive TTY terminal

Progress display is **disabled** when:
- `--workers 1` (sequential execution - no need for parallel status)
- Running in CI environment (detected via `CI` env var)
- Output redirected to file/pipe (non-TTY)

## Impact

- **Affected specs:** `evaluation`, `cli-ux`
- **New files:**
  - `apps/cli/src/commands/eval/progress-display.ts` - Progress display component
- **Modified files:**
  - `packages/core/src/evaluation/orchestrator.ts` - Progress event emission
  - `apps/cli/src/commands/eval/run-eval.ts` - Progress display integration
- **Breaking changes:** None (feature is additive and auto-detects environment)
- **Performance impact:** Negligible (debounced rendering, async updates)
- **UX impact:** Major improvement in visibility for parallel evaluations

## Future Enhancements

- Add `--no-progress` flag to disable display even in TTY mode
- Show more detailed metrics (tokens used, cost estimates)
- Support colored output based on pass/fail status
- Add estimated time remaining based on average test duration
- Support custom status messages from providers
