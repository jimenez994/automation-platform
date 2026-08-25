//! Workspace management: selecting, creating, opening and relocating the folder
//! that holds the user's case folders.
//!
//! A workspace is any folder the user picks. Opening one creates
//! `<workspace>/.automation-platform/` containing `workspace.json` and
//! `automation.db` — the only writes the application makes inside a workspace.

pub mod metadata;
pub mod preferences;

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;

use crate::database::{self, cases, meta, migrations};
use metadata::WorkspaceMetadata;

/// A workspace that is open, with its database connection.
#[derive(Debug)]
pub struct OpenWorkspace {
    pub root: PathBuf,
    pub metadata: WorkspaceMetadata,
    pub database_path: PathBuf,
    pub database_version: i32,
    pub connection: Connection,
}

/// Everything the frontend needs to describe the open workspace.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub workspace_id: String,
    pub workspace_name: String,
    pub path: String,
    pub database_path: String,
    pub database_connected: bool,
    pub database_version: i32,
    pub created_at: String,
    pub case_count: i64,
    /// Null until the workspace has been scanned at least once.
    pub last_scan_at: Option<String>,
    pub has_been_scanned: bool,
}

/// A remembered workspace, plus whether its folder is still where we left it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaceView {
    pub workspace_id: String,
    pub workspace_name: String,
    pub path: String,
    pub last_opened_at: String,
    pub case_count: i64,
    /// False when the folder is gone or no longer carries workspace metadata.
    pub available: bool,
}

impl RecentWorkspaceView {
    pub fn from_entry(entry: &preferences::RecentWorkspace) -> Self {
        let path = PathBuf::from(&entry.path);

        Self {
            workspace_id: entry.workspace_id.clone(),
            workspace_name: entry.workspace_name.clone(),
            path: entry.path.clone(),
            last_opened_at: entry.last_opened_at.clone(),
            case_count: entry.case_count,
            available: path.is_dir() && metadata::is_workspace(&path),
        }
    }
}

impl OpenWorkspace {
    /// Opens a folder as a workspace, creating the internal directory,
    /// metadata and database the first time.
    ///
    /// An existing workspace is reconnected to, never recreated: the stored
    /// `workspace_id` and the existing database are reused, which is what makes
    /// relocating a workspace safe.
    pub fn open(root: &Path) -> Result<Self, String> {
        if !root.exists() {
            return Err(format!("`{}` does not exist", root.display()));
        }

        if !root.is_dir() {
            return Err(format!("`{}` is not a folder", root.display()));
        }

        metadata::ensure_internal_dir(root)?;

        let database_path = metadata::database_path(root);
        let (connection, database_version) = database::open_and_migrate(&database_path)?;

        // Read the existing identity when there is one; only mint a new id for a
        // folder that has never been a workspace.
        let mut workspace_metadata = if metadata::is_workspace(root) {
            metadata::read(root)?
        } else {
            metadata::create(root, database_version)
        };

        // Keep the recorded versions current, but never touch `workspace_id` or
        // `created_at`.
        if workspace_metadata.database_version != database_version
            || workspace_metadata.application_version != env!("CARGO_PKG_VERSION")
        {
            workspace_metadata.database_version = database_version;
            workspace_metadata.application_version = env!("CARGO_PKG_VERSION").to_string();
        }

        metadata::write(root, &workspace_metadata)?;

        Ok(Self {
            root: root.to_path_buf(),
            metadata: workspace_metadata,
            database_path,
            database_version,
            connection,
        })
    }

    /// Resolves a case's stored (relative) folder path against the workspace
    /// root.
    pub fn absolute_case_path(&self, relative: &str) -> PathBuf {
        self.root.join(relative)
    }

    /// Builds the snapshot the frontend renders.
    pub fn state(&self) -> Result<WorkspaceState, String> {
        let case_count = cases::count(&self.connection)?;
        let last_scan_at = meta::get(&self.connection, meta::LAST_SCAN_AT)?;

        Ok(WorkspaceState {
            workspace_id: self.metadata.workspace_id.clone(),
            workspace_name: self.metadata.workspace_name.clone(),
            path: self.root.display().to_string(),
            database_path: self.database_path.display().to_string(),
            database_connected: true,
            database_version: self.database_version,
            created_at: self.metadata.created_at.clone(),
            case_count,
            has_been_scanned: last_scan_at.is_some(),
            last_scan_at,
        })
    }
}

/// Schema version this build migrates workspaces to.
pub fn expected_database_version() -> i32 {
    migrations::LATEST_VERSION
}
