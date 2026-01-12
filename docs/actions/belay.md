# Belay Action

> Zero-config CI workflow with intelligent auto-detection and self-healing capabilities.

## Overview

Belay is a reusable GitHub Actions workflow that automatically detects your project configuration and runs appropriate CI checks without any configuration required. It adapts CI intensity based on risk, retries flaky tests, and optimizes for both human developers and AI agents.

## Features

### 🔍 Auto-Detection

Belay automatically detects:

- **Language** - JavaScript/TypeScript, Rust, Go, Python, Java/Kotlin
- **Package Manager** - Bun, npm, pnpm, yarn, cargo, pip, maven, gradle
- **Commands** - Lint, typecheck, test, and build scripts
- **Repository Structure** - Monorepo vs single package
- **Stack Provider** - Graphite or GitHub

### 🎯 Smart CI Intensity

Three-tier system based on risk assessment:

| Tier | Description | When Used |
|------|-------------|-----------|
| **Minimal** | Lint + `type-check` only | Low-risk changes, draft PRs |
| **Essential** | Adds targeted tests | Medium-risk changes |
| **Full** | Complete test suite + build | High-risk changes, merge queue |

### 🔄 Self-Healing

- **Automatic retries** - Failed tests are retried once with backoff
- **Adaptive timeouts** - Timeouts expand after soft limits
- **Cache priming** - Cold caches are warmed for next run
- **Flake detection** - Marks intermittent failures in summary

### 🤖 Agent-Aware

Detects AI agents and adjusts output:

- Structured JSON summaries for parsing
- Precise error traces and reproduction steps
- Increased parallelism within safe limits
- Maintains human-readable check summary

## Usage

### Basic Usage

Add to `.github/workflows/ci.yml`:

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

### With Graphite

For Graphite stack optimization:

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets:
      GRAPHITE_CI_OPTIMIZER_TOKEN: ${{ secrets.GRAPHITE_CI_OPTIMIZER_TOKEN }}
```

### With All Features

Enable all optional features:

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets:
      GRAPHITE_CI_OPTIMIZER_TOKEN: ${{ secrets.GRAPHITE_CI_OPTIMIZER_TOKEN }}
      CI_STICKY_COMMENTS: true
      CI_STATUS_WEBHOOK: ${{ secrets.WEBHOOK_URL }}
```

## Configuration

### Zero Configuration

By default, Belay requires no configuration. It will:

1. Detect your language and tools
2. Find appropriate commands
3. Choose CI intensity based on risk
4. Run checks and report results

### Optional Config

Belay supports:
- `.ci.toml` (preferred file format)
- `.ci.yaml` / `.ci.yml`
- Inline YAML input via `with.config`

Example `.ci.toml`:

```toml
# Belay CI configuration
force = "full"              # "full" | "essential" | "minimal"
timeout_minutes = 30

ignore = ["**/*.md", "docs/**"]

critical_globs = [
  "packages/**/package.json",
  "**/schema.*",
  ".github/**",
]

[outputs]
comment = true
webhook = false
```

Inline YAML example in your workflow:

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
    with:
      config: |
        force: essential
        timeout_minutes: 45
        ignore:
          - "**/*.md"
          - "docs/**"
        critical_globs:
          - "packages/**/package.json"
        outputs:
          comment: true
          webhook: false
```

Precedence: inline `with.config` > `.ci.toml` > `.ci.yaml` / `.ci.yml`.

#### Configuration Options

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `force` | `"full" | "essential" | "minimal"` | Override automatic tier selection | Auto-detected |
| `timeout_minutes` | `number` | Maximum time for CI run | 30 |
| `ignore` | `string[]` | Glob patterns to ignore in risk assessment | `[]` |
| `critical_globs` | `string[]` | Files that always trigger full CI | See defaults below |
| `outputs.comment` | `boolean` | Enable sticky PR comments | `false` |
| `outputs.webhook` | `boolean` | Enable webhook notifications | `false` |

#### Default Critical Paths

These paths always trigger full CI when modified:

- `packages/**/package.json` - Package dependencies
- `**/schema.*` - Database/API schemas
- `.github/**` - Workflow files
- `*.config.*` - Configuration files
- `**/tsconfig.json` - TypeScript config
- `Cargo.toml` - Rust manifest
- `go.mod` - Go modules

## Language Support

### JavaScript/TypeScript

**Detection:** `package.json`, `bun.lockb`, lockfiles

**Commands:**

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "build": "vite build"
  }
}
```

