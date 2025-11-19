---
description: 'Apply when writing evals in YAML format'
---

## Schema Reference
- Schema: `@../contexts/eval-schema.json` (JSON Schema for validation and tooling)
- Format: YAML with structured content arrays

## Structure Requirements
- Root level: `$schema` (required: "agentv-eval-v2"), `description` (optional), `target` (optional), `evalcases` (required)
- Eval case fields: `id` (required), `outcome` (required), `input_messages` (required), `expected_messages` (required)
- Optional fields: `conversation_id`, `note`, `execution`
- Message fields: `role` (required), `content` (required)
- Message roles: `system`, `user`, `assistant`, `tool`
- Content types: `text` (inline), `file` (relative or absolute path)
- File paths must start with "/" for absolute paths (e.g., "/prompts/file.md")

## Example
```yaml
$schema: agentv-eval-v2
description: Example showing basic features and conversation threading
target: default

evalcases:
  # Basic eval case with file references
  - id: code-review-basic
    outcome: Assistant provides helpful code analysis
    
    input_messages:
      - role: system
        content: You are an expert code reviewer.
      - role: user
        content:
          - type: text
            value: |-
              Review this function:
              
              ```python
              def add(a, b):
                  return a + b
              ```
          # File paths can be relative or absolute
          - type: file
            value: /prompts/python.instructions.md
    
    expected_messages:
      - role: assistant
        content: |-
          The function is simple and correct. Suggestions:
          - Add type hints: `def add(a: int, b: int) -> int:`
          - Add docstring
          - Consider validation for edge cases

  # Advanced: conversation threading, multiple evaluators
  - id: python-coding-session
    conversation_id: python-coding-session
    outcome: Generates correct code with proper error handling
    
    execution:
      target: azure_base
      evaluators:
        - name: keyword_check
          type: code
          script: /evaluators/scripts/check_keywords.py
        - name: semantic_judge
          type: llm_judge
          prompt: /evaluators/prompts/correctness.md
          model: gpt-5-chat
    
    input_messages:
      - role: system
        content: You are a code generator.
      - role: user
        content:
          - type: text
            value: Create a function to find the second largest number in a list.
          - type: file
            value: /prompts/python.instructions.md
    
    expected_messages:
      - role: assistant
        content: |-
          ```python
          from typing import List, Union
          
          def find_second_largest(numbers: List[int]) -> Union[int, None]:
              """Find the second largest number."""
              if not isinstance(numbers, list):
                  raise TypeError("Input must be a list")
              if not numbers:
                  raise ValueError("List cannot be empty")
              
              unique = list(set(numbers))
              if len(unique) < 2:
                  return None
              
              unique.sort(reverse=True)
              return unique[1]
          ```
```