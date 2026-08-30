# Plan 002: Test the `useScan` scan-controller hook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 794dd9c..HEAD -- automation-platform/src/hooks/useScan.ts automation-platform/src/services/scan.ts automation-platform/src/types/scan.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `794dd9c`, 2026-08-24
- **Issue**: —

## Why this matters

`useScan` (`automation-platform/src/hooks/useScan.ts`) drives the workspace
scan UI — it owns live progress, the bounded activity log, the cancellation
flag, and the one-shot completion callback. It is wired into the app at
`App.tsx:127`. It is also brand new (untracked in git) and has zero test
coverage, while the Rust scanner it fronts was just refactored
(`Refactor filesystem scanner traversal`). The most complex frontend state
machine in the repo currently has no guard against regressions in its
subscription lifecycle, its `MAX_ACTIVITY_LINES` truncation, or its
exactly-once `onFinished` guarantee.

A vitest suite here makes future changes to the scan flow safe to ship.

## Current state

- `automation-platform/src/hooks/useScan.ts` — the hook under test. Key behavior:
  - `begin()` resets `progress`/`activity`/`cancelling`, then `await startScan()`.
  - `cancel()` sets `cancelling = true`, `await cancelScan()`, and on throw
    resets `cancelling = false` and rethrows.
  - A `useEffect` (deps `[]`) registers three listeners once, via
    `onScanProgress` / `onScanActivity` / `onScanFinished`, and unregisters on
    unmount with `unlisten.forEach((p) => void p.then((stop) => stop()))`.
  - `onScanActivity` appends and truncates the log to `MAX_ACTIVITY_LINES = 500`.
  - `onScanFinished` clears `cancelling` and calls `onFinishedRef.current(result)`
    (held in a ref so the callback is always the latest).
- `automation-platform/src/services/scan.ts` — thin `invoke`/`listen` wrappers the
  hook imports. The test must **mock this module**, not Tauri itself.
- `automation-platform/src/types/scan.ts` — the `ScanProgress`, `ActivityLine`,
  `ScanFinished` shapes the test fixtures need (fields listed below).
- Test conventions (the pattern to follow): `automation-platform/src/inspector/InspectorContext.test.tsx`
  renders a harness component with `createRoot` from `react-dom/client` and
  `act` from `react`, capturing hook return state into a mutable variable — it
  does **not** use `@testing-library/react` (not installed). Model the new test
  on this file. Vitest config lives in `automation-platform/vite.config.ts`
  (`environment: "jsdom"`, `include: ["src/**/*.test.{ts,tsx}"]`), so a new
  `useScan.test.tsx` is picked up automatically.

Type shapes for fixtures (from `types/scan.ts`):

```ts
ScanProgress = {
  phase: ScanPhase; currentCase: string | null; currentIndex: number;
  totalCases: number; filesDiscovered: number; created: number; updated: number;
  unchanged: number; skipped: number; warnings: number; errors: number;
  elapsedMs: number; estimatedRemainingMs: number | null;
};
ActivityLine = { timestamp: string; level: "info" | "warning" | "error"; message: string };
ScanFinished = { status: ScanPhase; outcome: ScanOutcome | null; error: string | null };
```

## Commands you will need

Run all commands from the `automation-platform/` directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend tests | `npm run test:unit` (aliases `vitest run`) | all pass, incl. new tests |
| Single file | `npx vitest run src/hooks/useScan.test.tsx` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |

## Scope

**In scope** (the only files you should modify):
- `automation-platform/src/hooks/useScan.test.tsx` (create)

**Out of scope** (do NOT touch):
- `automation-platform/src/hooks/useScan.ts` — this is a characterization test
  of existing behavior; do not change the hook to make a test pass.
- `automation-platform/src/services/scan.ts` — mock it, don't edit it.

## Git workflow

- Branch: `advisor/002-test-useScan`
- Commit message: `Add useScan hook tests` (imperative sentence, matching repo style).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the test file and mock the service module

Create `automation-platform/src/hooks/useScan.test.tsx`. Mock `../services/scan`
with `vi.mock`, exposing controllable handlers. Capture each event handler into
a module-scoped variable so the test can simulate events:

```tsx
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useScan, type ScanController } from "./useScan";
import * as scan from "../services/scan";
import type { ActivityLine, ScanFinished, ScanProgress } from "../types";

vi.mock("../services/scan", () => ({
  startScan: vi.fn(),
  cancelScan: vi.fn(),
  onScanProgress: vi.fn(),
  onScanActivity: vi.fn(),
  onScanFinished: vi.fn(),
}));

type ProgressHandler = (p: ScanProgress) => void;
type ActivityHandler = (l: ActivityLine) => void;
type FinishedHandler = (r: ScanFinished) => void;

let progressHandler: ProgressHandler | undefined;
let activityHandler: ActivityHandler | undefined;
let finishedHandler: FinishedHandler | undefined;
let unlistens: Array<() => void>;

beforeEach(() => {
  vi.clearAllMocks();
  progressHandler = undefined;
  activityHandler = undefined;
  finishedHandler = undefined;
  unlistens = [];

  vi.mocked(scan.startScan).mockResolvedValue(undefined);
  vi.mocked(scan.cancelScan).mockResolvedValue(undefined);
  vi.mocked(scan.onScanProgress).mockImplementation((h: ProgressHandler) => {
    progressHandler = h;
    const stop = vi.fn();
    unlistens.push(stop);
    return Promise.resolve(stop);
  });
  vi.mocked(scan.onScanActivity).mockImplementation((h: ActivityHandler) => {
    activityHandler = h;
    const stop = vi.fn();
    unlistens.push(stop);
    return Promise.resolve(stop);
  });
  vi.mocked(scan.onScanFinished).mockImplementation((h: FinishedHandler) => {
    finishedHandler = h;
    const stop = vi.fn();
    unlistens.push(stop);
    return Promise.resolve(stop);
  });
});
```

