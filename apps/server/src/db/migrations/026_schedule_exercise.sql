-- @delimiter $$

DROP PROCEDURE IF EXISTS _add_exercise_id_to_schedules$$

CREATE PROCEDURE _add_exercise_id_to_schedules()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'workout_schedules'
      AND column_name  = 'exercise_id'
  ) THEN
    ALTER TABLE workout_schedules
      ADD COLUMN exercise_id INT UNSIGNED NULL AFTER routine_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.key_column_usage
    WHERE table_schema    = DATABASE()
      AND table_name      = 'workout_schedules'
      AND constraint_name = 'fk_ws_exercise'
  ) THEN
    ALTER TABLE workout_schedules
      ADD CONSTRAINT fk_ws_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
  END IF;
END$$

CALL _add_exercise_id_to_schedules()$$

DROP PROCEDURE IF EXISTS _add_exercise_id_to_schedules$$
