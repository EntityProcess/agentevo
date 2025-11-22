# Design: Rename Grader to Evaluator

## Architecture Changes

### 1. Type System Refactoring

#### Current State
```typescript
// packages/core/src/evaluation/types.ts
export type GraderKind = "llm_judge";
export type EvaluatorKind = "code" | "llm_judge";  // User-facing config

// Two parallel type systems exist
```

#### New State
```typescript
// packages/core/src/evaluation/types.ts
export type EvaluatorKind = "code" | "llm_judge";

// Unified type system - no more GraderKind
```

### 2. Class Hierarchy

#### Current State
```
Grader (interface)
  └── QualityGrader (class)

runCodeEvaluator() (standalone function)
```

#### New State
```
Evaluator (interface)
  ├── LlmJudgeEvaluator (class, renamed from QualityGrader)
  └── CodeEvaluator (class, new)
```

### 3. Context Objects

#### Current State
```typescript
interface GradeContext {
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  // ...
}

interface GradeResult {
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  // ...
}
```

#### New State
```typescript
interface EvaluationContext {
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  // ...
}

interface EvaluationScore {
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  // ...
}
```

## File Structure Changes

### Renames
```
packages/core/src/evaluation/
  grading.ts → evaluators.ts
  types.ts (update exports)
  orchestrator.ts (update imports and usage)
  yaml-parser.ts (update field names)
```

### Updated Exports
```typescript
// packages/core/src/index.ts
export type {
  Evaluator,           // was: Grader
  EvaluationContext,   // was: GradeContext
  EvaluationScore,     // was: GradeResult
  EvaluatorKind,       // keep existing
} from "./evaluation/types.js";

export {
  LlmJudgeEvaluator,  // was: QualityGrader
  CodeEvaluator,      // new
} from "./evaluation/evaluators.js";
```

## Implementation Details

### 1. LlmJudgeEvaluator Class

```typescript
// packages/core/src/evaluation/evaluators.ts

export interface Evaluator {
  readonly kind: string;
  evaluate(context: EvaluationContext): Promise<EvaluationScore> | EvaluationScore;
}

type JudgeProviderResolver = (context: EvaluationContext) => Promise<Provider | undefined>;

export interface LlmJudgeEvaluatorOptions {
  readonly resolveJudgeProvider: JudgeProviderResolver;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly customPrompt?: string;
}

export class LlmJudgeEvaluator implements Evaluator {
  readonly kind = "llm_judge";

  private readonly resolveJudgeProvider: JudgeProviderResolver;
  private readonly maxOutputTokens?: number;
  private readonly temperature?: number;
  private readonly customPrompt?: string;

  constructor(options: LlmJudgeEvaluatorOptions) {
    this.resolveJudgeProvider = options.resolveJudgeProvider;
    this.maxOutputTokens = options.maxOutputTokens;
    this.temperature = options.temperature;
    this.customPrompt = options.customPrompt;
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationScore> {
    // Current QualityGrader.grade() implementation
    // ...
  }
}
```

### 2. CodeEvaluator Class

