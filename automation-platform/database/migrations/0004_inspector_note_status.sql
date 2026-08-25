-- Migration 0004 — Developer Inspector note status.
--
-- Adds a workflow status to each inspector note so the Developer Work Manager
-- can place cards on a Kanban board. New notes default to `Backlog`.

ALTER TABLE inspector_notes ADD COLUMN status TEXT NOT NULL DEFAULT 'Backlog';
