//! Integration tests for the database layer: migrations and case queries.
//!
//! These run against an in-memory SQLite database and never touch a real
//! workspace. Run with `npm test`.

use automation_platform_lib::database::cases::{self, UpsertOutcome};
use automation_platform_lib::database::models::{CaseEdit, ScannedCase};
use automation_platform_lib::database::{self, meta, migrations, notes};
use rusqlite::Connection;

fn migrated() -> Connection {
    let mut conn = database::open_in_memory().expect("in-memory database");
    migrations::run(&mut conn).expect("migrations apply");
    conn
}

fn scanned(case_number: &str, name: &str, documents: i64) -> ScannedCase {
    ScannedCase {
        case_number: case_number.to_string(),
        name: name.to_string(),
        folder_path: format!("{case_number} {name}"),
        document_count: documents,
    }
}

fn columns(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .expect("table_info");

    let mut names: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .expect("query")
        .map(|row| row.expect("column name"))
        .collect();

    names.sort();
    names
}

#[test]
fn migrations_reach_the_latest_version() {
    let conn = migrated();

    assert_eq!(
        migrations::current_version(&conn).unwrap(),
        migrations::LATEST_VERSION
    );
    database::verify(&conn).expect("schema verifies");
}

#[test]
fn inspector_notes_persist_with_auto_increment_ids() {
    let conn = migrated();

    assert!(database::table_exists(&conn, "inspector_notes").unwrap());

    let first = notes::create(&conn, "Widen rows", Some(r#"{"tag":"table"}"#), "Backlog", "App", None, "Normal", None).unwrap();
    let second = notes::create(&conn, "Add tooltip", Some(r#"{"tag":"button"}"#), "Backlog", "Inspector", Some("Bug"), "High", None).unwrap();
    assert_eq!(first, 1);
    assert_eq!(second, 2);

    // A manual item has no identity but carries a title.
    let third = notes::create(&conn, "Refactor search", None, "Backlog", "Manual", None, "Urgent", Some("Refactor search")).unwrap();
    assert_eq!(third, 3);

    let all = notes::list(&conn).unwrap();
    assert_eq!(all.len(), 3);
    assert_eq!(all.iter().map(|n| n.id).collect::<Vec<_>>(), vec![1, 2, 3]);

    let manual = notes::find(&conn, 3).unwrap().unwrap();
    assert_eq!(manual.origin, "Manual");
    assert_eq!(manual.identity, None);
    assert_eq!(manual.title.as_deref(), Some("Refactor search"));
    assert_eq!(manual.priority, "Urgent");

    notes::update(&conn, 1, "Widen rows (edited)", Some("Feature"), "Low", None).unwrap();
    let edited = notes::find(&conn, 1).unwrap().unwrap();
    assert_eq!(edited.note, "Widen rows (edited)");
    assert_eq!(edited.type_.as_deref(), Some("Feature"));
    assert_eq!(edited.priority, "Low");

    notes::set_status(&conn, 2, "In Progress").unwrap();
    assert_eq!(notes::find(&conn, 2).unwrap().unwrap().status, "In Progress");

    // Deleting a note must not reuse its id.
    notes::remove(&conn, 2).unwrap();
    let fourth = notes::create(&conn, "Another", Some(r#"{"tag":"div"}"#), "Completed", "App", None, "Normal", None).unwrap();
    assert_eq!(fourth, 4, "deleted ids are never reused");

    notes::clear(&conn).unwrap();
    assert!(notes::list(&conn).unwrap().is_empty());
}

#[test]
fn notes_reject_unknown_priority_and_type() {
    let conn = migrated();

    assert!(notes::create(&conn, "n", None, "Backlog", "App", None, "Nonsense", None).is_err());
    assert!(notes::create(&conn, "n", None, "Backlog", "App", Some("Nonsense"), "Normal", None).is_err());
    assert!(notes::create(&conn, "n", None, "Backlog", "App", Some("Bug"), "High", None).is_ok());

    let id = notes::create(&conn, "n2", None, "Backlog", "App", None, "Normal", None).unwrap();
    assert!(notes::update(&conn, id, "n2", Some("Nonsense"), "Normal", None).is_err());
    assert!(notes::update(&conn, id, "n2", None, "Nonsense", None).is_err());
    assert!(notes::update(&conn, id, "n2", Some("Feature"), "Low", None).is_ok());
}

#[test]
fn migrations_create_the_expected_columns() {
    let conn = migrated();

    assert_eq!(
        columns(&conn, "cases"),
        vec![
            "case_number",
            "created_at",
            "document_count",
            "folder_path",
            "id",
            "jurisdiction",
            "last_scanned_at",
            "name",
            "name_is_custom",
            "priority",
            "status",
            "updated_at",
        ]
    );
    assert!(database::table_exists(&conn, "app_meta").unwrap());
}

#[test]
fn migrations_are_not_reapplied() {
    let mut conn = migrated();

    // Re-running must be a no-op; migration 2 uses ALTER TABLE, which would
    // fail with "duplicate column" if the version guard were not working.
    migrations::run(&mut conn).expect("re-running migrations is safe");
    assert_eq!(
        migrations::current_version(&conn).unwrap(),
        migrations::LATEST_VERSION
    );
}

#[test]
fn a_milestone_one_database_is_upgraded_rather_than_recreated() {
    let mut conn = database::open_in_memory().expect("in-memory database");

    // Exactly what milestone 1 shipped, including its unset user_version.
    conn.execute_batch(
        "CREATE TABLE cases (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number  TEXT    NOT NULL UNIQUE,
            name         TEXT    NOT NULL,
            jurisdiction TEXT,
            status       TEXT    NOT NULL DEFAULT 'Open',
            folder_path  TEXT,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
         );
         INSERT INTO cases (case_number, name, status) VALUES ('LEGACY-1', 'Existing case', 'Open');",
    )
    .expect("legacy schema");

    migrations::run(&mut conn).expect("legacy database migrates");

    let case = cases::find_by_number(&conn, "LEGACY-1")
        .unwrap()
        .expect("the existing row survived the migration");

    assert_eq!(case.name, "Existing case");
    // 'Open' is normalised to the new status vocabulary.
    assert_eq!(case.status, "Initiated");
    assert_eq!(case.priority, "Normal");
    assert_eq!(case.document_count, 0);
}

#[test]
fn upsert_creates_then_reports_unchanged() {
    let conn = migrated();
    let case = scanned("DC8842.01", "Fairfax County", 3);

    assert_eq!(
        cases::upsert_scanned(&conn, &case, "2026-01-01T00:00:00Z").unwrap(),
        UpsertOutcome::Created
    );
    assert_eq!(
        cases::upsert_scanned(&conn, &case, "2026-01-02T00:00:00Z").unwrap(),
        UpsertOutcome::Unchanged
    );

    let stored = cases::find_by_number(&conn, "DC8842.01").unwrap().unwrap();
    assert_eq!(stored.name, "Fairfax County");
    assert_eq!(stored.status, "Initiated");
    assert_eq!(stored.priority, "Normal");
    assert_eq!(stored.document_count, 3);
    // The scan timestamp is refreshed even when nothing else changed.
    assert_eq!(stored.last_scanned_at.as_deref(), Some("2026-01-02T00:00:00Z"));
    assert_eq!(cases::count(&conn).unwrap(), 1);
}

#[test]
fn upsert_reports_a_changed_document_count() {
    let conn = migrated();
    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 1), "t1").unwrap();

    assert_eq!(
        cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 9), "t2").unwrap(),
        UpsertOutcome::Updated
    );
    assert_eq!(
        cases::find_by_number(&conn, "DC1.01")
            .unwrap()
            .unwrap()
            .document_count,
        9
    );
}

#[test]
fn scanning_never_overwrites_status_or_priority() {
    let conn = migrated();
    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 1), "t1").unwrap();
    let id = cases::find_by_number(&conn, "DC1.01").unwrap().unwrap().id;

    cases::apply_edit(
        &conn,
        id,
        &CaseEdit {
            name: "Alpha".to_string(),
            jurisdiction: Some("Fairfax County".to_string()),
            status: "Need Info".to_string(),
            priority: "High".to_string(),
        },
    )
    .unwrap();

    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 7), "t2").unwrap();

    let stored = cases::find_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(stored.status, "Need Info");
    assert_eq!(stored.priority, "High");
    assert_eq!(stored.jurisdiction.as_deref(), Some("Fairfax County"));
    // Filesystem-derived data still updates.
    assert_eq!(stored.document_count, 7);
}

