# Simple Example - AgentEvo V2 Schema

This directory demonstrates AgentEvo's V2 eval schema with complete, working examples.

## Directory Structure

```
simple/
├── evals/                          # Evaluation test cases
│   ├── example-eval.yaml        # Main V2 schema example
│   └── *.yaml                 # Additional eval files
├── evaluators/                     # Evaluator components
│   ├── prompts/                    # LLM judge prompt templates
│   │   ├── code-correctness-judge.md    # Semantic code evaluation
│   │   ├── javascript.instructions.md   # JavaScript guidelines
│   │   └── python.instructions.md       # Python guidelines
│   └── scripts/                    # Code-based evaluators
│       └── check_python_keywords.py     # Python validator script
├── optimizers/                     # Optimizer configurations
│   ├── ace-code-generation.yaml    # ACE optimization config
│   └── playbooks/                  # ACE learned knowledge (generated)
│       └── code-generation.json    # Structured optimization insights
├── prompts/                        # Shared instruction files
└── .agentevo/                      # AgentEvo workspace files
    └── targets.yaml                # Target/provider configuration
```

## Key Files

### Evaluation Files (`evals/`)

- **`example-eval.yaml`**: Complete V2 schema demonstration showing:
  - Basic features: `input_messages`, `expected_messages`
  - File references and content blocks
  - Conversation threading with `conversation_id`
  - Multiple evaluators (code + LLM judge)
  - Target overrides per eval case

### Optimizer Configurations (`optimizers/`)

- **`ace-code-generation.yaml`**: ACE optimization config that references eval files
  - Demonstrates separation between evals (what to test) and optimization (how to improve)
  - Shows ACE-specific settings: playbook path, epochs, reflection rounds
  
- **`playbooks/`**: ACE-generated playbooks (structured learning artifacts)
  - Contains learned optimization insights organized into sections
  - **Important**: Entire playbook is sent in LLM context (no RAG/retrieval)
  - Token-limited by model context window (~5-10k tokens practical limit)
  - Requires periodic consolidation to manage growth
  - Example: `code-generation.json` shows realistic playbook structure

### Evaluator Components (`evaluators/`)

- **`scripts/`**: Code-based evaluators (Python, shell, etc.)
  - Input: JSON with test case data via stdin
  - Output: JSON with score, passed flag, and reasoning
  - Example: `check_python_keywords.py` validates Python code quality

- **`prompts/`**: LLM judge prompt templates and instruction files (Markdown)
  - Define how an LLM should evaluate outputs
  - Include scoring guidelines and output format
  - Example: `code-correctness-judge.md` for semantic code review
  - Also includes instruction files like `python.instructions.md` and `javascript.instructions.md`

## Running Examples

### Basic Evaluation

```bash
# Run all evals in this directory
agentevo eval evals/

# Run specific eval file
agentevo eval evals/example-eval.yaml

# Run with specific target
agentevo eval evals/example-eval.yaml --target azure_base
```

### With Optimization (Future)

```bash
# Run ACE optimization using optimizer config
agentevo optimize optimizers/ace-code-generation.yaml
```

## V2 Schema Features

### 1. Clear Message Separation

**V1 (deprecated)**:
```yaml
messages:  # Mixed input and expected output
  - role: user
    content: "Request"
  - role: assistant  # This was the expected output
    content: "Expected response"
```

**V2**:
```yaml
input_messages:  # Input only
  - role: user
    content: "Request"
expected_messages:  # Expected output only
  - role: assistant
    content: "Expected response"
```

```yaml
execution:
  evaluators:
    - name: keyword_check
      type: code
      script: ../evaluators/scripts/check_python_keywords.py
    - name: semantic_correctness
      type: llm_judge
      prompt: ../evaluators/prompts/code-correctness-judge.md
      model: gpt-4
```   prompt: ./templates/code-correctness-judge.md
      model: gpt-4
