# AgentEvo

A TypeScript-based AI agent evaluation and optimization framework using YAML specifications to score task completion. Built for modern development workflows with first-class support for VS Code Copilot, Azure OpenAI, Anthropic, and Google Gemini.

## Installation and Setup

### Installation for End Users

This is the recommended method for users who want to use `agentevo` as a command-line tool.

1. Install via npm:

```bash
# Install globally
npm install -g agentevo

# Or use npx to run without installing
npx agentevo --help
```

2. Verify the installation:

```bash
agentevo --help
```

### Local Development Setup

Follow these steps if you want to contribute to the `agentevo` project itself. This workflow uses pnpm workspaces and an editable install for immediate feedback.

1. Clone the repository and navigate into it:

```bash
git clone https://github.com/EntityProcess/agentevo.git
cd agentevo
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
   - Copy [targets.yaml](docs/examples/simple/.agentevo/targets.yaml) to `.agentevo/targets.yaml`
   - Update the environment variable names in targets.yaml to match those defined in your `.env` file

## Quick Start

Run eval (target auto-selected from test file or CLI override):

```bash
# If your test.yaml contains "target: azure_base", it will be used automatically
agentevo eval "path/to/test.yaml"

# Override the test file's target with CLI flag
agentevo eval --target vscode_projectx "path/to/test.yaml"
```

Run a specific test case with custom targets path:

```bash
agentevo eval --target vscode_projectx --targets "path/to/targets.yaml" --test-id "my-test-case" "path/to/test.yaml"
```

### Command Line Options

- `test_file`: Path to test YAML file (required, positional argument)
- `--target TARGET`: Execution target name from targets.yaml (overrides target specified in test file)
- `--targets TARGETS`: Path to targets.yaml file (default: ./.agentevo/targets.yaml)
- `--test-id TEST_ID`: Run only the test case with this specific ID
- `--out OUTPUT_FILE`: Output file path (default: results/{testname}_{timestamp}.jsonl)
- `--format FORMAT`: Output format: 'jsonl' or 'yaml' (default: jsonl)
- `--dry-run`: Run with mock model for testing
- `--agent-timeout SECONDS`: Timeout in seconds for agent response polling (default: 120)
- `--max-retries COUNT`: Maximum number of retries for timeout cases (default: 2)
- `--cache`: Enable caching of LLM responses (default: disabled)
- `--dump-prompts`: Save all prompts to `.agentevo/prompts/` directory
- `--verbose`: Verbose output

### Target Selection Priority

The CLI determines which execution target to use with the following precedence:

1. CLI flag override: `--target my_target` (when provided and not 'default')
2. Test file specification: `target: my_target` key in the .test.yaml file
3. Default fallback: Uses the 'default' target (original behavior)

This allows test files to specify their preferred target while still allowing command-line overrides for flexibility, and maintains backward compatibility with existing workflows.

Output goes to `.agentevo/results/{testname}_{timestamp}.jsonl` (or `.yaml`) unless `--out` is provided.

### Tips for VS Code Copilot Evals

**Workspace Switching:** The runner automatically switches to the target workspace when running evals. Make sure you're not actively using another VS Code instance, as this could cause prompts to be injected into the wrong workspace.

**Recommended Models:** Use Claude Sonnet 4.5 or Grok Code Fast 1 for best results, as these models are more consistent in following instruction chains.

## Requirements

- Node.js 20.0.0 or higher
- Environment variables for your chosen providers (configured via targets.yaml)

Environment keys (configured via targets.yaml):

- **Azure OpenAI:** Set environment variables specified in your target's `settings.endpoint`, `settings.api_key`, and `settings.model`
- **Anthropic Claude:** Set environment variables specified in your target's `settings.api_key` and `settings.model`
- **Google Gemini:** Set environment variables specified in your target's `settings.api_key` and optional `settings.model`
- **VS Code:** Set environment variable specified in your target's `settings.workspace_env` → `.code-workspace` path

## Targets and Environment Variables

Execution targets in `.agentevo/targets.yaml` decouple tests from providers/settings and provide flexible environment variable mapping.

### Target Configuration Structure

Each target specifies:

- `name`: Unique identifier for the target
- `provider`: The model provider (`azure`, `anthropic`, `gemini`, `vscode`, `vscode-insiders`, or `mock`)
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

**Anthropic targets:**

```yaml
- name: anthropic_base
  provider: anthropic
  settings:
    api_key: "ANTHROPIC_API_KEY"
    model: "ANTHROPIC_MODEL"
