# Testing

Local testing uses `act` and Bun for tools.

## Setup

```bash
bun install
# Optional: Download act binary automatically
bun run act:setup
```

## Sample Events

Prebaked event payloads live in `events/`:

- `events/pull_request.json`
- `events/merge_group.json`

You can also generate scenarios via:

```bash
bun run generate-events list
bun run generate-events minimal-risk > events/pull_request.json
```

## Run Belay Locally

```bash
# Minimal/Essential/Full paths (GitHub provider)
bun run act:minimal
bun run act:essential
bun run act:full

# Merge queue (always full)
bun run act:merge
```

## Notes

- Ensure the `belay.yml` reusable workflow is referenced in your test invocation.
- For webhook testing, set `CI_STATUS_WEBHOOK` to a local receiver (e.g., `nc -l 8080`).
- Or run the included dev server: `bun run webhook-server` (listens on :8787) and set `CI_STATUS_WEBHOOK=http://127.0.0.1:8787`.
