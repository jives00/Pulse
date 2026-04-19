-- @delimiter $$
-- Migration 020: per-routine weekly goals table

DROP PROCEDURE IF EXISTS _m020 $$
CREATE PROCEDURE _m020()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'routine_goals'
  ) THEN
    CREATE TABLE routine_goals (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id        INT UNSIGNED NOT NULL,
      routine_id     INT UNSIGNED NOT NULL,
      target_per_week DECIMAL(10,2) NOT NULL,
      effective_from DATE NOT NULL,
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_rg_user    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT fk_rg_routine FOREIGN KEY (routine_id) REFERENCES workout_routines (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  END IF;
END $$
CALL _m020() $$
DROP PROCEDURE IF EXISTS _m020 $$
