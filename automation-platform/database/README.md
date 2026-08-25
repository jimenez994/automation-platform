# Database

Each workspace owns its database at
`<workspace>/.automation-platform/automation.db`, so it travels with the
workspace folder. Nothing case-related is stored in the application data
directory.

## Migrations

`migrations/` is the authoritative definition of the schema. There is no
hand-maintained `schema.sql`: a second description of the same tables drifts
from the migrations that actually run.

Files are applied in filename order and tracked with SQLite's `user_version`
pragma, so each one executes exactly once per database. They are embedded into
the Rust binary with `include_str!` (see `src-tauri/src/database/migrations.rs`).

To add a migration: create `000N_description.sql`, register it in the
`MIGRATIONS` array, and only ever append — editing a released migration leaves
existing databases inconsistent.

## Current schema

### `cases`

| Column            | Type      | Owner       | Notes                                    |
| ----------------- | --------- | ----------- | ---------------------------------------- |
| `id`              | `INTEGER` | —           | Primary key, autoincrement               |
| `case_number`     | `TEXT`    | scanner     | Not null, unique; first token of the folder name |
| `name`            | `TEXT`    | both        | Folder-derived until the user edits it   |
| `jurisdiction`    | `TEXT`    | user        | Never set by the scanner                 |
| `status`          | `TEXT`    | user        | New / Active / Waiting / Completed       |
| `priority`        | `TEXT`    | user        | Low / Normal / High / Urgent             |
| `folder_path`     | `TEXT`    | scanner     | **Relative** to the workspace root       |
| `document_count`  | `INTEGER` | scanner     | Files counted recursively, dotfiles excluded |
| `last_scanned_at` | `TEXT`    | scanner     | Null until first scanned                 |
| `created_at`      | `TEXT`    | —           | Defaults to `datetime('now')`            |
| `updated_at`      | `TEXT`    | —           | Written on every change                  |
| `name_is_custom`  | `INTEGER` | user        | 1 once the name is edited by hand        |

Indexes: `idx_cases_status`, `idx_cases_created_at`. The unique constraint on
`case_number` provides its own index.

`folder_path` is stored relative to the workspace root on purpose. Absolute
paths would break the moment the workspace folder is moved, which is a
supported operation; the absolute path is recomputed at read time.

### `app_meta`

Key/value bookkeeping for the workspace. Currently one key: `last_scan_at`.
