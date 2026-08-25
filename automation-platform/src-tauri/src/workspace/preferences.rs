//! Application-level preferences, stored in the OS application data directory.
//!
//! This is the only state the application keeps outside a workspace, and it
//! holds no case data — just which workspaces exist and which was open last.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::util::now_iso8601;

/// File name inside the application data directory.
pub const PREFERENCES_FILE_NAME: &str = "preferences.json";

/// How many workspaces are remembered. Older entries fall off the end.
const MAX_RECENT: usize = 10;

/// Which theme the user chose. `System` follows the operating system.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

/// One entry of the recent-workspaces list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentWorkspace {
    pub workspace_id: String,
    pub workspace_name: String,
    /// Last known location. Updated whenever the workspace is opened somewhere
    /// else, which is what makes relocation work.
    pub path: String,
    pub last_opened_at: String,
    /// Case count as of the last time the workspace was open, so the startup
    /// screen can show it without opening every database.
    #[serde(default)]
    pub case_count: i64,
}

/// Contents of `preferences.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub version: u32,
    /// Workspace to reopen on the next launch.
    pub last_workspace_id: Option<String>,
    pub recent_workspaces: Vec<RecentWorkspace>,
    /// Defaulted so a preferences file written before themes existed still
    /// loads instead of being discarded as corrupt.
    #[serde(default)]
    pub theme: ThemePreference,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            version: 1,
            last_workspace_id: None,
            recent_workspaces: Vec::new(),
            theme: ThemePreference::System,
        }
    }
}

impl Preferences {
    /// Reads the preferences file.
    ///
    /// A missing file is normal on first launch. A corrupt file is reported and
    /// replaced by defaults rather than blocking startup — losing the recent
    /// list is recoverable, being unable to open the application is not.
    pub fn load(path: &Path) -> Self {
        let contents = match std::fs::read_to_string(path) {
            Ok(contents) => contents,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Self::default(),
            Err(e) => {
                eprintln!(
                    "[automation-platform] could not read `{}`: {e}; starting with defaults",
                    path.display()
                );
                return Self::default();
            }
        };

        match serde_json::from_str(&contents) {
            Ok(preferences) => preferences,
            Err(e) => {
                eprintln!(
                    "[automation-platform] `{}` is not valid preferences JSON: {e}; starting with defaults",
                    path.display()
                );
                Self::default()
            }
        }
    }

    /// Writes the preferences file, creating the directory if needed.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("could not create `{}`: {e}", parent.display()))?;
        }

        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| format!("could not serialise the preferences: {e}"))?;

        std::fs::write(path, contents)
            .map_err(|e| format!("could not write `{}`: {e}", path.display()))
    }

    pub fn find(&self, workspace_id: &str) -> Option<&RecentWorkspace> {
        self.recent_workspaces
            .iter()
            .find(|entry| entry.workspace_id == workspace_id)
    }

    /// The workspace to reopen on launch, if there is one.
    pub fn last_workspace(&self) -> Option<&RecentWorkspace> {
        self.last_workspace_id
            .as_deref()
            .and_then(|id| self.find(id))
    }

    /// Records a workspace as opened: moves it to the front of the list and
    /// updates its path, which is how a relocated workspace stops pointing at
    /// the folder it used to live in.
    ///
    /// Matching is by workspace id, never by path, so relocating never creates
    /// a duplicate entry.
    pub fn record_opened(
        &mut self,
        workspace_id: &str,
        workspace_name: &str,
        path: &Path,
        case_count: i64,
    ) {
        self.recent_workspaces
            .retain(|entry| entry.workspace_id != workspace_id);

        self.recent_workspaces.insert(
            0,
            RecentWorkspace {
                workspace_id: workspace_id.to_string(),
                workspace_name: workspace_name.to_string(),
                path: path.display().to_string(),
                last_opened_at: now_iso8601(),
                case_count,
            },
        );

        self.recent_workspaces.truncate(MAX_RECENT);
        self.last_workspace_id = Some(workspace_id.to_string());
    }

    /// Updates the cached case count for a workspace, if it is known.
    pub fn set_case_count(&mut self, workspace_id: &str, case_count: i64) {
        if let Some(entry) = self
            .recent_workspaces
            .iter_mut()
            .find(|entry| entry.workspace_id == workspace_id)
        {
            entry.case_count = case_count;
        }
    }

    /// Forgets a workspace. Only ever removes the entry — the workspace folder
    /// and its database are left untouched.
    pub fn remove(&mut self, workspace_id: &str) {
        self.recent_workspaces
            .retain(|entry| entry.workspace_id != workspace_id);

        if self.last_workspace_id.as_deref() == Some(workspace_id) {
            self.last_workspace_id = None;
        }
    }
}

/// `<application data directory>/preferences.json`
pub fn preferences_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(PREFERENCES_FILE_NAME)
}
