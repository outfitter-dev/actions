# Agent Instructions

## Important Rules

- @.agents/rules/CORE.md
- @.agents/rules/IMPORTANT.md

## Current Work

- @.agents/docs/PRD-initial.md

## Project Overview

This is **@outfitter/actions** - a repository containing shared GitHub Actions and reusable workflows for Outfitter projects. The primary action is **Belay** - a zero-config CI workflow that auto-detects project configuration and runs appropriate checks.

Additional actions are planned and will be added to this repository as they are developed, including deployment workflows, security scanning, and performance monitoring integrations.

## Core Architecture

### Belay Action
The main product is a reusable GitHub workflow (`belay.yml`) that provides:

- Auto-detection of language, package manager, and commands
- Risk-based CI intensity (minimal/essential/full tiers)
- Self-healing capabilities (automatic retries, adaptive timeouts)
- Stack awareness (Graphite and GitHub merge queue integration)
- Agent-aware output formatting

### Key Components

- `.github/workflows/belay.yml` - Main reusable workflow (will be created)
- `actions/detector/action.yml` - Composite action for language/tool detection (will be created)
- `docs/` - Documentation for all actions
- `.agents/docs/PRD-initial.md` - Product requirements document with implementation details

## Development Commands

Since this is a GitHub Actions repository, there are no traditional build/test commands. Instead:

### Testing Workflows Locally

```bash
# Install act for local testing
brew install act  # macOS
# or see https://github.com/nektos/act for other platforms

# Test PR workflow
act pull_request -j ci -e events/pull_request.json

# Test merge queue
act merge_group -j ci -e events/merge_group.json

# Test with Graphite provider
export GRAPHITE_CI_OPTIMIZER_TOKEN=fake
act pull_request -j ci -e events/pull_request.json
```

### Linting and Formatting

```bash
# Markdown linting
npx markdownlint-cli2 "**/*.md"

# Prettier formatting
npx prettier --write "**/*.{json,yml,yaml,md}"
```

## Implementation Status

This project is in early development. The PRD has been written and documentation created, but the actual workflow and action files haven't been implemented yet. When implementing:

1. Follow the specifications in `.agents/docs/PRD-initial.md`
2. Use `belay` as the action name (not `zero` as mentioned in older docs)
3. Implement the detector composite action for language/tool detection
4. Create example event files for testing with `act`

## Project Rules

### From .agents/rules/

- Follow CORE.md principles: type-safety, performance obsession, uncompromising standards
- Apply PREFERENCES.md for code style and patterns
- Use established patterns from ARCHITECTURE.md, MONOREPO.md, DEVELOPMENT.md

### Specific to This Project

- The workflow must work with zero configuration
- Detection logic should be extensible for new languages
- All features must work identically for humans and AI agents
- Maintain single required check that never skips
- Default to safe fallbacks when detection fails

## Risk Scoring Logic

The risk scoring system (0-1) determines CI tier:

- **Factors increasing risk**: Many files changed (+0.3 if >50), stack position (+0.3 if top/bottom), critical paths (+0.3)
- **Factors decreasing risk**: Draft PR (-0.1), middle of stack (baseline)
- **Tier thresholds**: >0.7 = Full, >0.3 = Essential, ≤0.3 = Minimal
- **Hard overrides**: merge_group events always Full, Graphite "run full" always Full

## Language Detection Priority

Detection order (first match wins):

1. `bun.lockb` → Bun
2. `package-lock.json`/`pnpm-lock.yaml`/`yarn.lock` → Node
3. `Cargo.toml` → Rust
4. `go.mod` → Go
5. `requirements.txt`/`pyproject.toml` → Python
6. `pom.xml`/`gradlew` → Java/Kotlin
7. `Makefile` → Generic make targets

## Command Discovery Priority

Commands are discovered and run in this order:

1. **Lint** - Code style checks
2. **Typecheck** - Type validation
3. **Test** - Unit/integration tests
4. **Build** - Compilation/bundling

Sources: `package.json` scripts, Makefile targets, or language-specific defaults.

## Configuration Files

### `.ci.json` (Optional)
Repository-specific configuration to override defaults:

```json
{
  "force": "full|essential|minimal",
  "timeout_minutes": 30,
  "ignore": ["**/*.md"],
  "critical_globs": ["packages/**/package.json"],
  "outputs": {
    "comment": true,
    "webhook": false
  }
}
```

### Required Secrets (Optional)

- `GRAPHITE_CI_OPTIMIZER_TOKEN` - Enable Graphite integration
- `CI_STICKY_COMMENTS` - Enable PR comments
- `CI_STATUS_WEBHOOK` - Webhook URL for notifications