```

**Google Gemini targets:**

```yaml
- name: gemini_base
  provider: gemini
  settings:
    api_key: "GOOGLE_API_KEY"
    model: "GOOGLE_GEMINI_MODEL"  # Optional, defaults to gemini-2.0-flash-exp
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

## Timeout Handling and Retries

When using VS Code or other AI agents that may experience timeouts, the evaluator includes automatic retry functionality:

- **Timeout detection:** Automatically detects when agents timeout
- **Automatic retries:** When a timeout occurs, the same test case is retried up to `--max-retries` times (default: 2)
- **Retry behavior:** Only timeouts trigger retries; other errors proceed to the next test case
- **Timeout configuration:** Use `--agent-timeout` to adjust how long to wait for agent responses

Example with custom timeout settings:

```bash
agentevo eval evals/projectx/example.yaml --target vscode_projectx --agent-timeout 180 --max-retries 3
```

## How the Evals Work

For each test case in a `.yaml` file:

1. Parse YAML and collect user messages (inline text and referenced files)
2. Extract code blocks from text for structured prompting
3. Generate a candidate answer via the configured provider/model
4. Score against the expected answer using AI-powered quality grading
5. Output results in JSONL or YAML format with detailed metrics

### VS Code Copilot Target

- Opens your configured workspace and uses the `subagent` library to programmatically invoke VS Code Copilot
- The prompt is built from the `.yaml` user content (task, files, code blocks)
- Copilot is instructed to complete the task within the workspace context
- Results are captured and scored automatically

## Scoring and Outputs

Run with `--verbose` to print detailed information and stack traces on errors.

### Scoring Methodology

AgentEvo uses an AI-powered quality grader that:

- Extracts key aspects from the expected answer
- Compares model output against those aspects
- Provides detailed hit/miss analysis with reasoning
- Returns a normalized score (0.0 to 1.0)

### Output Formats

**JSONL format (default):**

- One JSON object per line (newline-delimited)
- Fields: `test_id`, `score`, `hits`, `misses`, `model_answer`, `expected_aspect_count`, `target`, `timestamp`, `reasoning`, `raw_request`, `grader_raw_request`

**YAML format (with `--format yaml`):**

- Human-readable YAML documents
- Same fields as JSONL, properly formatted for readability
- Multi-line strings use literal block style

### Summary Statistics

After running all test cases, AgentEvo displays:

- Mean, median, min, max scores
- Standard deviation
- Distribution histogram
- Total test count and execution time

## Architecture

AgentEvo is built as a TypeScript monorepo using:

- **pnpm workspaces:** Efficient dependency management
- **Turbo:** Build system and task orchestration
- **@ax-llm/ax:** Unified LLM provider abstraction
- **Vercel AI SDK:** Streaming and tool use capabilities
- **Zod:** Runtime type validation
- **Commander.js:** CLI argument parsing
- **Vitest:** Testing framework

### Package Structure

- `@agentevo/core` - Core evaluation engine, providers, grading logic
- `agentevo` - Main package that bundles CLI functionality

## Troubleshooting

### Installation Issues

**Problem:** Package installation fails or command not found.

**Solution:**

```bash
# Clear npm cache and reinstall
npm cache clean --force
npm uninstall -g agentevo
npm install -g agentevo

# Or use npx without installing
npx agentevo@latest --help
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

- [subagent](https://github.com/christso/subagent) - VS Code Copilot programmatic interface
- [Ax](https://github.com/axflow/axflow) - TypeScript LLM framework
