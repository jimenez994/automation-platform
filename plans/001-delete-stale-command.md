# Plan 001: Delete the stale, non-compiling `commands/database.rs`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 794dd9c..HEAD -- automation-platform/src-tauri/src/commands/`
> If any file under `automation-platform/src-tauri/src/commands/` changed since
> this plan was written, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `794dd9c`, 2026-08-24
- **Issue**: —

## Why this matters

`automation-platform/src-tauri/src/commands/database.rs` is dead code: it is not
declared in `commands/mod.rs` and its three commands are not registered in
`lib.rs`'s `generate_handler!`, so the Rust compiler never sees it. Worse, it
references symbols that no longer exist — `crate::db` (the module is named
`database`), a `DatabaseStatus` type, and `AppState::status()` /
`AppState::with_connection()` methods that are not on `AppState`. If anyone
re-includes the file (e.g. by adding `pub mod database;` to `mod.rs`) the build
breaks. It also duplicates `list_cases`/`get_case` with a stale API (`limit`,
`case_number`) that conflicts with the live API (`search`, `id`) in
`commands/cases.rs`, which is a trap for the next person grepping for commands.

Deleting it removes a misleading artifact and makes the command surface
unambiguous.

## Current state

- `automation-platform/src-tauri/src/commands/database.rs` — stale orphan.
  References the non-existent `crate::db` module and `DatabaseStatus` type, and
  non-existent `state.status()` / `state.with_connection()` methods:
  ```rust
  use crate::db::{cases, models::Case, DatabaseStatus};
  // ...
  pub fn database_status(state: State<'_, AppState>) -> DatabaseStatus {
      state.status()
  }
  // ...
  state.with_connection(|conn| cases::list(conn, limit))
  ```
- `automation-platform/src-tauri/src/commands/mod.rs` — the module manifest.
  It declares **only** `app`, `cases`, `inspector`, `scan`, `workspace`:
  ```rust
  pub mod app;
  pub mod cases;
  pub mod inspector;
  pub mod scan;
  pub mod workspace;
  ```
  No `database` module — this is why the file is dead.
- `automation-platform/src-tauri/src/lib.rs` — command registration. The
  `generate_handler!` list contains `commands::cases::list_cases` and
  `commands::cases::get_case` (the live versions), and **no**
  `commands::database::*` entries.
- The live module `automation-platform/src-tauri/src/database/` exists and is
  correct; this plan only removes the orphan *command* file, never touches the
  `database` module.

Conventions to honor: the `commands/*.rs` files are thin — they unwrap args and
delegate to services. Deleting a file changes no convention.

## Commands you will need

Run all commands from the `automation-platform/` directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0, no errors |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` | all pass |
| Grep for stale refs | `grep -rn "crate::db\|with_connection\|DatabaseStatus" src-tauri/src` | no matches |

## Scope

**In scope** (the only file you should modify):
- `automation-platform/src-tauri/src/commands/database.rs` (delete)

**Out of scope** (do NOT touch):
- `automation-platform/src-tauri/src/database/**` — the live data layer; nothing
  here is wrong.
- `commands/mod.rs` and `lib.rs` — no change needed; the orphan was simply never
  wired in.

## Git workflow

- Branch: `advisor/001-delete-stale-command`
- Commit message style matches the repo (imperative sentence, no type prefix),
  e.g. `git log` shows `Refactor filesystem scanner traversal`. Use something
  like: `Delete stale commands/database.rs orphan`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete the orphan file

Delete `automation-platform/src-tauri/src/commands/database.rs`.

**Verify**: `ls automation-platform/src-tauri/src/commands/database.rs` → file no
longer exists.

### Step 2: Confirm the build and tests are unaffected

Run the Rust check and test suite. Because the file was never compiled, both
must behave exactly as before the deletion.

**Verify**:
- `cargo check --manifest-path src-tauri/Cargo.toml` → exit 0, no errors.
- `cargo test --manifest-path src-tauri/Cargo.toml` → all tests pass (the
  baseline is green: 15 scanner + 14 workspace + others).

### Step 3: Confirm no stale references remain

**Verify**:
`grep -rn "crate::db\|with_connection\|DatabaseStatus" src-tauri/src` → no matches.

### Step 4: Confirm the diff is only the deletion

**Verify**: `git status` → shows `deleted: automation-platform/src-tauri/src/commands/database.rs`
and nothing else.

## Test plan

No new tests — this is pure dead-code removal. The existing Rust suite
(`cargo test --manifest-path src-tauri/Cargo.toml`) is the regression gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `automation-platform/src-tauri/src/commands/database.rs` is deleted
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` exits 0
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0 (all pass)
- [ ] `grep -rn "crate::db\|with_connection\|DatabaseStatus" src-tauri/src` → no matches
- [ ] `git status` shows only the single deletion
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `commands/mod.rs` already contains a `pub mod database;` line (meaning someone
  re-included the file; do not delete it then — report instead).
- `grep -rn "crate::db" src-tauri/src` finds references **outside** the file
  being deleted (some other file depends on the phantom module).
- `cargo check` or `cargo test` fails after deletion (the file was unexpectedly
  reachable).

## Maintenance notes

- If a `commands/database.rs`-style command is ever genuinely needed again,
  implement it in `commands/cases.rs` (or a new module explicitly declared in
  `commands/mod.rs` and registered in `lib.rs`), matching the live `search`/`id`
  API rather than the stale `limit`/`case_number` one.
- Deferred, out of scope: adding a `cargo-audit` / dependency-audit step to CI
  (audit found `cargo-audit` is not installed; `npm audit` reports 0 vulns).
