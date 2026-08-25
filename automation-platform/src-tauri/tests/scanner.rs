//! Integration tests for `CaseSyncService`.
//!
//! Each test builds a throwaway workspace in a temporary directory, so nothing
//! ever runs against the user's real case folders.

use std::path::Path;

use automation_platform_lib::cases::CaseSyncService;
use automation_platform_lib::database::cases;
use automation_platform_lib::database::models::CaseEdit;
use automation_platform_lib::filesystem::{count_documents, list_case_directories};
use automation_platform_lib::workspace::OpenWorkspace;
use tempfile::TempDir;

/// Creates a case folder containing `files` documents.
fn case_folder(root: &Path, name: &str, files: usize) {
    let folder = root.join(name);
    std::fs::create_dir_all(&folder).expect("case folder");

    for i in 0..files {
        std::fs::write(folder.join(format!("document-{i}.pdf")), b"pdf").expect("document");
    }
}

fn workspace(temp: &TempDir) -> OpenWorkspace {
    let root = temp.path().join("Cases");
    std::fs::create_dir_all(&root).expect("workspace folder");
    OpenWorkspace::open(&root).expect("workspace opens")
}

#[test]
fn finds_child_directories_and_ignores_files_in_the_root() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC8842.01 Fairfax County", 3);
    case_folder(&root, "DC8839.01 Fairfax County", 1);
    // Files sitting directly in the workspace root are not cases.
    std::fs::write(root.join("notes.txt"), b"loose file").unwrap();
    std::fs::write(root.join("index.xlsx"), b"loose file").unwrap();

    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    assert_eq!(report.folders_found, 2, "root-level files are not folders");
    assert_eq!(report.cases_found, 2);
    assert_eq!(report.created, 2);
    assert_eq!(report.skipped, 0);
    assert!(report.warnings.is_empty(), "warnings: {:?}", report.warnings);
    assert_eq!(cases::count(&ws.connection).unwrap(), 2);
}

#[test]
fn the_internal_directory_is_never_treated_as_a_case() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);

    let (folders, _) = list_case_directories(&root).unwrap();
    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0].folder_name, "DC1.01 Alpha");

    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();
    assert_eq!(report.cases_found, 1);
}

#[test]
fn parses_case_folders_and_stores_a_relative_path() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC8842.01 Fairfax County", 4);
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    let case = cases::find_by_number(&ws.connection, "DC8842.01")
        .unwrap()
        .expect("case created");

    assert_eq!(case.name, "Fairfax County");
    // Relative, so the database keeps working when the workspace moves.
    assert_eq!(case.folder_path.as_deref(), Some("DC8842.01 Fairfax County"));
    assert_eq!(case.document_count, 4);
    assert_eq!(case.status, "Initiated");
    assert_eq!(case.priority, "Normal");
    assert!(case.last_scanned_at.is_some());
    // The jurisdiction is not guessed from the folder name.
    assert!(case.jurisdiction.is_none());
}

#[test]
fn a_malformed_folder_name_warns_instead_of_failing_the_scan() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC8842.01 Fairfax County", 1);
    case_folder(&root, "Random Folder", 2);
    case_folder(&root, "Archive", 1);

    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    assert_eq!(report.folders_found, 3);
    assert_eq!(report.cases_found, 1);
    assert_eq!(report.created, 1);
    assert_eq!(report.skipped, 2);
    assert_eq!(report.warnings.len(), 2);
    assert!(report
        .warnings
        .iter()
        .any(|w| w.folder.as_deref() == Some("Random Folder")));
    assert_eq!(cases::count(&ws.connection).unwrap(), 1);
}

#[test]
fn two_folders_sharing_a_case_number_produce_a_warning_not_a_failure() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);
    case_folder(&root, "DC1.01 Duplicate", 1);

    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    assert_eq!(report.created, 1);
    assert_eq!(report.skipped, 1);
    assert_eq!(cases::count(&ws.connection).unwrap(), 1);
    assert!(report.warnings.iter().any(|w| w.message.contains("already used")));
}

#[test]
fn rescanning_updates_instead_of_duplicating() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC8842.01 Fairfax County", 2);
    let first = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();
    assert_eq!((first.created, first.updated, first.unchanged), (1, 0, 0));

    // Nothing changed on disk.
    let second = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();
    assert_eq!((second.created, second.updated, second.unchanged), (0, 0, 1));

    // A new document appears.
    std::fs::write(root.join("DC8842.01 Fairfax County").join("new.pdf"), b"pdf").unwrap();
    let third = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();
    assert_eq!((third.created, third.updated, third.unchanged), (0, 1, 0));

    assert_eq!(cases::count(&ws.connection).unwrap(), 1);
    assert_eq!(
        cases::find_by_number(&ws.connection, "DC8842.01")
            .unwrap()
            .unwrap()
            .document_count,
        3
    );
}

#[test]
fn a_scan_preserves_the_status_and_priority_the_user_set() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC8842.01 Fairfax County", 1);
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    let id = cases::find_by_number(&ws.connection, "DC8842.01")
        .unwrap()
        .unwrap()
        .id;

    cases::apply_edit(
        &ws.connection,
        id,
        &CaseEdit {
            name: "Fairfax County".to_string(),
            jurisdiction: Some("Fairfax County, VA".to_string()),
            status: "Need Info".to_string(),
            priority: "High".to_string(),
        },
    )
    .unwrap();

    // More documents arrive, then the user rescans.
    std::fs::write(root.join("DC8842.01 Fairfax County").join("extra.pdf"), b"pdf").unwrap();
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    let case = cases::find_by_id(&ws.connection, id).unwrap().unwrap();
    assert_eq!(case.status, "Need Info");
    assert_eq!(case.priority, "High");
    assert_eq!(case.jurisdiction.as_deref(), Some("Fairfax County, VA"));
    assert_eq!(case.document_count, 2);
}

