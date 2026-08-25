-- Migration 0007 — rework the case status vocabulary.
--
-- The old statuses (New / Active / Waiting / Completed) are replaced with a
-- richer workflow set. Existing rows are mapped onto the closest new status so
-- nothing is left with a value the application no longer recognises.

UPDATE cases SET status = 'Initiated' WHERE status = 'New';
UPDATE cases SET status = 'Ready'     WHERE status = 'Active';
UPDATE cases SET status = 'Need Info' WHERE status = 'Waiting';
