# Detector Action

> Composite action to auto-detect language, package manager, monorepo layout, and CI commands.

## Location

- Path: `./.github/actions/detector/action.yml`
- Use in workflows via:

```yaml
- id: det
  uses: outfitter-dev/actions/.github/actions/detector@alpha
  with:
    use_graphite: auto
  env:
    GRAPHITE_TOKEN: ${{ secrets.GRAPHITE_CI_OPTIMIZER_TOKEN }}
```

## Inputs

- `use_graphite`: `true | false | auto` (default: `auto`)
- `config_inline`: YAML string for inline config (optional)

## Outputs

- `provider`: `graphite | github`
- `position`: `top | middle | bottom | unknown`
- `tier`: `minimal | essential | full`
- `is_agent`: `true | false`
- `install_cmd`, `lint_cmd`, `typecheck_cmd`, `test_cmd`, `build_cmd`: discovered commands (or empty)
- `lang`: `bun | node | rust | go | python | ...`
- `critical`: `true | false`
- `timeout_minutes`: `number` (job timeout override)
- `critical_globs`: `string[]` (configured critical patterns)
- `force`: `"full" | "essential" | "minimal"` (if set in config)
- `cache_key`, `cache_path`: recommended cache settings
- `is_monorepo`: `true | false`
- `workspaces`: JSON string array of workspace globs (when present)

## Behavior

- Prefers Bun/TypeScript-based tools when available; falls back to bash
- Detects provider (Graphite vs GitHub) with safe fallbacks
- Calculates CI tier using risk factors (files changed, position, critical, draft, event)
- Outputs cache hints per language
- Reads overrides from (by precedence):
  1. Inline YAML input (`config_inline`)
  2. `.ci.toml`
  3. `.ci.yaml` / `.ci.yml`
  
  Overrides include: `force`, `timeout_minutes`, `ignore`, `critical_globs`, and `[outputs]`.

## Notes

- The detector makes no changes to the repo; it only emits outputs for downstream steps.
- When used outside this repository, the action will skip Bun tool install if not needed.
