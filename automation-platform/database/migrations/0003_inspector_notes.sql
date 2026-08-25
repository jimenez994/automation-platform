-- Migration 0003 — Developer Inspector notes (development tooling).
--
-- Persists the Developer Inspector's saved notes so they survive a restart.
-- These are development-time annotations, not case data: they are keyed by a
-- DOM selector and stored as opaque JSON identity + free text. Nothing in the
-- case-management code reads this table.

CREATE TABLE IF NOT EXISTS inspector_notes (
    key        TEXT PRIMARY KEY,
    note       TEXT NOT NULL DEFAULT '',
    identity   TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
