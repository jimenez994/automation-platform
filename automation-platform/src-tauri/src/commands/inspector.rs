//! Commands backing the Developer Inspector's note persistence.
//!
//! Notes are development-time annotations stored in the workspace database's
//! `inspector_notes` table. They are scoped to the open workspace — nothing is
//! written when no workspace is open.

use tauri::State;

use crate::database::notes::{self, InspectorNote};
use crate::state::AppState;

/// Returns every saved inspector note for the open workspace.
#[tauri::command]
pub fn list_inspector_notes(state: State<'_, AppState>) -> Result<Vec<InspectorNote>, String> {
    state.with_workspace(|workspace| notes::list(&workspace.connection))
}

/// Creates a note and returns its new id (`#N`).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn create_inspector_note(
    state: State<'_, AppState>,
    note: String,
    identity: Option<String>,
    status: String,
    origin: String,
    type_: Option<String>,
    priority: String,
    title: Option<String>,
) -> Result<i64, String> {
    state.with_workspace(|workspace| {
        notes::create(
            &workspace.connection,
            &note,
            identity.as_deref(),
            &status,
            &origin,
            type_.as_deref(),
            &priority,
            title.as_deref(),
        )
    })
}

/// Updates a note's editable fields.
#[tauri::command]
pub fn update_inspector_note(
    state: State<'_, AppState>,
    id: i64,
    note: String,
    type_: Option<String>,
    priority: String,
    title: Option<String>,
) -> Result<(), String> {
    state.with_workspace(|workspace| {
        notes::update(
            &workspace.connection,
            id,
            &note,
            type_.as_deref(),
            &priority,
            title.as_deref(),
        )
    })
}

/// Updates only the work-manager stage of a note.
#[tauri::command]
pub fn set_inspector_note_status(
    state: State<'_, AppState>,
    id: i64,
    status: String,
) -> Result<(), String> {
    state.with_workspace(|workspace| notes::set_status(&workspace.connection, id, &status))
}

/// Deletes a single note.
#[tauri::command]
pub fn remove_inspector_note(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.with_workspace(|workspace| notes::remove(&workspace.connection, id))
}

/// Deletes every inspector note for the open workspace.
#[tauri::command]
pub fn clear_inspector_notes(state: State<'_, AppState>) -> Result<(), String> {
    state.with_workspace(|workspace| notes::clear(&workspace.connection))
}
