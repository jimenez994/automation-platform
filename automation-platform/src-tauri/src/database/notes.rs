//! Developer Inspector notes.
//!
//! These are development-time annotations stored alongside (but entirely
//! separate from) the case data. Each note has an auto-increment id (`#N`)
//! that is unique per workspace and never reused.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::DbResult;

/// One persisted inspector note.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectorNote {
    pub id: i64,
    pub note: String,
    /// JSON-encoded element identity; null for manually created items.
    pub identity: Option<String>,
    /// Work-manager stage: Backlog / In Progress / Completed.
    pub status: String,
    /// Where the item came from: App / Inspector / Manual.
    pub origin: String,
    /// Optional Task / Feature / Bug.
    pub type_: Option<String>,
    /// Low / Normal / High / Urgent.
    pub priority: String,
    /// Manual item title; null for element-derived items.
    pub title: Option<String>,
    pub updated_at: String,
}

const SELECT: &str = "id, note, identity, status, origin, type, priority, title, updated_at";

fn from_row(row: &rusqlite::Row) -> rusqlite::Result<InspectorNote> {
    Ok(InspectorNote {
        id: row.get(0)?,
        note: row.get(1)?,
        identity: row.get(2)?,
        status: row.get(3)?,
        origin: row.get(4)?,
        type_: row.get(5)?,
        priority: row.get(6)?,
        title: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn list(conn: &Connection) -> DbResult<Vec<InspectorNote>> {
    let mut stmt = conn
        .prepare(&format!("SELECT {SELECT} FROM inspector_notes ORDER BY id"))
        .map_err(|e| format!("failed to prepare the inspector notes query: {e}"))?;

    let rows = stmt
        .query_map([], from_row)
        .map_err(|e| format!("failed to list inspector notes: {e}"))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("failed to read inspector notes: {e}"))
}

/// Creates a note and returns its new id (`#N`).
#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    note: &str,
    identity: Option<&str>,
    status: &str,
    origin: &str,
    type_: Option<&str>,
    priority: &str,
    title: Option<&str>,
) -> DbResult<i64> {
    conn.execute(
        "INSERT INTO inspector_notes (note, identity, status, origin, type, priority, title)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![note, identity, status, origin, type_, priority, title],
    )
    .map_err(|e| format!("failed to create the inspector note: {e}"))?;

    Ok(conn.last_insert_rowid())
}

/// Updates a note's editable fields.
#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    id: i64,
    note: &str,
    type_: Option<&str>,
    priority: &str,
    title: Option<&str>,
) -> DbResult<()> {
    conn.execute(
        "UPDATE inspector_notes
            SET note = ?1, type = ?2, priority = ?3, title = ?4, updated_at = datetime('now')
          WHERE id = ?5",
        params![note, type_, priority, title, id],
    )
    .map_err(|e| format!("failed to update the inspector note: {e}"))?;

    Ok(())
}

/// Updates only the work-manager stage of a note.
pub fn set_status(conn: &Connection, id: i64, status: &str) -> DbResult<()> {
    conn.execute(
        "UPDATE inspector_notes SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| format!("failed to update the inspector note status: {e}"))?;

    Ok(())
}

pub fn remove(conn: &Connection, id: i64) -> DbResult<()> {
    conn.execute("DELETE FROM inspector_notes WHERE id = ?1", [id])
        .map_err(|e| format!("failed to remove the inspector note: {e}"))?;

    Ok(())
}

pub fn clear(conn: &Connection) -> DbResult<()> {
    conn.execute("DELETE FROM inspector_notes", [])
        .map_err(|e| format!("failed to clear the inspector notes: {e}"))?;

    Ok(())
}

/// Convenience for tests: a single note by id.
pub fn find(conn: &Connection, id: i64) -> DbResult<Option<InspectorNote>> {
    conn.query_row(
        &format!("SELECT {SELECT} FROM inspector_notes WHERE id = ?1"),
        [id],
        from_row,
    )
    .optional()
    .map_err(|e| format!("failed to look up the inspector note `{id}`: {e}"))
}
