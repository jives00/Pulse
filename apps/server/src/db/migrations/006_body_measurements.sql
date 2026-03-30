-- Body measurements tracking + goals, plus volume goal for exercise_goals

-- ─── Body measurements ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_measurements (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED  NOT NULL,
  measured_at  DATE          NOT NULL,
  metric       VARCHAR(50)   NOT NULL,
  value        DECIMAL(8,2)  NOT NULL,
  unit         VARCHAR(10)   NOT NULL,
  notes        TEXT          NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_metric_date (user_id, metric, measured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Body measurement goals ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_measurement_goals (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED  NOT NULL,
  metric        VARCHAR(50)   NOT NULL,
  target_value  DECIMAL(8,2)  NOT NULL,
  unit          VARCHAR(10)   NOT NULL,
  target_date   DATE          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_metric (user_id, metric),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Volume goal on exercise_goals ───────────────────────────────────────────
-- Handled idempotently in migrate.ts post-migration hook (ALTER TABLE IF NOT EXISTS
-- is not supported in older MySQL versions).
