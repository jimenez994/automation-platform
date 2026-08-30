# Plan 004: Validate work-item priority and type at the persistence boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 1d9aa14..HEAD -- automation-platform/src-tauri/src/database/notes.rs automation-platform/src/inspector/InspectorContext.tsx automation-platform/src-tauri/tests/database.rs automation-platform/src/inspector/InspectorContext.test.tsx`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1d9aa14`, 2026-08-24
- **Issue**: —

## Why this matters

Cases validate `status` and `priority` in the backend before persisting
(`cases::apply_edit`), so a malformed value can never reach the dashboard.
Inspector work items do **not**: `notes::create` / `notes::update` accept
`priority` and `type` as free strings, and the frontend `load()` reads them
back without guarding, unlike `status` and `origin` which it already coerces. A
stale or hand-edited row with an unknown priority then violates the `WorkPriority`
type and renders through `PRIORITY_TONES[priority]`, which yields `undefined`
and a priority that displays with no styling and no way to recover it through
the UI.

This plan makes work-item `priority` and `type` validated on write (backend)
and coerced on read (frontend), matching the existing case-validation pattern
and the existing status/origin coercion.

## Current state

- `automation-platform/src-tauri/src/database/notes.rs` — `create` (lines 63-82)
  and `update` (lines 85-103) take `priority: &str` and `type_: Option<&str>`
  and pass them straight into SQL with no validation.
- `automation-platform/src/inspector/InspectorContext.tsx` — the `load()` effect
  (lines 259-280) coerces `origin` and `status` but not `priority`/`type`:
  ```ts
  const columns = WORK_COLUMNS as readonly string[];
  const origins = WORK_ORIGINS as readonly string[];
  // ...
  return {
    // ...
    type: note.type,
    priority: note.priority,
    // ...
    status: columns.includes(note.status) ? (note.status as WorkStatus) : "Backlog",
  };
  ```
  The value import at the top (lines 14-24) already brings in `WORK_COLUMNS`,
  `WORK_ORIGINS`, and the types `WorkPriority`, `WorkType` — but not the
  `WORK_PRIORITIES` / `WORK_TYPES` arrays.
- `automation-platform/src/inspector/types.ts` — `WORK_TYPES = ["Task", "Feature", "Bug"]`
  (line 37) and `WORK_PRIORITIES = ["Low", "Normal", "High", "Urgent"]` (line 41).
- Case validation to mirror: `automation-platform/src-tauri/src/database/cases.rs`
  `apply_edit` (lines 226-240) returns `Err` for an unsupported `status`/`priority`.
- Backend test harness: `automation-platform/src-tauri/tests/database.rs` has a
  `migrated()` helper and an existing `inspector_notes_persist_with_auto_increment_ids`
  test (lines 52-93) that calls `notes::create`/`notes::update` — model new Rust
  assertions on it.

## Commands you will need

Run all commands from the `automation-platform/` directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` | all pass, incl. new note-validation test |
| Frontend tests | `npm run test:unit` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |

## Scope

**In scope** (the only files you should modify):
- `automation-platform/src-tauri/src/database/notes.rs`
- `automation-platform/src/inspector/InspectorContext.tsx`
- `automation-platform/src-tauri/tests/database.rs`
- `automation-platform/src/inspector/InspectorContext.test.tsx`

**Out of scope** (do NOT touch):
- `automation-platform/src-tauri/src/database/cases.rs` — already validates its own
  fields; leave it alone.
- Validating `status`/`origin` in the backend — the frontend already coerces
  both on load; backend validation for them is deferred (see Maintenance notes).
- `WorkManager.tsx` — no change needed; its `PRIORITY_TONES` lookup is correct
  once values are guaranteed valid.

## Git workflow

- Branch: `advisor/004-validate-work-item-priority`
- Commit message: `Validate work-item priority and type on write and read`
  (imperative sentence, matching repo style).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add backend validation to `notes.rs`

Add two constants near the top of
`automation-platform/src-tauri/src/database/notes.rs` (after the imports):

```rust
/// Priorities the inspector understands. Must match `WORK_PRIORITIES` in the frontend.
const PRIORITIES: [&str; 4] = ["Low", "Normal", "High", "Urgent"];
/// Work-item types the inspector understands. Must match `WORK_TYPES` in the frontend.
const TYPES: [&str; 3] = ["Task", "Feature", "Bug"];
```

Then, at the start of both `create` and `update` (before the `conn.execute`),
validate `priority` and `type_`, returning `Err` on an unsupported value — the
same style as `cases::apply_edit`:

```rust
if !PRIORITIES.contains(&priority) {
    return Err(format!(
        "`{priority}` is not a supported priority (expected one of {})",
        PRIORITIES.join(", ")
    ));
}
if let Some(type_) = type_ {
    if !TYPES.contains(&type_) {
        return Err(format!(
            "`{type_}` is not a supported type (expected one of {})",
            TYPES.join(", ")
        ));
    }
}
```

Do not validate `status` or `origin` here (out of scope).

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` still passes
(baseline green; the new checks only reject previously-unsupported inputs).

