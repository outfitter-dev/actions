# PRD: Zero‑Config Stack CI (`@outfitter/actions`)

*Goal: CI that gets out of the way. No YAML yak‑shaving. Push → green checks → ship.*

---

## 1. Product Promise

**Make CI invisible.** If a developer or agent has to think about CI configuration, we missed the mark. Defaults should fit 95% of cases; the remaining 5% get a clean escape hatch.

---

## 2. Scope (MVP)

A **single reusable GitHub workflow** (\`belay.yml\`) + a small helper composite action that together:

1. **Auto‑detect** language/tooling/test commands with zero inputs.
2. **Minimize work** per PR via stack/queue awareness (Graphite or GitHub).
3. **Self‑heal** common CI pain (flaky test retries, cache priming, adaptive timeouts).
4. **Behave identically** for human contributors and AI agents.
5. **Emit one required meta check** that never skips, plus optional comment/webhook.

Out of scope (MVP): org‑wide policy management, exotic runners, non‑GitHub CIs.

---

## 3. One‑Line Interface

```yaml
name: CI
on: [pull_request, merge_group]
jobs:
  ci:
    uses: outfitter-dev/actions/.github/workflows/belay.yml@v1
    secrets: inherit # That’s it.
```

> **Policy:**
>
> - We keep `@v1` stable and push backwards‑compatible improvements under that tag.
> - Breaking changes → `@v2` with a migration note.

---

## 4. Zero‑Config Behavior

### 4.1 Language & Tooling Detection

Ordered probes (extendable):

```text
bun.lockb        → bun (runtime, test, scripts)
package-lock.json / pnpm-lock.yaml / yarn.lock → node (npm/pnpm/yarn)
Cargo.toml       → rust
go.mod           → go
requirements.txt / pyproject.toml → python
pom.xml / gradlew → java/kotlin
gradle.properties → gradle
Makefile         → generic make targets
```

### 4.2 Smart Command Discovery

Priority: **lint → typecheck → test → build**. We detect from:

- `package.json` scripts (`lint`, `typecheck`, `test`, `build`, `fmt:check`)
- `Makefile` targets
- language‑specific defaults (e.g., Rust: `cargo fmt -- --check`, `cargo clippy -D warnings`, `cargo test`)

If a command is missing, we skip it rather than fail.

### 4.3 Provider & Stack Detection (Graphite ↔ GitHub)

**Provider selection (first match wins):**

1. `inputs.use_graphite` (internal flag; default `auto`).
2. Presence of `GRAPHITE_TOKEN` secret.
3. Repo signal: `.github/actions/graphite/*` **or** code reference to `withgraphite/graphite-ci-action`.
4. Fallback: `github`.

**Stack awareness:**

- **Graphite provider:** use Graphite CI Optimizer outputs to decide skip/lean/heavy; respect bottom‑N and top‑of‑stack defaults.
- **GitHub provider:** infer position via PR relationships (top/middle/bottom) using `gh` CLI and branch topology.

### 4.4 Risk‑Scored CI Intensity

We do not expose “light vs full” knobs to users. Instead we compute a **risk score** and pick a tier:

- Inputs to `risk()` (examples):

  - Changed file count and spread
  - Critical path hits (tooling, schemas, app shells, workflow files)
  - Stack position (ends riskier than middle)
  - Draft status, PR age
  - (Optional) author reliability (merge success rate; org‑local only)

- Tiers:

  - **Minimal**: lint + `type-check` (+ smoke tests when cheap)
  - **Essential**: minimal + targeted tests/build for impacted packages
  - **Full**: full test/build matrix (always for `merge_group`)

**Hard rules that override the score:**

- `merge_group` events → **Full**.
- Graphite optimizer says “run full” → **Full**.
- Critical path hit (configurable defaults) → elevate to **Full**.

### 4.5 Self‑Healing

- **Flake retry:** on test failure, re‑run the failing step once with jittered backoff. If pass → mark as flaky in summary; if fail again → real red.
- **Adaptive timeouts:** expand step timeout by a small factor after one soft timeout; cap growth.
- **Cache priming:** if a cold cache is detected (miss), persist a warm cache at end of job for the key; next run restores.

### 4.6 Agent‑Aware UX (no config)

Heuristics to detect agents (commit author bots, known app tokens, CI‑authored PRs). If agent:

- Prefer **structured JSON** summaries (easier to parse).
- Emit precise error traces and reproduction commands.
- Increase parallelism within safe limits (runner CPU‑bound checks).
- Keep the single human‑readable meta check intact.

---

## 5. Merge Queue Dual Path

### 5.1 GitHub Merge Queue Mode

- **PR events:** run Minimal/Essential by risk.
- **`merge_group` events:** always run **Full**. This is the only required gate for merging.
- If MQ isn’t enabled, we degrade gracefully (essential/full on PR) and post a reminder.

### 5.2 Graphite Merge Queue Mode

- Use Graphite CI Optimizer to de‑duplicate heavy CI across stacked PRs (ends/bottom‑N/top always validated).
- When Graphite MQ batches/fast‑forwards, our workflow still exposes a **single meta check** that remains green/non‑skipped.
- If Graphite API is unavailable or token missing → safe fallback to GitHub path with **Full** on `merge_group`/ends.

---

## 6. Outputs & Reporting

**Always:** a single required job (e.g., `stack-ci`) that writes a concise summary to the job log and `$GITHUB_STEP_SUMMARY`.

**Configurable channels (zero‑touch defaults, optional secrets):**

- **Comment (sticky):** add/update a PR comment with the summary and decisions.
- **Check details:** keep the meta job’s log/summary as the source of truth.
- **Webhook:** if `WEBHOOK_URL` secret is present, POST a JSON payload (see schema below).

> Default: meta check + summary only. Comment/webhook auto‑enable when secrets are present.

**Webhook payload (example):**

```json
{
  "repo": "{owner}/{name}",
  "pr": 123,
  "sha": "<commit>",
  "provider": "graphite|github",
  "position": "top|middle|bottom",
  "ci_mode": "minimal|essential|full",
  "merge_queue_event": false,
  "critical_escalation": true,
  "duration_sec": 142,
  "flakes": [{ "name": "tests/foo.spec.ts", "retried": true }]
}
```

---

## 7. Escape Hatch (for the 5%)

Optional repo‑local config file: `.ci.json`. Missing file = zero‑config behavior.

```json
{
  "force": "full|essential|minimal",
  "timeout_minutes": 30,
  "ignore": ["**/*.md", "docs/**"],
  "critical_globs": ["packages/**/package.json", "**/schema.*", ".github/**"],
  "outputs": { "comment": true, "webhook": false }
}
```

We track adoption (telemetry counter only) to learn where auto‑detection fell short.

---

## 8. Architecture

**Components:**

- `belay.yml` — the reusable workflow (public entrypoint).
- `detector` (composite action) — language/tool/stack provider & risk scoring.
- `runtime` (container image) — common CLIs preinstalled (bun/node/go/rust/python/java + git/gh/jq), Actions cache friendly.
- `plugins/*` — optional language helpers (e.g., Node test splitter, Rust nextest adapter).

**Execution outline:**

1. **Detect** → provider, language(s), commands, stack position, risk tier.
2. **Meta (required)** → summarize decisions; start timers; enable outputs.
3. **Run** → Minimal/Essential/Full steps per tier and event.
4. **Self‑heal** → retries/timeouts/cache prime.
5. **Report** → emit webhook/comment if enabled; upload metrics artifact.

**Concurrency:**

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Security:**

- Secrets are read only when present; absence → safe defaults.
- Webhook payload includes no secrets; sender auth via secret URL.
- No org settings are changed by the workflow (we only suggest MQ if absent).

---

## 9. Definitions per Language (initial set)

- **Bun/Node**: `bun install` or package‑manager install; scripts for lint/typecheck/test/build; Vitest/Jest detection; cache `~/.bun/install/cache` or package‑manager caches keyed by lockfile.
- **Rust**: `rustup` toolchain (stable), `cargo fmt -- --check`, `cargo clippy -D warnings`, `cargo test`; optional nextest if present.
- **Go**: `go vet`, `go test ./...`, module cache.
- **Python**: `pip install -r requirements.txt`, `ruff check`, `pytest -q` (if present).

Monorepos: detect workspaces (pnpm/npm/yarn), run package‑scoped tasks affected by the diff; fall back to repo‑wide tasks when unsure.

---

## 10. Telemetry & Observability

- Emit a small JSON artifact per run: provider, position, tier, durations, cache hits, retry counts.
- Optional webhook feeds a lightweight dashboard for CI minute savings.
- No PII; optional author‑reliability metrics are org‑internal only and aggregate.

---

## 11. Acceptance Criteria

1. **≤3 minutes** to first green checkmark for ≥80% of PRs (in internal repos).
2. **Single required check** never skipped across PR + merge queue runs.
3. **40% reduction** in median CI duration on stacked workflows vs baseline.
4. **Belay** merges blocked by missing/skipped required checks.
5. **≤5%** of repos adopt `.ci.json` overrides after 30 days.

---

## 12. Delivery Plan (2 weeks)

**Week 1**

- Detector composite action (language/commands/provider/position/risk).
- Belay workflow skeleton (meta check + minimal/essential/full tiers).
- Container image with common toolchains; cache wiring.
- Graphite path (optimizer integration) + GitHub path (`merge_group`).

**Week 2**

- Flake retry + adaptive timeout + cache priming.
- Agent‑aware summaries (JSON + human friendly).
- Webhook output + metrics artifact.
- Monorepo diff‑aware package selection (basic version).
- Docs (README + quickstart) and sample repos (Graphite & GitHub MQ).

---

## 13. Risks & Mitigations

- **False “minimal” classification** → enforce `merge_group` as Full; critical‑path escalation.
- **Graphite token missing** → fall back to GitHub path automatically.
- **Cold caches on first runs** → deterministic warmup step saves cache for next.
- **Test retried hides real failure** → limit to one retry; mark flaky in summary; do not downgrade severity at `merge_group`.

---

## 14. Appendix

### 14.1 Example Comment Body

```markdown
**Stack CI**

- Provider: graphite
- Position: middle
- Tier: minimal → lint, typecheck
- Reason: graphite-skip + no critical paths
- Flakes: none
- Duration: 2m21s
```

### 14.2 `.ci.json` Schema (draft)

```json
{
  "$schema": "https://json.schemastore.org/xyz.json",
  "type": "object",
  "properties": {
    "force": { "enum": ["full", "essential", "minimal"] },
    "timeout_minutes": { "type": "integer", "minimum": 5, "maximum": 120 },
    "ignore": { "type": "array", "items": { "type": "string" } },
    "critical_globs": { "type": "array", "items": { "type": "string" } },
    "outputs": {
      "type": "object",
      "properties": {
        "comment": { "type": "boolean" },
        "webhook": { "type": "boolean" }
      }
    }
  }
}
```

### 14.3 Directory Layout (repo)

```text
@outfitter/actions/
  ├─ .github/workflows/belay.yml
  ├─ actions/detector/action.yml
  ├─ runtime/Dockerfile
  ├─ plugins/
  │   ├─ node/
  │   ├─ rust/
  │   └─ go/
  └─ docs/README.md
```

---

## 15. Why This Wins

- **Humans:** Stop thinking about CI. Push, see green, ship.
- **Agents:** Deterministic behavior, structured outputs, clear remediation.
- **Business:** Faster merges, fewer interruptions, measurable CI cost reductions.

---

## 16. Implementation — Code You Can Ship Today

### 16.1 Reusable Workflow: `.github/workflows/belay.yml`

```yaml
name: Belay Config Stack CI
on:
  pull_request:
  merge_group:
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write
  statuses: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  detect:
    name: Detect → provider/lang/commands/risk
    runs-on: ubuntu-latest
    outputs:
      provider: ${{ steps.det.outputs.provider }}
      position: ${{ steps.det.outputs.position }}
      tier: ${{ steps.det.outputs.tier }}        # minimal|essential|full
      is_agent: ${{ steps.det.outputs.is_agent }}
      install_cmd: ${{ steps.det.outputs.install_cmd }}
      lint_cmd: ${{ steps.det.outputs.lint_cmd }}
      typecheck_cmd: ${{ steps.det.outputs.typecheck_cmd }}
      test_cmd: ${{ steps.det.outputs.test_cmd }}
      build_cmd: ${{ steps.det.outputs.build_cmd }}
      lang: ${{ steps.det.outputs.lang }}        # bun|node|rust|go|python|...
      critical: ${{ steps.det.outputs.critical }}
    steps:
      - uses: actions/checkout@v4

      - id: det
        uses: outfitter-dev/actions/actions/detector@v1
        with:
          use_graphite: auto
        env:
          GRAPHITE_TOKEN: ${{ secrets.GRAPHITE_TOKEN }}

  meta:
    name: Meta (required)
    runs-on: ubuntu-latest
    needs: detect
    if: always()
    outputs:
      summary_line: ${{ steps.sum.outputs.summary_line }}
    steps:
      - id: sum
        run: |
          echo "summary_line=provider:${{ needs.detect.outputs.provider }} pos:${{ needs.detect.outputs.position }} tier:${{ needs.detect.outputs.tier }} crit:${{ needs.detect.outputs.critical }} agent:${{ needs.detect.outputs.is_agent }}" >> $GITHUB_OUTPUT
          echo "**Stack CI**

- Provider: ${{ needs.detect.outputs.provider }}
- Position: ${{ needs.detect.outputs.position }}
- Tier: ${{ needs.detect.outputs.tier }}
- Critical Escalation: ${{ needs.detect.outputs.critical }}
- Agent: ${{ needs.detect.outputs.is_agent }}" >> $GITHUB_STEP_SUMMARY

      - name: (Optional) Sticky Comment
        if: ${{ secrets.CI_STICKY_COMMENTS == 'true' && github.event_name == 'pull_request' }}
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: stack-ci
          message: |
            **Stack CI**
            - Provider: ${{ needs.detect.outputs.provider }}
            - Position: ${{ needs.detect.outputs.position }}
            - Tier: ${{ needs.detect.outputs.tier }}
            - Critical: ${{ needs.detect.outputs.critical }}

      - name: (Optional) Webhook
        if: ${{ secrets.CI_STATUS_WEBHOOK && github.event_name == 'pull_request' }}
        run: |
          jq -n --arg repo "${{ github.repository }}" \
                --arg sha "${{ github.sha }}" \
                --arg provider "${{ needs.detect.outputs.provider }}" \
                --arg position "${{ needs.detect.outputs.position }}" \
                --arg tier "${{ needs.detect.outputs.tier }}" \
                --arg crit "${{ needs.detect.outputs.critical }}" \
                '{repo:$repo,sha:$sha,provider:$provider,position:$position,ci_mode:$tier,critical_escalation:($crit=="true")}' \
            | curl -fsSL -H 'content-type: application/json' -d @- "$CI_STATUS_WEBHOOK"

  minimal:
    name: Minimal (lint+typecheck + smoke)
    needs: [detect, meta]
    if: needs.detect.outputs.tier == 'minimal' || needs.detect.outputs.tier == 'essential' || needs.detect.outputs.tier == 'full'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Setup language runtimes on demand
      - uses: oven-sh/setup-bun@v1
        if: needs.detect.outputs.lang == 'bun'
      - uses: actions/setup-node@v4
        if: needs.detect.outputs.lang == 'node'
        with: { node-version: 'lts/*' }
      - uses: actions/setup-go@v5
        if: needs.detect.outputs.lang == 'go'
        with: { go-version: 'stable' }
      - uses: dtolnay/rust-toolchain@stable
        if: needs.detect.outputs.lang == 'rust'
      - uses: actions/setup-python@v5
        if: needs.detect.outputs.lang == 'python'
        with: { python-version: '3.x' }

      # Cache heuristics by language
      - name: Cache (bun)
        if: needs.detect.outputs.lang == 'bun'
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}

      - name: Cache (node)
        if: needs.detect.outputs.lang == 'node'
        uses: actions/cache@v4
        with:
          path: |
            ~/.npm
            ~/.cache/pnpm
            ~/.yarn/cache
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock') }}

      - name: Install deps
        run: ${{ needs.detect.outputs.install_cmd }}

      - name: Lint
        if: needs.detect.outputs.lint_cmd != ''
        run: ${{ needs.detect.outputs.lint_cmd }}

      - name: Typecheck
        if: needs.detect.outputs.typecheck_cmd != ''
        run: ${{ needs.detect.outputs.typecheck_cmd }}

      - name: Smoke tests (fast path)
        if: needs.detect.outputs.test_cmd != ''
        run: scripts/with-retry.sh "${{ needs.detect.outputs.test_cmd }} --runInBand --maxWorkers=2" || scripts/with-retry.sh "${{ needs.detect.outputs.test_cmd }}"

  essential:
    name: Essential (targeted tests/build)
    needs: [detect, meta]
    if: needs.detect.outputs.tier == 'essential' || needs.detect.outputs.tier == 'full'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ${{ needs.detect.outputs.build_cmd != '' && needs.detect.outputs.build_cmd || 'echo "no build"' }}
      - name: Tests (re-run with retry)
        if: needs.detect.outputs.test_cmd != ''
        run: scripts/with-retry.sh "${{ needs.detect.outputs.test_cmd }}"

  full:
    name: Full (always on merge_group)
    needs: [detect, meta]
    if: needs.detect.outputs.tier == 'full'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        if: needs.detect.outputs.build_cmd != ''
        run: ${{ needs.detect.outputs.build_cmd }}
      - name: Test (final gate)
        if: needs.detect.outputs.test_cmd != ''
        run: scripts/with-retry.sh "${{ needs.detect.outputs.test_cmd }}"
```

> **Note:** The workflow assumes `scripts/with-retry.sh` exists (see §16.4). For consumers, we also ship a fallback inline step if that script is missing.

---

### 16.2 Composite Action: `actions/detector/action.yml`

```yaml
name: Outfitter Detector
branding:
  icon: search
  color: purple
inputs:
  use_graphite:
    description: 'true|false|auto'
    default: auto
outputs:
  provider: { description: 'graphite|github' }
  position: { description: 'top|middle|bottom|unknown' }
  tier: { description: 'minimal|essential|full' }
  is_agent: { description: 'true|false' }
  install_cmd: { description: 'install command' }
  lint_cmd: { description: 'lint command or empty' }
  typecheck_cmd: { description: 'typecheck command or empty' }
  test_cmd: { description: 'test command or empty' }
  build_cmd: { description: 'build command or empty' }
  lang: { description: 'bun|node|rust|go|python|...' }
  critical: { description: 'true|false' }
runs:
  using: composite
  steps:
    - name: Ensure tools
      shell: bash
      run: |
        sudo apt-get update -y
        sudo apt-get install -y jq coreutils >/dev/null

    - name: Discover language & commands
      id: probe
      shell: bash
      run: |
        set -euo pipefail
        lang=""
        install_cmd=""
        lint_cmd=""; typecheck_cmd=""; test_cmd=""; build_cmd=""
        if [[ -f bun.lockb ]]; then lang=bun; install_cmd="bun install --frozen-lockfile"; fi
        if [[ -z "$lang" && -f package.json ]]; then lang=node; install_cmd="npm ci || pnpm i --frozen-lockfile || yarn install --frozen-lockfile"; fi
        if [[ -f Cargo.toml ]]; then lang=${lang:-rust}; install_cmd="true"; fi
        if [[ -f go.mod ]]; then lang=${lang:-go}; install_cmd="go mod download"; fi
        if [[ -f requirements.txt || -f pyproject.toml ]]; then lang=${lang:-python}; install_cmd="python -m pip install -r requirements.txt || pip install -r requirements.txt || true"; fi

        if [[ -f package.json ]]; then
          has() { jq -r --arg n "$1" '.scripts[$n] // empty' package.json; }
          [[ -z "$lint_cmd"      ]] && { s=$(has lint);       [[ -n "$s" ]] && lint_cmd="bun run lint || npm run lint"; }
          [[ -z "$typecheck_cmd" ]] && { s=$(has typecheck);  [[ -n "$s" ]] && typecheck_cmd="bun run typecheck || npm run typecheck"; }
          [[ -z "$test_cmd"      ]] && { s=$(has test);       [[ -n "$s" ]] && test_cmd="bun test || npm test -- --ci"; }
          [[ -z "$build_cmd"     ]] && { s=$(has build);      [[ -n "$s" ]] && build_cmd="bun run build || npm run build"; }
        fi
        # Rust defaults
        if [[ "$lang" == "rust" ]]; then
          lint_cmd=${lint_cmd:-"cargo fmt -- --check && cargo clippy -D warnings"}
          test_cmd=${test_cmd:-"cargo test --all --quiet"}
          build_cmd=${build_cmd:-"cargo build --all --quiet"}
        fi
        # Go defaults
        if [[ "$lang" == "go" ]]; then
          lint_cmd=${lint_cmd:-"go vet ./..."}
          test_cmd=${test_cmd:-"go test ./..."}
          build_cmd=${build_cmd:-"go build ./..."}
        fi
        # Python defaults
        if [[ "$lang" == "python" ]]; then
          lint_cmd=${lint_cmd:-"python -m pip install ruff pytest >/dev/null 2>&1 || true; ruff check ."}
          test_cmd=${test_cmd:-"pytest -q"}
        fi

        echo "lang=$lang" >> $GITHUB_OUTPUT
        echo "install_cmd=$install_cmd" >> $GITHUB_OUTPUT
        echo "lint_cmd=$lint_cmd" >> $GITHUB_OUTPUT
        echo "typecheck_cmd=$typecheck_cmd" >> $GITHUB_OUTPUT
        echo "test_cmd=$test_cmd" >> $GITHUB_OUTPUT
        echo "build_cmd=$build_cmd" >> $GITHUB_OUTPUT

    - name: Critical path detection
      id: paths
      uses: dorny/paths-filter@v3
      with:
        list-files: shell
        filters: |
          critical:
            - 'packages/**/package.json'
            - '**/schema.*'
            - '.github/**'

    - name: Provider & position (Graphite if present)
      id: prov
      shell: bash
      env:
        USE_GRAPHITE: ${{ inputs.use_graphite }}
        TOKEN: ${{ env.GRAPHITE_TOKEN }}
      run: |
        provider=github
        if [[ "$USE_GRAPHITE" == "true" ]]; then provider=graphite; fi
        if [[ "$USE_GRAPHITE" == "auto" && -n "$TOKEN" ]]; then provider=graphite; fi
        echo "provider=$provider" >> $GITHUB_OUTPUT
        # position for github path; 'unknown' here, filled in next step
        echo "position=unknown" >> $GITHUB_OUTPUT

    - name: Position (GitHub path)
      if: steps.prov.outputs.provider == 'github'
      id: pos
      shell: bash
      run: |
        set -euo pipefail
        HEAD="${{ github.head_ref }}"; BASE="${{ github.event.pull_request.base.ref || '' }}"
        if [[ -z "$BASE" ]]; then echo "position=unknown" >> $GITHUB_OUTPUT; exit 0; fi
        DEFAULT=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
        if [[ "$BASE" == "$DEFAULT" ]]; then echo "position=bottom" >> $GITHUB_OUTPUT
        elif [[ $(gh pr list --search "is:pr is:open base:$HEAD" --json number --jq 'length') -eq 0 ]]; then echo "position=top" >> $GITHUB_OUTPUT
        else echo "position=middle" >> $GITHUB_OUTPUT; fi

    - name: Graphite optimizer (skip hint)
      if: steps.prov.outputs.provider == 'graphite'
      id: gopt
      uses: withgraphite/graphite-ci-action@main
      with:
        graphite_token: ${{ env.GRAPHITE_TOKEN }}

    - name: Risk score → tier
      id: tier
      shell: bash
      run: |
        set -euo pipefail
        # Signals
        pos="${{ steps.pos.outputs.position || 'unknown' }}"
        provider="${{ steps.prov.outputs.provider }}"
        critical="${{ steps.paths.outputs.critical }}"
        is_draft="${{ github.event.pull_request.draft || 'false' }}"
        files_changed=$(jq '.pull_request.changed_files // 0' <(echo '${{ toJson(github.event) }}'))

        # Simple risk scoring (0..1)
        risk=0
        (( files_changed > 50 )) && risk=$((risk+30))
        [[ "$pos" != "middle" ]] && risk=$((risk+30))
        [[ "$critical" == "true" ]] && risk=$((risk+30))
        [[ "$is_draft" == "true" ]] && risk=$((risk-10))
        # Normalize
        risk=$(awk -v r=$risk 'BEGIN{ printf "%.2f", (r/100) < 0 ? 0 : (r/100) > 1 ? 1 : (r/100) }')

        tier=minimal
        if awk 'BEGIN{exit !("'"$risk"'" > 0.70)}'; then tier=full
        elif awk 'BEGIN{exit !("'"$risk"'" > 0.30)}'; then tier=essential
        fi

        # Hard overrides
        if [[ "${{ github.event_name }}" == "merge_group" ]]; then tier=full; fi
        if [[ "$provider" == "graphite" && "${{ steps.gopt.outputs.skip || 'false' }}" == "false" ]]; then tier=full; fi
        if [[ "$critical" == "true" && "${{ github.event_name }}" != "merge_group" ]]; then tier=full; fi

        echo "tier=$tier" >> $GITHUB_OUTPUT
        echo "critical=$critical" >> $GITHUB_OUTPUT

    - name: Agent detection
      id: agent
      shell: bash
      run: |
        actor="${{ github.actor }}"
        is_agent=false
        [[ "$actor" == *"[bot]"* ]] && is_agent=true
        [[ "$actor" == "github-actions" ]] && is_agent=true
        echo "is_agent=$is_agent" >> $GITHUB_OUTPUT

    - name: Export outputs
      shell: bash
      run: |
        echo "provider=${{ steps.prov.outputs.provider }}" >> $GITHUB_OUTPUT
        echo "position=${{ steps.pos.outputs.position || 'unknown' }}" >> $GITHUB_OUTPUT
        echo "tier=${{ steps.tier.outputs.tier }}" >> $GITHUB_OUTPUT
        echo "critical=${{ steps.tier.outputs.critical }}" >> $GITHUB_OUTPUT
        echo "is_agent=${{ steps.agent.outputs.is_agent }}" >> $GITHUB_OUTPUT
        echo "install_cmd=${{ steps.probe.outputs.install_cmd }}" >> $GITHUB_OUTPUT
        echo "lint_cmd=${{ steps.probe.outputs.lint_cmd }}" >> $GITHUB_OUTPUT
        echo "typecheck_cmd=${{ steps.probe.outputs.typecheck_cmd }}" >> $GITHUB_OUTPUT
        echo "test_cmd=${{ steps.probe.outputs.test_cmd }}" >> $GITHUB_OUTPUT
        echo "build_cmd=${{ steps.probe.outputs.build_cmd }}" >> $GITHUB_OUTPUT
        echo "lang=${{ steps.probe.outputs.lang }}" >> $GITHUB_OUTPUT
```

---

### 16.3 Helper Scripts (repo‑local defaults)

**`scripts/with-retry.sh`** — flake‑tolerant wrapper (retry once, adaptive timeout):

```bash
#!/usr/bin/env bash
set -euo pipefail
CMD="$*"
SOFT=${TIMEOUT_SOFT:-10m}
HARD=${TIMEOUT_HARD:-20m}
retry() { echo "🔁 Retry: $CMD"; timeout "$HARD" bash -lc "$CMD"; }

set +e
timeout "$SOFT" bash -lc "$CMD"
rc=$?
set -e
if [[ $rc -eq 124 || $rc -eq 137 ]]; then
  echo "⏳ Soft timeout, extending to $HARD"; retry; exit $?
elif [[ $rc -ne 0 ]]; then
  echo "🔄 Possible flake, single retry..."; retry; exit $?
fi
```

Make executable: `chmod +x scripts/with-retry.sh`.

---

### 16.4 Optional Runtime Image (multi‑lang batteries)

**`runtime/Dockerfile`** (skeletal):

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl git ca-certificates jq build-essential python3 python3-pip openjdk-17-jre-headless unzip
# Node/Bun
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
# Go
ENV GO_VERSION=1.22.5
RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:${PATH}"
# Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
```

Use by adding `runs-on: ubuntu-latest` (default) or pinning a `container:` to this image once published.

---

## 17. Sandbox & Testing (incl. `act`)

We ship a **sandbox** example so you can exercise all paths locally without touching real repos.

### 17.1 Layout

```text
examples/sandbox/
  ├─ .github/workflows/belay.yml          # copied from §16.1 for local runs
  ├─ package.json
  ├─ bun.lockb
  ├─ src/sum.ts
  ├─ test/sum.test.ts
  ├─ scripts/with-retry.sh
  ├─ events/
  │   ├─ pull_request.json
  │   └─ merge_group.json
  └─ .actrc
```

### 17.2 Minimal Bun project

```json
{
  "name": "sandbox",
  "type": "module",
  "scripts": {
    "lint": "biome check .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --reporter=basic",
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.1",
    "@biomejs/biome": "^1.9.4"
  }
}
```

**`src/sum.ts`**

```ts
export const sum = (a: number, b: number) => a + b;
```

**`test/sum.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { sum } from '../src/sum';

describe('sum', () => {
  it('adds', () => {
    expect(sum(2, 2)).toBe(4);
  });
});
```

**`.actrc`** (maps runner image)

```text
-P ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-latest
```

### 17.3 Local runs with `act`

**Pull Request path (GitHub provider):**

```bash
cd examples/sandbox
act pull_request -j minimal -e events/pull_request.json
act pull_request -j essential -e events/pull_request.json
act pull_request -j full -e events/pull_request.json
```

**Merge Queue path:**

```bash
act -j full -e events/merge_group.json
```

**Simulate Graphite provider (no network needed):**

```bash
# Trick the detector into graphite mode
export GRAPHITE_TOKEN=fake
act pull_request -j minimal -e events/pull_request.json
```

> The composite action will enter `graphite` provider and, lacking live API, safely fall back to conservative decisions (tier ≥ essential). Remove the env to test GitHub path.

**Run entire workflow:**

```bash
act pull_request -j detect
act pull_request -j meta
act pull_request -j minimal
```

### 17.4 Sample event files

**`events/pull_request.json`**

```json
{
  "event_name": "pull_request",
  "pull_request": {
    "number": 1,
    "draft": false,
    "changed_files": 6,
    "base": { "ref": "main" },
    "head": { "ref": "feature/stack-2-of-3" }
  }
}
```

**`events/merge_group.json`**

```json
{
  "event_name": "merge_group",
  "merge_group": { "head_sha": "deadbeef" },
  "pull_request": {
    "number": 1,
    "draft": false,
    "changed_files": 12,
    "base": { "ref": "main" },
    "head": { "ref": "feature/top" }
  }
}
```

> **Tip:** Modify `changed_files` or flip `draft` to watch the detector elevate tiers. Toggle `GRAPHITE_TOKEN` to switch providers.

---

## 18. Agent‑First Polish (ready for automation)

- The **meta** job’s summary is machine‑readable enough for parsing; agents can also enable webhook output by providing `CI_STATUS_WEBHOOK`.
- Deterministic exits: minimal/essential/full jobs are mutually gated; only the chosen tier runs to completion.
- Scripts avoid TTY dependencies and emit plain logs.

---

## 19. Definition of Done (updated)

- `belay.yml` and `actions/detector` committed; version tag `v1` cut.
- `examples/sandbox` runs green under `act` for PR + merge_group with and without graphite env.
- Sticky comment and webhook both verified locally (webhook via `nc -l 8080`).
- Cache warms between two consecutive `act` runs (lockfile keyed).
- Flake retry proven by injecting a transient failing test and observing pass on retry.

---

## 20. Next Iterations

- Predictive test selection per diff (per‑package Vitest/Jest patterns).
- Author reliability as an optional signal (org‑local, opt‑in).
- Containerized runner image to shave setup time by \~20–30s per job.
