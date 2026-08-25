//! End-to-end acceptance test for the milestone 2 workflow.
//!
//! Walks the whole path a user takes: select a folder, scan it, edit a case,
//! rescan, move the workspace, reconnect to it at the new location, and confirm
//! nothing was duplicated or lost. Everything happens in a temporary directory.
//!
//! This exercises the same service layer the Tauri commands call, one level
//! below the UI.

use std::path::Path;

use automation_platform_lib::cases::CaseSyncService;
use automation_platform_lib::database::cases;
use automation_platform_lib::database::models::CaseEdit;
use automation_platform_lib::workspace::metadata::{self, INTERNAL_DIR_NAME};
use automation_platform_lib::workspace::preferences::{preferences_path, Preferences};
use automation_platform_lib::workspace::{OpenWorkspace, RecentWorkspaceView};
use tempfile::TempDir;

fn case_folder(root: &Path, name: &str, files: usize) {
    let folder = root.join(name);
    std::fs::create_dir_all(&folder).unwrap();
    for i in 0..files {
        std::fs::write(folder.join(format!("doc-{i}.pdf")), b"pdf").unwrap();
    }
}

#[test]
fn the_full_workspace_lifecycle() {
    let temp = TempDir::new().unwrap();
    let app_data = temp.path().join("app-data");
    let prefs_path = preferences_path(&app_data);

    // ---- First launch: nothing is remembered, so the picker would be shown.
    let mut preferences = Preferences::load(&prefs_path);
    assert!(preferences.last_workspace().is_none());

    // ---- The user picks a folder full of case folders.
    let original_root = temp.path().join("Kastle Cases");
    std::fs::create_dir_all(&original_root).unwrap();
    case_folder(&original_root, "DC8842.01 Fairfax County", 3);
    case_folder(&original_root, "DC8839.01 Fairfax County", 1);
    case_folder(&original_root, "DC6530.04.05 Fairfax County", 5);
    case_folder(&original_root, "Random Folder", 2); // not a case
    std::fs::write(original_root.join("index.xlsx"), b"loose file").unwrap();

    let mut workspace = OpenWorkspace::open(&original_root).unwrap();
    let workspace_id = workspace.metadata.workspace_id.clone();

    // Steps 6-8: the internal directory, the metadata and the database are
    // created inside the workspace, not in the application data directory.
    assert!(original_root.join(INTERNAL_DIR_NAME).is_dir());
    assert!(metadata::metadata_path(&original_root).is_file());
    assert!(metadata::database_path(&original_root).is_file());
    assert!(!app_data.join("automation.db").exists());

    preferences.record_opened(&workspace_id, &workspace.metadata.workspace_name, &original_root, 0);
    preferences.save(&prefs_path).unwrap();

    // ---- Step 10-11: scan, and the cases land in SQLite.
    let report = CaseSyncService::scan_workspace(&original_root, &mut workspace.connection).unwrap();

    assert_eq!(report.folders_found, 4, "the loose file is not a folder");
    assert_eq!(report.cases_found, 3);
    assert_eq!(report.created, 3);
    assert_eq!(report.skipped, 1, "`Random Folder` is skipped with a warning");
    assert_eq!(report.warnings.len(), 1);
    assert_eq!(cases::count(&workspace.connection).unwrap(), 3);

    let summary = cases::summary(&workspace.connection).unwrap();
    assert_eq!(summary.total, 3);
    assert_eq!(
        summary
            .statuses
            .iter()
            .find(|entry| entry.status == "Initiated")
            .map(|entry| entry.count),
        Some(3)
    );

    // ---- Step 13: the user edits a case.
    let target = cases::find_by_number(&workspace.connection, "DC8842.01")
        .unwrap()
        .unwrap();
    assert_eq!(target.document_count, 3);

    cases::apply_edit(
        &workspace.connection,
        target.id,
        &CaseEdit {
            name: "Fairfax County — expedited".to_string(),
            jurisdiction: Some("Fairfax County, VA".to_string()),
            status: "Need Info".to_string(),
            priority: "High".to_string(),
        },
    )
    .unwrap();

    // ---- Steps 14-15: rescanning does not undo the edit.
    std::fs::write(
        original_root.join("DC8842.01 Fairfax County").join("new.pdf"),
        b"pdf",
    )
    .unwrap();

    let rescan = CaseSyncService::scan_workspace(&original_root, &mut workspace.connection).unwrap();
    assert_eq!(rescan.created, 0, "no case is created twice");
    assert_eq!(rescan.updated, 1, "only the folder that changed");
    assert_eq!(cases::count(&workspace.connection).unwrap(), 3);

    let edited = cases::find_by_id(&workspace.connection, target.id)
        .unwrap()
        .unwrap();
    assert_eq!(edited.status, "Need Info");
    assert_eq!(edited.priority, "High");
    assert_eq!(edited.name, "Fairfax County — expedited");
    assert_eq!(edited.jurisdiction.as_deref(), Some("Fairfax County, VA"));
    assert_eq!(edited.document_count, 4, "filesystem data still updates");

    preferences.set_case_count(&workspace_id, 3);
    preferences.save(&prefs_path).unwrap();
    drop(workspace);

    // ---- Step 16: the user moves the workspace somewhere else.
    let moved_root = temp.path().join("Desktop").join("Kastle Cases");
    std::fs::create_dir_all(moved_root.parent().unwrap()).unwrap();
    std::fs::rename(&original_root, &moved_root).unwrap();

    // ---- Steps 17-18: on relaunch the old path is reported missing.
    let reloaded = Preferences::load(&prefs_path);
    let remembered = reloaded.last_workspace().expect("workspace is remembered");
    assert_eq!(remembered.path, original_root.display().to_string());
    assert_eq!(remembered.case_count, 3);

    let view = RecentWorkspaceView::from_entry(remembered);
    assert!(!view.available, "the workspace is detected as missing");

    // ---- Steps 19-21: the user locates it, and everything is still there.
    let mut preferences = reloaded;
    let reopened = OpenWorkspace::open(&moved_root).unwrap();

    assert_eq!(
        reopened.metadata.workspace_id, workspace_id,
        "the same workspace, not a new one"
    );
    assert_eq!(cases::count(&reopened.connection).unwrap(), 3);

    let after_move = cases::find_by_number(&reopened.connection, "DC8842.01")
        .unwrap()
        .unwrap();
    assert_eq!(after_move.status, "Need Info");
    assert_eq!(after_move.priority, "High");
    assert_eq!(after_move.name, "Fairfax County — expedited");

    // The stored path is relative, so it resolves against the new root.
    assert_eq!(
        reopened.absolute_case_path(after_move.folder_path.as_deref().unwrap()),
        moved_root.join("DC8842.01 Fairfax County")
    );
    assert!(reopened
        .absolute_case_path(after_move.folder_path.as_deref().unwrap())
        .is_dir());

    preferences.record_opened(
        &reopened.metadata.workspace_id,
        &reopened.metadata.workspace_name,
        &moved_root,
        cases::count(&reopened.connection).unwrap(),
    );
    preferences.save(&prefs_path).unwrap();

    // ---- Step 22: no duplicate workspace, no duplicate database.
    let final_preferences = Preferences::load(&prefs_path);
    assert_eq!(
        final_preferences.recent_workspaces.len(),
        1,
        "relocating updated the existing entry"
    );
    assert_eq!(
        final_preferences.recent_workspaces[0].path,
        moved_root.display().to_string()
    );
    assert!(metadata::database_path(&moved_root).is_file());
    assert!(!original_root.exists(), "no database was left behind");

    // A scan at the new location behaves as if nothing happened.
    let mut reopened = reopened;
    let final_scan = CaseSyncService::scan_workspace(&moved_root, &mut reopened.connection).unwrap();
    assert_eq!(final_scan.created, 0);
    assert_eq!(final_scan.missing, 0);
    assert_eq!(final_scan.cases_found, 3);
    assert_eq!(cases::count(&reopened.connection).unwrap(), 3);
}
