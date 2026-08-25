//! Application-level commands: theme and menu state.

use tauri::{AppHandle, State};

use crate::menu;
use crate::state::AppState;
use crate::workspace::preferences::ThemePreference;

/// The stored theme choice. `System` follows the operating system.
#[tauri::command]
pub fn get_theme(state: State<'_, AppState>) -> Result<ThemePreference, String> {
    state.theme()
}

/// Stores the theme choice and moves the checkmark in the View → Theme menu.
#[tauri::command]
pub fn set_theme(
    app: AppHandle,
    state: State<'_, AppState>,
    theme: ThemePreference,
) -> Result<(), String> {
    state.set_theme(theme)?;

    if let Err(error) = menu::refresh(&app) {
        eprintln!("[automation-platform] could not refresh the menu: {error}");
    }

    Ok(())
}

/// Rebuilds the menu from the current application state.
///
/// The frontend calls this after anything that changes what should be
/// selectable — opening or closing a workspace, or forgetting a recent one.
#[tauri::command]
pub fn refresh_menu(app: AppHandle) -> Result<(), String> {
    menu::refresh(&app).map_err(|e| format!("could not refresh the menu: {e}"))
}
