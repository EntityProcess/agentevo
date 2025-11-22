# Simple Example - AgentV Schema

This directory demonstrates AgentV's eval schema with complete, working examples.

## Directory Structure

```
simple/
├── .env.template                   # Environment configuration template
├── .gitignore                      # Git ignore rules
├── README.md                       # This file
├── evals/                          # Evaluation test cases
│   ├── example-eval.yaml           # Main schema example
│   └── snippets/                   # Code snippets for evals
│       └── python-second-largest.md
├── evaluators/                     # Evaluator components
│   ├── prompts/                    # LLM judge prompt templates
│   │   └── code-correctness-judge.md    # Semantic code evaluation
│   └── scripts/                    # Code-based evaluators
│       └── check_python_keywords.py     # Python validator script
├── optimizers/                     # Optimizer configurations
│   ├── ace-code-generation.yaml    # ACE optimization config
│   └── playbooks/                  # ACE learned knowledge (generated)
│       └── code-generation.json    # Structured optimization insights
└── prompts/                        # Shared instruction files
    ├── javascript.instructions.md  # JavaScript guidelines
    └── python.instructions.md      # Python guidelines
```

## Key Files

### Evaluation Files (`evals/`)

- **`example-eval.yaml`**: Complete schema demonstration showing:
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
  - Input: JSON with eval case data via stdin
  - Output: JSON with score, passed flag, and reasoning
  - Example: `check_python_keywords.py` validates Python code quality

- **`prompts/`**: LLM judge prompt templates (Markdown)
  - Define how an LLM should evaluate outputs
  - Include scoring guidelines and output format
  - Example: `code-correctness-judge.md` for semantic code review

### Shared Instruction Files (`prompts/`)

- **`python.instructions.md`**: Python coding guidelines
- **`javascript.instructions.md`**: JavaScript coding guidelines
- These instruction files can be referenced in eval files to provide context

## Running Examples

### Basic Evaluation

```bash
# Run all evals in this directory
agentv eval evals/

# Run specific eval file
agentv eval evals/example-eval.yaml

# Run with specific target
agentv eval evals/example-eval.yaml --target azure_base
```

### CLI provider sample

The bundled `.agentv/targets.yaml` includes a `local_cli` target that shells out to an existing CLI. Placeholders `{PROMPT}`, `{GUIDELINES}`, `{EVAL_ID}`, `{ATTEMPT}`, and `{FILES}` are shell-escaped automatically; adjust `files_format` (`{path}`/`{basename}`) and optional `healthcheck`/`timeout_seconds` to match your CLI's expectations.

To try it locally:

```bash
# 1) Ensure uv is available (CLI uses mock_cli.py via `uv run`)
# 2) Set PROJECT_ROOT/LOCAL_AGENT_TOKEN in .env (PROJECT_ROOT should point here)
# 3) Ensure your judge provider env (azure_base) is set for llm_judge grading
# 4) Run the demo eval with the CLI provider target
agentv eval evals/cli-provider-demo.yaml --target local_cli
```

### Codex CLI provider sample

The sample `codex_cli` target demonstrates how to drive the standalone Codex CLI from AgentV.

1. Install the `codex` CLI (follow the official `codex-cli` README) and run `codex configure` so `~/.codex/config` exists.
2. Export either `OPENAI_API_KEY` or `CODEX_API_KEY`, plus optional `CODEX_PROFILE`, `CODEX_MODEL`, and `CODEX_APPROVAL_PRESET` values (see `.env.template`).
3. (Optional) Set `CODEX_CLI_PATH` if the `codex` executable is not already on your `PATH`.
4. Run an eval with the Codex target:

```bash
agentv eval evals/example-eval.yaml --target codex_cli
```

AgentV mirrors guideline and attachment files into the Codex workspace and passes the combined prompt to `codex exec --json`, so preread links behave the same way as the VS Code provider.

### With Optimization (Future)

```bash
# Run ACE optimization using optimizer config
agentv optimize optimizers/ace-code-generation.yaml
```

## Key Features

### 1. Clear Message Separation

```yaml
input_messages:  # Input only
  - role: user
    content: "Request"
expected_messages:  # Expected output only
  - role: assistant
    content: "Expected response"
```

### 2. Multiple Evaluators

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
        value: ../prompts/python.instructions.md
```

Keeps eval files clean while supporting rich context.

## Writing Custom Evaluators

### Code Evaluator I/O Contract

Code evaluators receive input via stdin and write output to stdout as JSON.

**Input Format (via stdin):**
```json
{
  "task": "string describing the task",
  "outcome": "expected outcome description",
  "expected": "expected output string",
  "output": "generated code/text from the agent",
  "system_message": "system message if any",
  "guideline_paths": ["path1", "path2"],
  "attachments": ["file1", "file2"],
  "user_segments": [{"type": "text", "value": "..."}]
}
```

**Output Format (to stdout):**
```json
{
  "score": 0.85,
  "hits": ["list of successful checks"],
  "misses": ["list of failed checks"],
  "reasoning": "explanation of the score"
}
```

**Key Points:**
- Evaluators receive **full context** but should select only relevant fields
- Most evaluators only need `output` field - ignore the rest to avoid false positives
- Complex evaluators can use `task`, `expected`, or `guideline_paths` for context-aware validation
- Score range: `0.0` to `1.0` (float)
- `hits` and `misses` are optional but recommended for debugging

### Code Evaluator Script Template

```python
#!/usr/bin/env python3
import json
import sys

def evaluate(input_data):
    # Extract only the fields you need
    output = input_data.get("output", "")
    
    # Your validation logic here
    score = 0.0  # to 1.0
    hits = ["successful check 1", "successful check 2"]
    misses = ["failed check 1"]
    reasoning = "Explanation of score"
    
    return {
        "score": score,
        "hits": hits,
        "misses": misses,
        "reasoning": reasoning
    }

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = evaluate(input_data)
        print(json.dumps(result, indent=2))
    except Exception as e:
        error_result = {
            "score": 0.0,
            "hits": [],
            "misses": [f"Evaluator error: {str(e)}"],
            "reasoning": f"Evaluator error: {str(e)}"
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)
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

## Next Steps

- Review `example-eval.yaml` to understand the schema
- Create your own eval cases following the schema
- Write custom evaluator scripts for domain-specific validation
- Create LLM judge templates for semantic evaluation
- Set up optimizer configs when ready to improve prompts

## Resources

- [AgentV Documentation](../../../README.md)
- [Schema Specification](../../openspec/changes/update-eval-schema-v2/)
- [Ax ACE Documentation](https://github.com/ax-llm/ax/blob/main/docs/ACE.md)
