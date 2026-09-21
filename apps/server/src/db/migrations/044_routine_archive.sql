-- @delimiter $$
-- Migration 044: archive workout routines
-- `archived_at` NULL = active. Archived routines are hidden from the routine
-- lists/pickers but keep their workout_logs, so history, stats and exports are
-- unaffected.

DROP PROCEDURE IF EXISTS _m044 $$
CREATE PROCEDURE _m044()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_routines' AND COLUMN_NAME = 'archived_at'
  ) THEN
    ALTER TABLE workout_routines ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL;
  END IF;
END $$
CALL _m044() $$
DROP PROCEDURE IF EXISTS _m044 $$
