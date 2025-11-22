# AgentV

A TypeScript-based AI agent evaluation and optimization framework using YAML specifications to score task completion. Built for modern development workflows with first-class support for VS Code Copilot, OpenAI Codex CLI and Azure OpenAI.

## Installation and Setup

### Installation for End Users

This is the recommended method for users who want to use `agentv` as a command-line tool.

1. Install via npm:

```bash
# Install globally
npm install -g agentv

# Or use npx to run without installing
npx agentv --help
```

2. Verify the installation:

```bash
agentv --help
```

### Local Development Setup

Follow these steps if you want to contribute to the `agentv` project itself. This workflow uses pnpm workspaces and an editable install for immediate feedback.

1. Clone the repository and navigate into it:

```bash
git clone https://github.com/EntityProcess/agentv.git
cd agentv
```

2. Install dependencies:

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Install all workspace dependencies
pnpm install
```

3. Build the project:

```bash
pnpm build
```

4. Run tests:

```bash
pnpm test
```

You are now ready to start development. The monorepo contains:

- `packages/core/` - Core evaluation engine
- `apps/cli/` - Command-line interface

### Environment Setup

1. Configure environment variables:
   - Copy [.env.template](docs/examples/simple/.env.template) to `.env` in your project root
   - Fill in your API keys, endpoints, and other configuration values

2. Set up targets:
   - Copy [targets.yaml](docs/examples/simple/.agentv/targets.yaml) to `.agentv/targets.yaml`
   - Update the environment variable names in targets.yaml to match those defined in your `.env` file

## Quick Start

### Configuring Guideline Patterns

AgentV automatically detects guideline files and treats them differently from regular file content. You can customize which files are considered guidelines using an optional `.agentv/config.yaml` configuration file.

**Config file discovery:**
- AgentV searches for `.agentv/config.yaml` starting from the eval file's directory
- Walks up the directory tree to the repository root
- Uses the first config file found (similar to how `targets.yaml` is discovered)
- This allows you to place one config file at the project root for all evals

**Custom patterns** (create `.agentv/config.yaml` in same directory as your eval file):

```yaml
# .agentv/config.yaml
guideline_patterns:
  - "**/*.guide.md"           # Match all .guide.md files
  - "**/guidelines/**"        # Match all files in /guidelines/ dirs
  - "docs/AGENTS.md"          # Match specific files
  - "**/*.rules.md"           # Match by naming convention
```

See [config.yaml example](docs/examples/simple/.agentv/config.yaml) for more pattern examples.

### Validating Eval Files

Validate your eval and targets files before running them:

```bash
# Validate a single file
agentv validate evals/my-eval.yaml

# Validate multiple files
agentv validate evals/eval1.yaml evals/eval2.yaml

# Validate entire directory (recursively finds all YAML files)
agentv validate evals/
```

**File type detection:**

All AgentV files must include a `$schema` field:

```yaml
# Eval files
$schema: agentv-eval-v2
evalcases:
  - id: eval-1
    # ...

# Targets files
$schema: agentv-targets-v2
targets:
  - name: default
    # ...
```

Files without a `$schema` field will be rejected with a clear error message.

### Running Evals

Run eval (target auto-selected from eval file or CLI override):

```bash
# If your eval.yaml contains "target: azure_base", it will be used automatically
agentv eval "path/to/eval.yaml"

