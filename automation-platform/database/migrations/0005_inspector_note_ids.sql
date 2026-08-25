-- Migration 0005 — Developer Inspector note ids.
--
-- Replaces the uuid `key` primary key with an auto-increment integer id, so each
-- work item gets a stable `#N` that is never reused. Existing notes are carried
-- over and numbered in insertion order.

CREATE TABLE inspector_notes_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note       TEXT    NOT NULL DEFAULT '',
    identity   TEXT,
    status     TEXT    NOT NULL DEFAULT 'Backlog',
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO inspector_notes_new (note, identity, status, updated_at)
    SELECT note, identity, status, updated_at
    FROM inspector_notes
    ORDER BY updated_at, key;

DROP TABLE inspector_notes;
ALTER TABLE inspector_notes_new RENAME TO inspector_notes;
