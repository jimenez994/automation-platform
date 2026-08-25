//! Milestone 2A tests: scan progress transitions, cancellation safety, and
//! theme persistence.
//!
//! Everything runs in temporary directories against the same service layer the
//! commands call. Nothing touches a real workspace.

use std::path::Path;

use automation_platform_lib::cases::{CaseSyncService, CancelToken, RecordingSink, ScanPhase};
use automation_platform_lib::database::cases;
use automation_platform_lib::menu::MenuContext;
use automation_platform_lib::workspace::preferences::{preferences_path, Preferences, ThemePreference};
use automation_platform_lib::workspace::OpenWorkspace;
use tempfile::TempDir;

fn case_folder(root: &Path, name: &str, files: usize) {
    let folder = root.join(name);
    std::fs::create_dir_all(&folder).unwrap();
    for i in 0..files {
        std::fs::write(folder.join(format!("doc-{i}.pdf")), b"pdf").unwrap();
    }
}

fn workspace(temp: &TempDir) -> OpenWorkspace {
    let root = temp.path().join("Cases");
    std::fs::create_dir_all(&root).unwrap();
    OpenWorkspace::open(&root).unwrap()
}

// ---- Scan progress state transitions

#[test]
fn a_scan_walks_through_every_phase() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 2);
    case_folder(&root, "DC2.01 Beta", 1);

    let mut sink = RecordingSink::default();
    let outcome = CaseSyncService::scan_workspace_reporting(
        &root,
        &mut ws.connection,
        &mut sink,
        &CancelToken::new(),
    )
    .unwrap();

    assert_eq!(outcome.status, ScanPhase::Completed);

    let ordered = [
        ScanPhase::Initializing,
        ScanPhase::DiscoveringCases,
        ScanPhase::ScanningDocuments,
        ScanPhase::UpdatingDatabase,
        ScanPhase::Finalizing,
        ScanPhase::Completed,
    ];

    let mut seen = Vec::new();
    for update in &sink.updates {
        if seen.last() != Some(&update.phase) {
            seen.push(update.phase);
        }
    }

    assert_eq!(seen, ordered);
}

#[test]
fn progress_reports_the_total_before_the_scanning_phase() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    for i in 0..5 {
        case_folder(&root, &format!("DC{i}.01 Case {i}"), i);
    }

    let mut sink = RecordingSink::default();
    CaseSyncService::scan_workspace_reporting(
        &root,
        &mut ws.connection,
        &mut sink,
        &CancelToken::new(),
    )
    .unwrap();

    let discovering = sink
        .updates
        .iter()
        .find(|p| p.phase == ScanPhase::DiscoveringCases)
        .unwrap();
    assert_eq!(discovering.total_cases, 0);

    let scanning = sink
        .updates
        .iter()
        .find(|p| p.phase == ScanPhase::ScanningDocuments)
        .unwrap();
    assert_eq!(scanning.total_cases, 5);

    let last = sink.updates.last().unwrap();
    assert_eq!(last.phase, ScanPhase::Completed);
    assert_eq!(last.current_index, 5);
    assert_eq!(last.files_discovered, 0 + 1 + 2 + 3 + 4);
}

#[test]
fn progress_reports_the_current_case_as_it_goes() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);
    case_folder(&root, "DC2.01 Beta", 1);

    let mut sink = RecordingSink::default();
    CaseSyncService::scan_workspace_reporting(
        &root,
        &mut ws.connection,
        &mut sink,
        &CancelToken::new(),
    )
    .unwrap();

    let current_cases: Vec<&str> = sink
        .updates
        .iter()
        .filter_map(|p| p.current_case.as_deref())
        .collect();

    assert!(current_cases.contains(&"DC1.01 Alpha"), "saw {current_cases:?}");
    assert!(current_cases.contains(&"DC2.01 Beta"), "saw {current_cases:?}");
}

#[test]
fn the_eta_is_withheld_until_it_is_honest() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    for i in 0..8 {
        case_folder(&root, &format!("DC{i}.01 Case {i}"), 1);
    }

    let mut sink = RecordingSink::default();
    CaseSyncService::scan_workspace_reporting(
        &root,
        &mut ws.connection,
        &mut sink,
        &CancelToken::new(),
    )
    .unwrap();

    let before = sink.updates.iter().find(|p| p.current_index == 1).unwrap();
    assert_eq!(before.estimated_remaining_ms, None);

    let after = sink
        .updates
        .iter()
        .rev()
        .find(|p| p.current_index == 5)
        .unwrap();
    assert!(after.estimated_remaining_ms.is_some());
}

#[test]
fn activity_lines_cover_open_discover_and_warnings() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 2);
    case_folder(&root, "Random Folder", 1);

    let mut sink = RecordingSink::default();
    CaseSyncService::scan_workspace_reporting(
        &root,
        &mut ws.connection,
        &mut sink,
        &CancelToken::new(),
    )
    .unwrap();

    let text: Vec<&str> = sink.activity.iter().map(|l| l.message.as_str()).collect();

    assert!(text.iter().any(|m| m.contains("Found 1 case")));
    assert!(text.iter().any(|m| m.contains("DC1.01")));
    assert!(text.iter().any(|m| m.contains("Random Folder")));
    assert!(text.iter().any(|m| m.contains("Scan complete")));
}

