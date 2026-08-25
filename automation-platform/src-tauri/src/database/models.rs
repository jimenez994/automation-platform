//! Data structures mirroring the rows stored in a workspace database.

use serde::{Deserialize, Serialize};

/// Statuses the application understands. User-managed; the scanner never writes
/// this field.
pub const STATUSES: [&str; 7] = [
    "Initiated",
    "Submitted",
    "Need Info",
    "Ready",
    "Schedule",
    "Fail Inspection",
    "Completed",
];

/// Priorities the application understands. User-managed.
pub const PRIORITIES: [&str; 4] = ["Low", "Normal", "High", "Urgent"];

/// Status given to a case the scanner has just discovered.
pub const DEFAULT_STATUS: &str = "Initiated";

/// Priority given to a case the scanner has just discovered.
pub const DEFAULT_PRIORITY: &str = "Normal";

/// A row of the `cases` table.
///
/// `folder_path` is relative to the workspace root, which keeps the database
/// valid when the workspace folder is moved.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub id: i64,
    pub case_number: String,
    pub name: String,
    pub jurisdiction: Option<String>,
    pub status: String,
    pub priority: String,
    pub folder_path: Option<String>,
    pub document_count: i64,
    pub last_scanned_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// True once the user has edited the name by hand.
    pub name_is_custom: bool,
}

/// A case plus the fields derived from the currently open workspace.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseView {
    #[serde(flatten)]
    pub case: Case,
    /// `folder_path` resolved against the workspace root.
    pub absolute_path: Option<String>,
}

/// Filesystem-derived fields for a case the scanner has found on disk.
#[derive(Debug, Clone, PartialEq)]
pub struct ScannedCase {
    pub case_number: String,
    /// Name derived from the folder, used only when the user has not set one.
    pub name: String,
    /// Folder name relative to the workspace root.
    pub folder_path: String,
    pub document_count: i64,
}

/// The fields the user may edit. Everything here is protected from the scanner.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseEdit {
    pub name: String,
    pub jurisdiction: Option<String>,
    pub status: String,
    pub priority: String,
}

/// Number of cases in a single status.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
}

/// Number of cases in total and per status, for the dashboard summary.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseSummary {
    pub total: i64,
    pub statuses: Vec<StatusCount>,
}
