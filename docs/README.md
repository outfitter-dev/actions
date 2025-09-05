# Outfitter Actions Documentation

> Complete documentation for @outfitter/actions reusable workflows and composite actions.

## Quick Links

### Actions

- **[Belay](./actions/belay.md)** - Zero-config CI workflow with auto-detection

### Guides

- [Getting Started](#getting-started)
- [Migration Guide](#migration-guide)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- GitHub repository
- Basic understanding of GitHub Actions
- (Optional) Graphite for stacked PRs

### Installation

Add the Belay workflow to your repository:

1. Create `.github/workflows/ci.yml` in your repository
2. Add the following content:

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@v1
    secrets: inherit
```

3. Commit and push - that's it!

## Available Actions

### Belay

Our flagship zero-config CI workflow. [Full documentation →](./actions/belay.md)

**Key Features:**

- Auto-detects language and tooling
- Risk-based CI intensity
- Self-healing with automatic retries
- Agent-aware output formatting

## Migration Guide

### From Manual GitHub Actions

If you're currently using manual GitHub Actions workflows:

1. **Backup your existing workflow** - Copy your current `.github/workflows` files
2. **Add Belay** - Create a new workflow using Belay
3. **Test in parallel** - Run both workflows temporarily
4. **Remove old workflow** - Once confident, remove the manual workflow

### From Other CI Systems

Coming from Jenkins, CircleCI, or Travis? Belay handles the heavy lifting:

1. **No configuration files needed** - Belay auto-detects your setup
2. **Keep your existing scripts** - If you have `package.json` scripts or Makefile targets, Belay will use them
3. **Gradual migration** - Run Belay alongside your existing CI initially

## Best Practices

### Repository Setup

1. **Use conventional script names** in `package.json`:
   - `lint` - For linting
   - `typecheck` - For type checking  
   - `test` - For running tests
   - `build` - For building the project

2. **Leverage merge queues** - Enable GitHub merge queue or use Graphite for optimal performance

3. **Keep branches short-lived** - Belay works best with trunk-based development

### Performance Optimization

- **Use Graphite** - Add `GRAPHITE_CI_OPTIMIZER_TOKEN` for stack-aware optimization
- **Cache dependencies** - Belay automatically handles caching for most languages
- **Parallelize when possible** - Split large test suites across multiple jobs

### Security

- **Never commit secrets** - Use GitHub Secrets for sensitive values
- **Review webhook payloads** - If using webhook notifications, ensure URLs are secure
- **Limit permissions** - Belay uses minimal required permissions by default

## Configuration Reference

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GRAPHITE_CI_OPTIMIZER_TOKEN` | Enable Graphite stack optimization | No |
| `CI_STICKY_COMMENTS` | Enable sticky PR comments | No |
| `CI_STATUS_WEBHOOK` | Webhook URL for notifications | No |

### `.ci.json` Schema

```typescript
interface CIConfig {
  // Force a specific CI tier
  force?: "full" | "essential" | "minimal";
  
  // Override default timeout (minutes)
  timeout_minutes?: number;
  
  // Files to ignore (glob patterns)
  ignore?: string[];
  
  // Critical files that trigger full CI
  critical_globs?: string[];
  
  // Output configuration
  outputs?: {
    comment?: boolean;
    webhook?: boolean;
  };
}
```

## Troubleshooting

### Common Issues

#### "No commands detected"

Belay couldn't find any commands to run. Solutions:

- Add scripts to your `package.json`
- Create a `Makefile` with standard targets
- Check that language files are in the repository root

#### "CI taking too long"

If CI is running longer than expected:

- Check if you're hitting the Full tier unnecessarily
- Review your `.ci.json` for forced tiers
- Consider splitting large test suites

#### "Tests are flaky"

Belay automatically retries failed tests once. If tests continue to fail:

- Review test implementation for race conditions
- Check for external dependencies
- Consider increasing timeouts in test configuration

### Debug Mode

Enable debug output by setting the `ACTIONS_RUNNER_DEBUG` secret to `true` in your repository settings.

## Architecture

### Components

```
belay.yml (workflow)
    ├── detect (job)
    │   └── detector (action)
    │       ├── Language detection
    │       ├── Command discovery
    │       ├── Risk scoring
    │       └── Provider selection
    ├── meta (job)
    │   └── Summary generation
    └── run (job)
        ├── minimal
        ├── essential
        └── full
```

### Decision Flow

1. **Detection Phase** - Analyzes repository structure
2. **Risk Assessment** - Calculates appropriate CI tier
3. **Execution Phase** - Runs selected tier
4. **Reporting Phase** - Generates summaries and notifications

## Contributing

See our [Contributing Guide](../CONTRIBUTING.md) for details on:

- Setting up development environment
- Testing changes locally with `act`
- Submitting pull requests
- Code style guidelines

## Support

### Getting Help

- **GitHub Issues** - For bugs and feature requests
- **Discussions** - For questions and ideas
- **Documentation** - You're already here!

### Useful Links

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Graphite Documentation](https://graphite.dev/docs)
- [Act (Local Testing)](https://github.com/nektos/act)

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for version history and migration notes.

## License

MIT © [Outfitter](https://github.com/outfitter-dev)