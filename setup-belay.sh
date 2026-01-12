#!/usr/bin/env bash
# One-line Belay CI setup script
# Usage: curl -fsSL https://raw.githubusercontent.com/outfitter-dev/actions/v1/setup-belay.sh | bash

set -euo pipefail

# Error handling - report line number on failure
trap 'echo "[ERROR] setup-belay.sh failed on line $LINENO (exit code: $?)" >&2; exit 1' ERR

echo "Setting up Belay CI..."

# Create workflows directory
mkdir -p .github/workflows

# Download minimal workflow
curl -fsSL -o .github/workflows/ci.yml \
  "https://raw.githubusercontent.com/outfitter-dev/actions/v1/templates/belay-minimal.yml"

echo "Belay CI installed!"
echo ""
echo "Next steps:"
echo "1. Review: .github/workflows/ci.yml"
echo "2. Commit: git add .github/workflows/ci.yml && git commit -m 'feat: add Belay CI'"
echo "3. Push and watch the magic happen!"
echo ""
echo "Optional: Run the migration tool for advanced setup:"
echo "  bunx github:outfitter-dev/actions/tools/migrate-to-belay.ts"
