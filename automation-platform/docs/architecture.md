# Architecture

Two processes' worth of responsibility: a Rust layer that owns every local
resource, and a React frontend that renders it. They talk only through Tauri
commands.

```text
┌────────────────────────────────────────────────────────────┐
│ React frontend (src/)                                      │
│                                                            │
│  App.tsx              which screen is showing              │
│    └─ pages/          one component per screen             │
│    └─ components/     presentational only                  │
│    └─ services/       invoke() wrappers ───────────────────┼──┐
│    └─ types/          shapes shared with Rust              │  │
└────────────────────────────────────────────────────────────┘  │
                                                                │ IPC
┌────────────────────────────────────────────────────────────┐  │
│ Rust native layer (src-tauri/src/)                         │  │
│                                                            │  │
│  commands/     thin: unwrap args, call a service ◄─────────┼──┘
│  state.rs      AppState: preferences + open workspace      │
│                                                            │
│  workspace/    metadata.rs, preferences.rs                 │
│  cases/        parser.rs, sync.rs (CaseSyncService)        │
│  filesystem/   scan.rs (read-only), reveal.rs (per-OS)     │
│                              │                             │
│  database/     migrations, models, queries ◄───────────────┤
└────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
  <workspace>/.automation-platform/     <app data>/preferences.json
    automation.db, workspace.json         recent workspaces only
```

## Two levels of storage

**Workspace data lives in the workspace.** `automation.db` sits inside
`<workspace>/.automation-platform/`, so moving the folder moves the database
with it. `folder_path` is stored relative to the workspace root for the same
reason — an absolute path would break the moment the folder moved, and moving is
a supported operation.

**Application data holds no case data.** `preferences.json` in the OS
application data directory stores only the recent workspaces and which one was
open last.

## Rules the layout follows

**The frontend never talks to SQLite.** All database access lives in
`src-tauri/src/database/`. The frontend sees only what commands return.

**Components never call `invoke` directly.** Every command is wrapped in
`src/services/`, so a renamed command is a one-line change.

**Commands are thin.** They unwrap arguments and delegate. The logic lives in
`workspace`, `cases` and `filesystem` so it can be tested without a running
Tauri application.

**Query functions take a `&Connection`, not global state.** That is why
`tests/` can exercise the whole scanner against a temporary directory and an
in-memory database. `AppState` is the only thing that reaches into the shared
connection.

**The native menu routes, it does not act.** `menu.rs` maps an item id to a
`MenuAction` (a pure function, unit-tested) and emits it to the frontend, which
runs the same command a button would. That keeps one code path per action. The
menu is rebuilt from application state so enablement always matches reality; the
same `MenuContext` that builds it is what the tests assert against.

**The scan runs off the main thread, on its own connection.** `start_scan`
opens a second connection to the same database file and scans in a worker
thread, emitting `scan://progress`, `scan://activity` and `scan://finished`
events. WAL mode lets the UI's queries proceed during the scan's writes, and a
`busy_timeout` covers the occasional collision. Because the connection is not
shared, the scan never blocks the frontend. A single flag under `AppState`'s
lock is what makes a second scan impossible.

**The theme is one set of tokens.** `src/index.css` defines every colour as a
semantic CSS variable; components name tokens, never palette colours. `system`
resolves `prefers-color-scheme` in the frontend and follows it live.

**Only `filesystem/reveal.rs` knows which OS it is on.** Everything else is
platform-independent; callers use `reveal_in_file_manager(&path)` and get Finder,
File Explorer or the XDG default depending on the target.

**The scanner is read-only.** `filesystem/scan.rs` lists directories and counts
files. Nothing outside `workspace/` writes to disk, and what it writes is
confined to `<workspace>/.automation-platform/` and the preferences file.

## Ownership of case fields

The filesystem is authoritative for what it can observe; the user is
authoritative for judgement.

| Field                                              | Written by |
| -------------------------------------------------- | ---------- |
| `folder_path`, `document_count`, `last_scanned_at` | scanner    |
| `status`, `priority`, `jurisdiction`               | user       |
| `name`                                             | scanner until `name_is_custom` is set |

`name` is the awkward one: it is derived from the folder, but the user can also
edit it. `cases::apply_edit` sets `name_is_custom` when the name actually
changes, and `upsert_scanned` skips the name once that flag is set. Without it,
every rescan would silently undo a manual rename.

## Failure handling

A scan reports problems instead of stopping: an unparseable folder name, a
duplicate case number and an unreadable directory each become a `ScanWarning`
and the scan continues. Only a database failure aborts it.

Cases whose folder was not seen are counted as `missing` and left in the
database. Deleting them would be the destructive interpretation of a folder that
might simply be on an unmounted drive.

A workspace that cannot be opened at startup does not stop the application: the
recovery screen is shown, and the reason goes to the log.

## Migrations

`database/migrations/*.sql` are embedded with `include_str!` and applied in
order, each in its own transaction together with its `user_version` bump, so an
interrupted upgrade leaves the database on the last version that fully applied.

Migration 0001 is milestone 1's schema, kept verbatim. A database from that
build reports `user_version = 0`, re-runs 0001 as a no-op (every statement is
`IF NOT EXISTS`) and is then upgraded by 0002 — which is why an early database
is migrated rather than recreated.

Only ever append migrations. Editing a released one leaves databases that
already ran it inconsistent.

## Adding a table

1. Add `000N_description.sql` to `database/migrations/` and register it in
   `database/migrations.rs`.
2. Add the row struct to `database/models.rs`.
3. Add a query module next to `database/cases.rs`.
4. Add commands in `commands/`, registered in `lib.rs` by their full
   `commands::<module>::<fn>` path — `generate_handler!` expands sibling
   macro-generated items and cannot resolve re-exports.
5. Mirror the type in `src/types/` and add a wrapper in `src/services/`.

## Known limitations

`AppState` uses a single mutex, and a scan holds it for its duration. That is
deliberate — a query cannot then observe a half-applied scan — but it means a
very large or very slow workspace blocks other commands while scanning. If that
becomes a problem, the scan should move to a background task reporting progress
through events rather than the lock being made finer-grained.
