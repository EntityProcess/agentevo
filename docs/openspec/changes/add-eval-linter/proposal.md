# Change: Add Eval Linter Command

## Why

AgentEvo currently validates YAML files only when they are executed during eval runs. This creates a poor developer experience:
- Syntax errors and schema violations are discovered late in the workflow
- Invalid file references (instructions, prompts) aren't detected until runtime
- Users cannot validate their eval and targets files independently
- No pre-commit or CI validation is possible

A dedicated linter command enables fast feedback, better tooling integration, and catches errors before execution.

## What Changes

- Add `agentevo lint` command to validate eval YAML files and targets.yaml
- Support linting individual files or entire directories (e.g., `agentevo lint ./evals`)
- Validate YAML schema compliance (`$schema` field required, required fields, structure)
- Validate file URL references exist and are accessible
- Detect file type via `$schema` field: `agentevo-eval-v2` for eval files, `agentevo-targets-v2` for targets
- Files missing `$schema` field are rejected with clear error message
- Provide clear error messages with file path, location context
- Validate that referenced instruction files exist and warn if empty
- Exit with non-zero code on validation failures for CI integration

## Impact

- **Affected specs**: Creating new capability `lint-validation`
- **Affected code**: 
  - New CLI command in `apps/cli/src/commands/lint/`
  - New validation modules in `packages/core/src/evaluation/validation/`
  - Reuse existing schema parsing from `yaml-parser.ts` and `targets-file.ts`
- **CLI surface**: New command `agentevo lint [paths...]`
- **Breaking changes**: None (purely additive feature)

## File Type Detection Strategy

After analysis, we will use **`$schema` field** for type detection:

```yaml
$schema: agentevo-eval-v2
description: My test suite
evalcases: ...
```

```yaml
$schema: agentevo-targets-v2
targets:
  - name: azure_base
    provider: azure
```

This approach is:
- **Unambiguous**: File explicitly declares what it is (no assumption about extensions/paths)
- **Tool ownership**: `agentevo-` prefix clearly indicates this is an AgentEvo file
- **Versioned**: Schema identifier includes version (e.g., `v2`), no separate `version` field needed
- **Standard**: Follows `$schema` convention used by JSON Schema, VS Code configs, etc.
- **IDE-friendly**: Tools can provide autocomplete/validation based on `$schema`
- **Required**: Files without `$schema` are rejected - ensures all files explicitly declare their type

Alternative approaches considered:

### 1. File naming convention (e.g., `*.eval.yaml`)
```yaml
# my-test.eval.yaml
version: '2.0'
evalcases: ...
```

**Rejected because:**
- **No ownership**: AgentEvo doesn't own the `.eval.yaml` extension
- **Collision risk**: Other tools could use same pattern for different purposes
- **Ambiguous**: Extension doesn't guarantee AgentEvo compatibility
- **Weak signal**: Filename is a hint for humans, not source of truth
- **Comparison to industry**: TypeScript/ESLint don't rely on extensions; JSON Schema/OpenAPI use `$schema`

### 2. Config file with glob patterns
```yaml
# .agentevo/config.yaml
eval_patterns:
  - evals/**/*.yaml
```

**Rejected because:**
- **Still ambiguous**: Patterns don't distinguish AgentEvo files from other YAML
- **Bootstrap problem**: How do you validate the config file itself?
- **Indirection**: Must read config to understand what gets linted
- **Doesn't solve core issue**: Still can't tell if a YAML file is an AgentEvo eval without reading it

### 3. Directory-based inference
All files in `evals/` are eval files.

**Rejected because:**
- **Too implicit**: Breaks when files move
- **Not portable**: Assumes specific directory structure
- **Collision risk**: Multiple tools might use `evals/` directory

### 4. Version field only (current AgentEvo approach)
```yaml
version: '2.0'
evalcases: ...
```

**Rejected because:**
- **Generic field**: Many tools use `version`, doesn't identify file as AgentEvo-specific
- **Structural detection required**: Must check for `evalcases`/`targets` fields
- **No explicit declaration**: File doesn't declare its purpose

**Why `$schema` wins**: Explicit tool ownership, follows industry standards (JSON Schema, VS Code, OpenAPI), enables IDE support, unambiguous file type declaration.
