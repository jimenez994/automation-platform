/** The workspace that is currently open. */
export interface WorkspaceState {
  workspaceId: string;
  workspaceName: string;
  /** Absolute path of the workspace folder. */
  path: string;
  /** Absolute path of `<workspace>/.automation-platform/automation.db`. */
  databasePath: string;
  databaseConnected: boolean;
  databaseVersion: number;
  createdAt: string;
  caseCount: number;
  /** Null until the workspace has been scanned at least once. */
  lastScanAt: string | null;
  hasBeenScanned: boolean;
}

/** A remembered workspace, plus whether its folder is still where we left it. */
export interface RecentWorkspace {
  workspaceId: string;
  workspaceName: string;
  path: string;
  lastOpenedAt: string;
  caseCount: number;
  /** False when the folder is gone or no longer carries workspace metadata. */
  available: boolean;
}

/** What the application should show on launch. */
export interface StartupState {
  status: "noWorkspace" | "loaded" | "missing";
  workspace: WorkspaceState | null;
  /** Set when `status` is `missing`: the workspace we expected to find. */
  missingWorkspace: RecentWorkspace | null;
  /** Why the last workspace could not be opened, when that is the reason. */
  error: string | null;
  recent: RecentWorkspace[];
}
