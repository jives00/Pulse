-- @delimiter $$
-- Migration 015: add completed flag to workout_logs
-- completed = 0 means in-progress; completed = 1 means finished and visible in history.

DROP PROCEDURE IF EXISTS _m015 $$
CREATE PROCEDURE _m015()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'completed'
  ) THEN
    ALTER TABLE workout_logs ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0;
    -- Mark all pre-existing workouts as completed so they remain visible in history.
    UPDATE workout_logs SET completed = 1;
  END IF;
END $$
CALL _m015() $$
DROP PROCEDURE IF EXISTS _m015 $$
