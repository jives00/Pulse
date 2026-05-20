CREATE TABLE IF NOT EXISTS goal_checkpoints (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED  NOT NULL,
  metric       VARCHAR(50)   NOT NULL,
  target_value DECIMAL(10,2) NOT NULL,
  unit         VARCHAR(20)   NOT NULL,
  target_date  DATE          NOT NULL,
  notes        TEXT          NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_metric (user_id, metric),
  INDEX idx_user_date   (user_id, target_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