// ---- Cancellation

#[test]
fn cancelling_before_any_folder_is_processed_keeps_everything_consistent() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    case_folder(&root, "DC1.01 Alpha", 1);

    let cancel = CancelToken::new();
    cancel.cancel();

    let mut sink = RecordingSink::default();
    let outcome = CaseSyncService::scan_workspace_reporting(
        &root,
        &mut ws.connection,
        &mut sink,
        &cancel,
    )
    .unwrap();

    assert_eq!(outcome.status, ScanPhase::Cancelled);
    assert_eq!(outcome.report.cases_found, 0);
    assert_eq!(outcome.report.missing, 0, "no folders were reported missing");

    // A cancelled scan does not advance the recorded "last scanned" time.
    assert!(!ws.state().unwrap().has_been_scanned);
}

#[test]
fn cancelling_mid_scan_keeps_work_already_done() {
    let temp = TempDir::new().unwrap();
    let mut ws = workspace(&temp);
    let root = ws.root.clone();

    for i in 0..200 {
        case_folder(&root, &format!("DC{i:03}.01 Case {i}"), 1);
    }

    let mut sink = RecordingSink::default();
    let cancel = CancelToken::new();

    // Cancel deterministically after five folders, regardless of how fast the
    // scan runs.
    let outcome = CaseSyncService::scan_workspace_with_cancel_check_for_test(
        &root,
        &mut ws.connection,
        &mut sink,
        &cancel,
        &mut |_cancel, index| index >= 5,
    )
    .unwrap();

    assert_eq!(outcome.status, ScanPhase::Cancelled);
    assert_eq!(outcome.report.cases_found, 5);
    assert!(outcome.report.cases_found < 200);

    // Everything the scan did write is intact, and it reported no folders as
    // missing — a cancelled scan simply did not look at the rest.
    assert_eq!(outcome.report.missing, 0);
    assert_eq!(
        cases::count(&ws.connection).unwrap(),
        outcome.report.cases_found,
        "every case written is still there; none were removed"
    );
}

#[test]
fn cancel_token_resets_for_the_next_scan() {
    let cancel = CancelToken::new();

    cancel.cancel();
    assert!(cancel.is_cancelled());

    cancel.reset();
    assert!(!cancel.is_cancelled());
}

// ---- Theme persistence

#[test]
fn theme_defaults_to_system_and_persists() {
    let temp = TempDir::new().unwrap();
    let path = preferences_path(temp.path());

    // A preferences file from before themes existed still loads with the
    // default, rather than being discarded.
    std::fs::write(&path, "{}").unwrap();
    let loaded = Preferences::load(&path);
    assert_eq!(loaded.theme, ThemePreference::System);

    let mut preferences = loaded;
    preferences.theme = ThemePreference::Dark;
    preferences.save(&path).unwrap();

    let reloaded = Preferences::load(&path);
    assert_eq!(reloaded.theme, ThemePreference::Dark);
}

#[test]
fn theme_preference_round_trips_through_json() {
    let json = serde_json::json!({
        "version": 1,
        "last_workspace_id": null,
        "recent_workspaces": [],
        "theme": "light"
    });

    let preferences: Preferences = serde_json::from_value(json).unwrap();
    assert_eq!(preferences.theme, ThemePreference::Light);

    let back = serde_json::to_string(&preferences).unwrap();
    assert!(back.contains("\"theme\":\"light\""), "serialised as: {back}");
}

// ---- Menu state awareness

#[test]
fn menu_state_blocks_duplicate_and_conflicting_actions() {
    let no_workspace = MenuContext::default();
    assert!(no_workspace.can_select_workspace());
    assert!(!no_workspace.can_scan());

    let open = MenuContext {
        has_workspace: true,
        ..MenuContext::default()
    };
    assert!(open.can_scan());

    let scanning = MenuContext {
        has_workspace: true,
        scanning: true,
        ..MenuContext::default()
    };
    assert!(!scanning.can_scan());
    assert!(!scanning.can_change_workspace());
    assert!(!scanning.can_close_workspace());
}

// ---- Relocation still reuses the same workspace

#[test]
fn reopening_a_relocated_workspace_reuses_its_database() {
    let temp = TempDir::new().unwrap();
    let original = temp.path().join("Cases");
    std::fs::create_dir_all(&original).unwrap();
    case_folder(&original, "DC1.01 Alpha", 1);

    let mut ws = OpenWorkspace::open(&original).unwrap();
    let workspace_id = ws.metadata.workspace_id.clone();
    CaseSyncService::scan_workspace(&original, &mut ws.connection).unwrap();
    drop(ws);

    let moved = temp.path().join("Moved Cases");
    std::fs::rename(&original, &moved).unwrap();

    let reopened = OpenWorkspace::open(&moved).unwrap();
    assert_eq!(reopened.metadata.workspace_id, workspace_id);
    assert_eq!(cases::count(&reopened.connection).unwrap(), 1);
    assert!(!original.exists());
}
