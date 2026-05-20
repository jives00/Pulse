-- Recurring nutrition targets (mirrors meal_schedules recurrence model)
CREATE TABLE IF NOT EXISTS nutrition_schedules (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED  NOT NULL,
  day_type_id      INT UNSIGNED  NULL,
  calories         INT UNSIGNED  NULL,
  protein_g        DECIMAL(6,1)  NULL,
  carbs_g          DECIMAL(6,1)  NULL,
  fat_g            DECIMAL(6,1)  NULL,
  water_goal_oz    DECIMAL(6,1)  NULL,
  recurrence_type  ENUM('once','daily','every_other_day','days_of_week','every_x_days','day_of_month') NOT NULL,
  recurrence_config JSON         NOT NULL,
  start_date       DATE          NOT NULL,
  end_date         DATE          NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)           ON DELETE CASCADE,
  FOREIGN KEY (day_type_id) REFERENCES day_type_presets(id) ON DELETE SET NULL,
  INDEX idx_user_start (user_id, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
