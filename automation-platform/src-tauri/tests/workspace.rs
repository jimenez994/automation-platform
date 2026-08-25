//! Integration tests for workspace creation, loading, relocation and the
//! application-level preferences.
//!
//! Everything runs inside temporary directories; no test ever touches a real
//! workspace.

use std::path::Path;

use automation_platform_lib::database::cases;
use automation_platform_lib::database::models::ScannedCase;
use automation_platform_lib::workspace::metadata::{self, INTERNAL_DIR_NAME};
use automation_platform_lib::workspace::preferences::{preferences_path, Preferences};
use automation_platform_lib::workspace::{expected_database_version, OpenWorkspace, RecentWorkspaceView};
use tempfile::TempDir;

fn scanned(case_number: &str) -> ScannedCase {
    ScannedCase {
        case_number: case_number.to_string(),
        name: "Fairfax County".to_string(),
        folder_path: format!("{case_number} Fairfax County"),
        document_count: 2,
    }
}

fn workspace_root(temp: &TempDir, name: &str) -> std::path::PathBuf {
    let root = temp.path().join(name);
    std::fs::create_dir_all(&root).expect("workspace folder");
    root
}

#[test]
fn opening_a_new_folder_creates_the_workspace_files() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Kastle Cases");

    let workspace = OpenWorkspace::open(&root).expect("workspace opens");

    assert!(root.join(INTERNAL_DIR_NAME).is_dir());
    assert!(metadata::metadata_path(&root).is_file());
    assert!(metadata::database_path(&root).is_file());

    // The database belongs to the workspace, not the application data directory.
    assert!(workspace.database_path.starts_with(&root));
    assert_eq!(workspace.database_version, expected_database_version());

    let stored = metadata::read(&root).expect("metadata parses");
    assert_eq!(stored.workspace_name, "Kastle Cases");
    assert!(!stored.workspace_id.is_empty());
    assert_eq!(stored.database_version, expected_database_version());
    assert_eq!(stored.application_version, env!("CARGO_PKG_VERSION"));
    assert!(stored.created_at.ends_with('Z'));
}

#[test]
fn a_new_workspace_starts_empty_with_no_seeded_test_case() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Fresh");

    let workspace = OpenWorkspace::open(&root).unwrap();

    assert_eq!(cases::count(&workspace.connection).unwrap(), 0);
    let state = workspace.state().unwrap();
    assert_eq!(state.case_count, 0);
    assert!(!state.has_been_scanned);
    assert!(state.last_scan_at.is_none());
}

#[test]
fn reopening_a_workspace_reuses_its_identity_and_data() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Kastle Cases");

    let first = OpenWorkspace::open(&root).unwrap();
    let original_id = first.metadata.workspace_id.clone();
    cases::upsert_scanned(&first.connection, &scanned("DC8842.01"), "t1").unwrap();
    drop(first);

    let second = OpenWorkspace::open(&root).unwrap();

    assert_eq!(second.metadata.workspace_id, original_id);
    assert_eq!(cases::count(&second.connection).unwrap(), 1);
}

#[test]
fn the_workspace_id_survives_renaming_and_moving_the_folder() {
    let temp = TempDir::new().unwrap();
    let original = workspace_root(&temp, "Documents Cases");

    let first = OpenWorkspace::open(&original).unwrap();
    let original_id = first.metadata.workspace_id.clone();
    cases::upsert_scanned(&first.connection, &scanned("DC8842.01"), "t1").unwrap();
    drop(first);

    // Simulate the user moving the workspace somewhere else and renaming it.
    let moved = temp.path().join("Desktop Cases");
    std::fs::rename(&original, &moved).expect("workspace moves");

    let reopened = OpenWorkspace::open(&moved).unwrap();

    assert_eq!(reopened.metadata.workspace_id, original_id);
    // The name recorded at creation is metadata, not derived from the folder.
    assert_eq!(reopened.metadata.workspace_name, "Documents Cases");
    assert_eq!(cases::count(&reopened.connection).unwrap(), 1);
    assert!(!original.exists());
}

#[test]
fn a_case_folder_path_resolves_against_the_current_root() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Cases");
    let workspace = OpenWorkspace::open(&root).unwrap();

    assert_eq!(
        workspace.absolute_case_path("DC8842.01 Fairfax County"),
        root.join("DC8842.01 Fairfax County")
    );
}

#[test]
fn opening_a_path_that_is_not_a_folder_fails_cleanly() {
    let temp = TempDir::new().unwrap();

    let missing = temp.path().join("nowhere");
    let error = OpenWorkspace::open(&missing).unwrap_err();
    assert!(error.contains("does not exist"), "unexpected error: {error}");

    let file = temp.path().join("a-file.txt");
    std::fs::write(&file, "not a workspace").unwrap();
    let error = OpenWorkspace::open(&file).unwrap_err();
    assert!(error.contains("not a folder"), "unexpected error: {error}");
}

#[test]
fn a_folder_is_only_a_workspace_once_it_has_metadata() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Cases");

    assert!(!metadata::is_workspace(&root));
    OpenWorkspace::open(&root).unwrap();
    assert!(metadata::is_workspace(&root));
}

