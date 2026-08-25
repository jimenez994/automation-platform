-- Migration 0006 — work-item origin, type, priority and title.

ALTER TABLE inspector_notes ADD COLUMN origin   TEXT NOT NULL DEFAULT 'App';
ALTER TABLE inspector_notes ADD COLUMN type     TEXT;
ALTER TABLE inspector_notes ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal';
ALTER TABLE inspector_notes ADD COLUMN title    TEXT;
