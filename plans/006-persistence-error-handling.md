# Plan 006: Surface persistence failures and reconcile optimistic updates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8c231df..HEAD -- automation-platform/src/inspector/InspectorContext.tsx automation-platform/src/inspector/WorkManager.tsx automation-platform/src/inspector/QuickNoteModal.tsx automation-platform/src/inspector/InspectorContext.test.tsx`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/005-stable-selection-id.md (recommended, not hard)
- **Category**: bug
- **Planned at**: commit `8c231df`, 2026-08-24
- **Issue**: —

## Why this matters

Every inspector persistence call is fire-and-forget with an optimistic UI
update and a swallowed error. Concretely:

- `saveNote` and `createManualItem` `catch` → `console.error`, then the modal
  still closes — the user's note is silently lost with no indication.
- `removeSelection`, `editItem`, `setSelectionStatus`, and `clearSelections`
  append `.catch(() => {})`, so when the backend fails (locked DB, disk error)
  the UI keeps showing the change that was never persisted — it resets on the
  next reload with no warning.

This plan adds a single error signal to the inspector state, surfaces it through
the existing `Notice` component, keeps the create/save modals open on failure,
and rolls back the optimistic updates when the backend rejects them.

## Current state

- `automation-platform/src/inspector/InspectorContext.tsx` — the state machine.
  - `InspectorState` (lines 28-44) has no error field.
  - `saveNote` (129-156): `catch` logs, then unconditionally
    `setActiveSelectionId(null); setMode("idle")`.
  - `createManualItem` (198-227): `catch` logs only.
  - `removeSelection` (168-175), `editItem` (178-195), `clearSelections` (229-233),
    `setSelectionStatus` (235-245): `.catch(() => {})`.
  - `load` (248-291): `catch` logs only.
- `automation-platform/src/inspector/WorkManager.tsx` — renders the board; the
  `ManualItemForm` (333-423) calls `await createManualItem(...)` then `onClose()`
  unconditionally (line 343-344), so it closes even on failure.
- `automation-platform/src/inspector/QuickNoteModal.tsx` — renders the note
  textarea and Save/Cancel; `saveNote` is called from the Save button (line 87).
- `automation-platform/src/components/Notice.tsx` — existing `Notice` component
  with `tone="error"` (renders `role="alert"`). Reuse it for the error banner.
- `automation-platform/src/inspector/InspectorContext.test.tsx` — `renderHarness`
  (lines 80-99) builds its own `inMemoryNoteStore(seed)` internally and already
  accepts a `seed` array (added by plan 004); it does not yet accept an injected
  `store`.

## Commands you will need

Run all commands from the `automation-platform/` directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend tests | `npm run test:unit` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |

## Scope

**In scope** (the only files you should modify):
- `automation-platform/src/inspector/InspectorContext.tsx`
- `automation-platform/src/inspector/WorkManager.tsx`
- `automation-platform/src/inspector/QuickNoteModal.tsx`
- `automation-platform/src/inspector/InspectorContext.test.tsx`

**Out of scope** (do NOT touch):
- The backend commands/notes — failures originate there but the fix is purely
  frontend resilience; no backend change.
- `identify.ts`, `markdown.ts`, `types.ts` — unrelated.

## Git workflow

- Branch: `advisor/006-persistence-error-handling`
- Commit message: `Surface inspector persistence errors and revert on failure`
  (imperative sentence, matching repo style).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an error signal to `InspectorState`

In `InspectorContext.tsx`:

1. Add to the `InspectorState` interface (after `activeSelectionId`):
   ```ts
   error: string | null;
   clearError: () => void;
   ```
2. Add state + callback inside `InspectorProvider`:
   ```ts
   const [error, setError] = useState<string | null>(null);
   const clearError = useCallback(() => setError(null), []);
   ```
3. Add `error` and `clearError` to the `useMemo` value object and its dependency
   array.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Keep modals open on create/save failure

Rewrite `saveNote` so the close (`setActiveSelectionId(null); setMode("idle")`)
happens only on success, and the catch sets the error:

