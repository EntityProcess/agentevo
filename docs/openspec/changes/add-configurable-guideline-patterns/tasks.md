## 1. Config Loading

- [x] 1.1 Add `loadConfig(evalFilePath: string)` function in yaml-parser.ts
- [x] 1.2 Check for `.agentv.yaml` in same directory as eval file
- [x] 1.3 Parse YAML and extract `guideline_patterns` array (or return null)

## 2. Pattern Matching with Glob

- [x] 2.1 Add micromatch dependency to packages/core/package.json
- [x] 2.2 Update `isGuidelineFile()` to accept optional `patterns: string[]` parameter
- [x] 2.3 Normalize file paths to forward slashes before matching
- [x] 2.4 When patterns provided, use micromatch.isMatch() to test each pattern
- [x] 2.5 When patterns not provided, use hardcoded defaults as glob patterns

## 3. Integration

- [x] 3.1 Call `loadConfig()` once at start of `loadTestCases()`
- [x] 3.2 Pass patterns to `isGuidelineFile()` during file processing
- [x] 3.3 Convert current hardcoded checks to glob patterns for consistency

## 4. Testing & Docs

- [x] 4.1 Add test: config file with custom glob patterns
- [x] 4.2 Add test: no config file uses default glob patterns
- [x] 4.3 Add test: cross-platform path matching (Windows/Unix)
- [x] 4.4 Add example `.agentv/config.yaml` to docs/examples/simple/.agentv/
- [x] 4.5 Update README with glob pattern examples

## 5. Directory Tree Walking (Enhancement)

- [x] 5.1 Add `buildConfigSearchChain()` function to walk directory tree
- [x] 5.2 Update `loadConfig()` to search from eval dir up to repo root
- [x] 5.3 Make config discovery consistent with targets.yaml behavior
- [x] 5.4 Add test: config at repo root discovered from nested eval
- [x] 5.5 Update README to document tree-walking behavior

## 6. Bundling Fix

- [x] 6.1 Mark micromatch as external in CLI tsup config
- [x] 6.2 Add micromatch as runtime dependency in apps/cli/package.json
- [x] 6.3 Verify CLI works with external micromatch
