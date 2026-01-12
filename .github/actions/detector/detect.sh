#!/usr/bin/env bash
# Fallback bash detector for when TypeScript tools aren't available

set -euo pipefail

# Error handling - report line number on failure
# Capture exit code immediately before it gets overwritten by other commands
trap 'rc=$?; echo "::error::detect.sh failed on line $LINENO (exit code: $rc)" >&2; exit $rc' ERR

# Ensure GITHUB_OUTPUT is set (use /dev/null as fallback for local testing)
GITHUB_OUTPUT="${GITHUB_OUTPUT:-/dev/null}"

# Initialize variables with safe defaults
lang=""
pm=""
install_cmd=""
lint_cmd=""
typecheck_cmd=""
test_cmd=""
build_cmd=""
is_monorepo="false"
workspaces="{}"

# Language detection (ordered by priority)
if [[ -f bun.lockb || -f bun.lock ]]; then
  lang="bun"
  pm="bun"
  install_cmd="bun install --frozen-lockfile"
elif [[ -f package-lock.json ]]; then
  lang="node"
  pm="npm"
  install_cmd="npm ci"
elif [[ -f yarn.lock ]]; then
  lang="node"
  pm="yarn"
  install_cmd="yarn install --frozen-lockfile"
elif [[ -f pnpm-lock.yaml ]]; then
  lang="node"
  pm="pnpm"
  install_cmd="pnpm install --frozen-lockfile"
elif [[ -f Cargo.toml ]]; then
  lang="rust"
  install_cmd="cargo fetch"
elif [[ -f go.mod ]]; then
  lang="go"
  install_cmd="go mod download"
elif [[ -f requirements.txt ]]; then
  lang="python"
  install_cmd="pip install -r requirements.txt"
elif [[ -f pyproject.toml ]]; then
  lang="python"
  install_cmd="pip install ."
elif [[ -f pom.xml ]]; then
  lang="java"
  install_cmd="mvn dependency:resolve"
elif [[ -f build.gradle || -f build.gradle.kts ]]; then
  lang="gradle"
  install_cmd="./gradlew dependencies"
elif [[ -f Makefile ]]; then
  lang="make"
  install_cmd="make deps || true"
elif [[ -f package.json ]]; then
  # Fallback: package.json present without lockfile → treat as Node (npm)
  lang="node"
  pm="npm"
  install_cmd="npm install --no-audit --progress=false"
fi

# Command detection based on language
case "${lang:-}" in
  bun|node)
    # Check package.json for scripts
    if [[ -f package.json ]]; then
      # Check for monorepo
      if jq -e '.workspaces' package.json >/dev/null 2>&1; then
        is_monorepo="true"
        workspaces=$(jq -c '.workspaces // []' package.json)
      fi
      
      # Detect commands from scripts using selected package manager
      if [[ -z "${pm:-}" ]]; then pm="npm"; fi
      if jq -e '.scripts.lint' package.json >/dev/null 2>&1; then
        if [[ "$pm" == "bun" ]]; then lint_cmd="bun run lint"; else lint_cmd="$pm run lint"; fi
      fi
      if jq -e '.scripts.typecheck' package.json >/dev/null 2>&1; then
        if [[ "$pm" == "bun" ]]; then typecheck_cmd="bun run typecheck"; else typecheck_cmd="$pm run typecheck"; fi
      elif jq -e '.scripts["type-check"]' package.json >/dev/null 2>&1; then
        if [[ "$pm" == "bun" ]]; then typecheck_cmd="bun run type-check"; else typecheck_cmd="$pm run type-check"; fi
      fi
      if jq -e '.scripts.test' package.json >/dev/null 2>&1; then
        if [[ "$pm" == "bun" ]]; then test_cmd="bun run test"; else test_cmd="$pm run test"; fi
      fi
      if jq -e '.scripts.build' package.json >/dev/null 2>&1; then
        if [[ "$pm" == "bun" ]]; then build_cmd="bun run build"; else build_cmd="$pm run build"; fi
      fi
    fi
    ;;
    
  rust)
    # Check for Cargo workspace
    if grep -q '^\[workspace\]' Cargo.toml 2>/dev/null; then
      is_monorepo="true"
      # Extract workspace members
      workspaces=$(grep -A 10 '^\[workspace\]' Cargo.toml | grep 'members' | sed 's/.*\[//;s/\].*//' | tr -d '"' | jq -R -s -c 'split(",") | map(gsub("^\\s+|\\s+$";""))') || workspaces="[]"
    fi
    
    lint_cmd="cargo fmt -- --check && cargo clippy -- -D warnings"
    test_cmd="cargo test --all"
    build_cmd="cargo build --all"
    ;;
    
  go)
    # Check for Go workspace
    if [[ -f go.work ]]; then
      is_monorepo="true"
    fi
    
    lint_cmd="go vet ./..."
    test_cmd="go test ./..."
    build_cmd="go build ./..."
    ;;
    
  python)
    # Check for common Python monorepo patterns
    if [[ -f pyproject.toml ]] && grep -q '\[tool.poetry.group\|packages = \[' pyproject.toml 2>/dev/null; then
      is_monorepo="true"
    fi
    
    lint_cmd="ruff check . || flake8 . || pylint **/*.py || true"
    test_cmd="pytest || python -m pytest || python -m unittest discover || true"
    ;;
    
  java)
    # Check for Maven multi-module
    if grep -q '<modules>' pom.xml 2>/dev/null; then
      is_monorepo="true"
    fi
    
    lint_cmd="mvn checkstyle:check || true"
    test_cmd="mvn test"
    build_cmd="mvn package"
    ;;
    
  gradle)
    # Gradle multi-project
    if [[ -f settings.gradle || -f settings.gradle.kts ]]; then
      if grep -q 'include\|includeFlat' settings.gradle* 2>/dev/null; then
        is_monorepo="true"
      fi
    fi
    
    lint_cmd="./gradlew check || true"
    test_cmd="./gradlew test"
    build_cmd="./gradlew build"
    ;;
    
  make)
    # Check Makefile for targets
    if grep -q '^lint:' Makefile 2>/dev/null; then
      lint_cmd="make lint"
    fi
    if grep -q '^test:' Makefile 2>/dev/null; then
      test_cmd="make test"
    fi
    if grep -q '^build:' Makefile 2>/dev/null; then
      build_cmd="make build"
    fi
    ;;
    
  *)
    # No recognized language - commands stay empty
    ;;
esac

# Provider detection
provider="github"
if [[ "${USE_GRAPHITE:-}" == "true" ]]; then
  provider="graphite"
elif [[ "${USE_GRAPHITE:-}" == "auto" && -n "${GRAPHITE_TOKEN:-}" ]]; then
  provider="graphite"
elif [[ -d ".github/actions/graphite" ]]; then
  provider="graphite"
elif grep -r "withgraphite/graphite-ci-action" .github/workflows 2>/dev/null | grep -q .; then
  provider="graphite"
fi

# Output all detected values (with proper quoting)
{
  echo "lang=${lang:-}"
  echo "install_cmd=${install_cmd:-}"
  echo "lint_cmd=${lint_cmd:-}"
  echo "typecheck_cmd=${typecheck_cmd:-}"
  echo "test_cmd=${test_cmd:-}"
  echo "build_cmd=${build_cmd:-}"
  echo "provider=${provider:-github}"
  echo "is_monorepo=${is_monorepo:-false}"
  echo "workspaces=${workspaces:-{}}"
} >> "$GITHUB_OUTPUT"
