# Change: Add Configurable Guideline Pattern Matching

## Why

Currently, AgentV hardcodes guideline file detection in `yaml-parser.ts` using fixed patterns (`.instructions.md`, `/instructions/`, `.prompt.md`, `/prompts/`). This prevents users from customizing which files are treated as guidelines vs. regular file content, limiting flexibility for different project conventions.

## What Changes

- Add optional `.agentv/config.yaml` configuration file with customizable `guideline_patterns` using glob patterns
- Use `micromatch` library for standard glob pattern matching (37M weekly downloads, used by webpack/babel/eslint)
- Maintain current hardcoded patterns as defaults (converted to glob format) when config file is absent
- Normalize paths to forward slashes for cross-platform compatibility
- Follow industry-standard config file approach (similar to `.gitignore`, `.eslintignore`, `.prettierignore`)
- Config file location follows existing AgentV convention of placing config in `.agentv/` directory (alongside `targets.yaml`)

## Impact

- Affected specs: `evaluation` (file reference resolution and guideline handling)
- Affected code: 
  - `packages/core/src/evaluation/yaml-parser.ts` (isGuidelineFile function, config loading)
  - `packages/core/package.json` (add micromatch dependency)
- Breaking changes: None (fully backward compatible - defaults match current behavior as glob patterns)
- Migration: Optional - users can add `.agentv/config.yaml` to customize patterns using standard glob syntax