**Package Managers:** Bun (preferred), npm, pnpm, yarn

### Rust

**Detection:** `Cargo.toml`

**Default Commands:**

- Lint: `cargo fmt -- --check`
- Clippy: `cargo clippy -D warnings`
- Test: `cargo test --all`
- Build: `cargo build --all`

### Go

**Detection:** `go.mod`

**Default Commands:**

- Lint: `go vet ./...`
- Test: `go test ./...`
- Build: `go build ./...`

### Python

**Detection:** `requirements.txt`, `pyproject.toml`

**Default Commands:**

- Lint: `ruff check .`
- Test: `pytest -q`
- Install: `pip install -r requirements.txt`

### Java/Kotlin

**Detection:** `pom.xml`, `build.gradle`, `gradlew`

**Commands:** Maven/Gradle targets

## Stack Awareness

### Graphite Integration

When `GRAPHITE_CI_OPTIMIZER_TOKEN` is present:

- Uses Graphite CI Optimizer for skip decisions
- Respects stack position (bottom/middle/top)
- De-duplicates CI across stacked PRs
- Maintains single required check

### GitHub Mode

Without Graphite token:

- Infers stack position from PR relationships
- Uses GitHub merge queue for final validation
- Runs full CI on merge_group events

## Risk Scoring

Risk score (0-1) determines CI tier:

### Factors Increasing Risk

- **Many files changed** (+0.3 if >50 files)
- **Stack position** (+0.3 if top or bottom)
- **Critical paths** (+0.3 if modified)
- **Merge queue event** (always full)

### Factors Decreasing Risk

- **Draft PR** (-0.1)
- **Middle of stack** (baseline)
- **Documentation only** (minimal)

### Tier Thresholds

- `risk > 0.7` → Full
- `risk > 0.3` → Essential  
- `risk ≤ 0.3` → Minimal

## Outputs

### Job Summary

Always generated in `$GITHUB_STEP_SUMMARY`:

```markdown
**Stack CI**
- Provider: graphite
- Position: middle
- Tier: minimal
- Critical: false
- Agent: false
```

### PR Comment (Optional)

When `CI_STICKY_COMMENTS=true`:

```markdown
**Stack CI**
- Provider: graphite
- Position: middle  
- Tier: minimal → lint, typecheck
- Reason: graphite-skip + no critical paths
- Flakes: none
- Duration: 2m21s
```

### Webhook (Optional)

When `CI_STATUS_WEBHOOK` is set:

```json
{
  "repo": "owner/name",
  "pr": 123,
  "sha": "abc123",
  "provider": "graphite",
  "position": "middle",
  "ci_mode": "minimal",
  "merge_queue_event": false,
  "critical_escalation": false,
  "duration_sec": 142,
  "flakes": []
}
```

## Advanced Features

### Monorepo Support

Belay detects workspace configurations:

- npm/yarn/pnpm workspaces
- Lerna
- Nx
- Turborepo

Runs package-scoped commands when possible.

### Caching

Automatic cache management for:

- Package manager caches (npm, yarn, pnpm, bun)
- Language caches (Go modules, Rust target)
- Build outputs (when safe)

### Flake Handling

```bash
# First attempt fails
timeout 10m npm test
# Exit code: 1

# Automatic retry
🔁 Retry: npm test
# Success → marked as flaky
```

### Adaptive Timeouts

```bash
# Soft timeout hit
timeout 10m npm test
# Exit code: 124

# Expanded timeout
⏳ Soft timeout, extending to 20m
timeout 20m npm test
```

## Debugging

### Enable Debug Output

Set repository secret:

- Name: `ACTIONS_RUNNER_DEBUG`
- Value: `true`

### Check Detection

View detection job output:

1. Go to Actions tab
2. Click on workflow run
3. Expand "Detect" job
4. Review detection steps

