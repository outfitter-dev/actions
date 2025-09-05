<!-- tldr ::: waymark syntax, patterns, and usage guidelines -->

# Waymarks

## Core Concept

The waymark pattern: `[comment-leader] [prefix] ::: [properties] [note] [#hashtags]`

- **`:::`** - the sigil that defines a waymark (preceded by space when prefix is present)
- **prefix** - optional classifier before the sigil (e.g., `todo`, `fix`, `tldr`)
- **properties** - key:value pairs for structured metadata (e.g., `priority:high`)
- **note** - human-readable description
- **#hashtags** - open-namespace tags for classification

## Waymark Terminology

- **Waymark**: The entire comment structure containing the `:::` sigil
- **Sigil**: The `:::` separator that defines a waymark
- **Prefix**: Optional classifier before `:::` (limited namespace)
- **Properties**: Machine-readable key:value pairs after `:::`
- **Note**: Human-readable description (waymarks without prefix are pure notes)
- **Hashtags**: Classification tags prefixed with `#`

## Common Waymark Prefixes

### Work Prefixes

- `todo :::` - work to be done
- `fix :::` - bugs to fix (synonym: `fixme`)
- `done :::` - completed work
- `ask :::` - questions needing answers
- `review :::` - needs review
- `needs :::` - dependencies (synonyms: `depends on`, `requires`)
- `chore :::` - routine maintenance tasks
- `hotfix :::` - urgent production patch
- `spike :::` - exploratory proof-of-concept work

### Lifecycle/Maturity Prefixes

- `stub :::` - skeleton/basic implementation
- `draft :::` - work in progress (synonym: `wip`)
- `stable :::` - mature/solid code
- `shipped :::` - deployed to production
- `good :::` - approved (synonyms: `lgtm`, `approved`)
- `bad :::` - not approved
- `hold :::` - work intentionally paused
- `stale :::` - work that has stagnated
- `cleanup :::` - code cleanup needed
- `remove :::` - scheduled deletion

### Alerts/Warnings Prefixes

- `warn :::` - warning
- `crit :::` - critical issue (synonym: `critical`)
- `unsafe :::` - dangerous code
- `caution :::` - proceed carefully
- `broken :::` - non-functional code
- `locked :::` - do not modify (synonym: `freeze`)
- `deprecated :::` - scheduled for removal
- `audit :::` - requires audit review
- `legal :::` - legal obligations
- `temp :::` - temporary code (synonym: `temporary`)
- `revisit :::` - flag for future reconsideration

### Information Prefixes

- `tldr :::` - brief summary (MUST be placed at the very top of file, one per file)
- `summary :::` - code section summary
- `note :::` - general note (synonym: `info`)
- `thought :::` - thinking out loud
- `docs :::` - documentation reference
- `why :::` - explains reasoning
- `see :::` - cross-reference (synonyms: `ref`, `xref`)
- `example :::` - usage example

### Meta Prefixes

- `important :::` - important information
- `hack :::` - hacky solution
- `flag :::` - generic marker
- `pin :::` - pinned item
- `idea :::` - future possibility
- `test :::` - test-specific marker

## Property Keys and Patterns

### Core Property Keys

- **Assignment**: `assign:@person` or `attn:@person`
- **Priority**: `priority:high`, `priority:critical`
- **Dependencies**: `requires:package(version)`, `depends:service`
- **Issue tracking**: `fixes:#123`, `closes:#123`, `blocks:#123`
- **Lifecycle**: `deprecated:v2.0`, `since:v1.0`, `until:v3.0`
- **Files/paths**: `path:filename`, `affects:files`
- **Messages**: `message:"error text"`

### @Mentions

- Direct mentions in notes: `// ::: @alice please review`
- Assignment in todos: `// todo ::: @bob implement caching`
- Explicit assignment: `// todo ::: assign:@carol fix bug`

### Hashtags

- Open namespace for classification
- Can appear anywhere (prefer at end)
- Examples: `#security`, `#performance`, `#frontend`
- Hierarchical: `#auth/oauth`, `#security/a11y`
- **Note**: Numeric-only hashtags prohibited (conflicts with issue refs)

## Search Commands

Using ripgrep (rg) is the primary way to work with waymarks:

```bash
# Find all waymarks
rg ":::"

# Find by prefix
rg "todo :::"
rg "fix :::"
rg "warn :::"

# Find by properties
rg ":::.*priority:high"
rg ":::.*assign:@alice"

# Find by hashtags
rg "#security"
rg ":::.*#security"

# Find with context
rg -C2 "todo :::"  # 2 lines before/after

# Find in markdown (HTML comments)
rg "<!-- .*:::" --type md

# Extract assignees
rg -o "todo ::: .*@(\w+)" -r '$1' | sort | uniq -c

# Find high priority items
rg ".*::: .* priority:high"
```
