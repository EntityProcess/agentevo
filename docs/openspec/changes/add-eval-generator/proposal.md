# Add Eval Generator

## Summary
Implement a new `agentv generate` command that uses an LLM to automatically generate adversarial evaluation cases from a high-level user description.

## Problem
Creating high-quality, adversarial evaluation cases manually is time-consuming and requires creativity to think of edge cases. Users often know *what* they want to test (e.g., "refund policy") but struggle to write 10 different tricky scenarios in the correct YAML format.

## Solution
Add a `generate` command to the CLI that:
1.  Takes a natural language description of the test goal.
2.  Uses a specialized "Generator Prompt" to act as an adversarial attacker.
3.  Produces a valid `agentv` YAML file with multiple test cases.
4.  Leverages the new `evaluators` list (from `implement-custom-evaluators`) to automatically configure an adversarial judge for these cases.

## Dependencies
- Depends on `implement-custom-evaluators` to ensure the generated YAML can use custom adversarial judges.
