-- Recurring meal schedule entries (label-based, recurrence mirrors workout_schedules)
CREATE TABLE IF NOT EXISTS meal_schedules (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  meal_slot        ENUM('breakfast','lunch','dinner','snack') NULL,
  label            VARCHAR(100) NOT NULL,
  recurrence_type  ENUM('once','daily','every_other_day','days_of_week','every_x_days','day_of_month') NOT NULL,
  recurrence_config JSON        NOT NULL,
  start_date       DATE         NOT NULL,
  end_date         DATE         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_start (user_id, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
