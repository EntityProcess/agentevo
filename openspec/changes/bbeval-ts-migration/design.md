# Design: Complete bbeval TypeScript Migration

## Context

The bbeval evaluation framework was originally implemented in Python. We are migrating it to TypeScript to:

- Enable better integration with the agentevo ecosystem (which is TypeScript-based)
- Leverage type safety for configuration and results
- Simplify deployment and dependency management in the monorepo
- Support future extensibility with the Ax LLM framework

The core domain translation (types, YAML parsing, provider scaffolding) is complete. This design covers the remaining implementation: evaluation orchestration, grading, CLI, and testing.

## Goals / Non-Goals

### Goals

- **Feature parity**: All Python bbeval capabilities work identically in TypeScript
- **Type safety**: Strict TypeScript with comprehensive schemas for configs and results
- **Test coverage**: >80% coverage for core evaluation logic
- **Clear errors**: Helpful error messages with actionable fixes
- **Performance**: Similar or better performance than Python version

### Non-Goals

- **Extended features**: No new capabilities beyond Python parity
- **Multi-language support**: Focus on TypeScript/Node.js runtime only
- **Distributed execution**: Single-machine evaluation only (matches Python)
- **GUI interface**: CLI-only (matches Python)

## Decisions

### 1. Evaluation Orchestration Architecture

**Decision**: Use async/await with controlled concurrency for test execution

**Rationale**:

- TypeScript's native async patterns are cleaner than Python's asyncio
- Controlled concurrency prevents resource exhaustion
- Easy to integrate with retry logic and timeout handling

**Implementation**:

```typescript
async function runEvaluation(
  testCases: TestCase[],
  options: EvaluationOptions,
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  for (const testCase of testCases) {
    const result = await runTestCaseWithRetry(testCase, options);
    results.push(result);

    if (options.outputPath) {
      await appendJsonl(options.outputPath, result);
    }
  }

  return results;
}
```

**Alternatives considered**:

- **Parallel execution**: Rejected because provider rate limits and cost tracking require sequential execution
- **Stream-based processing**: Rejected as overkill for typical test suite sizes (<100 tests)

### 2. Grading Implementation

**Decision**: Separate heuristic scoring from LLM grading; use Ax for LLM grading

**Rationale**:

- Heuristic scoring (hits/misses) is fast and deterministic
- LLM grading provides nuanced evaluation but adds latency and cost
- Ax framework provides structured output and retry handling
- Clear separation allows users to skip LLM grading for faster feedback

**Implementation**:

```typescript
interface GradingResult {
  heuristic: {
    hits: string[];
    misses: string[];
    aspectScores: Record<string, number>;
  };
  llm?: {
    score: number;
    reasoning: string;
    rawResponse: string;
  };
}
```

**Alternatives considered**:

- **LLM-only grading**: Rejected due to cost and latency
- **Custom LLM integration**: Rejected in favor of Ax's structured outputs and reliability

### 3. VS Code Copilot Integration

**Decision**: Use subagent library programmatically with enhanced prompt scaffolding

**Rationale**:

- Subagent library already handles workspace provisioning and CLI invocation
- Prompt scaffolding (preread block, SHA tokens) improves audit trail and debugging
- Focus hints guide Copilot to relevant workspace files
- Matches Python implementation's prompt structure

**Implementation**:

```typescript
async function invokeCopilot(
  request: string,
  guidelines: string[],
  workspaceFiles: string[],
  options: CopilotOptions,
): Promise<string> {
  const promptPath = await createPromptFile({
    prereadBlock: generatePrereadBlock(workspaceFiles),
    shaTokens: generateShaTokens(request, guidelines),
    focusHints: workspaceFiles,
    request,
    guidelines,
  });

  return await subagent.invoke({
    promptPath,
    timeout: options.timeout,
    dryRun: options.dryRun,
  });
}
```

**Alternatives considered**:

- **Direct API calls**: Rejected because VS Code Copilot Chat API is not available outside VS Code
- **Simple prompt files**: Rejected because audit trail and debugging require structured prompts

### 4. Gemini Provider Integration

**Decision**: Support Google Gemini via Ax with configurable model selection

**Rationale**:

- Gemini provides competitive pricing and performance
- Ax framework already supports Google AI providers
- Model selection allows users to choose between speed (flash) and capability (pro)
- Consistent with other provider patterns (env-based configuration)

**Implementation**:

```typescript
const geminiProvider = {
  apiKey: process.env.GOOGLE_API_KEY,
  model: process.env.GOOGLE_GEMINI_MODEL || "gemini-2.5-flash",
  provider: "google",
};
```

**Environment variables**:

- `GOOGLE_API_KEY` (required): Google AI API key
- `GOOGLE_GEMINI_MODEL` (optional): Model override (defaults to `gemini-2.5-flash`)

