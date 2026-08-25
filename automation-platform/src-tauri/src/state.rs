//! Application state shared between Tauri commands.
//!
//! Holds the application-level preferences and, when one is open, the current
//! workspace with its database connection. A single mutex guards both: the
//! operations are short, and a scan deliberately holds the lock so that a query
//! cannot observe a half-applied scan.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::cases::{CancelToken, ScanOutcome};
use crate::workspace::preferences::{preferences_path, Preferences, ThemePreference};
use crate::workspace::{OpenWorkspace, RecentWorkspaceView, WorkspaceState};

/// What the frontend should show when the application starts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupState {
    /// `noWorkspace`, `loaded` or `missing`.
    pub status: String,
    /// Present when `status` is `loaded`.
    pub workspace: Option<WorkspaceState>,
    /// Present when `status` is `missing`: the workspace we expected to find.
    pub missing_workspace: Option<RecentWorkspaceView>,
    /// Why the last workspace could not be opened, when that is the reason.
    pub error: Option<String>,
    pub recent: Vec<RecentWorkspaceView>,
}

/// Everything the frontend needs to know about scanning.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub running: bool,
    /// Result of the last finished scan, kept so the completion screen survives
    /// a re-render.
    pub last_outcome: Option<ScanOutcome>,
}

/// What a scan thread needs to do its work.
///
/// It carries paths rather than the open connection: the scan opens its own
/// connection to the same file so that it never holds the application lock
/// while it runs.
pub struct ScanSession {
    pub root: PathBuf,
    pub database_path: PathBuf,
    pub cancel: CancelToken,
}

#[derive(Default)]
struct ScanRuntime {
    running: bool,
    cancel: CancelToken,
    last_outcome: Option<ScanOutcome>,
}

struct Inner {
    preferences: Preferences,
    workspace: Option<OpenWorkspace>,
    scan: ScanRuntime,
}

pub struct AppState {
    inner: Mutex<Inner>,
    preferences_path: PathBuf,
}

