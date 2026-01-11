# Architecture

## Overview

This repository provides reusable GitHub Actions and workflows for Outfitter projects, designed with a "zero-config" philosophy. The architecture emphasizes auto-detection, progressive enhancement, and polyglot support.

## Design Principles

### 1. Zero Configuration by Default
- Actions should work with a simple `uses:` declaration
- Auto-detect language, tools, and project structure
- Provide sensible defaults that work for 95% of cases
- Allow configuration only as an escape hatch

### 2. Progressive Enhancement with TypeScript
- Composite actions use Bun/TypeScript tools when available
- Graceful fallback to bash scripts for compatibility
- TypeScript provides better maintainability and testing
- Performance-critical paths optimized with native tools

### 3. Risk-Based CI Intensity
- Calculate risk score based on multiple factors
- Three tiers: minimal, essential, full
- Automatic escalation for critical changes
- Smart reduction for low-risk changes (drafts, small PRs)

### 4. Polyglot & Monorepo First
- Detect multiple languages in priority order
- Support workspace configurations across ecosystems
- Handle mixed-language projects gracefully
- Cache optimization per language/workspace

## Repository Structure

```
@outfitter/actions/
├── .github/workflows/          # Reusable workflows
│   ├── belay.yml              # Main zero-config CI workflow
│   └── publish.yml            # NPM publishing workflow
│
├── actions/                    # Composite actions
│   └── actions/
│       └── detector/          # Language/tool detection action
│           ├── action.yml     # Composite action definition
│           └── detect.sh      # Bash fallback script
│
├── tools/                      # TypeScript CLI tools
│   ├── detector.ts            # Language detection logic
│   ├── risk-calculator.ts    # Risk scoring for CI tiers
│   ├── cache-key-gen.ts      # Smart cache key generation
│   ├── github-api.ts         # GitHub API utilities
│   ├── validate-config.ts    # Config validation
│   ├── generate-events.ts    # Test event generation
│   └── *.test.ts             # Tests with benchmarks
│
├── scripts/                    # Shell utilities
│   └── with-retry.sh          # Flake mitigation wrapper
│
├── docs/                       # Documentation
│   ├── README.md              # Documentation index
│   ├── ARCHITECTURE.md        # This file
│   └── actions/               # Per-action documentation
│       └── belay.md           # Belay workflow docs
│
└── package.json               # Bun configuration
```

## Component Architecture

### Reusable Workflows (`.github/workflows/`)

Workflows are the primary interface for consumers. They:
- Accept minimal inputs (mostly optional)
- Call composite actions for detection
- Orchestrate job dependencies
- Provide consistent status checks

**Key Design**: The `status` job is always required and never skipped, ensuring branch protection rules work correctly.

### Composite Actions (`actions/`)

Composite actions encapsulate reusable logic:
- Install necessary tools (Bun)
- Run TypeScript detectors when available
- Fall back to bash for compatibility
- Output structured data for workflows

**Progressive Enhancement**: Actions check for TypeScript tools first, falling back to bash only when necessary.

### TypeScript Tools (`tools/`)

Core logic implemented in TypeScript for:
- **Type safety**: Catch errors at build time
- **Testability**: Unit tests with Bun's test runner
- **Performance**: Benchmarks ensure fast execution
- **Maintainability**: Easier to extend and debug

Each tool is:
- Standalone CLI executable with `bun run`
- Importable as a module for testing
- Documented with JSDoc comments
- Benchmarked for performance

### Detection Strategy

The detector follows a priority order:

1. **Bun** (bun.lockb) - Highest priority, modern runtime
2. **Node.js** variants (package-lock.json, yarn.lock, pnpm-lock.yaml)
3. **Rust** (Cargo.toml) - Systems programming
4. **Go** (go.mod) - Cloud native tools
5. **Python** (requirements.txt, pyproject.toml)
6. **Java/Maven** (pom.xml)
7. **Gradle** (build.gradle)
8. **Make** (Makefile) - Generic fallback

This order reflects:
- Modern tools first (Bun > Node)
- Lock files over config files (more reliable)
- Specific over generic (language > Make)

### Monorepo Detection

Each language has specific monorepo patterns:

- **JavaScript**: `workspaces` in package.json, pnpm-workspace.yaml
- **Rust**: `[workspace]` section in Cargo.toml
- **Go**: go.work file
- **Python**: pyproject.toml with groups/packages
- **Java**: `<modules>` in pom.xml
- **Gradle**: `include` in settings.gradle

### Risk Calculation

Risk factors are weighted and combined:

```typescript
interface RiskFactors {
  filesChanged: number;      // >50 files = +0.3
  position: string;          // top/bottom = +0.3
  critical: boolean;         // critical paths = +0.3
  isDraft: boolean;          // draft = -0.1
  eventName: string;         // merge_group = force full
}
```

Tiers:
- **Minimal** (score ≤ 0.3): Lint, type-check
- **Essential** (0.3 < score ≤ 0.7): + tests, targeted builds
- **Full** (score > 0.7): Complete validation

### Caching Strategy

Cache keys are generated per language:

1. **Primary key**: OS + language + lockfile hash
2. **Restore keys**: Progressively broader patterns
3. **Paths**: Language-specific directories
4. **Monorepo**: Additional workspace paths

### Provider Support

Two providers with different strategies:

**GitHub** (default):
- Use PR relationships to determine stack position
- Standard concurrency groups
- Native merge queue support

**Graphite**:
- Integration with Graphite CI Optimizer
- Stack-aware skip logic
- Deduplication across stacked PRs

## Extension Points

### Adding a New Language

1. Update priority in `detector.ts`
2. Add detection method (e.g., `detectRubyCommands()`)
3. Add monorepo pattern if applicable
4. Update cache key generation
5. Add tests

### Adding a New Workflow

1. Create workflow in `.github/workflows/`
2. Use detector action for language detection
3. Document in `docs/actions/`
4. Add example usage

### Custom Configuration

Projects can add `.ci.toml` for overrides:

```toml
force = "full"              # Override tier
timeout_minutes = 45        # Custom timeout
critical_globs = ["..."]   # Additional critical paths
ignore = ["..."]           # Ignore patterns
```

## Performance Considerations

### Detection Speed
- File existence checks are fast (~1ms)
- JSON parsing is cached
- Regex patterns are precompiled
- Benchmarks ensure <100ms total

### CI Time Optimization
- Risk-based tiers reduce unnecessary work
- Parallel job execution where possible
- Smart caching reduces install time
- Retry logic prevents flake-induced reruns

### Workflow Efficiency
- Single meta job for status checks
- Conditional job execution
- Early termination on failure
- Concurrency groups prevent duplicate runs

## Security Considerations

- Secrets are optional and scoped
- No elevated permissions required
- Webhook payloads contain no secrets
- Config validation prevents injection
- Dependencies locked with lockfiles

## Future Enhancements

### Planned Features
- Container image with pre-installed tools
- Predictive test selection
- Author reliability scoring
- Cross-repo cache sharing
- Custom runner support

### Extension Ideas
- Language-specific plugins
- Organization-wide policies
- Cost optimization reports
- Performance regression detection
- Security scanning integration