```ts
const saveNote = useCallback(async (id: string, note: string) => {
  const target = selectionsRef.current.find((s) => s.id === id);
  if (!target) return;

  try {
    const number = await store.create({
      note,
      identity: target.identity,
      status: target.status,
      origin: target.origin,
      type: target.type,
      priority: target.priority,
      title: target.title,
    });
    setSelections((current) =>
      current.map((s) => (s.id === id ? { ...s, note, number } : s)),
    );
    setActiveSelectionId(null);
    setMode("idle");
  } catch (error) {
    setError("Could not save the work item. Please try again.");
  }
}, [store]);
```

Rewrite `createManualItem` to surface the error and rethrow so the caller can
avoid closing:

```ts
const createManualItem = useCallback(async (fields: ManualItemFields) => {
  try {
    const number = await store.create({
      note: fields.note,
      identity: null,
      status: "Backlog",
      origin: "Manual",
      type: fields.type,
      priority: fields.priority,
      title: fields.title,
    });
    setSelections((current) => [
      ...current,
      {
        id: newSelectionId(),
        number,
        identity: manualIdentity(),
        title: fields.title,
        origin: "Manual",
        type: fields.type,
        priority: fields.priority,
        note: fields.note,
        addedAt: new Date().toISOString(),
        status: "Backlog",
      },
    ]);
  } catch (error) {
    setError("Could not create the work item. Please try again.");
    throw error;
  }
}, [store]);
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Revert optimistic mutations on failure

Rewrite the four fire-and-forget mutations to capture the prior value and revert
on failure. `selectionsRef.current` is the pre-mutation state, so read it first.

`removeSelection`:

```ts
const removeSelection = useCallback((id: string) => {
  const index = selectionsRef.current.findIndex((s) => s.id === id);
  if (index < 0) return;
  const removed = selectionsRef.current[index];

  setSelections((current) => current.filter((s) => s.id !== id));
  setActiveSelectionId((current) => (current === id ? null : current));

  if (removed.number != null) {
    void store.remove(removed.number).catch(() => {
      setSelections((current) => {
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });
      setError("Could not delete the work item.");
    });
  }
}, [store]);
```

`editItem`:

```ts
const editItem = useCallback((id: string, fields: EditableItemFields) => {
  const target = selectionsRef.current.find((s) => s.id === id);
  if (!target) return;

  setSelections((current) =>
    current.map((s) => (s.id === id ? { ...s, ...fields } : s)),
  );

  if (target.number != null) {
    void store
      .update(target.number, {
        note: fields.note,
        type: fields.type,
        priority: fields.priority,
        title: fields.title,
      })
      .catch(() => {
        setSelections((current) =>
          current.map((s) => (s.id === id ? target : s)),
        );
        setError("Could not save the changes.");
      });
  }
}, [store]);
```

`clearSelections`:

```ts
const clearSelections = useCallback(() => {
  const previous = selectionsRef.current;
  setSelections([]);
  setActiveSelectionId(null);

  void store.clear().catch(() => {
    setSelections(previous);
    setError("Could not clear the work items.");
  });
}, [store]);
```

`setSelectionStatus`:

```ts
const setSelectionStatus = useCallback((id: string, status: WorkStatus) => {
  const target = selectionsRef.current.find((s) => s.id === id);
  if (!target) return;

  setSelections((current) =>
    current.map((s) => (s.id === id ? { ...s, status } : s)),
  );

  if (target.number != null) {
    void store.setStatus(target.number, status).catch(() => {
      setSelections((current) =>
        current.map((s) => (s.id === id ? { ...s, status: target.status } : s)),
      );
      setError("Could not move the work item.");
    });
  }
}, [store]);
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Surface load failures

In the `load` effect's `catch`, replace/augment the `console.error` with the
error signal:

