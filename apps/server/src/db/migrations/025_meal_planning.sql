-- Planned meals for specific dates
CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  plan_date        DATE NOT NULL,
  meal             ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  food_id          INT UNSIGNED NULL,
  serving_size_id  INT UNSIGNED NULL,
  quantity         DECIMAL(8,2) NULL,
  recipe_id        INT UNSIGNED NULL,
  recipe_servings  DECIMAL(8,2) NULL,
  calories         DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_g        DECIMAL(8,2) NOT NULL DEFAULT 0,
  carbs_g          DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat_g            DECIMAL(8,2) NOT NULL DEFAULT 0,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)         REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id)         REFERENCES foods(id) ON DELETE SET NULL,
  FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id) ON DELETE SET NULL,
  FOREIGN KEY (recipe_id)       REFERENCES recipes(id) ON DELETE SET NULL,
  INDEX idx_user_date (user_id, plan_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Named template weeks (reusable)
CREATE TABLE IF NOT EXISTS meal_plan_templates (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Items within a template (day_of_week: 0=Mon, 6=Sun)
CREATE TABLE IF NOT EXISTS meal_plan_template_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id     INT UNSIGNED NOT NULL,
  day_of_week     TINYINT UNSIGNED NOT NULL,
  meal            ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  food_id         INT UNSIGNED NULL,
  serving_size_id INT UNSIGNED NULL,
  quantity        DECIMAL(8,2) NULL,
  recipe_id       INT UNSIGNED NULL,
  recipe_servings DECIMAL(8,2) NULL,
  calories        DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_g       DECIMAL(8,2) NOT NULL DEFAULT 0,
  carbs_g         DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat_g           DECIMAL(8,2) NOT NULL DEFAULT 0,
  sort_order      INT NOT NULL DEFAULT 0,
  FOREIGN KEY (template_id)     REFERENCES meal_plan_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id)         REFERENCES foods(id) ON DELETE SET NULL,
  FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id) ON DELETE SET NULL,
  FOREIGN KEY (recipe_id)       REFERENCES recipes(id) ON DELETE SET NULL,
  INDEX idx_template_day (template_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
