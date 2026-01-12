<!-- tldr ::: linear project management rules and configuration -->

# LINEAR.md

## Project

- Team: Outfitter
- Key: `ID`
- Workspace: Outfitter

## Streamlinear MCP

This project uses the `streamlinear` MCP server for Linear integration. All actions use a single tool: `mcp__linear__linear`.

### Default Team Filter

Always filter by team `ID` when searching:

```json
{ "action": "search", "query": { "team": "ID" } }
```

### Common Actions

| Action | Example |
|--------|---------|
| Search team issues | `{ "action": "search", "query": { "team": "ID" } }` |
| Search in progress | `{ "action": "search", "query": { "team": "ID", "state": "In Progress" } }` |
| Get issue | `{ "action": "get", "id": "ID-123" }` |
| Update status | `{ "action": "update", "id": "ID-123", "state": "Done" }` |
| Add comment | `{ "action": "comment", "id": "ID-123", "body": "Comment text" }` |
| Create issue | `{ "action": "create", "title": "Issue title", "team": "ID" }` |
| GraphQL query | `{ "action": "graphql", "graphql": "query { ... }" }` |

## Rules

- Linear is the authoritative tracker. Log or locate an issue before meaningful work.
- Always use team filter `ID` when searching to scope results to this project.
- When working with GitHub issues, use a `<magic word> <linear ID>` to reference the corresponding Linear issue.
- Branch naming: `act-123-issue-slug`
- Commit footer: `Fixes: ID-123` or `Refs: ID-123`
- PR title: `feat: description [ID-123]`
