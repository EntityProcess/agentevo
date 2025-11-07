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

## Implications for AgentEvo YAML
- Share Agent Lightning’s structured telemetry (spans, reward schema) while exposing a declarative panel file.
- Borrow AX’s type-safety by backing YAML with generated TypeScript interfaces/validators.
- Adopt Promptflow’s separation of per-task execution vs aggregation, but define evaluators declaratively so logic is discoverable without Python code.

These insights motivate the proposed YAML structure: datasets + tasks + reusable evaluators + scoring + reporting, all validated via a TypeScript schema and able to emit structured telemetry for downstream tooling.