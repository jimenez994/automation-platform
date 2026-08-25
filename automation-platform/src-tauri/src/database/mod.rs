//! Workspace-local SQLite database: connections, migrations and queries.
//!
//! Every workspace owns its database at
//! `<workspace>/.automation-platform/automation.db`, so it travels with the
//! workspace folder. Nothing case-related is stored in the application data
//! directory.

pub mod cases;
pub mod meta;
pub mod migrations;
pub mod models;
pub mod notes;

use std::path::Path;

use rusqlite::Connection;

/// Database operations report failures as human-readable strings, which is what
/// both the logs and the frontend need. There is no recovery logic that would
/// benefit from richer error types yet.
pub type DbResult<T> = Result<T, String>;

/// File name of the database inside a workspace's internal directory.
pub const DATABASE_FILE_NAME: &str = "automation.db";

/// Opens (or creates) a database file and applies the connection settings used
/// everywhere in the application.
pub fn open(path: &Path) -> DbResult<Connection> {
    let conn =
        Connection::open(path).map_err(|e| format!("could not open `{}`: {e}", path.display()))?;

    configure(&conn)?;
    Ok(conn)
}

/// Opens an in-memory database. Used by the tests.
pub fn open_in_memory() -> DbResult<Connection> {
    let conn = Connection::open_in_memory()
        .map_err(|e| format!("could not open an in-memory database: {e}"))?;

    // `journal_mode = WAL` is meaningless for an in-memory database, so only the
    // shared settings are applied here.
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("could not enable foreign keys: {e}"))?;

    Ok(conn)
}

fn configure(conn: &Connection) -> DbResult<()> {
    // Write-ahead logging keeps reads from blocking on writes, which matters
    // once background automations share this file with the UI.
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("could not enable WAL mode: {e}"))?;

    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("could not enable foreign keys: {e}"))?;

    // A scan runs on its own connection to the same file so it never blocks the
    // UI's queries. WAL lets those readers proceed during the scan's writes;
    // this timeout covers the brief moments when two connections do collide,
    // instead of surfacing SQLITE_BUSY to the user.
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("could not set the busy timeout: {e}"))?;

    Ok(())
}

/// Runs a trivial query to confirm the connection is usable and that the schema
/// is in place.
pub fn verify(conn: &Connection) -> DbResult<()> {
    conn.query_row("SELECT 1", [], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("connection check failed: {e}"))?;

    for table in ["cases", "app_meta", "inspector_notes"] {
        if !table_exists(conn, table)? {
            return Err(format!("the `{table}` table is missing after migrating"));
        }
    }

    Ok(())
}

/// Returns true when a table with the given name exists.
pub fn table_exists(conn: &Connection, table: &str) -> DbResult<bool> {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .map_err(|e| format!("failed to look up table `{table}`: {e}"))
}

/// Opens a database file, migrates it to the current schema and verifies it.
///
/// This is the single entry point used when a workspace is opened, whether the
/// database is brand new or was created by an earlier version.
pub fn open_and_migrate(path: &Path) -> DbResult<(Connection, i32)> {
    let mut conn = open(path)?;
    let version = migrations::run(&mut conn)?;
    verify(&conn)?;
    Ok((conn, version))
}