#[test]
fn a_moved_workspace_is_reported_as_unavailable_at_its_old_path() {
    let temp = TempDir::new().unwrap();
    let original = workspace_root(&temp, "Cases");
    let workspace = OpenWorkspace::open(&original).unwrap();

    let mut preferences = Preferences::default();
    preferences.record_opened(
        &workspace.metadata.workspace_id,
        &workspace.metadata.workspace_name,
        &original,
        0,
    );
    drop(workspace);

    let entry = preferences.last_workspace().unwrap().clone();
    assert!(RecentWorkspaceView::from_entry(&entry).available);

    let moved = temp.path().join("Moved Cases");
    std::fs::rename(&original, &moved).unwrap();

    let view = RecentWorkspaceView::from_entry(&entry);
    assert!(!view.available);
    // The entry is kept so the user can relocate it, not silently dropped.
    assert_eq!(view.path, original.display().to_string());
}

#[test]
fn a_folder_without_metadata_is_not_treated_as_the_remembered_workspace() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Cases");
    let workspace = OpenWorkspace::open(&root).unwrap();

    let mut preferences = Preferences::default();
    preferences.record_opened(
        &workspace.metadata.workspace_id,
        &workspace.metadata.workspace_name,
        &root,
        0,
    );
    drop(workspace);

    // The folder still exists, but the internal directory was removed.
    std::fs::remove_dir_all(root.join(INTERNAL_DIR_NAME)).unwrap();

    let entry = preferences.last_workspace().unwrap().clone();
    assert!(!RecentWorkspaceView::from_entry(&entry).available);
}

#[test]
fn relocating_updates_the_existing_entry_instead_of_adding_one() {
    let temp = TempDir::new().unwrap();
    let original = workspace_root(&temp, "Cases");

    let first = OpenWorkspace::open(&original).unwrap();
    let workspace_id = first.metadata.workspace_id.clone();

    let mut preferences = Preferences::default();
    preferences.record_opened(&workspace_id, &first.metadata.workspace_name, &original, 0);
    drop(first);

    let moved = temp.path().join("Moved Cases");
    std::fs::rename(&original, &moved).unwrap();

    let reopened = OpenWorkspace::open(&moved).unwrap();
    preferences.record_opened(
        &reopened.metadata.workspace_id,
        &reopened.metadata.workspace_name,
        &moved,
        0,
    );

    assert_eq!(reopened.metadata.workspace_id, workspace_id);
    assert_eq!(preferences.recent_workspaces.len(), 1, "no duplicate entry");
    assert_eq!(
        preferences.recent_workspaces[0].path,
        moved.display().to_string(),
        "the remembered path follows the workspace"
    );

    // Exactly one database exists, at the new location.
    assert!(metadata::database_path(&moved).is_file());
    assert!(!original.exists());
}

#[test]
fn selecting_a_second_new_workspace_keeps_both() {
    let temp = TempDir::new().unwrap();
    let first_root = workspace_root(&temp, "Kastle Cases");
    let second_root = workspace_root(&temp, "Florida Projects");

    let first = OpenWorkspace::open(&first_root).unwrap();
    let second = OpenWorkspace::open(&second_root).unwrap();

    assert_ne!(first.metadata.workspace_id, second.metadata.workspace_id);

    let mut preferences = Preferences::default();
    preferences.record_opened(&first.metadata.workspace_id, "Kastle Cases", &first_root, 148);
    preferences.record_opened(
        &second.metadata.workspace_id,
        "Florida Projects",
        &second_root,
        32,
    );

    assert_eq!(preferences.recent_workspaces.len(), 2);
    // Most recently opened first.
    assert_eq!(preferences.recent_workspaces[0].workspace_name, "Florida Projects");
    assert_eq!(
        preferences.last_workspace_id.as_deref(),
        Some(second.metadata.workspace_id.as_str())
    );
}

#[test]
fn preferences_persist_across_restarts() {
    let temp = TempDir::new().unwrap();
    let app_data = temp.path().join("app-data");
    let path = preferences_path(&app_data);

    let mut preferences = Preferences::default();
    preferences.record_opened("workspace-1", "Kastle Cases", Path::new("/tmp/cases"), 148);
    preferences.save(&path).expect("preferences save");

    let reloaded = Preferences::load(&path);

    assert_eq!(reloaded.recent_workspaces.len(), 1);
    assert_eq!(reloaded.last_workspace_id.as_deref(), Some("workspace-1"));

    let entry = reloaded.last_workspace().unwrap();
    assert_eq!(entry.workspace_name, "Kastle Cases");
    assert_eq!(entry.path, "/tmp/cases");
    assert_eq!(entry.case_count, 148);
    assert!(entry.last_opened_at.ends_with('Z'));
}

#[test]
fn missing_or_corrupt_preferences_fall_back_to_defaults() {
    let temp = TempDir::new().unwrap();
    let path = preferences_path(temp.path());

    // Missing file: first launch.
    assert!(Preferences::load(&path).recent_workspaces.is_empty());

    // Corrupt file must not stop the application from starting.
    std::fs::write(&path, "{ this is not json").unwrap();
    let loaded = Preferences::load(&path);
    assert!(loaded.recent_workspaces.is_empty());
    assert!(loaded.last_workspace_id.is_none());
}

#[test]
fn removing_a_recent_workspace_forgets_only_the_entry() {
    let temp = TempDir::new().unwrap();
    let root = workspace_root(&temp, "Cases");
    let workspace = OpenWorkspace::open(&root).unwrap();
    let workspace_id = workspace.metadata.workspace_id.clone();
    drop(workspace);

    let mut preferences = Preferences::default();
    preferences.record_opened(&workspace_id, "Cases", &root, 0);
    preferences.remove(&workspace_id);

    assert!(preferences.recent_workspaces.is_empty());
    assert!(preferences.last_workspace_id.is_none());
    // The workspace itself is untouched.
    assert!(metadata::database_path(&root).is_file());
    assert!(metadata::metadata_path(&root).is_file());
}