**Alternatives considered**:

- **Hardcoded model**: Rejected to allow flexibility for different use cases
- **Vertex AI**: Deferred; can add later if GCP integration is needed

### 5. CLI Design

**Decision**: Single `agentevo eval` command with all Python flags

**Rationale**:

- Maintains muscle memory for existing bbeval users
- Clear migration path from Python to TypeScript version
- Extensible for future evaluation-related subcommands

**Command structure**:

```bash
agentevo eval <test-file> [options]

Options:
  --target <name>          Override target provider
  --targets <path>         Path to targets.yaml
  --test-id <id>           Run specific test by ID
  --out <path>             Output JSONL path
  --dry-run                Mock provider calls
  --agent-timeout <ms>     Per-test timeout
  --max-retries <n>        Retry limit for timeouts
  --cache                  Enable LLM response caching
  --verbose                Detailed logging
  --dump-prompts           Save prompts to .agentevo/
```

**Alternatives considered**:

- **Separate binary**: Rejected to reduce distribution complexity
- **Different flag names**: Rejected to maintain compatibility

### 6. Error Handling Strategy

**Decision**: Three-tier error handling: validation → retry → graceful failure

**Rationale**:

- Early validation prevents wasted time on invalid configs
- Retry logic handles transient provider issues
- Graceful failure allows partial results and debugging

**Tiers**:

1. **Validation errors**: Schema violations, missing env vars → immediate exit
2. **Retryable errors**: Timeouts, rate limits → retry with backoff
3. **Test failures**: Invalid responses, grading failures → record in results, continue

**Implementation**:

```typescript
try {
  validateConfig(config); // Tier 1: Fail fast
} catch (error) {
  console.error("Configuration error:", error.message);
  process.exit(1);
}

for (const testCase of testCases) {
  try {
    const result = await retryWithBackoff(
      // Tier 2: Retry
      () => runTestCase(testCase),
      { maxRetries: options.maxRetries },
    );
    results.push(result);
  } catch (error) {
    results.push({
      // Tier 3: Record failure, continue
      testCase,
      error: error.message,
      status: "failed",
    });
  }
}
```

## Risks / Trade-offs

### Risk: VS Code Copilot Reliability

- **Issue**: VS Code Copilot integration depends on subagent library and VS Code being available
- **Mitigation**: Provide clear error messages when dependencies missing; document VS Code setup requirements
- **Fallback**: Mock provider works without VS Code for testing workflows

### Risk: Ax Framework Learning Curve

- **Issue**: Team may be unfamiliar with Ax patterns for LLM orchestration
- **Mitigation**: Document Ax usage patterns; provide examples; keep Ax usage isolated in grading module
- **Trade-off**: Accept learning curve in exchange for structured outputs and reliability

### Risk: Type Safety Overhead

- **Issue**: Strict TypeScript may slow initial development
- **Mitigation**: Use Zod for runtime validation aligned with TypeScript types; incremental typing acceptable
- **Trade-off**: Accept slower development for better runtime safety and IDE support

### Risk: Incomplete Migration

- **Issue**: Partial migration leaves team supporting two implementations
- **Mitigation**: Complete all phases before deprecating Python; document migration status clearly
- **Trade-off**: Temporary duplication vs premature deprecation

## Migration Plan

### Phase 1: Isolated Development

- Implement evaluation pipeline, grading, and CLI in TypeScript
- Test against same fixtures used by Python version
- Compare outputs to ensure parity

### Phase 2: Parallel Operation

- Run both implementations on real test suites
- Validate consistency of results
- Document any intentional differences

### Phase 3: Transition

- Update documentation to prefer TypeScript version
- Add deprecation notice to Python version
- Monitor for issues and rollback capability

### Phase 4: Python Deprecation

- Archive Python implementation
- Remove from active development
- Maintain for emergency fallback only

### Rollback Plan

If critical issues arise:

1. Document the issue with reproducible test case
2. Add issue to TypeScript backlog
3. Revert documentation to recommend Python version
4. Fix TypeScript implementation
5. Re-validate and transition again

## Open Questions

1. **Package distribution**: Should we publish `@agentevo/cli` to npm, or keep it monorepo-only?

   - **Proposed answer**: Start monorepo-only; add npm publishing if external demand emerges

2. **Performance benchmarks**: What performance targets should we set vs Python?

   - **Proposed answer**: Match Python speed ±20%; optimize if user complaints emerge

3. **Extended grading**: Should we support custom grading functions?

   - **Proposed answer**: Defer to post-parity; add if users request it

4. **Results format**: Should we maintain exact JSONL format or enhance it?
   - **Proposed answer**: Maintain exact format for compatibility; consider v2 format later
