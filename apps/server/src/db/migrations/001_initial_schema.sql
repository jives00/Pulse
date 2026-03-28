-- FoodTracker initial schema
-- Run once against the food_tracker database

CREATE TABLE IF NOT EXISTS foods (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  barcode         VARCHAR(30)   NULL,
  name            VARCHAR(255)  NOT NULL,
  brand           VARCHAR(255)  NULL,
  source          ENUM('custom','open_food_facts','usda') NOT NULL DEFAULT 'custom',
  source_id       VARCHAR(100)  NULL,
  calories_per100 DECIMAL(8,2)  NOT NULL DEFAULT 0,
  carbs_per100    DECIMAL(8,2)  NOT NULL DEFAULT 0,
  protein_per100  DECIMAL(8,2)  NOT NULL DEFAULT 0,
  fat_per100      DECIMAL(8,2)  NOT NULL DEFAULT 0,
  fiber_per100    DECIMAL(8,2)  NULL,
  sodium_per100   DECIMAL(8,2)  NULL,
  is_custom       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_barcode   (barcode),
  INDEX idx_source_id (source, source_id),
  FULLTEXT INDEX ft_name_brand (name, brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS serving_sizes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  food_id    INT UNSIGNED NOT NULL,
  label      VARCHAR(100) NOT NULL,
  grams      DECIMAL(8,2) NOT NULL,
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
  INDEX idx_food_id (food_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_goals (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  calories       INT UNSIGNED NOT NULL DEFAULT 2000,
  carbs_g        INT UNSIGNED NOT NULL DEFAULT 250,
  protein_g      INT UNSIGNED NOT NULL DEFAULT 150,
  fat_g          INT UNSIGNED NOT NULL DEFAULT 65,
  fiber_g        INT UNSIGNED NULL,
  sodium_mg      INT UNSIGNED NULL,
  water_goal_ml  INT UNSIGNED NOT NULL DEFAULT 2000,
  effective_from DATE         NOT NULL DEFAULT (CURRENT_DATE),
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default goals so the app works on first launch
INSERT IGNORE INTO user_goals (id, calories, carbs_g, protein_g, fat_g, water_goal_ml, effective_from)
VALUES (1, 2000, 250, 150, 65, 2000, CURRENT_DATE);

CREATE TABLE IF NOT EXISTS food_log (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  log_date        DATE         NOT NULL,
  meal            ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  food_id         INT UNSIGNED NOT NULL,
  serving_size_id INT UNSIGNED NOT NULL,
  quantity        DECIMAL(8,2) NOT NULL DEFAULT 1.0,
  calories        DECIMAL(8,2) NOT NULL,
  carbs_g         DECIMAL(8,2) NOT NULL,
  protein_g       DECIMAL(8,2) NOT NULL,
  fat_g           DECIMAL(8,2) NOT NULL,
  fiber_g         DECIMAL(8,2) NULL,
  sodium_mg       DECIMAL(8,2) NULL,
  dram_recipe_id  INT UNSIGNED NULL,
  notes           VARCHAR(500) NULL,
  logged_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (food_id)         REFERENCES foods(id),
  FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id),
  INDEX idx_log_date  (log_date),
  INDEX idx_meal_date (log_date, meal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS barcode_cache (
  barcode    VARCHAR(30)  NOT NULL PRIMARY KEY,
  food_id    INT UNSIGNED NULL,
  fetched_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_templates (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_template_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id     INT UNSIGNED NOT NULL,
  food_id         INT UNSIGNED NOT NULL,
  serving_size_id INT UNSIGNED NOT NULL,
  quantity        DECIMAL(8,2) NOT NULL DEFAULT 1.0,
  sort_order      INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (template_id)     REFERENCES meal_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id)         REFERENCES foods(id),
  FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id),
  INDEX idx_template_id (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS water_log (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  log_date  DATE         NOT NULL,
  amount_ml INT UNSIGNED NOT NULL,
  logged_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_water_date (log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
