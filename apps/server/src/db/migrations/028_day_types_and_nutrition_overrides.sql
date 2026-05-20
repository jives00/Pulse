-- Day type presets (e.g. "Rest Day", "Workout Day") with nutrition targets
CREATE TABLE IF NOT EXISTS day_type_presets (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED  NOT NULL,
  name           VARCHAR(50)   NOT NULL,
  calories       INT UNSIGNED  NULL,
  protein_g      DECIMAL(6,1)  NULL,
  carbs_g        DECIMAL(6,1)  NULL,
  fat_g          DECIMAL(6,1)  NULL,
  water_goal_oz  DECIMAL(6,1)  NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-day nutrition overrides (explicit date overrides, optionally linked to a day type preset)
CREATE TABLE IF NOT EXISTS daily_nutrition_overrides (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED  NOT NULL,
  date           DATE          NOT NULL,
  day_type_id    INT UNSIGNED  NULL,
  calories       INT UNSIGNED  NULL,
  protein_g      DECIMAL(6,1)  NULL,
  carbs_g        DECIMAL(6,1)  NULL,
  fat_g          DECIMAL(6,1)  NULL,
  water_goal_oz  DECIMAL(6,1)  NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_date (user_id, date),
  FOREIGN KEY (user_id)     REFERENCES users(id)           ON DELETE CASCADE,
  FOREIGN KEY (day_type_id) REFERENCES day_type_presets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
