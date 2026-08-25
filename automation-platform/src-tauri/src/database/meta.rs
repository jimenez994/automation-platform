//! Key/value bookkeeping stored alongside the cases in a workspace database.

use rusqlite::{params, Connection, OptionalExtension};

use super::DbResult;

/// Timestamp of the last completed scan of the workspace.
pub const LAST_SCAN_AT: &str = "last_scan_at";

pub fn get(conn: &Connection, key: &str) -> DbResult<Option<String>> {
    conn.query_row("SELECT value FROM app_meta WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .optional()
    .map_err(|e| format!("failed to read `{key}`: {e}"))
}

pub fn set(conn: &Connection, key: &str, value: &str) -> DbResult<()> {
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| format!("failed to write `{key}`: {e}"))?;

    Ok(())
}
