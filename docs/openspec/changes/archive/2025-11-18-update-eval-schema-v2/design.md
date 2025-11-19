# Design: Eval Schema V2 Migration

## Context

The current eval schema (V1) uses a simple structure with `testcases`, flat `messages` arrays, and implicit configuration inheritance. As AgentV evolves to support advanced features like conversation threading and template-based evaluation, we need a more structured schema that:

- Explicitly declares execution configuration at appropriate levels
- Supports conversation-based organization for multi-turn scenarios
- Separates input messages from expected output messages
- Aligns with modern eval framework conventions (similar to LangSmith, Braintrust, etc.)
- Provides clean separation between eval definitions and optimization configs

**Stakeholders**: AgentV users, ACE framework integrators, eval pipeline maintainers

**Constraints**:
- V1 format will not be supported (clean break to V2)
- Minimize migration effort for existing eval files through clear documentation
- Keep parsing performance acceptable (no significant overhead)
- Preserve ability to run evals without optimization enabled

## Goals / Non-Goals

**Goals**:
- Define V2 schema supporting conversation threading and execution config
- Support template-based evaluators with configurable models
- Support multiple evaluators per eval case

**Non-Goals**:
- Backward compatibility with V1 format (clean break)
- Automatic conversion of V1 files to V2 (no users to migrate)
- ACE or other optimization framework integration (separate config files, separate change)
- Multi-language support in templates (English only for now)

## Decisions

### Decision 1: Top-Level Field Rename (`testcases` → `evalcases`)

**Rationale**: "Eval case" better reflects the purpose (evaluation scenario) vs "test case" (unit test). Also aligns with `execution.evaluator` naming.

**Alternatives considered**:
- Keep `testcases`: Rejected - perpetuates legacy naming, harder to distinguish V1/V2
- Use `scenarios`: Rejected - too generic, conflicts with requirement scenarios
- Use `cases`: Rejected - ambiguous without context

**Migration**: V1 format (files with `testcases` key) will be rejected with a clear error message.

### Decision 2: Execution Block Structure

**Rationale**: Explicit execution configuration enables:
- Per-case target overrides (useful for A/B testing different models)
- Multiple evaluators per case (e.g., combine code validation, keyword matching, and semantic grading)
- Custom evaluator templates per case (e.g., security-focused vs performance-focused grading)
- Optimization settings scoped to specific cases (ACE might only optimize critical paths)

**Structure**:
```yaml
execution:
  target: azure_base  # Optional, inherits from file-level or default
  evaluators:  # Array of evaluators (each produces a separate score)
    - name: semantic_quality  # Unique identifier for this evaluator's score
      type: llm_judge   # Options: llm_judge, code
      prompt: ./templates/incident-triage-judge.md  # Prompt template file
      model: gpt-5-chat  # Model override for judge
    - name: marker_check  # Second evaluator
      type: code  # Code-based evaluator (regex, script, keyword matching)
      script: ./scripts/check_markers.py
    - name: regex_validation  # Third evaluator
      type: code  # Code-based regex or keyword checking
      script: ./scripts/validate_format.py
```

**Optimization Separation**: ACE and other optimization frameworks will use separate config files (e.g., `opts/ace-code-generation.yaml`) that reference eval files:
```yaml
# opts/ace-code-generation.yaml
type: ace
eval_files:
  - evals/code-generation.test.yaml
  - evals/code-review.test.yaml
playbook_path: ./playbooks/code-generation.json
max_epochs: 5
max_reflector_rounds: 3
allow_dynamic_sections: true
```

**Alternatives considered**:
- Flat structure (all fields at top level): Rejected - cluttered, hard to extend
- Separate `evaluators` and `optimization` top-level keys: Rejected - breaks logical grouping
- Only file-level execution config: Rejected - limits per-case flexibility
- Single evaluator per case: Rejected - DSPy, Promptflow, and ax all support multiple evaluators per test case

**Multiple Evaluators**: Each evaluator has a unique `name` and produces a separate score in the results. This aligns with patterns from DSPy (multiple metrics), Promptflow (evaluators dict), and ax (multi-objective metrics).

**Resolution precedence**: Case-level → File-level → CLI flags → Defaults

### Decision 3: Message Structure (`input_messages` / `expected_messages`)

