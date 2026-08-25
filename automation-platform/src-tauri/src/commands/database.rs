//! Commands the frontend calls to read the database status and its contents.

use tauri::State;

use crate::db::{cases, models::Case, DatabaseStatus};
use crate::state::AppState;

/// Reports whether the database opened successfully at startup.
#[tauri::command]
pub fn database_status(state: State<'_, AppState>) -> DatabaseStatus {
    state.status()
}

/// Returns the most recent cases, newest first.
#[tauri::command]
pub fn list_cases(state: State<'_, AppState>, limit: Option<i64>) -> Result<Vec<Case>, String> {
    let limit = limit.unwrap_or(50).clamp(1, 500);
    state.with_connection(|conn| cases::list(conn, limit))
}

/// Returns a single case by its case number, or `null` when there is no match.
#[tauri::command]
pub fn get_case(state: State<'_, AppState>, case_number: String) -> Result<Option<Case>, String> {
    state.with_connection(|conn| cases::find_by_number(conn, &case_number))
}
