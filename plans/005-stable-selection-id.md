# Plan 005: Give each selection a stable client id (stop overwriting it on save)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 16e30cd..HEAD -- automation-platform/src/inspector/InspectorContext.tsx automation-platform/src/inspector/InspectorContext.test.tsx`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `16e30cd`, 2026-08-24
- **Issue**: —

## Why this matters

`Selection.id` is used as the React key, the drag-and-drop payload, and the
lookup key everywhere. For an unsaved item it is a client-generated uuid
(`newSelectionId()`); after save, `saveNote` **overwrites** it with
`String(number)` — the stringified database id — even though `number` already
carries that id separately. The result is two coexisting id schemes and a key
that mutates mid-lifecycle, which forces every consumer to handle the id
changing under it and makes the invariant "id is a stable client key" false.

The cleanup: `id` is always a stable, opaque, client-generated key that never
changes after creation; `number` remains the only persistence key. This removes
the `id: String(number)` overwrite and the conflation.

## Current state

- `automation-platform/src/inspector/InspectorContext.tsx`:
  - `saveNote` (lines 129-156) on success does
    `{ ...selection, note, number, id: String(number) }` — the overwrite.
  - `createManualItem` (lines 198-227) sets `id: String(number)` on the new
    item from the start.
  - `addSelection` (lines 106-127) already uses `newSelectionId()` for unsaved
    items — the pattern to standardize on.
  - `newSelectionId` and `manualIdentity` are already imported (line 13).
- `automation-platform/src/inspector/WorkManager.tsx` uses `selection.id` only as
  a key/lookup/payload (lines 87, 285, 306, 308, 316, 452, 466) — it never reads
  the *format* of the id, so a uuid is fully interchangeable with a
  string-number. No consumer depends on `id === String(number)`.
- `automation-platform/src/inspector/InspectorContext.test.tsx` asserts `number`
  values and selection membership but does not assert the `id` format, so this
  change should not break existing tests.

## Commands you will need

Run all commands from the `automation-platform/` directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend tests | `npm run test:unit` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |

## Scope

**In scope** (the only files you should modify):
- `automation-platform/src/inspector/InspectorContext.tsx`
- `automation-platform/src/inspector/InspectorContext.test.tsx`

**Out of scope** (do NOT touch):
- `automation-platform/src/inspector/WorkManager.tsx` and `QuickNoteModal.tsx` —
  they consume `id` opaquely; no change needed.
- `automation-platform/src/inspector/identify.ts` — `newSelectionId()` is fine as-is.

## Git workflow

- Branch: `advisor/005-stable-selection-id`
- Commit message: `Use a stable client id for work-item selections`
  (imperative sentence, matching repo style).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stop overwriting the id in `saveNote`

In `automation-platform/src/inspector/InspectorContext.tsx`, change the success
branch of `saveNote` (around line 146) so it no longer rewrites `id`:

```ts
setSelections((current) =>
  current.map((selection) =>
    selection.id === id
      ? { ...selection, note, number }
      : selection,
  ),
);
```

(`id` stays the uuid that `addSelection` assigned.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Use a generated id in `createManualItem`

In `createManualItem` (around line 212), change `id: String(number)` to a fresh
client key:

```ts
id: newSelectionId(),
```

Keep `number` as the database id on the same object.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Add a test asserting id stability

In `automation-platform/src/inspector/InspectorContext.test.tsx`, add a test that
captures a selection's `id` before `saveNote`, saves, and asserts the `id` is
unchanged while `number` is now set:

```tsx
it("keeps a stable id across save while assigning a number", async () => {
  const harness = renderHarness();
  act(() => harness.get().toggleSelector());
  act(() => harness.get().addSelection(identity("div.a", "A")));
  const id = harness.get().activeSelectionId!;

  await act(async () => {
    await harness.get().saveNote(id, "hello");
  });

  const saved = harness.get().selections[0];
  expect(saved.id).toBe(id);
  expect(saved.number).toBe(1);

  harness.unmount();
});
```

(Reuse the existing `renderHarness` and `identity` helpers already in the file.)

**Verify**: `npm run test:unit` → all pass, including the new test.

### Step 4: Full verification

**Verify**:
- `npm run test:unit` → all pass.
- `npx tsc --noEmit` → exit 0.

## Test plan

- New test: "keeps a stable id across save while assigning a number" in
  `InspectorContext.test.tsx`, using the existing `renderHarness`/`identity` helpers.
- Confirm existing tests still pass unchanged (they assert `number`, not `id` format).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `saveNote` no longer rewrites `id` to `String(number)`
- [ ] `createManualItem` assigns `newSelectionId()` instead of `String(number)`
- [ ] `npm run test:unit` exits 0, incl. the new id-stability test
- [ ] `npx tsc --noEmit` exits 0
- [ ] `git status` shows only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `saveNote` / `createManualItem` no longer match the excerpts (drift).
- You find a consumer that depends on `id === String(number)` (grep for
  `String(` in `src/`) — if so, report it rather than working around it.

## Maintenance notes

- The invariant after this plan: `id` is opaque and stable for the life of the
  selection; `number` is `null` until persisted and then holds the database id.
  Future code should key on `id` and use `number` only for backend calls (which
  `removeSelection`/`editItem`/`setSelectionStatus` already do).
- Related to plan 006 (persistence error handling): because `id` is now stable,
  the optimistic-revert logic there can restore a removed selection by its `id`
  without worrying about id mutation.