#[test]
fn a_user_edited_name_survives_a_rescan() {
    let conn = migrated();
    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 1), "t1").unwrap();
    let id = cases::find_by_number(&conn, "DC1.01").unwrap().unwrap().id;

    cases::apply_edit(
        &conn,
        id,
        &CaseEdit {
            name: "Renamed by the user".to_string(),
            jurisdiction: None,
            status: "Ready".to_string(),
            priority: "Normal".to_string(),
        },
    )
    .unwrap();

    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 1), "t2").unwrap();

    let stored = cases::find_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(stored.name, "Renamed by the user");
    assert!(stored.name_is_custom);
}

#[test]
fn a_folder_derived_name_follows_the_folder_until_it_is_edited() {
    let conn = migrated();
    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 1), "t1").unwrap();

    assert_eq!(
        cases::upsert_scanned(&conn, &scanned("DC1.01", "Beta", 1), "t2").unwrap(),
        UpsertOutcome::Updated
    );
    assert_eq!(
        cases::find_by_number(&conn, "DC1.01").unwrap().unwrap().name,
        "Beta"
    );
}

#[test]
fn edits_are_validated() {
    let conn = migrated();
    cases::upsert_scanned(&conn, &scanned("DC1.01", "Alpha", 0), "t1").unwrap();
    let id = cases::find_by_number(&conn, "DC1.01").unwrap().unwrap().id;

    let edit = |status: &str, priority: &str, name: &str| CaseEdit {
        name: name.to_string(),
        jurisdiction: None,
        status: status.to_string(),
        priority: priority.to_string(),
    };

    assert!(cases::apply_edit(&conn, id, &edit("Nonsense", "Normal", "Alpha")).is_err());
    assert!(cases::apply_edit(&conn, id, &edit("Ready", "Nonsense", "Alpha")).is_err());
    assert!(cases::apply_edit(&conn, id, &edit("Ready", "Normal", "   ")).is_err());
    assert!(cases::apply_edit(&conn, id, &edit("Ready", "Normal", "Alpha")).is_ok());
}

