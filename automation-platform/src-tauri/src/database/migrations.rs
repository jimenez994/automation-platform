//! Schema migrations.
//!
//! Versions are tracked with SQLite's `user_version` pragma, so each migration
//! runs exactly once per database. Milestone 1 databases never set the pragma,
//! which leaves them at 0 — migration 1 is written with `IF NOT EXISTS` so
//! re-running it against such a database is a no-op and it is then upgraded by
//! the later migrations instead of being recreated.

use rusqlite::Connection;

use super::DbResult;

/// The version a fully migrated database reports.
pub const LATEST_VERSION: i32 = 7;

/// Ordered migrations. Only ever append: editing a released migration leaves
/// databases that already ran it inconsistent.
const MIGRATIONS: &[(i32, &str, &str)] = &[
    (
        1,
        "0001_initial_schema",
        include_str!("../../../database/migrations/0001_initial_schema.sql"),
    ),
    (
        2,
        "0002_workspace_cases",
        include_str!("../../../database/migrations/0002_workspace_cases.sql"),
    ),
    (
        3,
        "0003_inspector_notes",
        include_str!("../../../database/migrations/0003_inspector_notes.sql"),
    ),
    (
        4,
        "0004_inspector_note_status",
        include_str!("../../../database/migrations/0004_inspector_note_status.sql"),
    ),
    (
        5,
        "0005_inspector_note_ids",
        include_str!("../../../database/migrations/0005_inspector_note_ids.sql"),
    ),
    (
        6,
        "0006_work_item_fields",
        include_str!("../../../database/migrations/0006_work_item_fields.sql"),
    ),
    (
        7,
        "0007_case_statuses",
        include_str!("../../../database/migrations/0007_case_statuses.sql"),
    ),
];

/// Reads the schema version recorded in the database.
pub fn current_version(conn: &Connection) -> DbResult<i32> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("could not read the schema version: {e}"))
}

/// Applies every migration newer than the recorded version.
///
/// Each migration runs inside its own transaction together with the version
/// bump, so an interrupted upgrade leaves the database on the last version that
/// fully applied rather than half-migrated.
pub fn run(conn: &mut Connection) -> DbResult<i32> {
    let mut version = current_version(conn)?;

    if version > LATEST_VERSION {
        return Err(format!(
            "this database is at schema version {version}, but this build only understands {LATEST_VERSION}; \
             it was probably created by a newer version of the application"
        ));
    }

    for (target, name, sql) in MIGRATIONS {
        if *target <= version {
            continue;
        }

        let tx = conn
            .transaction()
            .map_err(|e| format!("could not start the transaction for migration {name}: {e}"))?;

        tx.execute_batch(sql)
            .map_err(|e| format!("migration {name} failed: {e}"))?;

        // `user_version` does not accept a bound parameter.
        tx.pragma_update(None, "user_version", *target)
            .map_err(|e| format!("could not record the schema version after {name}: {e}"))?;

        tx.commit()
            .map_err(|e| format!("could not commit migration {name}: {e}"))?;

        version = *target;
    }

    Ok(version)
}
