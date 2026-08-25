//! Automation Platform — native layer.
//!
//! Layering: Tauri commands (`commands`) call into the services (`workspace`,
//! `cases`, `filesystem`), which own the `database`. Nothing above the
//! `database` module talks to SQLite directly.

pub mod cases;
pub mod commands;
pub mod database;
pub mod filesystem;
pub mod menu;
pub mod state;
pub mod util;
pub mod workspace;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Used by the frontend for the native folder picker; the workspace
        // itself is opened by our own command with the chosen path.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Only the application-level preferences live here. Case data lives
            // in the workspace the user selects.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("could not resolve the application data directory: {e}"))?;

            app.manage(AppState::load(&app_data_dir));

            // Built after the state is managed, so the enabled items and the
            // theme checkmark reflect the stored preferences from the start.
            let handle = app.handle();
            menu::install(handle, &menu::context_from_state(handle))?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_event(app, event.id().0.as_str());
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_theme,
            commands::app::set_theme,
            commands::app::refresh_menu,
            commands::workspace::workspace_startup,
            commands::workspace::open_workspace,
            commands::workspace::open_recent_workspace,
            commands::workspace::current_workspace,
            commands::workspace::close_workspace,
            commands::workspace::list_recent_workspaces,
            commands::workspace::remove_recent_workspace,
            commands::workspace::open_workspace_folder,
            commands::cases::list_cases,
            commands::cases::get_case,
            commands::cases::case_summary,
            commands::cases::update_case,
            commands::cases::scan_case,
            commands::cases::open_case_folder,
            commands::cases::list_case_files,
            commands::scan::start_scan,
            commands::scan::cancel_scan,
            commands::scan::scan_status,
            commands::inspector::list_inspector_notes,
            commands::inspector::create_inspector_note,
            commands::inspector::update_inspector_note,
            commands::inspector::set_inspector_note_status,
            commands::inspector::remove_inspector_note,
            commands::inspector::clear_inspector_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Automation Platform application");
}
