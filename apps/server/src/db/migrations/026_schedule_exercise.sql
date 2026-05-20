ALTER TABLE workout_schedules
  ADD COLUMN exercise_id INT UNSIGNED NULL AFTER routine_id,
  ADD CONSTRAINT fk_ws_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
