//! Read/write access to the `cases` table.
//!
//! Every function takes a `&Connection` rather than reaching for global state,
//! which keeps this module usable from tests without a running Tauri
//! application.

use rusqlite::{params, Connection, OptionalExtension, Row};

use super::models::{
    Case, CaseEdit, CaseSummary, ScannedCase, StatusCount, DEFAULT_PRIORITY, DEFAULT_STATUS,
    PRIORITIES, STATUSES,
};
use super::DbResult;

const SELECT_COLUMNS: &str = "id, case_number, name, jurisdiction, status, priority, folder_path, \
     document_count, last_scanned_at, created_at, updated_at, name_is_custom";

/// What happened to a case during a scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpsertOutcome {
    Created,
    /// A filesystem-derived field actually changed.
    Updated,
    /// Nothing changed except the scan timestamp.
    Unchanged,
}

fn from_row(row: &Row) -> rusqlite::Result<Case> {
    Ok(Case {
        id: row.get(0)?,
        case_number: row.get(1)?,
        name: row.get(2)?,
        jurisdiction: row.get(3)?,
        status: row.get(4)?,
        priority: row.get(5)?,
        folder_path: row.get(6)?,
        document_count: row.get(7)?,
        last_scanned_at: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        name_is_custom: row.get::<_, i64>(11)? != 0,
    })
}

/// Wraps a search term for a `LIKE` comparison, escaping the wildcards so a
/// literal `%` or `_` typed by the user does not match everything.
fn like_pattern(term: &str) -> String {
    let escaped = term
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");

    format!("%{escaped}%")
}

/// Number of rows in the table.
pub fn count(conn: &Connection) -> DbResult<i64> {
    conn.query_row("SELECT COUNT(*) FROM cases", [], |row| row.get(0))
        .map_err(|e| format!("failed to count cases: {e}"))
}

/// Case counts per status, for the dashboard summary. Unknown statuses are
/// included in `total` only.
pub fn summary(conn: &Connection) -> DbResult<CaseSummary> {
    let mut stmt = conn
        .prepare("SELECT status, COUNT(*) FROM cases GROUP BY status ORDER BY status")
        .map_err(|e| format!("failed to prepare the summary query: {e}"))?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| format!("failed to summarise cases: {e}"))?;

    let mut summary = CaseSummary::default();
    for row in rows {
        let (status, count) = row.map_err(|e| format!("failed to read the summary: {e}"))?;
        summary.total += count;
        summary.statuses.push(StatusCount { status, count });
    }

    Ok(summary)
}

/// Lists cases, optionally filtered by a search term matched against the case
/// number and the name.
pub fn list(conn: &Connection, search: Option<&str>) -> DbResult<Vec<Case>> {
    let term = search.map(str::trim).filter(|t| !t.is_empty());

    let (sql, bindings): (String, Vec<String>) = match term {
        Some(term) => (
            format!(
                "SELECT {SELECT_COLUMNS} FROM cases \
                 WHERE case_number LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\' \
                 ORDER BY case_number"
            ),
            vec![like_pattern(term)],
        ),
        None => (
            format!("SELECT {SELECT_COLUMNS} FROM cases ORDER BY case_number"),
            Vec::new(),
        ),
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare the case query: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(bindings), from_row)
        .map_err(|e| format!("failed to query cases: {e}"))?;

    rows.collect::<rusqlite::Result<Vec<Case>>>()
        .map_err(|e| format!("failed to read cases: {e}"))
}

/// Looks up a single case by id.
pub fn find_by_id(conn: &Connection, id: i64) -> DbResult<Option<Case>> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM cases WHERE id = ?1");

    conn.query_row(&sql, [id], from_row)
        .optional()
        .map_err(|e| format!("failed to look up case {id}: {e}"))
}

/// Looks up a single case by its case number.
pub fn find_by_number(conn: &Connection, case_number: &str) -> DbResult<Option<Case>> {
    let sql = format!("SELECT {SELECT_COLUMNS} FROM cases WHERE case_number = ?1");

    conn.query_row(&sql, [case_number], from_row)
        .optional()
        .map_err(|e| format!("failed to look up case `{case_number}`: {e}"))
}