```ts
} catch (error) {
  setError("Could not load the work items.");
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: Render the error in the UI

`WorkManager.tsx`:
1. Import `Notice`: `import { Notice } from "../components/Notice";`
2. Destructure `error` and `clearError` from `useInspector()`.
3. Render a dismissible banner inside the board, directly under the `<header>`
   (around line 516), only when `error` is set:
   ```tsx
   {error ? (
     <div className="border-app-border flex items-start justify-between gap-2 border-b px-5 py-3">
       <Notice tone="error">{error}</Notice>
       <button type="button" onClick={clearError} className="text-app-muted hover:text-app-text text-xs">Dismiss</button>
     </div>
   ) : null}
   ```

`QuickNoteModal.tsx`:
1. Import `Notice`.
2. Destructure `error` and `clearError` from `useInspector()`.
3. Render an inline `Notice tone="error"` above the Save/Cancel row (around line
   77), only when `error` is set. (The modal stays open on save failure via Step
   2, so the error is visible where the user is.)

`ManualItemForm` (inside `WorkManager.tsx`): change `save` so it closes only on
success:

```tsx
async function save() {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return;
  try {
    await createManualItem({ title: trimmedTitle, note, type, priority });
    onClose();
  } catch {
    // the error is already surfaced through context
  }
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: Add regression tests

Extend the existing `renderHarness(workspaceId, seed)` in
`InspectorContext.test.tsx` with an optional third `store` parameter (default the
`inMemoryNoteStore(seed)` it already builds), and add a `failingStore()` helper
whose methods reject:

```tsx
function failingStore(): NoteStore {
  const fail = () => Promise.reject(new Error("boom"));
  return { list: () => Promise.resolve([]), create: fail, update: fail,
           setStatus: fail, remove: fail, clear: fail };
}
```

Then add tests (using the existing `renderHarness`/`identity` helpers):

1. `saveNote` failure keeps the modal open and sets `error` (mode stays
   `"noting"`, `activeSelectionId` unchanged, `error` non-null).
2. `createManualItem` failure rejects and sets `error`.
3. `removeSelection` failure restores the removed selection and sets `error`.
4. `editItem` failure reverts the field and sets `error`.
5. `setSelectionStatus` failure reverts the status and sets `error`.
6. `load` failure sets `error` (inject `failingStore` into the harness).

Note: `failingStore.list` should resolve to `[]` (not reject) except where the
test is specifically for load failure — for the load test, make `list` reject
too. You may add a second helper or a parameter to control which methods fail.

**Verify**: `npm run test:unit` → all pass, including the new tests.

### Step 7: Full verification

**Verify**:
- `npm run test:unit` → all pass.
- `npx tsc --noEmit` → exit 0.

## Test plan

- File: `automation-platform/src/inspector/InspectorContext.test.tsx`.
- Cases: save-failure keeps modal open; create-failure rejects; remove/edit/status
  failures revert optimistically; load failure surfaces. Six tests total.
- Structural pattern: existing `Inspector state machine` describe block and the
  `renderHarness`/`identity` helpers.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `InspectorState` exposes `error` and `clearError`
- [ ] `saveNote`/`createManualItem` surface failure and keep the modal open / reject
- [ ] `removeSelection`/`editItem`/`clearSelections`/`setSelectionStatus` revert on failure
- [ ] `load` surfaces failure
- [ ] `WorkManager` and `QuickNoteModal` render the error via `Notice`
- [ ] `npm run test:unit` exits 0, incl. the six new tests
- [ ] `npx tsc --noEmit` exits 0
- [ ] `git status` shows only the four in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the callbacks no longer match the excerpts (drift).
- `Notice`'s props/import path differ from `automation-platform/src/components/Notice.tsx`.
- `renderHarness`'s signature or the `inMemoryNoteStore` shape changed (drift) —
  report rather than force the test changes.
- You discover the error signal needs to be scoped per-item rather than a single
  global message (e.g. multiple items failing at once) — report and discuss,
  rather than silently switching to a per-item model.

## Maintenance notes

- The optimistic-revert pattern relies on reading `selectionsRef.current` before
  mutating; keep that ordering in any future mutation.
- The single global `error` is deliberately simple. If the app later needs to
  surface simultaneous independent errors, revisit with a richer shape (e.g. a
  map of `id -> error`), but don't over-build now.
- This plan depends on plan 005 only for convenience (stable ids make the revert
  restore unambiguous). If 005 lands first, the revert-by-index in
  `removeSelection` is still correct; it does not rely on id format.