**Rationale**:
- `input_messages`: Clear separation of input conversation from expected output
- `expected_messages`: Supports multi-turn expected responses (not just single assistant message)
- Array structure enables future extensions (e.g., tool calls, function responses)

**V1 structure** (deprecated):
```yaml
messages:  # Single array containing both input and expected output
  - role: system
    content: ...
  - role: user
    content: ...
  - role: assistant  # This is the expected output
    content: ...
```

**V2 structure**:
```yaml
input_messages:  # Input conversation only
  - role: system
    content: ...
  - role: user
    content: ...
expected_messages:  # Expected output messages
  - role: assistant
    content: ...
```

**Alternatives considered**:
- Keep `messages`, infer expected output from last assistant message: Rejected - implicit behavior is error-prone
- Add `expected_output` field (string): Rejected - doesn't support multi-turn expected responses or tool calls
- Use `prompt` and `completion`: Rejected - doesn't map well to multi-turn conversations
- Separate `system`, `user`, `assistant` arrays: Rejected - loses conversation order

### Decision 4: Conversation ID for Grouping

**Rationale**: The `conversation_id` represents the full conversation that may be split into multiple eval cases. This enables:
- Testing different turns within the same conversation (e.g., intermediate responses vs final response)
- Analytics (aggregate scores by conversation)
- Optimization (treat conversation-level performance as a cohort)
- Reporting (group results in UI)

Most commonly, eval cases test the final response (e.g., `id: final-response`), but conversations with multiple important decision points may have eval cases for intermediate turns.

**Usage**:
```yaml
evalcases:
  - id: incident-triage-step-1
    conversation_id: incident-triage-playbook
    ...
  - id: incident-triage-playbook-final  # Most common: test the final output
    conversation_id: incident-triage-playbook
    ...
```

**Alternatives considered**:
- Nested structure with conversation as parent: Rejected - complicates parsing and flattening
- Tags array: Rejected - less semantic, harder to query
- No grouping: Rejected - loses valuable organizational dimension

### Decision 5: No Backward Compatibility

**Approach**: Clean break to V2 format only

**Rationale**: 
- Simplifies implementation (no dual parser maintenance)
- Clearer codebase without legacy support
- No existing users to migrate
- Clean start with V2 schema only

**Alternatives considered**:
- Auto-detection with V1 support: Rejected - adds complexity for minimal benefit
- Gradual deprecation: Rejected - delays cleanup, confuses users

**Trade-offs**:
- ✅ Simpler implementation and maintenance
- ✅ Cleaner architecture without legacy code
- ✅ Easier to document and understand
- ❌ Users must manually update existing eval files

## Risks / Trade-offs

### Risk: Template Rendering Performance

**Impact**: Low - Loading/rendering templates per eval case could slow down large suites

**Mitigation**:
- Cache loaded templates by path
- Use streaming rendering where possible
- Add optional `--skip-templates` flag for debugging

### Trade-off: Schema Complexity vs Flexibility

**Decision**: Favor flexibility with explicit structure over simplicity

**Reasoning**: AgentV is evolving toward production-grade eval platform. Power users need fine-grained control, and clear structure aids maintainability. Beginners can use defaults and ignore advanced features.

## Implementation Plan

1. Replace existing YAML parser with V2-only implementation
2. Update type definitions to V2 schema
3. Update all bundled examples to V2 format
4. Update CLI help text and error messages for V2
5. Add validation to reject any V1 format files with clear error

## Open Questions

1. **Should `conversation_id` be required or optional?**
   - Proposal: Optional (defaults to eval case ID)
   - Rationale: Not all evals have multi-step conversations

2. **Should we support Jinja2 or Mustache for templates?**
   - Proposal: Start with simple string interpolation, add Jinja2 if needed
   - Rationale: Minimize dependencies, most templates are simple

3. **How to handle partial expected messages (e.g., only check first assistant message)?**
   - Proposal: Add `match_mode: prefix|exact|any` to evaluator config
   - Rationale: Defer to separate change on evaluator improvements

4. **Should optimization configs (ACE, etc.) live in separate files or be part of eval schema?**
   - Decision: Separate files in `opts/` directory that reference eval files
   - Rationale: Clean separation of concerns - evals define test cases, optimization configs define how to improve prompts using those evals
