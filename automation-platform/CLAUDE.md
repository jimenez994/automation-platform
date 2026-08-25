# Project

Automation Platform

## Purpose

A cross-platform desktop application built with Tauri 2 for local case/workspace management and future automation.

## Supported Platforms

- macOS
- Windows

## Current Stack

- Tauri 2
- Rust
- React
- TypeScript
- Vite
- Tailwind CSS
- SQLite via rusqlite (bundled)

## Architecture Rules

- React is the presentation layer.
- The frontend does not access SQLite directly.
- Database operations remain in the Rust/Tauri backend.
- Filesystem operations remain behind Tauri/Rust commands.
- Workspace data belongs to the selected workspace.
- The workspace database lives at `<workspace>/.automation-platform/automation.db`.
- Workspace-relative paths should be preferred over absolute paths so workspaces can be moved.
- User-managed fields such as case status and priority must not be overwritten by filesystem synchronization.
- The scanner must not modify or delete case documents.
- Tauri commands are thin: they unwrap arguments and delegate to services in `src-tauri/src/`.
- Components never call `invoke` directly; wrap every command in `src/services/`.

## Important Existing Concepts

- **Workspace** — the folder containing the user's case folders. Identified by a stable `workspace_id` in `.automation-platform/workspace.json`.
- **Case** — one row of the `cases` table, derived from a child folder of the workspace.
- **CaseSyncService** — `src-tauri/src/cases/sync.rs`. Reconciles the workspace filesystem with SQLite; reports progress via events and supports cancellation.
- **SQLite database** — per-workspace, travels with the workspace folder.
- **Workspace metadata** — `.automation-platform/workspace.json`.
- **Native desktop application menu** — built in `src-tauri/src/menu.rs` via Tauri's menu API; routes to the frontend by emitting `menu://action`.

## Important Commands

- `npm run dev` — run the Vite frontend in a browser (no Tauri commands).
- `npm run tauri dev` — run the full desktop app with hot reload.
- `npm run build` — TypeScript check + Vite production build.
- `npm run tauri build` — production build of the frontend + native app.
- `npm test` — run the Rust test suite (`cargo test --manifest-path src-tauri/Cargo.toml`).

## Development Rules

Before changing code:

1. Inspect the relevant existing implementation.
2. Identify the affected architecture.
3. Make the smallest appropriate change.
4. Do not rewrite working code unnecessarily.

After changing code:

1. Run relevant tests.
2. Run TypeScript checks when frontend code changes.
3. Build when appropriate.
4. Report failures honestly.
5. Do not implement unrelated improvements. If you notice a useful improvement, mention it separately without changing the code.

## Incremental Development

- Treat each request as a focused change.
- Preserve existing behavior unless the request explicitly asks for it to change.
- Do not bundle unrelated features, refactors, cleanup, or redesigns into the same task.
- Prefer the smallest implementation that fully satisfies the request.
- Before changing code, use the existing architecture, documentation, and Graphify to locate the relevant implementation.
- After the change, verify that existing functionality still works.
- Do not remove working functionality unless explicitly requested.
- If an improvement is discovered while working, mention it separately instead of implementing it.
- Keep the project progressing in small, testable milestones.

## Documentation

Important architectural documentation is located in:

- `docs/architecture.md`
- `database/README.md`
- `docs/decisions/`

When architecture changes materially, update the appropriate documentation.

## Git

- Do not create commits unless explicitly requested.
- Do not rewrite unrelated files.

## Future Architecture

The application may eventually include:

- AI providers
- Ollama
- AI agents
- Browser automation
- Microsoft Graph
- Workflow automation
- Email integration

These are not current dependencies unless they already exist in the repository.