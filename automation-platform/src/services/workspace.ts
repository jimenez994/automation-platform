/**
 * Workspace commands. Components import from here rather than calling `invoke`
 * directly, so the command names live in exactly one place.
 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { RecentWorkspace, StartupState, WorkspaceState } from "../types";

/** What to show on launch: the picker, the loaded workspace, or recovery. */
export function workspaceStartup(): Promise<StartupState> {
  return invoke<StartupState>("workspace_startup");
}

/**
 * Shows the native folder picker. Resolves to `null` when the user cancels.
 *
 * No path is ever hard-coded: whatever the user picks becomes the workspace.
 */
export async function chooseWorkspaceFolder(
  title = "Select a workspace folder",
): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === "string" ? selected : null;
}

/**
 * Opens a folder as a workspace. Creates `.automation-platform/` the first
 * time and reconnects to the existing database every time after that, so this
 * handles a new folder, a known one and a relocated one alike.
 */
export function openWorkspace(path: string): Promise<WorkspaceState> {
  return invoke<WorkspaceState>("open_workspace", { path });
}

/** Opens a remembered workspace by its id, at the path last recorded for it. */
export function openRecentWorkspace(workspaceId: string): Promise<WorkspaceState> {
  return invoke<WorkspaceState>("open_recent_workspace", { workspaceId });
}

export function currentWorkspace(): Promise<WorkspaceState | null> {
  return invoke<WorkspaceState | null>("current_workspace");
}

/** Returns to the workspace selection screen. */
export function closeWorkspace(): Promise<void> {
  return invoke<void>("close_workspace");
}

export function listRecentWorkspaces(): Promise<RecentWorkspace[]> {
  return invoke<RecentWorkspace[]>("list_recent_workspaces");
}

/** Forgets a workspace. The folder and its database are left untouched. */
export function removeRecentWorkspace(workspaceId: string): Promise<RecentWorkspace[]> {
  return invoke<RecentWorkspace[]>("remove_recent_workspace", { workspaceId });
}

/** Opens the workspace folder in the operating system's file manager. */
export function openWorkspaceFolder(): Promise<void> {
  return invoke<void>("open_workspace_folder");
}
