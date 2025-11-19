## ADDED Requirements

### Requirement: Guideline Pattern Configuration

The system SHALL support an optional `.agentv.yaml` configuration file in the eval file directory for customizing guideline detection using glob patterns.

#### Scenario: Load custom guideline patterns

- **WHEN** a `.agentv.yaml` file exists in the same directory as the eval file
- **AND** it contains a `guideline_patterns` array with glob patterns
- **THEN** the system uses those patterns to identify guideline files
- **AND** treats files matching any pattern as guidelines (excluded from user segments)

#### Scenario: Use defaults when config absent

- **WHEN** no `.agentv.yaml` file exists in the eval file directory
- **THEN** the system uses default patterns: `**/*.instructions.md`, `**/instructions/**`, `**/*.prompt.md`, `**/prompts/**`
- **AND** continues evaluation normally

#### Scenario: Match files with glob patterns

- **WHEN** evaluating whether a file is a guideline
- **THEN** the system matches the normalized file path against each glob pattern
- **AND** supports `**` (recursive), `*` (wildcard), and literal path segments
- **AND** normalizes path separators to forward slashes for cross-platform compatibility
