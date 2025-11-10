# Project Context

## Purpose

AgentEvo is an evaluation framework for AI agents and prompts, currently focused on:

- **YAML evaluation panels**: Define tasks with expected outputs and metric targets
- **Multi-objective scoring**: Measure correctness, latency, cost, tool efficiency, robustness, safety
- **Evaluation workflows**: Run scoring against test panels to validate agent performance

### Current Implementation Status

**Implemented:**
- YAML evaluation panel parsing and validation
- Test execution framework
- Basic scoring infrastructure

**Planned (not yet implemented):**
- External Mode (integration with external agents)
- Internal Mode (built-in executor)
- Prompt artifacts and versioning
- Candidate generation and promotion
- Automatic optimization
- Local tool registry
- HTTP API

## Project Conventions

### Code Style

- Follow TypeScript 5.x and ES2022 guidelines from `.github/instructions/typescript-5-es2022.instructions.md`

### Architecture Patterns

- **Monorepo**: Turbo-powered workspace
- **YAML Evaluation Panels**: Declarative task definitions with metrics and thresholds
- **Multi-objective Scoring**: Correctness, latency, cost, toolEfficiency, robustness

### Testing

- **Framework**: Vitest with coverage tracking

### Git Workflow

- Feature branches with imperative commit messages

## Domain Context

- **AI Agent Evaluation**: Multi-objective scoring (correctness, latency, cost, tool efficiency, robustness, safety) against YAML test panels
- **Planned - Ax Integration**: Declarative signatures and optimization algorithms (MiPRO, ACE, GEPA)

## Important Constraints

- **Node.js**: v20.0.0+
- **Package Manager**: pnpm only
- **Migration in Progress**: Porting from Python (bbeval) to TypeScript

## Dependencies

- **Current**: turbo, tsx, tsup, vitest
- **Planned**: Ax framework (MiPRO, ACE, GEPA optimization), LLM providers