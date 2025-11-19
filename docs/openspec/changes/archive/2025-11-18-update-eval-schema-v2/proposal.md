# Change: Update Eval YAML Schema to V2 Format

## Why

The current eval schema uses legacy naming (`testcases`, `messages`) and lacks support for advanced features like conversation threading and structured execution configuration. The new V2 schema aligns with modern eval frameworks, enabling:

- Conversation-based test organization via `conversation_id`
- Explicit execution configuration with target and evaluator settings
- Clearer separation between input and expected output messages
- Better alignment with industry-standard eval formats
- Foundation for external optimization frameworks (ACE will reference evals, not be embedded in them)

## What Changes

- **BREAKING**: Rename `testcases` → `evalcases` (top-level array in YAML)
- **BREAKING**: Split `messages` into `input_messages` and `expected_messages` (per eval case in YAML)
- Add `conversation_id` field for grouping related eval cases
- Add `execution` block with:
  - `target`: Execution target (inherits from top-level if not specified)
  - `evaluators`: Array of evaluator configurations, each with:
    - `name`: Unique identifier for the evaluator's score
    - `type`: Evaluator type (llm_judge, code)
    - `prompt`: Prompt template path (for llm_judge)
    - `model`: Model override (for llm_judge)
    - `script`: Script path (for code evaluators)

**Note**: ACE optimization configuration will be handled in separate optimization config files (e.g., `optimizers/*.yaml`) that reference eval files, not within eval cases themselves.

## Impact

- Affected specs: `evaluation`
- Affected code:
  - `packages/core/src/evaluation/yaml-parser.ts` - Schema parsing and validation
  - `packages/core/src/evaluation/types.ts` - Type definitions for test cases
  - `packages/core/src/evaluation/orchestrator.ts` - Test execution logic
  - `apps/cli/src/commands/eval.ts` - CLI interface
  - `docs/examples/simple/evals/example.test.yaml` - Example file
- **Migration path**: BREAKING CHANGE - V1 format is no longer supported. Users must update all eval files to V2 format before upgrading. Files using V1 format (`testcases` key) will be rejected with a clear error message and migration guidance.
