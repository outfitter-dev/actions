# Outfitter Actions Documentation

Welcome to the documentation for `@outfitter/actions` - a collection of reusable GitHub Actions and workflows designed to make CI/CD simple and automatic.

## Quick Start

Add this to your repository's `.github/workflows/ci.yml`:

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

That's it! No configuration needed. The workflow will auto-detect your language, tools, and run appropriate checks.

## Available Actions & Workflows

### Workflows

- **[Belay](./actions/belay.md)** - Zero-config CI workflow with auto-detection
  - Language and tool detection
  - Risk-based CI tiers
  - Monorepo support
  - Smart caching
  - Flake mitigation
- **[PR Size Labeler](../docs/labeler.md)** - Auto-applies `size:*` labels to PRs

### Composite Actions

- **[Detector](./actions/detector.md)** - Language and tool detection action
  - Polyglot support
  - Monorepo detection
  - Command discovery

## Documentation

- **[Architecture](./ARCHITECTURE.md)** - Repository structure and design decisions
- **Contributing** - See repository README for general contributing
- **[Testing](./TESTING.md)** - Local testing with act and Bun

## Features

### 🚀 Zero Configuration
- Works out of the box with no setup
- Auto-detects language and tools
- Sensible defaults for 95% of projects

### 🎯 Smart Detection
- Supports Bun, Node.js, Rust, Go, Python, Java, and more
- Detects monorepo structures
- Finds test, lint, and build commands automatically

### ⚡ Performance Optimized
- Risk-based CI tiers (minimal/essential/full)
- Intelligent caching per language
- Parallel job execution
- Flake retry with adaptive timeouts

### 🔧 Progressive Enhancement
- TypeScript tools with Bun for speed
- Bash fallbacks for compatibility
- Extensible architecture

### 🌐 Provider Support
- GitHub native (default)
- Graphite CI Optimizer integration
- Merge queue aware

## Configuration (Optional)

While zero-config is the goal, you can customize behavior with `.ci.toml` (preferred), `.ci.yaml` / `.ci.yml`, or inline YAML via the workflow input `with.config`.

```toml
# .ci.toml (preferred)
force = "full"
timeout_minutes = 45

critical_globs = ["packages/**/package.json"]

[outputs]
comment = true
webhook = false
```

Inline YAML (in your workflow):

```yaml
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
    with:
      config: |
        force: full
        timeout_minutes: 30
```

## Tools

The repository includes TypeScript CLI tools for local development:

```bash
# Install dependencies
bun install

# Run detector locally
bun run detect

# Calculate risk tier
bun run risk

# Validate config
bun run validate

# Generate test events
bun run generate-events

# Run tests with benchmarks
bun test
```

## Examples

### Basic CI
```yaml
uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
```

### With Graphite
```yaml
uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
secrets:
  GRAPHITE_CI_OPTIMIZER_TOKEN: ${{ secrets.GRAPHITE_TOKEN }}
```

### With Comments
```yaml
uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
secrets:
  CI_STICKY_COMMENTS: "true"
```

## Support

- [GitHub Issues](https://github.com/outfitter-dev/actions/issues)
- [Discussions](https://github.com/outfitter-dev/actions/discussions)

## License

MIT - See [LICENSE](../LICENSE) for details.

## Versioning and Tags

- Use `@alpha` for the latest pre-release builds while we iterate toward v1.
- Use `@latest` for the most recent stable release (updated on GitHub Releases).
- Use major tags like `@v1` once a stable v1 is cut.

Tag management is automated via `.github/workflows/versioning.yml`:

- Push to `main` moves the `alpha` tag to the latest commit.
- Publishing a GitHub Release moves `latest` and the major tag (e.g., `v1`) to the release.
- Run the workflow manually to move custom tag aliases.