#[test]
fn documents_are_counted_recursively_excluding_hidden_files() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("DC1.01 Alpha");
    std::fs::create_dir_all(root.join("Permits/2024")).unwrap();
    std::fs::create_dir_all(root.join("Drawings")).unwrap();

    std::fs::write(root.join("cover.pdf"), b"pdf").unwrap();
    std::fs::write(root.join("Permits/permit.pdf"), b"pdf").unwrap();
    std::fs::write(root.join("Permits/2024/renewal.pdf"), b"pdf").unwrap();
    std::fs::write(root.join("Drawings/plan.dwg"), b"dwg").unwrap();
    // Not documents.
    std::fs::write(root.join(".DS_Store"), b"junk").unwrap();
    std::fs::write(root.join("Permits/.hidden"), b"junk").unwrap();

    let counted = count_documents(&root);

    assert_eq!(counted.files, 4);
    assert!(counted.warnings.is_empty());
}

#[test]
fn an_empty_case_folder_counts_zero_documents() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Empty", 0);
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    assert_eq!(
        cases::find_by_number(&ws.connection, "DC1.01")
            .unwrap()
            .unwrap()
            .document_count,
        0
    );
}

#[test]
fn a_case_whose_folder_disappeared_is_reported_not_deleted() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);
    case_folder(&root, "DC2.01 Beta", 1);
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    std::fs::remove_dir_all(root.join("DC2.01 Beta")).unwrap();
    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    assert_eq!(report.missing, 1);
    // The record survives: a folder can be missing because a drive is offline.
    assert_eq!(cases::count(&ws.connection).unwrap(), 2);
    assert!(cases::find_by_number(&ws.connection, "DC2.01")
        .unwrap()
        .is_some());
}

#[test]
fn scanning_a_missing_workspace_root_fails_with_a_clear_message() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let missing = temp.path().join("gone");

    let error = CaseSyncService::scan_workspace(&missing, &mut ws.connection).unwrap_err();
    assert!(error.contains("does not exist"), "unexpected error: {error}");

    // A file is not a workspace root either.
    let file = temp.path().join("a-file.txt");
    std::fs::write(&file, b"x").unwrap();
    let error = CaseSyncService::scan_workspace(&file, &mut ws.connection).unwrap_err();
    assert!(error.contains("not a directory"), "unexpected error: {error}");
}

#[test]
fn scanning_a_single_case_leaves_the_others_alone() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);
    case_folder(&root, "DC2.01 Beta", 1);
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    let alpha = cases::find_by_number(&ws.connection, "DC1.01")
        .unwrap()
        .unwrap();

    std::fs::write(root.join("DC1.01 Alpha").join("extra.pdf"), b"pdf").unwrap();
    std::fs::write(root.join("DC2.01 Beta").join("extra.pdf"), b"pdf").unwrap();

    let report = CaseSyncService::scan_case(&root, &ws.connection, alpha.id).unwrap();
    assert_eq!(report.updated, 1);

    assert_eq!(
        cases::find_by_id(&ws.connection, alpha.id)
            .unwrap()
            .unwrap()
            .document_count,
        2
    );
    // Beta was not part of this scan.
    assert_eq!(
        cases::find_by_number(&ws.connection, "DC2.01")
            .unwrap()
            .unwrap()
            .document_count,
        1
    );
}

#[test]
fn scanning_a_single_case_whose_folder_is_gone_reports_it_as_missing() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);
    CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();
    let id = cases::find_by_number(&ws.connection, "DC1.01")
        .unwrap()
        .unwrap()
        .id;

    std::fs::remove_dir_all(root.join("DC1.01 Alpha")).unwrap();

    let report = CaseSyncService::scan_case(&root, &ws.connection, id).unwrap();
    assert_eq!(report.missing, 1);
    assert_eq!(report.warnings.len(), 1);
    assert!(cases::find_by_id(&ws.connection, id).unwrap().is_some());
}

#[test]
fn the_last_scan_time_is_recorded_on_the_workspace() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    assert!(!ws.state().unwrap().has_been_scanned);

    case_folder(&root, "DC1.01 Alpha", 1);
    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection).unwrap();

    let state = ws.state().unwrap();
    assert!(state.has_been_scanned);
    assert_eq!(state.last_scan_at.as_deref(), Some(report.scanned_at.as_str()));
    assert_eq!(state.case_count, 1);
}

/// A directory the process cannot read must warn and be skipped, not abort the
/// scan. Unix-only: permissions behave differently enough on Windows that this
/// would not be testing the same thing.
#[cfg(unix)]
#[test]
fn an_unreadable_folder_warns_and_the_scan_continues() {
    use std::os::unix::fs::PermissionsExt;

    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 2);
    case_folder(&root, "DC2.01 Beta", 1);

    let locked = root.join("DC2.01 Beta").join("Restricted");
    std::fs::create_dir_all(&locked).unwrap();
    std::fs::write(locked.join("secret.pdf"), b"pdf").unwrap();
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();

    let report = CaseSyncService::scan_workspace(&root, &mut ws.connection);

    // Restore permissions before asserting so the temporary directory can be
    // cleaned up even if an assertion fails.
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();

    let report = report.expect("the scan completes despite the unreadable folder");
    assert_eq!(report.created, 2, "both cases were still recorded");
    assert!(
        report
            .warnings
            .iter()
            .any(|w| w.message.contains("could not read")),
        "expected a warning about the unreadable folder, got {:?}",
        report.warnings
    );

    // The readable case is unaffected.
    assert_eq!(
        cases::find_by_number(&ws.connection, "DC1.01")
            .unwrap()
            .unwrap()
            .document_count,
        2
    );
}
