-- @delimiter $$
-- Migration 007: workout routines, plus started_at and routine_id on workout_logs

CREATE TABLE IF NOT EXISTS workout_routines (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  name            VARCHAR(255) NOT NULL,
  notes           TEXT         NULL,
  cover_image_key VARCHAR(500) NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci $$

CREATE TABLE IF NOT EXISTS routine_exercises (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  routine_id  INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NOT NULL,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  notes       TEXT         NULL,
  FOREIGN KEY (routine_id)  REFERENCES workout_routines(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id),
  INDEX idx_routine (routine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci $$

CREATE TABLE IF NOT EXISTS routine_exercise_sets (
  id                   INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  routine_exercise_id  INT UNSIGNED  NOT NULL,
  set_number           INT UNSIGNED  NOT NULL,
  reps                 INT UNSIGNED  NULL,
  weight_kg            DECIMAL(6,2)  NULL,
  duration_seconds     INT UNSIGNED  NULL,
  distance_meters      DECIMAL(10,2) NULL,
  FOREIGN KEY (routine_exercise_id) REFERENCES routine_exercises(id) ON DELETE CASCADE,
  INDEX idx_routine_exercise (routine_exercise_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci $$

DROP PROCEDURE IF EXISTS _m007 $$
CREATE PROCEDURE _m007()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'started_at'
  ) THEN
    ALTER TABLE workout_logs ADD COLUMN started_at TIMESTAMP NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workout_logs' AND COLUMN_NAME = 'routine_id'
  ) THEN
    ALTER TABLE workout_logs ADD COLUMN routine_id INT NULL;
  END IF;
END $$
CALL _m007() $$
DROP PROCEDURE IF EXISTS _m007 $$
