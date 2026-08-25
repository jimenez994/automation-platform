//! Commands for selecting, opening and relocating workspaces.

use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::filesystem::reveal_in_file_manager;
use crate::menu;
use crate::state::{AppState, StartupState};
use crate::workspace::{RecentWorkspaceView, WorkspaceState};

/// Rebuilds the menu so its enabled items match the new state.
fn sync_menu(app: &AppHandle) {
    if let Err(error) = menu::refresh(app) {
        eprintln!("[automation-platform] could not refresh the menu: {error}");
    }
}

/// What to show when the application starts: the welcome or selection screen,
/// the loaded workspace, or the recovery screen for a workspace that has moved.
#[tauri::command]
pub fn workspace_startup(app: AppHandle, state: State<'_, AppState>) -> Result<StartupState, String> {
    let startup = state.startup()?;
    sync_menu(&app);
    Ok(startup)
}

/// Opens a folder as a workspace, creating `.automation-platform/` the first
/// time and reconnecting to the existing database every time after that.
///
/// The same command handles a brand new folder, a previously used one, and one
/// that has been moved — the workspace id stored in the folder decides which.
#[tauri::command]
pub fn open_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<WorkspaceState, String> {
    let workspace = state.open_workspace(&PathBuf::from(path))?;
    sync_menu(&app);
    Ok(workspace)
}

/// Opens a remembered workspace by its id, using the path last recorded for it.
#[tauri::command]
pub fn open_recent_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceState, String> {
    let path = state.recent_workspace_path(&workspace_id)?;
    let workspace = state.open_workspace(&path)?;
    sync_menu(&app);
    Ok(workspace)
}

/// The open workspace, or `null` when the selection screen should be shown.
#[tauri::command]
pub fn current_workspace(state: State<'_, AppState>) -> Result<Option<WorkspaceState>, String> {
    state.current_workspace()
}

/// Returns to the workspace selection screen.
#[tauri::command]
pub fn close_workspace(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.close_workspace()?;
    sync_menu(&app);
    Ok(())
}

#[tauri::command]
pub fn list_recent_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<RecentWorkspaceView>, String> {
    state.recent_workspaces()
}

/// Forgets a workspace. Removes the entry from the recent list only; the
/// workspace folder and its database are left untouched.
#[tauri::command]
pub fn remove_recent_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<RecentWorkspaceView>, String> {
    let recent = state.remove_recent_workspace(&workspace_id)?;
    sync_menu(&app);
    Ok(recent)
}

/// Opens the workspace folder in the operating system's file manager.
#[tauri::command]
pub fn open_workspace_folder(state: State<'_, AppState>) -> Result<(), String> {
    state.with_workspace(|workspace| reveal_in_file_manager(&workspace.root))
}
