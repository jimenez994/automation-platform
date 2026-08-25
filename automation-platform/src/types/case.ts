export const CASE_STATUSES = [
  "Initiated",
  "Submitted",
  "Need Info",
  "Ready",
  "Schedule",
  "Fail Inspection",
  "Completed",
] as const;
export const CASE_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/** A case, as returned by the Rust layer. */
export interface Case {
  id: number;
  caseNumber: string;
  name: string;
  jurisdiction: string | null;
  status: string;
  priority: string;
  /** Stored relative to the workspace root, so the workspace stays portable. */
  folderPath: string | null;
  documentCount: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True once the user has edited the name; the scanner then leaves it alone. */
  nameIsCustom: boolean;
  /** `folderPath` resolved against the current workspace root. */
  absolutePath: string | null;
}

/** The fields the user may edit. The scanner never overwrites these. */
export interface CaseEdit {
  name: string;
  jurisdiction: string | null;
  status: string;
  priority: string;
}

/** Case count for a single status. */
export interface CaseStatusCount {
  status: string;
  count: number;
}

/** Case counts in total and per status, for the dashboard summary. */
export interface CaseSummary {
  total: number;
  statuses: CaseStatusCount[];
}

/** A single file inside a case folder. */
export interface CaseFile {
  name: string;
  /** Path relative to the case folder. */
  path: string;
  size: number;
}