```typescript
// packages/core/src/evaluation/evaluators.ts

export interface CodeEvaluatorOptions {
  readonly script: string;
  readonly cwd?: string;
  readonly agentTimeoutMs?: number;
}

export class CodeEvaluator implements Evaluator {
  readonly kind = "code";

  private readonly script: string;
  private readonly cwd?: string;
  private readonly agentTimeoutMs?: number;

  constructor(options: CodeEvaluatorOptions) {
    this.script = options.script;
    this.cwd = options.cwd;
    this.agentTimeoutMs = options.agentTimeoutMs;
  }

  async evaluate(context: EvaluationContext): Promise<EvaluationScore> {
    const inputPayload = JSON.stringify({
      task: context.evalCase.task,
      outcome: context.evalCase.outcome,
      expected: context.evalCase.expected_assistant_raw,
      output: context.candidate,
      system_message: context.promptInputs.systemMessage ?? "",
      guideline_paths: context.evalCase.guideline_paths,
      attachments: context.evalCase.file_paths,
      user_segments: context.evalCase.user_segments,
    }, null, 2);

    try {
      const stdout = await executeScript(
        this.script,
        inputPayload,
        this.agentTimeoutMs,
        this.cwd
      );
      const parsed = parseJsonSafe(stdout);
      const score = clampScore(typeof parsed?.score === "number" ? parsed.score : 0);
      const hits = Array.isArray(parsed?.hits) ? parsed.hits.filter(isNonEmptyString) : [];
      const misses = Array.isArray(parsed?.misses) ? parsed.misses.filter(isNonEmptyString) : [];
      const reasoning = typeof parsed?.reasoning === "string" ? parsed.reasoning : undefined;

      return {
        score,
        hits,
        misses,
        expectedAspectCount: hits.length + misses.length || 1,
        reasoning,
        evaluatorRawRequest: {
          script: this.script,
          ...(this.cwd ? { cwd: this.cwd } : {}),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        score: 0,
        hits: [],
        misses: [`Code evaluator failed: ${message}`],
        expectedAspectCount: 1,
        reasoning: message,
        evaluatorRawRequest: {
          script: this.script,
          ...(this.cwd ? { cwd: this.cwd } : {}),
          error: message,
        },
      };
    }
  }
}
```

### 3. Orchestrator Refactoring

```typescript
// packages/core/src/evaluation/orchestrator.ts

async function runEvaluatorsForCase(options: {
  readonly evalCase: EvalCase;
  readonly candidate: string;
  readonly target: ResolvedTarget;
  readonly provider: Provider;
  readonly evaluators: Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator };
  readonly attempt: number;
  readonly promptInputs: { readonly request: string; readonly guidelines: string; readonly systemMessage?: string };
  readonly now: Date;
  readonly judgeProvider?: Provider;
  readonly agentTimeoutMs?: number;
}): Promise<{ score: EvaluationScore; evaluatorResults?: EvaluatorResult[] }> {
  const { evalCase, candidate, target, provider, evaluators, attempt, promptInputs, now, judgeProvider, agentTimeoutMs } =
    options;

  if (evalCase.evaluators && evalCase.evaluators.length > 0) {
    return runEvaluatorList({
      evalCase,
      evaluators: evalCase.evaluators,
      candidate,
      target,
      provider,
      evaluatorRegistry: evaluators,
      attempt,
      promptInputs,
      now,
      judgeProvider,
      agentTimeoutMs,
    });
  }

  // Legacy fallback for old 'grader' field (deprecated)
  const evaluatorKind = evalCase.evaluator ?? evalCase.grader ?? "llm_judge";
  const activeEvaluator = evaluators[evaluatorKind] ?? evaluators.llm_judge;
  if (!activeEvaluator) {
    throw new Error(`No evaluator registered for kind '${evaluatorKind}'`);
  }

  const score = await activeEvaluator.evaluate({
    evalCase,
    candidate,
    target,
    provider,
    attempt,
    promptInputs,
    now,
    judgeProvider,
  });

  return { score };
}
```

### 4. Registry Builder

```typescript
// packages/core/src/evaluation/orchestrator.ts

function buildEvaluatorRegistry(
  overrides: Partial<Record<string, Evaluator>> | undefined,
  resolveJudgeProvider: (target: ResolvedTarget) => Promise<Provider | undefined>,
): Partial<Record<string, Evaluator>> & { readonly llm_judge: Evaluator } {
  const llmJudge =
    overrides?.llm_judge ??
    new LlmJudgeEvaluator({
      resolveJudgeProvider: async (context: EvaluationContext) => {
        return resolveJudgeProvider(context.target);
      },
    });

  return {
    ...overrides,
    llm_judge: llmJudge,
  };
}
```

### 5. Instantiating Code Evaluators