### Step 2: Coerce `priority` and `type` on frontend load

In `automation-platform/src/inspector/InspectorContext.tsx`:

1. Add `WORK_PRIORITIES` and `WORK_TYPES` to the value import from `./types`
   (the `type` imports `WorkPriority`/`WorkType` are already present).
2. In the `load()` effect, add the two guard arrays next to `columns`/`origins`:
   ```ts
   const priorities = WORK_PRIORITIES as readonly string[];
   const types = WORK_TYPES as readonly string[];
   ```
3. In the mapped `return`, replace the raw assignments with guarded ones:
   ```ts
   type: note.type != null && types.includes(note.type) ? (note.type as WorkType) : null,
   priority: priorities.includes(note.priority) ? (note.priority as WorkPriority) : "Normal",
   ```

**Verify**: `npx tsc --noEmit` → exit 0, no errors.

### Step 3: Add a Rust regression test

In `automation-platform/src-tauri/tests/database.rs`, add a test modeled on the
existing note test (reusing the `migrated()` helper):

```rust
#[test]
fn notes_reject_unknown_priority_and_type() {
    let conn = migrated();

    assert!(notes::create(&conn, "n", None, "Backlog", "App", None, "Nonsense", None).is_err());
    assert!(notes::create(&conn, "n", None, "Backlog", "App", Some("Nonsense"), "Normal", None).is_err());
    assert!(notes::create(&conn, "n", None, "Backlog", "App", Some("Bug"), "High", None).is_ok());

    let id = notes::create(&conn, "n2", None, "Backlog", "App", None, "Normal", None).unwrap();
    assert!(notes::update(&conn, id, "n2", Some("Nonsense"), "Normal", None).is_err());
    assert!(notes::update(&conn, id, "n2", None, "Nonsense", None).is_err());
    assert!(notes::update(&conn, id, "n2", Some("Feature"), "Low", None).is_ok());
}
```

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` → the new test passes
and all existing tests still pass.

### Step 4: Add a frontend regression test

In `automation-platform/src/inspector/InspectorContext.test.tsx`, add a test that
injects a note with an unknown `priority` and an unknown `type` through the
existing `inMemoryNoteStore`, renders the harness, and asserts the loaded
selection was coerced:

- unknown `priority` (`"Blocker"`) → `priority === "Normal"`
- unknown `type` (`"Chore"`) → `type === null`
- a valid `priority`/`type` pass through unchanged.

Model the render/wait pattern on the existing tests (the harness's `renderHarness`
already supports an injected `store`; you may need to pre-seed the in-memory
store's `notes` map before rendering, or add a `seed` helper mirroring the
backend `#N` assignment).

**Verify**: `npm run test:unit` → all pass, including the new test.

### Step 5: Full verification

**Verify**:
- `cargo test --manifest-path src-tauri/Cargo.toml` → all pass.
- `npm run test:unit` → all pass.
- `npx tsc --noEmit` → exit 0.

## Test plan

- Rust: `notes_reject_unknown_priority_and_type` in `tests/database.rs` (write-side
  validation).
- Frontend: coercion-on-load test in `InspectorContext.test.tsx` (read-side guard).
- Structural patterns: `inspector_notes_persist_with_auto_increment_ids` (Rust)
  and the existing `Inspector state machine` describe block (frontend).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `notes.rs` validates `priority` and `type` in both `create` and `update`
- [ ] `InspectorContext.tsx` coerces `priority` and `type` on load
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0, incl. new test
- [ ] `npm run test:unit` exits 0, incl. new test
- [ ] `npx tsc --noEmit` exits 0
- [ ] `git status` shows only the four in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `notes::create`/`update` signatures differ from the excerpts (drift).
- The `load()` effect or `selection()` helper in `InspectorContext.tsx` / its test
  has changed shape (drift).
- A valid priority/type that the frontend's `WORK_PRIORITIES`/`WORK_TYPES` define
  is rejected by the new backend checks (the two lists must agree — report the
  mismatch rather than silently editing either).

## Maintenance notes

- The backend `PRIORITIES`/`TYPES` and the frontend `WORK_PRIORITIES`/`WORK_TYPES`
  are duplicated by necessity (Rust vs TypeScript); a change to the allowed set
  must update both. Keep the "Must match" comments so a future reader knows.
- Deferred, out of scope: backend validation for `status` and `origin`. The
  frontend coerces both on load, so they cannot corrupt the UI today, but a
  follow-up could mirror this plan for those two fields if desired.