/// Creates or refreshes a case from what the scanner found on disk.
///
/// Only filesystem-derived fields are written. `status`, `priority` and
/// `jurisdiction` are never touched, and `name` is left alone once the user has
/// edited it.
pub fn upsert_scanned(
    conn: &Connection,
    scanned: &ScannedCase,
    scanned_at: &str,
) -> DbResult<UpsertOutcome> {
    let Some(existing) = find_by_number(conn, &scanned.case_number)? else {
        conn.execute(
            "INSERT INTO cases (case_number, name, status, priority, folder_path, document_count, last_scanned_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                scanned.case_number,
                scanned.name,
                DEFAULT_STATUS,
                DEFAULT_PRIORITY,
                scanned.folder_path,
                scanned.document_count,
                scanned_at,
            ],
        )
        .map_err(|e| format!("failed to insert case `{}`: {e}", scanned.case_number))?;

        return Ok(UpsertOutcome::Created);
    };

    // A name the user edited stays as it is; otherwise it follows the folder.
    let name = if existing.name_is_custom {
        existing.name.clone()
    } else {
        scanned.name.clone()
    };

    let changed = existing.folder_path.as_deref() != Some(scanned.folder_path.as_str())
        || existing.document_count != scanned.document_count
        || existing.name != name;

    if changed {
        conn.execute(
            "UPDATE cases
                SET name = ?1, folder_path = ?2, document_count = ?3,
                    last_scanned_at = ?4, updated_at = datetime('now')
              WHERE id = ?5",
            params![
                name,
                scanned.folder_path,
                scanned.document_count,
                scanned_at,
                existing.id,
            ],
        )
        .map_err(|e| format!("failed to update case `{}`: {e}", scanned.case_number))?;

        return Ok(UpsertOutcome::Updated);
    }

    // Nothing changed, but the case was still seen during this scan.
    conn.execute(
        "UPDATE cases SET last_scanned_at = ?1 WHERE id = ?2",
        params![scanned_at, existing.id],
    )
    .map_err(|e| format!("failed to record the scan time for `{}`: {e}", scanned.case_number))?;

    Ok(UpsertOutcome::Unchanged)
}

/// Case numbers currently stored, used to report cases whose folder was not
/// found during a scan.
pub fn all_case_numbers(conn: &Connection) -> DbResult<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT case_number FROM cases")
        .map_err(|e| format!("failed to prepare the case number query: {e}"))?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("failed to list case numbers: {e}"))?;

    rows.collect::<rusqlite::Result<Vec<String>>>()
        .map_err(|e| format!("failed to read case numbers: {e}"))
}

/// Applies a user edit. Rejects statuses and priorities outside the supported
/// sets so a malformed call cannot put the dashboard into a state it cannot
/// render.
pub fn apply_edit(conn: &Connection, id: i64, edit: &CaseEdit) -> DbResult<Case> {
    let name = edit.name.trim();
    if name.is_empty() {
        return Err("the case name cannot be empty".to_string());
    }

    if !STATUSES.contains(&edit.status.as_str()) {
        return Err(format!(
            "`{}` is not a supported status (expected one of {})",
            edit.status,
            STATUSES.join(", ")
        ));
    }

    if !PRIORITIES.contains(&edit.priority.as_str()) {
        return Err(format!(
            "`{}` is not a supported priority (expected one of {})",
            edit.priority,
            PRIORITIES.join(", ")
        ));
    }

    let existing = find_by_id(conn, id)?.ok_or_else(|| format!("case {id} no longer exists"))?;

    let jurisdiction = edit
        .jurisdiction
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    // Once the name differs from what the scanner derived, the scanner must
    // stop overwriting it. The flag is sticky: it is never cleared here.
    let name_is_custom = existing.name_is_custom || name != existing.name;

    conn.execute(
        "UPDATE cases
            SET name = ?1, jurisdiction = ?2, status = ?3, priority = ?4,
                name_is_custom = ?5, updated_at = datetime('now')
          WHERE id = ?6",
        params![
            name,
            jurisdiction,
            edit.status,
            edit.priority,
            i64::from(name_is_custom),
            id,
        ],
    )
    .map_err(|e| format!("failed to update case {id}: {e}"))?;

    find_by_id(conn, id)?.ok_or_else(|| format!("case {id} disappeared while it was being saved"))
}
