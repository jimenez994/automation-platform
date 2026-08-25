//! Commands for reading, editing and scanning the cases in the open workspace.

use tauri::State;

use crate::cases::{CaseSyncService, ScanReport};
use crate::database::cases;
use crate::database::models::{Case, CaseEdit, CaseSummary, CaseView};
use crate::filesystem::reveal_in_file_manager;
use crate::state::AppState;
use crate::workspace::OpenWorkspace;

/// Attaches the absolute folder path, which is derived from the workspace root
/// rather than stored, so a moved workspace resolves correctly.
fn to_view(workspace: &OpenWorkspace, case: Case) -> CaseView {
    let absolute_path = case
        .folder_path
        .as_deref()
        .map(|relative| workspace.absolute_case_path(relative).display().to_string());

    CaseView {
        case,
        absolute_path,
    }
}

/// Lists cases, optionally filtered by a search term matched against the case
/// number and the name.
#[tauri::command]
pub fn list_cases(
    state: State<'_, AppState>,
    search: Option<String>,
) -> Result<Vec<CaseView>, String> {
    state.with_workspace(|workspace| {
        let rows = cases::list(&workspace.connection, search.as_deref())?;
        Ok(rows
            .into_iter()
            .map(|case| to_view(workspace, case))
            .collect())
    })
}

#[tauri::command]
pub fn get_case(state: State<'_, AppState>, id: i64) -> Result<Option<CaseView>, String> {
    state.with_workspace(|workspace| {
        Ok(cases::find_by_id(&workspace.connection, id)?.map(|case| to_view(workspace, case)))
    })
}

/// Case counts per status, for the dashboard summary.
#[tauri::command]
pub fn case_summary(state: State<'_, AppState>) -> Result<CaseSummary, String> {
    state.with_workspace(|workspace| cases::summary(&workspace.connection))
}

/// Saves the user-managed fields. These are exactly the fields the scanner
/// never overwrites.
#[tauri::command]
pub fn update_case(
    state: State<'_, AppState>,
    id: i64,
    edit: CaseEdit,
) -> Result<CaseView, String> {
    state.with_workspace(|workspace| {
        let case = cases::apply_edit(&workspace.connection, id, &edit)?;
        Ok(to_view(workspace, case))
    })
}

/// Rescans a single case folder.
///
/// A whole-workspace scan goes through `commands::scan::start_scan` instead:
/// it runs on its own thread and reports progress. A single folder finishes in
/// milliseconds, so it stays a plain call.
#[tauri::command]
pub fn scan_case(state: State<'_, AppState>, id: i64) -> Result<ScanReport, String> {
    state.with_workspace_mut(|workspace| {
        let root = workspace.root.clone();
        CaseSyncService::scan_case(&root, &workspace.connection, id)
    })
}

/// Opens a case folder in the operating system's file manager.
#[tauri::command]
pub fn open_case_folder(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.with_workspace(|workspace| {
        let case = cases::find_by_id(&workspace.connection, id)?
            .ok_or_else(|| format!("case {id} no longer exists"))?;

        let relative = case
            .folder_path
            .ok_or_else(|| format!("`{}` has no folder recorded yet", case.case_number))?;

        reveal_in_file_manager(&workspace.absolute_case_path(&relative))
    })
}

/// Lists the files inside a case folder, relative paths and sizes.
#[tauri::command]
pub fn list_case_files(state: State<'_, AppState>, id: i64) -> Result<Vec<crate::filesystem::CaseFile>, String> {
    state.with_workspace(|workspace| {
        let case = cases::find_by_id(&workspace.connection, id)?
            .ok_or_else(|| format!("case {id} no longer exists"))?;

        let relative = case
            .folder_path
            .ok_or_else(|| format!("`{}` has no folder recorded yet", case.case_number))?;

        Ok(crate::filesystem::list_files(
            &workspace.absolute_case_path(&relative),
        ))
    })
}
