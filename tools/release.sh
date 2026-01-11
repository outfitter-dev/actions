#!/usr/bin/env bash
# Release script for Belay CI versioning

set -euo pipefail

# Error handling - report line number on failure
trap 'echo "[ERROR] release.sh failed on line $LINENO (exit code: $?)" >&2; exit 1' ERR

# Colors for output (with safe defaults for non-terminal environments)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Check if we're on main branch
current_branch=$(git branch --show-current)
if [[ "${current_branch:-}" != "main" ]]; then
  log_error "Must be on main branch to release. Current: ${current_branch:-unknown}"
  exit 1
fi

# Check for uncommitted changes
if [[ -n "$(git status --porcelain)" ]]; then
  log_error "Uncommitted changes detected. Please commit or stash."
  exit 1
fi

# Get version argument (with safe default)
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  log_error "Usage: $0 <version>"
  echo "Examples:"
  echo "  $0 v1        # Major version (stable)"
  echo "  $0 v1.0.0    # Specific version"
  echo "  $0 alpha     # Alpha release"
  echo "  $0 beta      # Beta release"
  exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^(v[0-9]+(\.[0-9]+(\.[0-9]+)?)?|alpha|beta|rc[0-9]+)$ ]]; then
  log_error "Invalid version format: $VERSION"
  exit 1
fi

# Pull latest changes
log_info "Pulling latest changes..."
git pull origin main

# Run tests
log_info "Running tests..."
if command -v bun >/dev/null 2>&1; then
  bun test || { log_error "Tests failed"; exit 1; }
else
  log_warn "Bun not installed, skipping tests"
fi

# Create and push tag
log_info "Creating tag: $VERSION"

# For major versions (v1, v2), we'll force update the tag to latest commit
if [[ "$VERSION" =~ ^v[0-9]+$ ]]; then
  # Delete existing tag if it exists (locally and remote)
  git tag -d "$VERSION" 2>/dev/null || true
  git push origin ":refs/tags/$VERSION" 2>/dev/null || true
  
  # Create new tag with message
  git tag -a "$VERSION" -m "Release $VERSION - Belay CI

Zero-config CI for GitHub Actions with intelligent tier selection.

Features:
- Auto-detection of language and tools
- Risk-based CI intensity (minimal/essential/full)
- Stack-aware (Graphite/GitHub)
- Monorepo support
- Self-healing with retries
- Agent-aware formatting

Usage:
\`\`\`yaml
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@$VERSION
    secrets: inherit
\`\`\`
"
  log_info "Moving major version tag to latest commit"
else
  # For specific versions, check if tag already exists
  if git tag -l "$VERSION" | grep -q "$VERSION"; then
    log_error "Tag $VERSION already exists"
    exit 1
  fi
  
  git tag -a "$VERSION" -m "Release $VERSION"
fi

# Push tag
log_info "Pushing tag to origin..."
git push origin "$VERSION" --force-with-lease

# Create GitHub release (if gh CLI is available)
if command -v gh >/dev/null 2>&1; then
  log_info "Creating GitHub release..."
  
  RELEASE_NOTES="## 🚀 Belay CI - $VERSION

### Quick Start
\`\`\`yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@$VERSION
    secrets: inherit
\`\`\`

### What's Included
- Zero-config language detection
- Intelligent risk-based CI tiers
- Monorepo support
- Flaky test retries
- Stack awareness (Graphite/GitHub)

### Migration
\`\`\`bash
bunx github:outfitter-dev/actions/tools/migrate-to-belay.ts
\`\`\`

See [ADOPTION.md](https://github.com/outfitter-dev/actions/blob/$VERSION/ADOPTION.md) for detailed instructions.
"

  if [[ "$VERSION" =~ ^v[0-9]+$ ]]; then
    # Major version - mark as latest
    gh release create "$VERSION" \
      --title "Belay CI $VERSION (Latest Stable)" \
      --notes "$RELEASE_NOTES" \
      --latest
  elif [[ "$VERSION" == "alpha" || "$VERSION" == "beta" ]]; then
    # Pre-release
    gh release create "$VERSION" \
      --title "Belay CI $VERSION" \
      --notes "$RELEASE_NOTES" \
      --prerelease
  else
    # Specific version
    gh release create "$VERSION" \
      --title "Belay CI $VERSION" \
      --notes "$RELEASE_NOTES"
  fi
  
  log_info "GitHub release created: https://github.com/outfitter-dev/actions/releases/tag/$VERSION"
else
  log_warn "gh CLI not installed, skipping GitHub release creation"
  echo "Install with: brew install gh"
fi

log_info "Release complete!"
echo ""
echo "Users can now reference: outfitter-dev/actions/.github/workflows/belay.yml@$VERSION"
echo ""
echo "Next steps:"
echo "1. Test in a sample repository"
echo "2. Update documentation if needed"
echo "3. Announce to team"
