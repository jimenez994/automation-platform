-- Migration 0002 — workspace-scoped cases (milestone 2).
--
-- Adds the fields the case scanner maintains, plus a small key/value table for
-- workspace-level bookkeeping such as the last scan time.
--
-- `ALTER TABLE ... ADD COLUMN` is not idempotent on its own; the migration
-- runner guarantees this file executes exactly once per database by comparing
-- `PRAGMA user_version`.

-- User-managed. The scanner must never change this.
ALTER TABLE cases ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal';

-- Filesystem-derived. Maintained by the scanner.
ALTER TABLE cases ADD COLUMN document_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN last_scanned_at TEXT;

-- Set to 1 once the user edits the name by hand, after which the scanner stops
-- deriving the name from the folder. Without this flag a rescan would undo
-- every manual rename.
ALTER TABLE cases ADD COLUMN name_is_custom INTEGER NOT NULL DEFAULT 0;

-- Milestone 1 defaulted `status` to 'Open'; the supported values are now
-- New / Active / Waiting / Completed. The column default is left as-is because
-- changing it would require rebuilding the table, and every insert supplies a
-- status explicitly.
UPDATE cases SET status = 'New' WHERE status = 'Open';

-- Workspace-level bookkeeping (last_scan_at, ...). Kept as key/value because
-- there is exactly one row per key and no querying beyond direct lookup.
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