### Force Specific Tier

In `.ci.toml`:

```toml
force = "full"
```

## Examples

### Next.js Application

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

Belay will detect:

- Node.js with npm/yarn/pnpm
- Scripts from package.json
- React/Next.js patterns

### Rust CLI Tool

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

Belay will run:

- `cargo fmt -- --check`
- `cargo clippy -D warnings`
- `cargo test`
- `cargo build`

### Python Package

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

Belay will:

- Install dependencies
- Run ruff for linting
- Execute pytest if present

### Monorepo with Turborepo

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

```toml
# .ci.toml (optional)
critical_globs = [
  "packages/core/**",
  "packages/api/schema.ts",
]
```

## Migration Guide

### From Basic GitHub Actions

**Before:**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
```

**After:**

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@alpha
    secrets: inherit
```

### From Complex Workflows

Keep your existing scripts, Belay will use them:

```json
{
  "scripts": {
    "ci:lint": "npm run lint",
    "ci:test": "npm run test:unit && npm run test:integration",
    "ci:build": "npm run build:prod"
  }
}
```

Rename to standard names for auto-detection:

```json
{
  "scripts": {
    "lint": "npm run lint",
    "test": "npm run test:unit && npm run test:integration",
    "build": "npm run build:prod"
  }
}
```

## Troubleshooting

### Problem: Commands Not Found

**Symptom:** "No lint/test/build commands detected"

**Solution:**

1. Add scripts to package.json
2. Create Makefile with targets
3. Use `.ci.toml` to override

### Problem: Wrong Tier Selected

**Symptom:** CI runs too much or too little

**Solution:**

1. Check risk factors in job summary
2. Review critical path configuration
3. Use `force` in `.ci.toml` if needed

### Problem: Tests Timeout

**Symptom:** Tests killed after timeout

**Solution:**

1. Increase timeout in `.ci.toml`
2. Split large test suites
3. Check for hanging tests

### Problem: Cache Misses

**Symptom:** Slow dependency installation

**Solution:**

1. Ensure lockfiles are committed
2. Check cache key in debug output
3. Verify cache permissions

## Performance Tips

### Optimize Detection

Place detection files in repository root:

- `package.json`
- `Cargo.toml`
- `go.mod`
- `Makefile`

### Speed Up Tests

1. **Use Graphite** for stack-aware optimization
2. **Split tests** into parallel jobs
3. **Cache aggressively** with proper keys
4. **Run minimal tier** for draft PRs

### Reduce False Positives

```json
{
  "ignore": [
    "**/*.md",
    "docs/**",
    "examples/**"
  ]
}
```

## Security Considerations

### Secrets

- Never commit secrets
- Use GitHub Secrets for tokens
- Rotate tokens regularly

### Permissions

Belay uses minimal permissions:

- `contents: read`
- `pull-requests: write` (for comments)
- `statuses: write` (for checks)

### Webhook Security

- Use HTTPS URLs only
- Validate webhook signatures
- Limit payload data

## FAQ

**Q: Can I use Belay with private npm packages?**
A: Yes, provide `NPM_TOKEN` as a secret.

**Q: Does Belay work with self-hosted runners?**
A: Yes, but ensure required tools are installed.

**Q: Can I run Belay locally?**
A: Use `act` for local testing. See `apps/sandbox` for a minimal example.

**Q: How do I disable Belay temporarily?**
A: Add `[skip ci]` to commit message or close PR.

**Q: Can Belay deploy my application?**
A: No, Belay is for CI only. Deployment actions coming soon.

## Changelog

### v1.0.0 (Current)

- Initial release
- Auto-detection for major languages
- Three-tier risk system
- Self-healing capabilities
- Graphite integration

### Roadmap

- **v1.1.0** - Improved monorepo support
- **v1.2.0** - Custom test reporters
- **v1.3.0** - Deployment preview integration
- **v2.0.0** - Multi-platform matrix support

## Support

- [GitHub Issues](https://github.com/outfitter-dev/actions/issues)
- [Discussions](https://github.com/outfitter-dev/actions/discussions)
- [Main Documentation](../README.md)
