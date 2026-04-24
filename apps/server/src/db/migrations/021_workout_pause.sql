-- @delimiter $$
-- Migration 021: workout timer pause/resume support

DROP PROCEDURE IF EXISTS _m021 $$
CREATE PROCEDURE _m021()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'paused_at'
  ) THEN
    ALTER TABLE workout_logs
      ADD COLUMN paused_at TIMESTAMP NULL DEFAULT NULL,
      ADD COLUMN total_paused_seconds INT NOT NULL DEFAULT 0;
  END IF;
END $$
CALL _m021() $$
DROP PROCEDURE IF EXISTS _m021 $$
