# Design: Eval Schema V2 Migration

## Context

The current eval schema (V1) uses a simple structure with `testcases`, flat `messages` arrays, and implicit configuration inheritance. As AgentEvo evolves to support advanced features like ACE optimization, conversation threading, and template-based evaluation, we need a more structured schema that:

- Explicitly declares execution configuration at appropriate levels
- Supports conversation-based organization for multi-turn scenarios
- Enables pluggable optimization frameworks (starting with ACE)
- Separates input messages from expected output messages
- Aligns with modern eval framework conventions (similar to LangSmith, Braintrust, etc.)

**Stakeholders**: AgentEvo users, ACE framework integrators, eval pipeline maintainers

**Constraints**:
- V1 format will not be supported (clean break to V2)
- Minimize migration effort for existing eval files through clear documentation
- Keep parsing performance acceptable (no significant overhead)
- Preserve ability to run evals without optimization enabled

## Goals / Non-Goals

**Goals**:
- Define V2 schema supporting conversation threading, execution config, and optimization
- Enable ACE optimization framework integration
- Support template-based evaluators with configurable models
- Provide migration guide documenting V1 to V2 changes
- Reject V1 format with clear error message and migration guidance

**Non-Goals**:
- Backward compatibility with V1 format (clean break)
- Automatic conversion of V1 files to V2 (user responsibility)
- Full ACE implementation in this change (stub the integration points only)
- Multi-language support in templates (English only for now)
- Custom optimization frameworks beyond ACE (future work)

## Decisions

### Decision 1: Top-Level Field Rename (`testcases` → `evalcases`)

**Rationale**: "Eval case" better reflects the purpose (evaluation scenario) vs "test case" (unit test). Also aligns with `execution.evaluator` naming.

**Alternatives considered**:
- Keep `testcases`: Rejected - perpetuates legacy naming, harder to distinguish V1/V2
- Use `scenarios`: Rejected - too generic, conflicts with requirement scenarios
- Use `cases`: Rejected - ambiguous without context

**Migration**: V1 format (files with `testcases` key) will be rejected with a clear error message directing users to the migration guide.

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
  optimization:
    type: ace  # Future: genetic, bayesian, etc.
    playbook_path: ./playbooks/triage.json
    max_epochs: 2
    max_reflector_rounds: 2
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

**Rationale**: Enables grouping related eval cases (e.g., variations of same scenario, multi-step workflows). Useful for:
- Analytics (aggregate scores by conversation)
- Optimization (treat related cases as cohort)
- Reporting (group results in UI)

**Usage**:
```yaml
evalcases:
  - id: incident-triage-step-1
    conversation_id: incident-triage-playbook
    ...
  - id: incident-triage-step-2
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
- AgentEvo is early-stage; limited existing eval files to migrate
- Breaking change is acceptable at this maturity level

**Alternatives considered**:
- Auto-detection with V1 support: Rejected - adds complexity for minimal benefit
- Gradual deprecation: Rejected - delays cleanup, confuses users

**Trade-offs**:
- ✅ Simpler implementation and maintenance
- ✅ Cleaner architecture without legacy code
- ✅ Easier to document and understand
- ❌ Users must manually update existing eval files

## Risks / Trade-offs

### Risk: Breaking Changes in Production Pipelines

**Impact**: High - Users with automated eval pipelines will break if they upgrade without updating files

**Mitigation**:
- Document as BREAKING CHANGE in release notes
- Provide clear migration guide with before/after examples
- Version bump to indicate breaking change (e.g., 0.x → 1.0 or major version)
- Consider providing conversion script to automate migration

### Risk: ACE Integration Complexity

**Impact**: Medium - ACE framework may have different requirements than stubbed interface

**Mitigation**:
- Design optimization config as extensible dict (ACE can add custom fields)
- Keep optimization block optional (defaults to no optimization)
- Defer full ACE implementation to separate change
- Coordinate with ACE team on config schema before implementation

### Risk: Template Rendering Performance

**Impact**: Low - Loading/rendering templates per eval case could slow down large suites

**Mitigation**:
- Cache loaded templates by path
- Use streaming rendering where possible
- Add optional `--skip-templates` flag for debugging

### Trade-off: Schema Complexity vs Flexibility

**Decision**: Favor flexibility with explicit structure over simplicity

**Reasoning**: AgentEvo is evolving toward production-grade eval platform. Power users need fine-grained control, and clear structure aids maintainability. Beginners can use defaults and ignore advanced features.

## Migration Plan

### Implementation (Current Change)

1. Replace existing YAML parser with V2-only implementation
2. Update type definitions to V2 schema
3. Update all bundled examples to V2 format
4. Document V1→V2 migration guide with field mappings
5. Update CLI help text and error messages for V2

### User Migration Steps

1. Review migration guide in documentation
2. Update eval files:
   - `testcases` → `evalcases`
   - `messages` → `input_messages` + `expected_messages`
   - Add optional `conversation_id`, `execution` blocks as needed
3. Test updated files with `agentevo eval --dry-run`
4. Run production evals

### Rollback Plan

If critical issues arise:
- Revert to previous version of agentevo (with V1 support)
- Users can stay on old version until issues resolved
- Fix V2 parser and re-release
- Note: Once upgraded, users cannot downgrade without reverting their eval files to V1 format

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

4. **Should optimization config support multiple strategies in one eval?**
   - Proposal: No - one optimization type per eval case
   - Rationale: Simplifies implementation, unclear use case for mixing strategies
