---
name: jsonl-to-yaml
description: Convert JSONL (JSON Lines) files to human-readable YAML format with proper multiline string handling. Use this skill when users need to view or convert JSONL evaluation results, logs, or data exports into readable YAML format.
---

# JSONL to YAML Converter

Convert JSONL (JSON Lines) files into human-readable YAML format with proper formatting for multiline strings.

## Purpose

JSONL files are compact and machine-friendly but difficult for humans to read. This skill converts JSONL files (where each line is a JSON object) into well-formatted YAML with:

- Document separators (`---`) between records
- Literal block scalars (`|`) for multiline strings
- Proper indentation and readability
- Preserved data structure and types

## When to Use This Skill

Use this skill when:
- Converting evaluation results (`.jsonl`) to readable format
- Reviewing log files or data exports in JSONL format
- Users request to "view", "read", "convert", or "make readable" a JSONL file
- Users want to see JSONL content in YAML format
- Preparing JSONL data for human review or documentation

## How to Use This Skill

### Conversion Script

The skill provides a Python script at `scripts/jsonl_to_yaml.py` that handles the conversion:

**Usage:**
```bash
uv run scripts/jsonl_to_yaml.py <input.jsonl> [output.yaml]
```

**Examples:**
```bash
# Convert with automatic output naming (input.yaml)
uv run scripts/jsonl_to_yaml.py results.jsonl

# Convert with custom output path
uv run scripts/jsonl_to_yaml.py results.jsonl readable_results.yaml
```

**Features:**
- Automatically detects and formats multiline strings using `|` character
- Escapes special YAML characters in strings
- Handles nested objects and arrays
- Skips invalid JSON lines with warnings
- Preserves all data types (strings, numbers, booleans, null, arrays, objects)

### Conversion Process

To convert a JSONL file:

1. Locate the JSONL file path from user's request or workspace
2. Execute the conversion script with appropriate paths
3. Inform the user of the output location
4. Optionally display a preview of the converted content

### Output Format

The script produces YAML with:
- Each JSONL record as a separate YAML document
- Documents separated by `---`
- Multiline strings formatted with `|` for readability
- Proper indentation (2 spaces per level)
- Special characters properly escaped

### Example Transformation

**Input JSONL:**
```jsonl
{"test_id":"example","score":0.85,"message":"Line 1\nLine 2\nLine 3"}
{"test_id":"another","score":0.92,"items":["a","b","c"]}
```

**Output YAML:**
```yaml
test_id: example
score: 0.85
message: |
  Line 1
  Line 2
  Line 3
---
test_id: another
score: 0.92
items:
  - a
  - b
  - c
```

## Notes

- The script handles encoding issues by using UTF-8 explicitly
- Invalid JSON lines are skipped with warnings to stderr
- Empty lines in JSONL are ignored
- Output file defaults to input filename with `.yaml` extension
