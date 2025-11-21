## 1. Implementation

- [x] Update target schema to accept `provider_batching` under `settings`.
- [x] Wire provider capability detection so AgentV batches in a single provider session when supported and requested.
- [x] Add tests covering schema acceptance and batching selection/fallback behaviour.
