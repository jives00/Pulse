-- @delimiter $$
-- Migration 018: add routine_type to workout_routines

DROP PROCEDURE IF EXISTS _m018 $$
CREATE PROCEDURE _m018()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_routines' AND COLUMN_NAME = 'routine_type'
  ) THEN
    ALTER TABLE workout_routines
      ADD COLUMN routine_type ENUM('strength','cardio_distance','cardio_duration','steps','bodyweight')
      NOT NULL DEFAULT 'strength';
  END IF;
END $$
CALL _m018() $$
DROP PROCEDURE IF EXISTS _m018 $$
