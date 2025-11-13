# Repository Guidelines

This is a TypeScript monorepo for AgentEvo - an AI agent evaluation framework.

## Tech Stack & Tools
- **Language:** TypeScript 5.x targeting ES2022
- **Package Manager:** pnpm 10.20.0 (use `pnpm` for all package operations)
- **Build System:** Turbo (monorepo task orchestration)
- **Bundler:** tsup (TypeScript bundler)
- **Testing:** Vitest
- **LLM Framework:** @ax-llm/ax, Vercel AI SDK
- **Validation:** Zod

## Project Structure
- `packages/core/` - Evaluation engine, providers, grading
- `apps/cli/` - Command-line interface (published as `agentevo`)

## Essential Commands
- `pnpm install` - Install dependencies
- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm typecheck` - Type checking
- `pnpm lint` - Lint code
- `pnpm format` - Format with Prettier

## Functional Testing

When functionally testing changes to the AgentEvo CLI, **NEVER** use `agentevo` directly as it may run the globally installed npm version. Instead:

- **From repository root:** Use `pnpm agentevo <args>` to run the locally built version
- **From apps/cli directory:** Use `pnpm dev -- <args>` to run from TypeScript source with tsx

This ensures you're testing your local changes, not the published npm package.

## TypeScript Guidelines
- Target ES2022 with Node 20+
- Prefer type inference over explicit types
- Use `async/await` for async operations
- Prefer named exports
- Keep modules cohesive

## Package Publishing
- CLI package (`apps/cli`) is published as `agentevo` on npm
- Uses tsup with `noExternal: ["@agentevo/core"]` to bundle workspace dependencies
- Install command: `npm install -g agentevo`

## Python Scripts
When running Python scripts, always use: `uv run <script.py>`

<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/docs/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/docs/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: Bash("openskills read <skill-name>")
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>jsonl-to-yaml</name>
<description>Convert JSONL (JSON Lines) files to human-readable YAML format with proper multiline string handling. Use this skill when users need to view or convert JSONL evaluation results, logs, or data exports into readable YAML format.</description>
<location>project</location>
</skill>

<skill>
<name>skill-creator</name>
<description>Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
