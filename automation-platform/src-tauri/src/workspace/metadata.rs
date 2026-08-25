//! `<workspace>/.automation-platform/workspace.json`.
//!
//! The metadata file is what makes a folder a workspace. It carries the
//! workspace id, which stays the same when the folder is renamed or moved —
//! that is how a relocated workspace is recognised as the same one.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::util::now_iso8601;

/// Internal directory created inside every workspace. The only place the
/// application writes to within a workspace.
pub const INTERNAL_DIR_NAME: &str = ".automation-platform";

/// Metadata file inside the internal directory.
pub const METADATA_FILE_NAME: &str = "workspace.json";

/// Contents of `workspace.json`. Field names are snake_case in the file so it
/// stays readable to anyone who opens it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    /// Stable identity of the workspace. Never regenerated.
    pub workspace_id: String,
    pub workspace_name: String,
    pub created_at: String,
    /// Schema version of `automation.db` the last time it was opened.
    pub database_version: i32,
    /// Application version that last opened the workspace.
    pub application_version: String,
}

/// `<root>/.automation-platform`
pub fn internal_dir(root: &Path) -> PathBuf {
    root.join(INTERNAL_DIR_NAME)
}

/// `<root>/.automation-platform/workspace.json`
pub fn metadata_path(root: &Path) -> PathBuf {
    internal_dir(root).join(METADATA_FILE_NAME)
}

/// `<root>/.automation-platform/automation.db`
pub fn database_path(root: &Path) -> PathBuf {
    internal_dir(root).join(crate::database::DATABASE_FILE_NAME)
}

/// True when the folder already carries workspace metadata.
pub fn is_workspace(root: &Path) -> bool {
    metadata_path(root).is_file()
}

/// Name used for a workspace created from a folder, derived from the folder
/// name. Falls back to the full path for a root directory or an odd name.
pub fn default_name(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| root.display().to_string())
}

/// Creates the internal directory if it is not already there.
pub fn ensure_internal_dir(root: &Path) -> Result<PathBuf, String> {
    let dir = internal_dir(root);

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create `{}`: {e}", dir.display()))?;

    Ok(dir)
}

/// Reads and parses `workspace.json`.
pub fn read(root: &Path) -> Result<WorkspaceMetadata, String> {
    let path = metadata_path(root);

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("could not read `{}`: {e}", path.display()))?;

    serde_json::from_str(&contents)
        .map_err(|e| format!("`{}` is not valid workspace metadata: {e}", path.display()))
}

/// Writes `workspace.json`, creating the internal directory if needed.
pub fn write(root: &Path, metadata: &WorkspaceMetadata) -> Result<(), String> {
    ensure_internal_dir(root)?;
    let path = metadata_path(root);

    let contents = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("could not serialise the workspace metadata: {e}"))?;

    std::fs::write(&path, contents)
        .map_err(|e| format!("could not write `{}`: {e}", path.display()))
}

/// Builds metadata for a folder that has never been used as a workspace.
pub fn create(root: &Path, database_version: i32) -> WorkspaceMetadata {
    WorkspaceMetadata {
        workspace_id: uuid::Uuid::new_v4().to_string(),
        workspace_name: default_name(root),
        created_at: now_iso8601(),
        database_version,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}
