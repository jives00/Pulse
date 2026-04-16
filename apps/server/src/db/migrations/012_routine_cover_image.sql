-- @delimiter $$
-- Migration 012: add cover_image_key to workout_routines
-- Note: workout_routines was created in 007 already including this column.
-- This migration is a no-op on fresh installs; it exists to apply the column
-- on databases that had 007 applied before cover_image_key was added.

DROP PROCEDURE IF EXISTS _m012 $$
CREATE PROCEDURE _m012()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_routines' AND COLUMN_NAME = 'cover_image_key'
  ) THEN
    ALTER TABLE workout_routines ADD COLUMN cover_image_key VARCHAR(500) NULL;
  END IF;
END $$
CALL _m012() $$
DROP PROCEDURE IF EXISTS _m012 $$
