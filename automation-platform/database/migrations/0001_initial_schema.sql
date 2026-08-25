-- Migration 0001 — initial schema (shipped in milestone 1).
--
-- Kept exactly as it was released so that a database created by milestone 1 is
-- recognised as being at version 1 and upgraded by the later migrations rather
-- than recreated. Every statement is `IF NOT EXISTS` for that reason.

CREATE TABLE IF NOT EXISTS cases (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number  TEXT    NOT NULL UNIQUE,
    name         TEXT    NOT NULL,
    jurisdiction TEXT,
    status       TEXT    NOT NULL DEFAULT 'Open',
    folder_path  TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cases_status     ON cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases (created_at);
