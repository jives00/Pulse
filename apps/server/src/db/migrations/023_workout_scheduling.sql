-- workout_schedules: one row per routine+recurrence pairing
CREATE TABLE IF NOT EXISTS workout_schedules (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  routine_id       INT UNSIGNED NULL,
  label            VARCHAR(100) NULL,
  is_rest_day      TINYINT(1)   NOT NULL DEFAULT 0,
  recurrence_type  ENUM('daily','every_other_day','days_of_week','every_x_days','day_of_month') NOT NULL,
  recurrence_config JSON        NOT NULL,
  start_date       DATE         NOT NULL,
  end_date         DATE         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)             ON DELETE CASCADE,
  FOREIGN KEY (routine_id) REFERENCES workout_routines(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- workout_schedule_log: explicit skip/rest overrides per date
CREATE TABLE IF NOT EXISTS workout_schedule_log (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schedule_id    INT UNSIGNED NOT NULL,
  scheduled_date DATE         NOT NULL,
  status         ENUM('completed','skipped','rest') NOT NULL,
  workout_log_id INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule_date (schedule_id, scheduled_date),
  FOREIGN KEY (schedule_id)    REFERENCES workout_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- program_templates: seeded pre-built schedule shapes (not user-created)
CREATE TABLE IF NOT EXISTS program_templates (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT         NULL,
  weeks       INT          NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS program_template_days (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED NOT NULL,
  day_offset  INT          NOT NULL,  -- 0=Mon ... 6=Sun
  slot_label  VARCHAR(50)  NULL,
  is_rest_day TINYINT(1)   NOT NULL DEFAULT 0,
  UNIQUE KEY uq_template_day_slot (template_id, day_offset, slot_label),
  FOREIGN KEY (template_id) REFERENCES program_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed program templates
INSERT INTO program_templates (id, name, description, weeks) VALUES
  (1, '3-Day Full Body',   'Three days per week — Mon, Wed, Fri.', 1),
  (2, '4-Day Upper/Lower', 'Four days per week — Upper on Mon/Thu, Lower on Tue/Fri.', 1),
  (3, '5-Day PPL',         'Five days — Mon Push, Tue Pull, Wed Legs, Fri Push, Sat Pull.', 1),
  (4, '6-Day PPL',         'Six days — Push Mon/Thu, Pull Tue/Fri, Legs Wed/Sat.', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO program_template_days (template_id, day_offset, slot_label, is_rest_day) VALUES
  -- 3-Day Full Body: Mon(0) / Wed(2) / Fri(4)
  (1, 0, 'Full Body', 0),
  (1, 2, 'Full Body', 0),
  (1, 4, 'Full Body', 0),
  -- 4-Day Upper/Lower: Mon(0)=Upper, Tue(1)=Lower, Thu(3)=Upper, Fri(4)=Lower
  (2, 0, 'Upper', 0),
  (2, 1, 'Lower', 0),
  (2, 3, 'Upper', 0),
  (2, 4, 'Lower', 0),
  -- 5-Day PPL: Mon(0)=Push, Tue(1)=Pull, Wed(2)=Legs, Fri(4)=Push, Sat(5)=Pull
  (3, 0, 'Push', 0),
  (3, 1, 'Pull', 0),
  (3, 2, 'Legs', 0),
  (3, 4, 'Push', 0),
  (3, 5, 'Pull', 0),
  -- 6-Day PPL: Mon(0)=Push, Tue(1)=Pull, Wed(2)=Legs, Thu(3)=Push, Fri(4)=Pull, Sat(5)=Legs
  (4, 0, 'Push', 0),
  (4, 1, 'Pull', 0),
  (4, 2, 'Legs', 0),
  (4, 3, 'Push', 0),
  (4, 4, 'Pull', 0),
  (4, 5, 'Legs', 0);