Fixture factories (small helpers, keep them near the top of the file):

```tsx
const progress = (overrides: Partial<ScanProgress> = {}): ScanProgress => ({
  phase: "scanningDocuments",
  currentCase: "DC8842.01",
  currentIndex: 1,
  totalCases: 3,
  filesDiscovered: 42,
  created: 1,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  warnings: 0,
  errors: 0,
  elapsedMs: 120,
  estimatedRemainingMs: null,
  ...overrides,
});

const activityLine = (message: string): ActivityLine => ({
  timestamp: "2026-08-24T00:00:00Z",
  level: "info",
  message,
});

const finished = (overrides: Partial<ScanFinished> = {}): ScanFinished => ({
  status: "completed",
  outcome: null,
  error: null,
  ...overrides,
});
```

### Step 2: Add the render harness

Model it on `InspectorContext.test.tsx`'s `renderHarness` (lines 74-99): render
a component that calls `useScan` and captures the returned controller, using
`createRoot` + `act`. Because `useScan`'s effect runs on mount inside `act`, the
three handlers are captured synchronously after `root.render`.

```tsx
function renderHarness(onFinished: (result: ScanFinished) => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  let controller: ScanController | null = null;

  function Harness() {
    controller = useScan({ onFinished });
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    get: () => controller!,
    unmount: () => act(() => root.unmount()),
  };
}
```

### Step 3: Write the test cases

Add a `describe("useScan", ...)` block covering:

1. **begin calls startScan and resets state** — render, push a fake progress +
   activity first (so state is non-empty), call `await act(async () => { await harness.get().begin(); })`,
   assert `scan.startScan` called once and `progress` is `null` / `activity` is `[]`.
2. **progress event updates progress state** — after mount, `act(() => progressHandler!(progress()))`;
   assert `harness.get().progress` equals the fixture (or its `phase`/`filesDiscovered`).
3. **activity events append and are capped at 500** — `act(() => { for (let i = 0; i < 520; i++) activityHandler!(activityLine(\`line \${i}\`)); })`;
   assert `activity.length === 500` and the first retained line is `line 20`
   (the oldest 20 were dropped) and the last is `line 519`.
4. **finished fires onFinished exactly once and clears cancelling** — make
   `onFinished` a `vi.fn()`; `act(() => finishedHandler!(finished()))`; assert
   `onFinished` called once with the payload and `cancelling` is `false`.
5. **cancel sets cancelling, calls cancelScan, and clears on finish** —
   `await act(async () => { await harness.get().cancel(); })`; assert
   `cancelling === true` and `scan.cancelScan` called once; then
   `act(() => finishedHandler!(finished()))`; assert `cancelling === false`.
6. **cancel rethrows a backend failure and resets cancelling** — make
   `scan.cancelScan.mockRejectedValueOnce(new Error("no scan running"))`; call
   `cancel()` inside `act`, expect it to reject, and assert `cancelling` is
   `false` afterward (use `await expect(...).rejects.toThrow(...)`).
7. **unmount unregisters all listeners** — after mount, call
   `harness.unmount()`, then assert every function in `unlistens` was called.

Each test must end with `harness.unmount()` (in a `finally` where a rejection is
expected), matching the existing test file's cleanup discipline.

**Verify**: `npx vitest run src/hooks/useScan.test.tsx` → all 7 pass.

### Step 4: Run the full frontend suite and typecheck

**Verify**:
- `npm run test:unit` → all tests pass (existing `inspector` tests + new `useScan` tests).
- `npx tsc --noEmit` → exit 0, no errors.

## Test plan

- New file: `automation-platform/src/hooks/useScan.test.tsx`.
- Cases: the seven listed in Step 3 — start/reset, progress propagation,
  activity capping at 500, exactly-once finish, cancel happy path, cancel
  rejection, unmount cleanup.
- Structural pattern: `automation-platform/src/inspector/InspectorContext.test.tsx`
  (createRoot + act harness, no testing-library).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `automation-platform/src/hooks/useScan.test.tsx` exists with ≥7 tests
- [ ] `npm run test:unit` exits 0, including the new `useScan` tests
- [ ] `npx tsc --noEmit` exits 0
- [ ] `git status` shows only the new test file (and the branch) changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `useScan.ts` source does not match the "Current state" excerpts (drift).
- `services/scan.ts` no longer exports `startScan` / `cancelScan` /
  `onScanProgress` / `onScanActivity` / `onScanFinished` (mock target missing).
- `@testing-library/react` was added to the project since this plan — prefer its
  `renderHook` then and report back rather than building a custom harness.
- A test case's expected behavior is genuinely different from what the hook
  does (e.g. `cancel` does not set `cancelling`); report the mismatch — do not
  "fix" the hook.

## Maintenance notes

- The `MAX_ACTIVITY_LINES = 500` cap is asserted in test 3; if the cap is ever
  changed, update that test's expected numbers (`500` and `line 20`).
- If the hook gains a `status`/`scanStatus` polling path, add coverage for it
  here rather than in a new file.
- Deferred, out of scope: testing `services/scan.ts` itself (it is a thin
  `invoke`/`listen` wrapper) and `clipboard.ts` (thin browser-API wrapper,
  low value).