```typescript
// packages/core/src/evaluation/orchestrator.ts

async function runEvaluatorList(options: {
  readonly evalCase: EvalCase;
  readonly evaluators: readonly EvaluatorConfig[];
  // ... other params
}): Promise<{ score: EvaluationScore; evaluatorResults: EvaluatorResult[] }> {
  const { evalCase, evaluators, candidate, agentTimeoutMs, evaluatorRegistry } = options;

  const scored: Array<{ readonly score: EvaluationScore; readonly name: string; readonly type: string }> = [];
  const evaluatorResults: EvaluatorResult[] = [];

  for (const config of evaluators) {
    try {
      if (config.type === "llm_judge") {
        const score = await evaluatorRegistry.llm_judge.evaluate({
          ...buildContext(),
          systemPrompt: await resolveCustomPrompt(config),
          evaluator: config,
          judgeModel: config.model,
        });
        scored.push({ score, name: config.name, type: config.type });
        evaluatorResults.push({ /* ... */ });
        continue;
      }

      if (config.type === "code") {
        const codeEvaluator = new CodeEvaluator({
          script: config.script,
          cwd: config.resolvedCwd ?? config.cwd,
          agentTimeoutMs,
        });
        const score = await codeEvaluator.evaluate({
          evalCase,
          candidate,
          // ... other context
        });
        scored.push({ score, name: config.name, type: config.type });
        evaluatorResults.push({ /* ... */ });
        continue;
      }
    } catch (error) {
      // Error handling
    }
  }

  // Aggregate scores
  return { score: aggregateScores(scored), evaluatorResults };
}
```

## Data Model Changes

### EvalCase Interface

```typescript
export interface EvalCase {
  // ... existing fields
  readonly grader?: GraderKind;         // DEPRECATED: Keep for backward compat
  readonly evaluator?: EvaluatorKind;   // NEW: Preferred field name
  readonly evaluators?: readonly EvaluatorConfig[];
}
```

**Migration path**: Support both `grader` and `evaluator` fields with deprecation warning.

### EvaluationResult Interface

```typescript
export interface EvaluationResult {
  // ... existing fields
  readonly grader_raw_request?: JsonObject;      // DEPRECATED
  readonly evaluator_raw_request?: JsonObject;   // NEW
  readonly evaluator_results?: readonly EvaluatorResult[];
}
```

**Output behavior**: Write both fields during transition period for backward compatibility.

## Testing Strategy

### Unit Tests

1. **Evaluator Classes**
   - Test `LlmJudgeEvaluator.evaluate()`
   - Test `CodeEvaluator.evaluate()`
   - Mock provider calls

2. **Registry Building**
   - Test `buildEvaluatorRegistry()`
   - Test overrides work correctly

3. **Orchestration**
   - Test `runEvaluatorsForCase()`
   - Test legacy `grader` field still works
   - Test new `evaluator` field

### Integration Tests

1. **End-to-end evaluation**
   - Run full evaluation with new API
   - Verify results match expected format

2. **Backward compatibility**
   - Run evaluation with old `grader` field
   - Verify deprecation warnings appear

## Migration Guide Template

```markdown
# Migration Guide: Grader → Evaluator

## Breaking Changes in v0.x.0

### API Changes

#### Type Renames
- `Grader` → `Evaluator`
- `GraderKind` → `EvaluatorKind` (for legacy field only)
- `GradeContext` → `EvaluationContext`
- `GradeResult` → `EvaluationScore`
- `QualityGrader` → `LlmJudgeEvaluator`

#### Function Parameter Renames
- `graders` → `evaluators` in `runEvaluation()`
- `graders` → `evaluators` in `runEvalCase()`

#### Result Field Renames
- `grader_raw_request` → `evaluator_raw_request`

### Migration Examples

**Before:**
```typescript
import { Grader, QualityGrader } from '@agentv/core';

const grader: Grader = new QualityGrader({
  resolveJudgeProvider: async () => provider,
});

await runEvaluation({
  graders: { llm_judge: grader },
  // ...
});
```

**After:**
```typescript
import { Evaluator, LlmJudgeEvaluator } from '@agentv/core';

const evaluator: Evaluator = new LlmJudgeEvaluator({
  resolveJudgeProvider: async (context) => provider,
});

await runEvaluation({
  evaluators: { llm_judge: evaluator },
  // ...
});
```

### YAML Changes

**Before (deprecated but still works):**
```yaml
grader: llm_judge
```

**After (recommended):**
```yaml
evaluators:
  - name: quality
    type: llm_judge
```

### Automated Migration

Use the provided codemod:
```bash
npx @agentv/codemod rename-grader-to-evaluator
```
```
