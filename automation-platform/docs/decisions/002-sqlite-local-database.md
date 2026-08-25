# SQLite via rusqlite for Local Data

## Status

Accepted

## Context

The application stores structured case metadata locally. It must work offline,
start instantly, and run on macOS and Windows without requiring the user to
install or run a database server.

## Decision

Use SQLite through the `rusqlite` crate with the `bundled` feature, which
compiles SQLite into the binary so no system SQLite version is required.

Schema changes are versioned migrations in `database/migrations/`, tracked with
SQLite's `user_version` pragma and applied when a workspace is opened.

## Consequences

- Zero-configuration, single-file storage that travels with the workspace.
- No database server, no network dependency, no user setup.
- `bundled` makes the first build slower (compiles SQLite) but removes a runtime
  dependency on the host's SQLite.
- Migrations are append-only: editing a released migration would leave existing
  databases inconsistent.