# Override the eval file's target with CLI flag
agentv eval --target vscode_projectx "path/to/eval.yaml"
```

Run a specific eval case with custom targets path:

```bash
agentv eval --target vscode_projectx --targets "path/to/targets.yaml" --eval-id "my-eval-case" "path/to/eval.yaml"
```

### Command Line Options

- `eval_file`: Path to eval YAML file (required, positional argument)
- `--target TARGET`: Execution target name from targets.yaml (overrides target specified in eval file)
- `--targets TARGETS`: Path to targets.yaml file (default: ./.agentv/targets.yaml)
- `--eval-id EVAL_ID`: Run only the eval case with this specific ID
- `--out OUTPUT_FILE`: Output file path (default: results/{evalname}_{timestamp}.jsonl)
- `--format FORMAT`: Output format: 'jsonl' or 'yaml' (default: jsonl)
- `--dry-run`: Run with mock model for testing
- `--agent-timeout SECONDS`: Timeout in seconds for agent response polling (default: 120)
- `--max-retries COUNT`: Maximum number of retries for timeout cases (default: 2)
- `--cache`: Enable caching of LLM responses (default: disabled)
- `--dump-prompts`: Save all prompts to `.agentv/prompts/` directory
- `--verbose`: Verbose output

### Target Selection Priority

The CLI determines which execution target to use with the following precedence:

1. CLI flag override: `--target my_target` (when provided and not 'default')
2. Eval file specification: `target: my_target` key in the .eval.yaml file
3. Default fallback: Uses the 'default' target (original behavior)

This allows eval files to specify their preferred target while still allowing command-line overrides for flexibility, and maintains backward compatibility with existing workflows.

Output goes to `.agentv/results/{evalname}_{timestamp}.jsonl` (or `.yaml`) unless `--out` is provided.

### Tips for VS Code Copilot Evals

**Workspace Switching:** The runner automatically switches to the target workspace when running evals. Make sure you're not actively using another VS Code instance, as this could cause prompts to be injected into the wrong workspace.

**Recommended Models:** Use Claude Sonnet 4.5 or Grok Code Fast 1 for best results, as these models are more consistent in following instruction chains.

## Targets and Environment Variables

Execution targets in `.agentv/targets.yaml` decouple evals from providers/settings and provide flexible environment variable mapping.

### Target Configuration Structure

Each target specifies:

- `name`: Unique identifier for the target
- `provider`: The model provider (`azure`, `anthropic`, `gemini`, `codex`, `vscode`, `vscode-insiders`, `cli`, or `mock`)
- `settings`: Environment variable names to use for this target

### Examples

**Azure OpenAI targets:**

```yaml
- name: azure_base
  provider: azure
  settings:
    endpoint: "AZURE_OPENAI_ENDPOINT"
    api_key: "AZURE_OPENAI_API_KEY"
    model: "AZURE_DEPLOYMENT_NAME"
```

**VS Code targets:**

```yaml
- name: vscode_projectx
  provider: vscode
  settings:
    workspace_env: "EVAL_PROJECTX_WORKSPACE_PATH"

- name: vscode_insiders_projectx
  provider: vscode-insiders
  settings:
    workspace_env: "EVAL_PROJECTX_WORKSPACE_PATH"
```

**CLI targets (template-based):**

```yaml
- name: local_cli
  provider: cli
  settings:
    command_template: 'somecommand {PROMPT} {FILES}'
    files_format: '--file {path}'
    cwd: PROJECT_ROOT               # optional working directory
    env:                            # merged into process.env
      API_TOKEN: LOCAL_AGENT_TOKEN
    timeout_seconds: 30             # optional per-command timeout
    healthcheck:
      type: command                 # or http
      command_template: code --version
```

**Codex CLI targets:**

```yaml
- name: codex_cli
  provider: codex
  settings:
    executable: "CODEX_CLI_PATH"     # defaults to `codex` if omitted
    profile: "CODEX_PROFILE"         # matches the profile in ~/.codex/config
    model: "CODEX_MODEL"             # optional, falls back to profile default
    approval_preset: "CODEX_APPROVAL_PRESET"
    timeout_seconds: 180
    cwd: CODEX_WORKSPACE_DIR
```

Codex targets require the standalone `codex` CLI and a configured profile (via `codex configure`) so credentials are stored in `~/.codex/config` (or whatever path the CLI already uses). AgentV mirrors all guideline and attachment files into a fresh scratch workspace, so the `file://` preread links remain valid even when the CLI runs outside your repo tree.
Confirm the CLI works by running `codex exec --json --profile <name> "ping"` (or any supported dry run) before starting an eval. This prints JSONL events; seeing `item.completed` messages indicates the CLI is healthy.

