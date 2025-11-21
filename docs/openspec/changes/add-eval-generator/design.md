# Design: Eval Generator

## Architecture

### CLI Command
`agentv generate <prompt> [options]`
- `prompt`: The high-level description (e.g., "Test the refund policy for a shoe store").
- `--output, -o`: Output file path (default: `generated-eval.yaml`).
- `--count, -n`: Number of cases to generate (default: 5).
- `--target`: The LLM target to use for generation (default: `default`).
- `--context, -c`: One or more file/directory paths to include as context (e.g., `-c ./docs -c ./src/policy.ts`).

### Generator Logic
1.  **Context Gathering**:
    *   Iterate through paths provided via `--context`.
    *   Read file contents (respecting `.gitignore` if possible, or just simple recursive read).
    *   Concatenate file contents into a "Context Block".
2.  **Prompt Construction**:
    *   Load a system prompt (`templates/generator.prompt.md`) that instructs the LLM to be an expert QA engineer.
    *   Inject the user's `<prompt>` and the gathered "Context Block".
    *   Instruct the LLM to output a JSON object matching the `EvalCase` schema.
3.  **Execution**:
    *   **Option A (Default)**: Use the existing `AxAI` provider infrastructure to call a standard LLM (e.g., GPT-4).
    *   **Option B (Agentic)**: If the target is `vscode` or `vscode-insiders`, reuse the `VSCodeProvider` logic from `packages/core/src/evaluation/providers/vscode.ts`.
        *   This allows us to dispatch the generation task to a real VS Code agent (like GitHub Copilot) running inside a subagent instance.
        *   The prompt will be sent as a user query to the agent.
        *   The agent will be instructed to write the YAML to a file or return it in the response.
4.  **Parsing & Validation**:
    *   Parse the JSON/YAML output.
    *   Validate against the `EvalCase` schema.
5.  **Output**:
    *   Write the YAML to the specified output file.

### Adversarial Judge Configuration
The generator will be instructed to automatically add an `llm_judge` evaluator to each generated case.
*   It should reference a standard "adversarial judge" prompt (which we will ship as a template).
*   Example generated YAML:
    ```yaml
    - id: generated-1
      task: "I want a refund now!"
      evaluators:
        - name: adversarial_judge
          type: llm_judge
          prompt: prompts/adversarial-judge.md
    ```

### Templates
We need to add two new templates to the `apps/cli/src/templates/` directory:
1.  `generator.prompt.md`: The system prompt for the generator.
2.  `adversarial-judge.md`: The standard judge prompt for checking policy violations.