#[test]
fn search_matches_the_case_number_and_the_name() {
    let conn = migrated();
    cases::upsert_scanned(&conn, &scanned("DC8842.01", "Fairfax County", 0), "t").unwrap();
    cases::upsert_scanned(&conn, &scanned("DC6530.04", "Loudoun County", 0), "t").unwrap();

    let by_number = cases::list(&conn, Some("8842")).unwrap();
    assert_eq!(by_number.len(), 1);
    assert_eq!(by_number[0].case_number, "DC8842.01");

    let by_name = cases::list(&conn, Some("loudoun")).unwrap();
    assert_eq!(by_name.len(), 1);

    assert_eq!(cases::list(&conn, Some("   ")).unwrap().len(), 2);
    assert_eq!(cases::list(&conn, None).unwrap().len(), 2);

    // Wildcards typed by the user are matched literally, not as patterns.
    assert!(cases::list(&conn, Some("%")).unwrap().is_empty());
}

#[test]
fn summary_counts_each_status() {
    let conn = migrated();
    for (number, status) in [
        ("DC1.01", "Initiated"),
        ("DC2.01", "Ready"),
        ("DC3.01", "Ready"),
        ("DC4.01", "Need Info"),
        ("DC5.01", "Completed"),
    ] {
        cases::upsert_scanned(&conn, &scanned(number, "Case", 0), "t").unwrap();
        let id = cases::find_by_number(&conn, number).unwrap().unwrap().id;
        cases::apply_edit(
            &conn,
            id,
            &CaseEdit {
                name: "Case".to_string(),
                jurisdiction: None,
                status: status.to_string(),
                priority: "Normal".to_string(),
            },
        )
        .unwrap();
    }

    let summary = cases::summary(&conn).unwrap();
    assert_eq!(summary.total, 5);

    let count = |status: &str| {
        summary
            .statuses
            .iter()
            .find(|entry| entry.status == status)
            .map(|entry| entry.count)
            .unwrap_or(0)
    };

    assert_eq!(count("Initiated"), 1);
    assert_eq!(count("Ready"), 2);
    assert_eq!(count("Need Info"), 1);
    assert_eq!(count("Completed"), 1);
}

#[test]
fn meta_round_trips() {
    let conn = migrated();

    assert!(meta::get(&conn, meta::LAST_SCAN_AT).unwrap().is_none());
    meta::set(&conn, meta::LAST_SCAN_AT, "2026-01-01T00:00:00Z").unwrap();
    meta::set(&conn, meta::LAST_SCAN_AT, "2026-01-02T00:00:00Z").unwrap();

    assert_eq!(
        meta::get(&conn, meta::LAST_SCAN_AT).unwrap().as_deref(),
        Some("2026-01-02T00:00:00Z")
    );
}