impl AppState {
    /// Loads the application preferences from the application data directory.
    /// No workspace is opened yet; that happens in [`AppState::startup`].
    pub fn load(app_data_dir: &Path) -> Self {
        let preferences_path = preferences_path(app_data_dir);
        let preferences = Preferences::load(&preferences_path);

        Self {
            inner: Mutex::new(Inner {
                preferences,
                workspace: None,
                scan: ScanRuntime::default(),
            }),
            preferences_path,
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        self.inner
            .lock()
            .map_err(|_| "the application state is poisoned".to_string())
    }

    /// Persists the preferences, reporting failures to the log rather than to
    /// the user: losing the recent list is not worth failing an operation the
    /// user asked for.
    fn persist(&self, preferences: &Preferences) {
        if let Err(error) = preferences.save(&self.preferences_path) {
            eprintln!("[automation-platform] could not save the preferences: {error}");
        }
    }

    /// Decides what the application should show on launch.
    ///
    /// Reopens the last workspace when its folder is still there and still
    /// carries workspace metadata. A workspace that has moved is reported as
    /// missing so the user can relocate it; it is never silently forgotten.
    pub fn startup(&self) -> Result<StartupState, String> {
        let mut inner = self.lock()?;

        let Some(entry) = inner.preferences.last_workspace().cloned() else {
            return Ok(StartupState {
                status: "noWorkspace".to_string(),
                workspace: None,
                missing_workspace: None,
                error: None,
                recent: recent_views(&inner.preferences),
            });
        };

        let view = RecentWorkspaceView::from_entry(&entry);
        if !view.available {
            eprintln!(
                "[automation-platform] the last workspace `{}` was not found at {}",
                entry.workspace_name, entry.path
            );

            return Ok(StartupState {
                status: "missing".to_string(),
                workspace: None,
                missing_workspace: Some(view),
                error: None,
                recent: recent_views(&inner.preferences),
            });
        }

        match self.open_locked(&mut inner, Path::new(&entry.path)) {
            Ok(state) => Ok(StartupState {
                status: "loaded".to_string(),
                workspace: Some(state),
                missing_workspace: None,
                error: None,
                recent: recent_views(&inner.preferences),
            }),
            Err(error) => {
                eprintln!(
                    "[automation-platform] could not reopen `{}`: {error}",
                    entry.path
                );

                Ok(StartupState {
                    status: "missing".to_string(),
                    workspace: None,
                    missing_workspace: Some(view),
                    error: Some(error),
                    recent: recent_views(&inner.preferences),
                })
            }
        }
    }

    /// Opens a folder as a workspace and remembers it.
    pub fn open_workspace(&self, root: &Path) -> Result<WorkspaceState, String> {
        let mut inner = self.lock()?;
        self.open_locked(&mut inner, root)
    }

    /// Shared by `startup` and `open_workspace`; assumes the lock is held.
    ///
    /// The recent entry is matched on the workspace id read from the folder, so
    /// opening a workspace at a new location updates the existing entry instead
    /// of adding a second one.
    fn open_locked(&self, inner: &mut Inner, root: &Path) -> Result<WorkspaceState, String> {
        let workspace = OpenWorkspace::open(root)?;
        let state = workspace.state()?;

        inner.preferences.record_opened(
            &workspace.metadata.workspace_id,
            &workspace.metadata.workspace_name,
            &workspace.root,
            state.case_count,
        );

        println!(
            "[automation-platform] workspace `{}` ({}) opened at {}",
            workspace.metadata.workspace_name,
            workspace.metadata.workspace_id,
            workspace.root.display()
        );

        inner.workspace = Some(workspace);
        self.persist(&inner.preferences);

        Ok(state)
    }

    /// Closes the current workspace and returns to the selection screen. The
    /// workspace stays in the recent list.
    pub fn close_workspace(&self) -> Result<(), String> {
        let mut inner = self.lock()?;

        if inner.scan.running {
            return Err("a scan is running; cancel it before closing the workspace".to_string());
        }

        inner.workspace = None;
        inner.scan.last_outcome = None;
        Ok(())
    }

    // ---- Scanning

    /// Claims the right to run a scan.
    ///
    /// Setting the flag under the same lock that checks it is what makes
    /// duplicate scans impossible: a second caller sees `running` and is turned
    /// away rather than starting a competing writer.
    pub fn begin_scan(&self) -> Result<ScanSession, String> {
        let mut inner = self.lock()?;

        if inner.scan.running {
            return Err("a scan is already running".to_string());
        }

        let workspace = inner
            .workspace
            .as_ref()
            .ok_or_else(|| "no workspace is open".to_string())?;

        let session = ScanSession {
            root: workspace.root.clone(),
            database_path: workspace.database_path.clone(),
            cancel: inner.scan.cancel.clone(),
        };

        // The token is reused across scans, so clear any earlier cancellation.
        session.cancel.reset();
        inner.scan.last_outcome = None;
        inner.scan.running = true;

        Ok(session)
    }

    /// Records the end of a scan and refreshes the cached case count.
    pub fn finish_scan(&self, outcome: Option<ScanOutcome>) {
        let Ok(mut inner) = self.lock() else {
            return;
        };

        inner.scan.running = false;
        inner.scan.cancel.reset();
        inner.scan.last_outcome = outcome;

        // The scan wrote through its own connection; refresh what the recent
        // list shows for this workspace.
        let refreshed = inner
            .workspace
            .as_ref()
            .map(|workspace| {
                (
                    workspace.metadata.workspace_id.clone(),
                    crate::database::cases::count(&workspace.connection),
                )
            })
            .and_then(|(id, count)| count.ok().map(|count| (id, count)));

        if let Some((workspace_id, count)) = refreshed {
            inner.preferences.set_case_count(&workspace_id, count);
            let preferences = inner.preferences.clone();
            drop(inner);
            self.persist(&preferences);
        }
    }

    /// Asks the running scan to stop at the next folder boundary.
    pub fn cancel_scan(&self) -> Result<(), String> {
        let inner = self.lock()?;

        if !inner.scan.running {
            return Err("no scan is running".to_string());
        }

        inner.scan.cancel.cancel();
        Ok(())
    }

    pub fn scan_status(&self) -> Result<ScanStatus, String> {
        let inner = self.lock()?;

        Ok(ScanStatus {
            running: inner.scan.running,
            last_outcome: inner.scan.last_outcome.clone(),
        })
    }

    pub fn is_scanning(&self) -> bool {
        self.lock().map(|inner| inner.scan.running).unwrap_or(false)
    }

    pub fn has_workspace(&self) -> bool {
        self.lock()
            .map(|inner| inner.workspace.is_some())
            .unwrap_or(false)
    }

    // ---- Preferences

    pub fn theme(&self) -> Result<ThemePreference, String> {
        Ok(self.lock()?.preferences.theme)
    }

    /// Stores the theme choice so it survives a restart.
    pub fn set_theme(&self, theme: ThemePreference) -> Result<(), String> {
        let mut inner = self.lock()?;
        inner.preferences.theme = theme;

        let preferences = inner.preferences.clone();
        drop(inner);
        self.persist(&preferences);

        Ok(())
    }

    /// The open workspace, or `None` when the selection screen should be shown.
    pub fn current_workspace(&self) -> Result<Option<WorkspaceState>, String> {
        let inner = self.lock()?;

        match inner.workspace.as_ref() {
            Some(workspace) => workspace.state().map(Some),
            None => Ok(None),
        }
    }

    pub fn recent_workspaces(&self) -> Result<Vec<RecentWorkspaceView>, String> {
        let inner = self.lock()?;
        Ok(recent_views(&inner.preferences))
    }

    /// The last known path of a remembered workspace.
    pub fn recent_workspace_path(&self, workspace_id: &str) -> Result<PathBuf, String> {
        let inner = self.lock()?;

        inner
            .preferences
            .find(workspace_id)
            .map(|entry| PathBuf::from(&entry.path))
            .ok_or_else(|| format!("`{workspace_id}` is not in the recent workspaces"))
    }

    /// Forgets a workspace. Removes the preferences entry only — the workspace
    /// folder and its database are never touched.
    pub fn remove_recent_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<RecentWorkspaceView>, String> {
        let mut inner = self.lock()?;
        inner.preferences.remove(workspace_id);
        self.persist(&inner.preferences);
        Ok(recent_views(&inner.preferences))
    }

    /// Runs `f` against the open workspace.
    pub fn with_workspace<T>(
        &self,
        f: impl FnOnce(&OpenWorkspace) -> Result<T, String>,
    ) -> Result<T, String> {
        let inner = self.lock()?;
        let workspace = inner
            .workspace
            .as_ref()
            .ok_or_else(|| "no workspace is open".to_string())?;

        f(workspace)
    }

    /// Runs `f` against the open workspace with a mutable connection, then
    /// refreshes the cached case count in the recent list.
    pub fn with_workspace_mut<T>(
        &self,
        f: impl FnOnce(&mut OpenWorkspace) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut inner = self.lock()?;
        let workspace = inner
            .workspace
            .as_mut()
            .ok_or_else(|| "no workspace is open".to_string())?;

        let result = f(workspace)?;

        let workspace_id = workspace.metadata.workspace_id.clone();
        let case_count = crate::database::cases::count(&workspace.connection)?;
        inner.preferences.set_case_count(&workspace_id, case_count);
        self.persist(&inner.preferences);

        Ok(result)
    }
}

fn recent_views(preferences: &Preferences) -> Vec<RecentWorkspaceView> {
    preferences
        .recent_workspaces
        .iter()
        .map(RecentWorkspaceView::from_entry)
        .collect()
}
