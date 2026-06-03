-- Goals overhaul: unified goals table + milestones + progress log
-- Replaces: custom_goals, body_measurement_goals, exercise_goals, routine_goals (data migrated separately)
-- Leaves intact: user_goals (operational nutrition targets), goal_checkpoints (migrated separately)

CREATE TABLE IF NOT EXISTS goals (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  catalog_key           VARCHAR(60) NOT NULL,
  name                  VARCHAR(120) NOT NULL,
  category              ENUM('body','nutrition','exercise','activity') NOT NULL,
  card_type             ENUM('line_chart','progress_bar') NOT NULL,
  source_type           VARCHAR(30) DEFAULT NULL,
  source_id             INT DEFAULT NULL,
  source_name           VARCHAR(120) DEFAULT NULL,
  start_value           DECIMAL(10,3) DEFAULT NULL,
  target_value          DECIMAL(10,3) NOT NULL,
  unit                  VARCHAR(20) NOT NULL,
  started_at            DATE NOT NULL,
  deadline              DATE DEFAULT NULL,
  show_on_dashboard     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order            INT NOT NULL DEFAULT 0,
  status                ENUM('active','achieved','missed','abandoned') NOT NULL DEFAULT 'active',
  closed_at             DATETIME DEFAULT NULL,
  actual_value_at_close DECIMAL(10,3) DEFAULT NULL,
  notes                 TEXT DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_status   (user_id, status),
  INDEX idx_user_category (user_id, category)
);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  goal_id               INT NOT NULL,
  user_id               INT NOT NULL,
  target_value          DECIMAL(10,3) NOT NULL,
  target_date           DATE NOT NULL,
  label                 VARCHAR(120) DEFAULT NULL,
  status                ENUM('active','achieved','missed') NOT NULL DEFAULT 'active',
  closed_at             DATETIME DEFAULT NULL,
  actual_value_at_close DECIMAL(10,3) DEFAULT NULL,
  notes                 TEXT DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_milestone_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  INDEX idx_goal_date (goal_id, target_date)
);

CREATE TABLE IF NOT EXISTS goal_progress (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  goal_id    INT NOT NULL,
  user_id    INT NOT NULL,
  value      DECIMAL(10,3) NOT NULL,
  logged_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source     ENUM('manual','auto') NOT NULL DEFAULT 'manual',
  notes      TEXT DEFAULT NULL,
  CONSTRAINT fk_progress_goal FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  INDEX idx_goal_date (goal_id, logged_at)
);
