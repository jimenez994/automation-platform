/** Stage a scan is in. Mirrors `ScanPhase` in Rust. */
export type ScanPhase =
  | "initializing"
  | "discoveringCases"
  | "scanningDocuments"
  | "updatingDatabase"
  | "finalizing"
  | "completed"
  | "cancelled"
  | "failed";

/** The phases shown as a checklist on the loading screen, in order. */
export const SCAN_PHASE_SEQUENCE: ScanPhase[] = [
  "initializing",
  "discoveringCases",
  "scanningDocuments",
  "updatingDatabase",
  "finalizing",
];

export const SCAN_PHASE_LABELS: Record<ScanPhase, string> = {
  initializing: "Opening workspace",
  discoveringCases: "Discovering case folders",
  scanningDocuments: "Scanning documents",
  updatingDatabase: "Updating case records",
  finalizing: "Finalizing",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** A snapshot of an in-flight scan. */
export interface ScanProgress {
  phase: ScanPhase;
  currentCase: string | null;
  currentIndex: number;
  totalCases: number;
  filesDiscovered: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  warnings: number;
  errors: number;
  elapsedMs: number;
  /** Null until there is enough information for an honest estimate. */
  estimatedRemainingMs: number | null;
}

export type ActivityLevel = "info" | "warning" | "error";

/** One line of the live activity log. */
export interface ActivityLine {
  timestamp: string;
  level: ActivityLevel;
  message: string;
}

/** A problem with one folder. Warnings never abort a scan. */
export interface ScanWarning {
  folder: string | null;
  message: string;
}

/** What a scan did. */
export interface ScanReport {
  scannedAt: string;
  durationMs: number;
  foldersFound: number;
  casesFound: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /** Cases whose folder was not found. Reported, never deleted. */
  missing: number;
  documentsFound: number;
  errors: number;
  warnings: ScanWarning[];
}

export interface ScanOutcome {
  status: ScanPhase;
  report: ScanReport;
}

/** Payload of the `scan://finished` event. */
export interface ScanFinished {
  status: ScanPhase;
  outcome: ScanOutcome | null;
  error: string | null;
}

export interface ScanStatus {
  running: boolean;
  lastOutcome: ScanOutcome | null;
}
