import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelScan,
  onScanActivity,
  onScanFinished,
  onScanProgress,
  startScan,
} from "../services/scan";
import type { ActivityLine, ScanFinished, ScanProgress } from "../types";

/** Keeps the activity log bounded on a very large workspace. */
const MAX_ACTIVITY_LINES = 500;

/** Drives a workspace scan and reports its live state. */
export interface ScanController {
  progress: ScanProgress | null;
  activity: ActivityLine[];
  cancelling: boolean;
  begin(): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * The scan lifecycle, lifted out of the screen flow.
 *
 * Owns the live progress, the activity log and the cancellation flag, plus the
 * one-off subscription to the scanner's events. The caller reacts to completion
 * through `onFinished`, which fires exactly once per scan whatever the outcome.
 */
export function useScan(options: { onFinished: (result: ScanFinished) => void }): ScanController {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [activity, setActivity] = useState<ActivityLine[]>([]);
  const [cancelling, setCancelling] = useState(false);

  // Held in a ref so the subscription is registered once but always sees the
  // caller's latest callback, mirroring how App wires its menu handler.
  const onFinishedRef = useRef(options.onFinished);
  onFinishedRef.current = options.onFinished;

  const begin = useCallback(async () => {
    setProgress(null);
    setActivity([]);
    setCancelling(false);
    await startScan();
  }, []);

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      await cancelScan();
    } catch (error) {
      setCancelling(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    const unlisten: Array<Promise<() => void>> = [
      onScanProgress(setProgress),
      onScanActivity((line) =>
        setActivity((lines) => {
          const next = [...lines, line];
          return next.length > MAX_ACTIVITY_LINES
            ? next.slice(next.length - MAX_ACTIVITY_LINES)
            : next;
        }),
      ),
      onScanFinished((result) => {
        setCancelling(false);
        onFinishedRef.current(result);
      }),
    ];

    return () => {
      unlisten.forEach((pending) => void pending.then((stop) => stop()));
    };
  }, []);

  return { progress, activity, cancelling, begin, cancel };
}
