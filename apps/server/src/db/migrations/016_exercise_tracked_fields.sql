-- @delimiter $$
-- Migration 016: replace track_weight with tracked_fields
-- tracked_fields is a comma-separated list of: reps, weight, duration, distance

DROP PROCEDURE IF EXISTS _m016 $$
CREATE PROCEDURE _m016()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'tracked_fields'
  ) THEN
    ALTER TABLE exercises ADD COLUMN tracked_fields VARCHAR(100) NOT NULL DEFAULT 'reps,weight';
    UPDATE exercises SET tracked_fields = CASE
      WHEN exercise_type = 'cardio'     THEN 'duration,distance'
      WHEN exercise_type = 'duration'   THEN 'duration'
      WHEN exercise_type = 'bodyweight' THEN 'reps'
      ELSE 'reps,weight'
    END;
    -- Honour existing track_weight = 0 overrides (weight was explicitly disabled)
    UPDATE exercises
    SET tracked_fields = REPLACE(REPLACE(tracked_fields, ',weight', ''), 'weight,', '')
    WHERE track_weight = 0 AND tracked_fields LIKE '%weight%';
  END IF;
END $$
CALL _m016() $$
DROP PROCEDURE IF EXISTS _m016 $$
