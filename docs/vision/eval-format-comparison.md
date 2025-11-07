# Evaluation Formats Comparison

This note summarizes how three reference projects structure agent evaluation workflows. It serves as a rationale baseline for evolving AgentEvo’s YAML panel format.

## Agent Lightning
- **Artifacts**: Rewards serialized as OpenTelemetry spans (`al.reward` with `score`, `pass`, `reason`). Datasets expressed as Python/TypedDict models or JSONL/Parquet tables.
- **Configuration**: Hydra/OmegaConf YAML for PPO/VERL training (`trainer`, `algorithm`, `evaluator`). Additional JSON-compatible blobs for APO optimization (`run_id`, `artifacts`, `reward_spans`).
- **Metrics**: Mix of deterministic scorers (Spider EM/F1) and LLM-graded feedback encoded via POML templates.
- **Strengths**: Span-based telemetry is language agnostic; JSON-compatible data structures; flexible mix of rule and LLM judges.
- **Gaps**: Schemas live in Python; no single declarative panel file; heavy reliance on runtime code for validation.

## AX
- **Artifacts**: Evaluations written directly in TypeScript. Signatures declare inputs/outputs; examples are arrays of typed objects; metric functions compute scores.
- **Configuration**: No standalone YAML—benchmark logic is code-first. Optimizer checkpoints saved as JSON (`signature`, `metric`, `scores`, `config`).
- **Metrics**: Functions returning scalar or structured scores; reusable helpers (`exactMatch`, `semanticEquivalence`).
- **Strengths**: Strong type-safety, single source of truth with runtime code, straightforward JSON export of states.
- **Gaps**: High barrier for non-developers; CLI must compile TS modules to run; lacks declarative spec for tooling to ingest.

## Promptflow
- **Artifacts**: YAML DAGs (`$schema`, `inputs`, `outputs`, `nodes`). Evaluation flows flagged with `type: evaluation` and nodes marked `aggregation: true`.
- **Configuration**: Flow YAML references datasets (JSONL) and other runs via column macros (`${run.outputs.prediction}`). Aggregation nodes call Python scripts to emit metrics.
- **Metrics**: Implemented as Python functions or LLM nodes. Metrics computed in aggregation step and serialized to `evaluation_results.json`.
- **Strengths**: Declarative DAG enables mixed tooling; aggregation flag cleanly separates per-item vs summary; CLI/SDK integrate tightly.
- **Gaps**: Metric semantics live in Python; string macros are brittle; limited explicit schema for evaluation outcomes.

## bbeval
- **Artifacts**: YAML test specifications (`.test.yaml`) with `description`, `grader`, `target`, and `testcases` (each with `id`, `outcome`, `messages`). Messages support multi-turn conversations with role-based structure (system, user, assistant) and mixed content types (text, file references, instruction files).
- **Configuration**: Target system decouples tests from providers via `.bbeval/targets.yaml` (provider, settings with environment variable names). Supports Azure, Anthropic, VS Code Copilot, VS Code Insiders, and mock providers. Instruction files can be referenced in messages to inject domain-specific guidelines.
- **Metrics**: DSPy-based signatures (QuerySignature, CodeGeneration, CodeReview) for domain-specific evaluation. Scoring via aspect extraction from expected outcomes (normalized token overlap) with `hits`, `misses`, `expected_aspect_count`. LLM judge grading option available. Results in JSONL with `test_id`, `score`, `model_answer`, `timestamp`, `raw_request`, `grader_raw_request`.
- **Strengths**: Strong provider abstraction via targets; multi-turn conversation support with instruction file injection; VS Code integration for agent-in-the-loop evaluation; timeout handling with automatic retries; session-based file management prevents race conditions; supports both LLM and agent-based evaluation (vs. code CLI).
- **Gaps**: Python-based implementation limits cross-language adoption; scoring limited to aspect matching and LLM judge (no semantic embeddings yet); schema lives in Python models; complex examples in WTG.AI.Prompts demonstrate multi-file instruction patterns and VS Code workspace evaluation but are not publicly available.

## Implications for AgentEvo YAML
- Share Agent Lightning's structured telemetry (spans, reward schema) while exposing a declarative panel file.
- Borrow AX's type-safety by backing YAML with generated TypeScript interfaces/validators.
- Adopt Promptflow's separation of per-task execution vs aggregation, but define evaluators declaratively so logic is discoverable without Python code.
- Leverage bbeval's target abstraction pattern to decouple test specifications from execution providers, enabling flexible multi-provider evaluation.
- Support multi-turn conversation patterns with instruction file references (bbeval) to inject domain-specific guidelines without polluting test cases.
- Incorporate session-based artifact management (bbeval) to prevent race conditions in concurrent evaluation scenarios.
- Consider both aspect-based scoring (bbeval) and LLM judge patterns for flexible evaluation strategies.

These insights motivate the proposed YAML structure: datasets + tasks + reusable evaluators + scoring + reporting, all validated via a TypeScript schema and able to emit structured telemetry for downstream tooling.