```

Each evaluator produces a separate score in the results.

### 3. Conversation Threading

```yaml
evalcases:
  - id: step-1
    conversation_id: multi-step-workflow
    # ...
  - id: step-2
    conversation_id: multi-step-workflow
    # ...
```

The `conversation_id` represents the full conversation that may be split into multiple eval cases. Most commonly, eval cases test the final response (e.g., `id: final-response`), but can also test intermediate conversation turns. This enables analytics and optimization at the conversation level.

### 4. File References

```yaml
input_messages:
  - role: user
    content:
      - type: text
        value: "Main request text"
      - type: file
        value: ../evaluators/prompts/python.instructions.md
```

Keeps eval files clean while supporting rich context.

## Writing Custom Evaluators

### Code Evaluator Script Template

```python
#!/usr/bin/env python3
import json
import sys

def evaluate(input_data):
    output = input_data.get("output", "")
    # Your validation logic here
    score = 0.0 to 1.0
    passed = score >= threshold
    reasoning = "Explanation"
    
    return {"score": score, "passed": passed, "reasoning": reasoning}

if __name__ == "__main__":
    input_data = json.loads(sys.stdin.read())
    result = evaluate(input_data)
    print(json.dumps(result, indent=2))
```

### LLM Judge Template Structure

```markdown
# Judge Name

Evaluation criteria and guidelines...

## Scoring Guidelines
0.9-1.0: Excellent
0.7-0.8: Good
...

## Output Format
{
  "score": 0.85,
  "passed": true,
  "reasoning": "..."
}
```

## ACE Optimization and Playbooks

### How ACE Works

ACE (Automatic Cognitive Enhancement) uses a Generator → Reflector → Curator loop to build structured "playbooks" of learned optimization insights.

**Key Characteristics:**
- **No RAG/Retrieval**: Entire playbook is sent in LLM context on every forward pass
- **Token-Limited**: Practical limit of ~5-10k tokens for playbook size
- **Structured Bullets**: Organized into sections with IDs, tags, and confidence scores
- **Incremental Updates**: Curator applies delta operations (add/modify bullets, not full rewrites)
- **Requires Maintenance**: Periodic consolidation needed to manage growth

### Playbook Structure

```json
{
  "sections": {
    "core_requirements": {
      "bullets": [
        {
          "id": "req-001",
          "content": "Always include type hints...",
          "tags": ["typing", "best-practices"],
          "confidence": 0.95,
          "added_epoch": 1
        }
      ]
    }
  }
}
```

### Token Management Strategies

1. **Delta Updates**: Only add/modify specific bullets, never rewrite entire playbook
2. **Confidence Scores**: Track which bullets are most valuable
3. **Periodic Consolidation**: Merge similar bullets, remove low-confidence items
4. **Section Organization**: Group related insights for readability
5. **Tag System**: Enable cross-referencing without duplication

### When Playbook Grows Too Large

- Archive low-confidence bullets (< 0.7)
- Consolidate related bullets into more general guidance
- Split into multiple specialized playbooks for different contexts
- Consider custom RAG implementation (not built into ACE)

## Migration from V1

Key changes when updating existing eval files:

1. Rename `testcases` → `evalcases`
2. Split `messages` into `input_messages` + `expected_messages`
3. Move optimization config to separate `optimizers/*.yaml` files
4. Optional: Add `conversation_id` for related cases
5. Optional: Add multiple evaluators in `execution.evaluators`

## Next Steps

- Review `example-eval.yaml` to understand the schema
- Create your own eval cases following the V2 format
- Write custom evaluator scripts for domain-specific validation
- Create LLM judge templates for semantic evaluation
- Set up optimizer configs when ready to improve prompts

## Resources

- [AgentEvo Documentation](../../../README.md)
- [V2 Schema Specification](../../openspec/changes/update-eval-schema-v2/)
- [Ax ACE Documentation](https://github.com/ax-llm/ax/blob/main/docs/ACE.md)
