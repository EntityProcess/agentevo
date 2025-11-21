# Spec: Eval Generator

## ADDED Requirements

### Requirement: Generate Command
The CLI SHALL support a `generate` command that creates evaluation files from natural language descriptions.

#### Scenario: Generate adversarial cases
Given a user runs `agentv generate "Test the refund policy"`
When the command completes
Then a YAML file is created containing multiple `EvalCase` entries
And each case has an `llm_judge` evaluator configured
And the cases represent adversarial attempts to test the policy.

#### Scenario: Generate with file context
Given a user runs `agentv generate "Test the policy" --context ./policy.md`
When the command completes
Then the generated cases reflect the rules defined in `policy.md`.

#### Scenario: Generate using VS Code agent
Given a user runs `agentv generate "Test the policy" --target vscode`
When the command completes
Then the generation task is dispatched to a VS Code subagent
And the resulting YAML is saved to the output file.

#### Scenario: Custom output path
Given a user runs `agentv generate "Test" --output my-test.yaml`
When the command completes
Then the file `my-test.yaml` exists with the generated content.

#### Scenario: Init includes judge template
Given a user runs `agentv init`
When the command completes
Then the file `prompts/adversarial-judge.md` (or similar) exists in the project
So that generated cases can reference it.
