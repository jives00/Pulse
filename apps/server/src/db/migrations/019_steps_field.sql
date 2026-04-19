-- @delimiter $$
-- Migration 019: add steps column to exercise_sets and routine_exercise_sets
-- steps stores a step count (e.g. stair climbs) as an integer, distinct from distance_meters

DROP PROCEDURE IF EXISTS _m019 $$
CREATE PROCEDURE _m019()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercise_sets' AND COLUMN_NAME = 'steps'
  ) THEN
    ALTER TABLE exercise_sets ADD COLUMN steps INT NULL;
    -- Backfill steps from distance_meters for stair exercises (name-based, one-time only)
    UPDATE exercise_sets es
    JOIN workout_exercises we ON we.id = es.workout_exercise_id
    JOIN exercises e ON e.id = we.exercise_id
    SET es.steps = ROUND(es.distance_meters)
    WHERE e.name LIKE '%stair%' AND es.distance_meters IS NOT NULL;
    -- Clear distance_meters for those same sets so no double-counting
    UPDATE exercise_sets es
    JOIN workout_exercises we ON we.id = es.workout_exercise_id
    JOIN exercises e ON e.id = we.exercise_id
    SET es.distance_meters = NULL
    WHERE e.name LIKE '%stair%' AND es.steps IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routine_exercise_sets' AND COLUMN_NAME = 'steps'
  ) THEN
    ALTER TABLE routine_exercise_sets ADD COLUMN steps INT NULL;
    -- Backfill template sets too
    UPDATE routine_exercise_sets res
    JOIN routine_exercises re ON re.id = res.routine_exercise_id
    JOIN exercises e ON e.id = re.exercise_id
    SET res.steps = ROUND(res.distance_meters)
    WHERE e.name LIKE '%stair%' AND res.distance_meters IS NOT NULL;
    UPDATE routine_exercise_sets res
    JOIN routine_exercises re ON re.id = res.routine_exercise_id
    JOIN exercises e ON e.id = re.exercise_id
    SET res.distance_meters = NULL
    WHERE e.name LIKE '%stair%' AND res.steps IS NOT NULL;
  END IF;

  -- Update tracked_fields for stair exercises from 'duration,distance' to 'duration,steps'
  UPDATE exercises
  SET tracked_fields = 'duration,steps'
  WHERE name LIKE '%stair%' AND tracked_fields = 'duration,distance';
END $$
CALL _m019() $$
DROP PROCEDURE IF EXISTS _m019 $$
