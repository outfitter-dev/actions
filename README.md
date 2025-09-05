# @outfitter/actions

> Shared GitHub Actions and reusable workflows for Outfitter projects.

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/outfitter-dev/actions)
[![License](https://img.shields.io/github/license/outfitter-dev/actions)](LICENSE)

## Overview

**@outfitter/actions** provides reusable GitHub Actions and workflows to standardize CI/CD across Outfitter projects. Built for both human developers and AI agents, with smart defaults and minimal configuration.

## Available Actions

### 🪢 Belay

Zero-config CI workflow that auto-detects your project setup and runs the right checks.

**Features:**

- 🚀 **Zero configuration** - Just add 4 lines to your workflow
- 🔍 **Auto-detection** - Automatically detects language, package manager, and test commands
- 🎯 **Smart CI intensity** - Risk-based tier selection (minimal/essential/full)
- 🔄 **Self-healing** - Automatic retries for flaky tests, adaptive timeouts
- 🤖 **Agent-aware** - Optimized for both human and AI contributors
- 📊 **Stack-aware** - Integrates with Graphite and GitHub merge queues

**Quick Start:**

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@v1
    secrets: inherit
```

[Documentation](./docs/belay.md) | [Examples](./examples/belay)

---

## How Belay Works

### Language Detection

Belay automatically detects your project's language and tooling:

- **JavaScript/TypeScript**: Bun, Node.js (npm/pnpm/yarn)
- **Rust**: Cargo
- **Go**: Go modules
- **Python**: pip/poetry
- **Java/Kotlin**: Maven/Gradle
- **Make**: Generic Makefile targets

### Command Discovery

Belay automatically finds and runs your project's commands in order:

1. **Lint** - Code style and quality checks
2. **Typecheck** - Type safety validation
3. **Test** - Unit and integration tests
4. **Build** - Compilation and bundling

Commands are detected from `package.json` scripts, Makefile targets, or language defaults.

### Smart CI Intensity

Belay automatically adjusts CI intensity based on risk:

- **Minimal** - Lint and `type-check` for low-risk changes
- **Essential** - Adds targeted tests for medium-risk changes  
- **Full** - Complete test suite for high-risk changes or merge queue

Risk factors include file count, critical paths, stack position, and PR status.

### Self-Healing Features

- **Automatic retries** for flaky tests
- **Adaptive timeouts** that expand as needed
- **Smart caching** that primes itself on cold starts
- **Agent detection** for optimized output formatting

## Configuration

### Zero Configuration (Default)

Belay works out of the box with no configuration needed. It will auto-detect your project setup and run appropriate checks.

### Optional Configuration

For the 5% of cases that need customization, create a `.ci.json` file in your repository root:

```json
{
  "force": "full",              // Force a specific tier: full|essential|minimal
  "timeout_minutes": 30,        // Override default timeout
  "ignore": ["**/*.md"],        // Glob patterns to ignore
  "critical_globs": [           // Files that trigger full CI
    "packages/**/package.json",
    "**/schema.*"
  ],
  "outputs": {
    "comment": true,            // Enable PR comments
    "webhook": false            // Enable webhook notifications
  }
}
```

### Secrets

Optional secrets for enhanced functionality:

- `GRAPHITE_CI_OPTIMIZER_TOKEN` - Enable Graphite stack optimization
- `CI_STICKY_COMMENTS` - Enable sticky PR comments
- `CI_STATUS_WEBHOOK` - Webhook URL for CI status notifications

## Repository Structure

```
@outfitter/actions/
├── .github/
│   └── workflows/
│       └── belay.yml          # Main reusable workflow
├── actions/
│   └── detector/
│       └── action.yml         # Language/tool detection
├── docs/
│   └── belay.md              # Detailed documentation
├── examples/
│   └── belay/                # Example configurations
└── scripts/
    └── with-retry.sh         # Helper scripts
```

## Development

### Testing Locally

Use [`act`](https://github.com/nektos/act) to test workflows locally:

```bash
# Test PR workflow
act pull_request -j ci

# Test merge queue
act merge_group -j ci
```

### Contributing

1. Fork the repository
2. Create your feature branch (`gt create -m "feat: amazing feature"`)
3. Run tests locally with `act`
4. Submit via Graphite (`gt submit`)

## Roadmap

- [ ] Additional language support (Ruby, PHP, .NET)
- [ ] Deployment workflows
- [ ] Security scanning actions
- [ ] Performance monitoring integration
- [ ] Multi-platform matrix testing

## License

MIT © [Outfitter](https://github.com/outfitter-dev)

## Support

- [Documentation](https://github.com/outfitter-dev/actions/tree/main/docs)
- [Issues](https://github.com/outfitter-dev/actions/issues)
- [Discussions](https://github.com/outfitter-dev/actions/discussions)