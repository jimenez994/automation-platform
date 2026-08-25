# Workspace-Owned Database

## Status

Accepted

## Context

Case data must stay with the folder it describes, so a workspace can be moved
to another folder or drive — or onto another machine — and reconnect without
losing anything. Storing case data in the OS application-data directory would
break that: moving the folder would orphan the database.

## Decision

Each workspace owns its database at:

```
<workspace>/.automation-platform/automation.db
```

The same hidden directory also holds `workspace.json`, which carries the stable
`workspace_id`. Application-level data (recent workspaces, preferences) stays in
the OS application-data directory; case data never does.

## Consequences

- Workspace and case data move together as one unit.
- The `workspace_id` — read from the folder, not the path — lets a relocated
  workspace be recognised and reconnected without creating a second database.
- The hidden `.automation-platform/` directory is the only thing the application
  writes inside a workspace.
- A workspace whose folder is missing is reported and relocatable, never
  silently recreated.
