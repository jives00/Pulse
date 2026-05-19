CREATE TABLE IF NOT EXISTS steps_log (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  log_date   DATE NOT NULL,
  steps      INT NOT NULL,
  source     ENUM('manual', 'pedometer') NOT NULL DEFAULT 'manual',
  logged_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_date (user_id, log_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
