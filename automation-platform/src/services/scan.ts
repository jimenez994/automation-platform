/**
 * Workspace scanning.
 *
 * `startScan` returns as soon as the scan has started; everything after that
 * arrives as events from Rust. Nothing here polls the database — the progress
 * shown is the scanner's own.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { ActivityLine, ScanFinished, ScanProgress, ScanStatus } from "../types";

const PROGRESS_EVENT = "scan://progress";
const ACTIVITY_EVENT = "scan://activity";
const FINISHED_EVENT = "scan://finished";

/**
 * Starts a scan of the open workspace.
 *
 * Rejects if a scan is already running rather than queueing a second one.
 */
export function startScan(): Promise<void> {
  return invoke<void>("start_scan");
}

/**
 * Asks the running scan to stop.
 *
 * The scanner stops at the next folder boundary and keeps what it has written;
 * no case record is removed.
 */
export function cancelScan(): Promise<void> {
  return invoke<void>("cancel_scan");
}

export function scanStatus(): Promise<ScanStatus> {
  return invoke<ScanStatus>("scan_status");
}

export function onScanProgress(handler: (progress: ScanProgress) => void): Promise<UnlistenFn> {
  return listen<ScanProgress>(PROGRESS_EVENT, (event) => handler(event.payload));
}

export function onScanActivity(handler: (line: ActivityLine) => void): Promise<UnlistenFn> {
  return listen<ActivityLine>(ACTIVITY_EVENT, (event) => handler(event.payload));
}

export function onScanFinished(handler: (result: ScanFinished) => void): Promise<UnlistenFn> {
  return listen<ScanFinished>(FINISHED_EVENT, (event) => handler(event.payload));
}