## Timeout Handling and Retries

When using VS Code or other AI agents that may experience timeouts, the evaluator includes automatic retry functionality:

- **Timeout detection:** Automatically detects when agents timeout
- **Automatic retries:** When a timeout occurs, the same eval case is retried up to `--max-retries` times (default: 2)
- **Retry behavior:** Only timeouts trigger retries; other errors proceed to the next eval case
- **Timeout configuration:** Use `--agent-timeout` to adjust how long to wait for agent responses

Example with custom timeout settings:

```bash
agentv eval evals/projectx/example.yaml --target vscode_projectx --agent-timeout 180 --max-retries 3
```

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

## Next Steps

- Review `docs/examples/simple/evals/example-eval.yaml` to understand the schema
- Create your own eval cases following the schema
- Write custom evaluator scripts for domain-specific validation
- Create LLM judge templates for semantic evaluation
- Set up optimizer configs when ready to improve prompts

## Resources

- [Simple Example README](docs/examples/simple/README.md)
- [Schema Specification](docs/openspec/changes/update-eval-schema-v2/)
- [Ax ACE Documentation](https://github.com/ax-llm/ax/blob/main/docs/ACE.md)

## Scoring and Outputs

Run with `--verbose` to print detailed information and stack traces on errors.

### Scoring Methodology

AgentV uses an AI-powered quality grader that:

- Extracts key aspects from the expected answer
- Compares model output against those aspects
- Provides detailed hit/miss analysis with reasoning
- Returns a normalized score (0.0 to 1.0)

### Output Formats

**JSONL format (default):**

- One JSON object per line (newline-delimited)
- Fields: `eval_id`, `score`, `hits`, `misses`, `model_answer`, `expected_aspect_count`, `target`, `timestamp`, `reasoning`, `raw_request`, `grader_raw_request`

**YAML format (with `--format yaml`):**

- Human-readable YAML documents
- Same fields as JSONL, properly formatted for readability
- Multi-line strings use literal block style

### Summary Statistics

After running all eval cases, AgentV displays:

- Mean, median, min, max scores
- Standard deviation
- Distribution histogram
- Total eval count and execution time

## Architecture

AgentV is built as a TypeScript monorepo using:

- **pnpm workspaces:** Efficient dependency management
- **Turbo:** Build system and task orchestration
- **@ax-llm/ax:** Unified LLM provider abstraction
- **Vercel AI SDK:** Streaming and tool use capabilities
- **Zod:** Runtime type validation
- **Commander.js:** CLI argument parsing
- **Vitest:** Testing framework

### Package Structure

- `@agentv/core` - Core evaluation engine, providers, grading logic
- `agentv` - Main package that bundles CLI functionality

## Troubleshooting

### Installation Issues

**Problem:** Package installation fails or command not found.

**Solution:**

```bash
# Clear npm cache and reinstall
npm cache clean --force
npm uninstall -g agentv
npm install -g agentv

# Or use npx without installing
npx agentv@latest --help
```

### VS Code Integration Issues

**Problem:** VS Code workspace doesn't open or prompts aren't injected.

**Solution:**

- Ensure the `subagent` package is installed (should be automatic)
- Verify your workspace path in `.env` is correct and points to a `.code-workspace` file
- Close any other VS Code instances before running evals
- Use `--verbose` flag to see detailed workspace switching logs

### Provider Configuration Issues

**Problem:** API authentication errors or missing credentials.

**Solution:**

- Double-check environment variables in your `.env` file
- Verify the variable names in `targets.yaml` match your `.env` file
- Use `--dry-run` first to test without making API calls
- Check provider-specific documentation for required environment variables

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [subagent](https://github.com/EntityProcess/subagent) - VS Code Copilot programmatic interface
- [Ax](https://github.com/axflow/axflow) - TypeScript LLM framework
