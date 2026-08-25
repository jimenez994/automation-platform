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

describe("useScan", () => {
  it("begin calls startScan and resets state", async () => {
    const harness = renderHarness(vi.fn());
    act(() => progressHandler!(progress()));
    act(() => activityHandler!(activityLine("some activity")));

    await act(async () => {
      await harness.get().begin();
    });

    expect(scan.startScan).toHaveBeenCalledTimes(1);
    expect(harness.get().progress).toBeNull();
    expect(harness.get().activity).toEqual([]);

    harness.unmount();
  });

  it("progress event updates progress state", () => {
    const harness = renderHarness(vi.fn());

    act(() => progressHandler!(progress()));

    expect(harness.get().progress).toEqual(progress());

    harness.unmount();
  });

  it("activity events append and are capped at 500", () => {
    const harness = renderHarness(vi.fn());

    act(() => {
      for (let i = 0; i < 520; i++) activityHandler!(activityLine(`line ${i}`));
    });

    const activity = harness.get().activity;
    expect(activity).toHaveLength(500);
    expect(activity[0].message).toBe("line 20");
    expect(activity[activity.length - 1].message).toBe("line 519");

    harness.unmount();
  });

  it("finished fires onFinished exactly once and clears cancelling", () => {
    const onFinished = vi.fn();
    const harness = renderHarness(onFinished);

    act(() => finishedHandler!(finished()));

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith(finished());
    expect(harness.get().cancelling).toBe(false);

    harness.unmount();
  });

  it("cancel sets cancelling, calls cancelScan, and clears on finish", async () => {
    const harness = renderHarness(vi.fn());

    await act(async () => {
      await harness.get().cancel();
    });

    expect(harness.get().cancelling).toBe(true);
    expect(scan.cancelScan).toHaveBeenCalledTimes(1);

    act(() => finishedHandler!(finished()));
    expect(harness.get().cancelling).toBe(false);

    harness.unmount();
  });

  it("cancel rethrows a backend failure and resets cancelling", async () => {
    vi.mocked(scan.cancelScan).mockRejectedValueOnce(new Error("no scan running"));
    const harness = renderHarness(vi.fn());

    await expect(
      act(async () => {
        await harness.get().cancel();
      }),
    ).rejects.toThrow("no scan running");
    expect(harness.get().cancelling).toBe(false);

    harness.unmount();
  });

  it("unmount unregisters all listeners", async () => {
    const harness = renderHarness(vi.fn());

    harness.unmount();
    // The unlisten promises resolve on a microtask; flush them before asserting.
    await act(async () => {});

    expect(unlistens).toHaveLength(3);
    for (const stop of unlistens) {
      expect(stop).toHaveBeenCalledTimes(1);
    }
  });
});
