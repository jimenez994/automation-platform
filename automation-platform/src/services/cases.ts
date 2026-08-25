/** Case commands: reading, editing and scanning the open workspace. */
import { invoke } from "@tauri-apps/api/core";

import type { Case, CaseEdit, CaseFile, CaseSummary, ScanReport } from "../types";

/** Lists cases, optionally filtered by case number or name. */
export function listCases(search?: string): Promise<Case[]> {
  return invoke<Case[]>("list_cases", { search: search?.trim() || null });
}

export function getCase(id: number): Promise<Case | null> {
  return invoke<Case | null>("get_case", { id });
}

export function caseSummary(): Promise<CaseSummary> {
  return invoke<CaseSummary>("case_summary");
}

/** Saves the user-managed fields. These are never overwritten by a scan. */
export function updateCase(id: number, edit: CaseEdit): Promise<Case> {
  return invoke<Case>("update_case", { id, edit });
}

/**
 * Rescans one case folder.
 *
 * A whole-workspace scan goes through `services/scan.ts` instead: it runs in
 * the background and reports progress.
 */
export function scanCase(id: number): Promise<ScanReport> {
  return invoke<ScanReport>("scan_case", { id });
}

/** Opens a case folder in the operating system's file manager. */
export function openCaseFolder(id: number): Promise<void> {
  return invoke<void>("open_case_folder", { id });
}

/** Lists the files inside a case folder (relative paths + sizes). */
export function listCaseFiles(id: number): Promise<CaseFile[]> {
  return invoke<CaseFile[]>("list_case_files", { id });
}
