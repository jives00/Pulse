-- Pulse initial schema
-- Creates all tables for the unified app.
-- Migration strategy for existing data:
--   1. Run this migration (creates schema with user_id DEFAULT 1)
--   2. Import dram + food_tracker tables into pulse db
--   3. INSERT INTO users ... (admin user with id=1)
--   4. All imported rows automatically get user_id=1 via DEFAULT
-- Phase 2 will remove the DEFAULT after multi-user auth is live.

-- ─────────────────────────────────────────────────────────────
-- Auth / Users (Phase 2 — created now, populated in Phase 2)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invite_tokens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash    VARCHAR(255) NOT NULL UNIQUE,
  created_by    INT UNSIGNED NOT NULL,
  used_at       TIMESTAMP    NULL,
  expires_at    TIMESTAMP    NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- Recipe tables (from Dram) — with user_id
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recipes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL DEFAULT 1,
  type        VARCHAR(20)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  notes       TEXT         NULL,
  source      VARCHAR(500) NULL,
  photo_key   VARCHAR(500) NULL,
  is_favorite TINYINT(1)   NOT NULL DEFAULT 0,
  prep_time   INT UNSIGNED NULL,
  cook_time   INT UNSIGNED NULL,
  servings    INT UNSIGNED NULL,
  subcategory VARCHAR(255) NULL,
  glass_type  VARCHAR(100) NULL,
  abv_level   VARCHAR(10)  NULL,
  calories    INT UNSIGNED NULL,
  carbs_g     DECIMAL(8,2) NULL,
  protein_g   DECIMAL(8,2) NULL,
  fat_g       DECIMAL(8,2) NULL,
  fiber_g     DECIMAL(8,2) NULL,
  sodium_mg   INT UNSIGNED NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_type (type),
  FULLTEXT INDEX ft_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_log (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipe_id INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL DEFAULT 1,
  made_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  INDEX idx_recipe_id (recipe_id),
  INDEX idx_user_date (user_id, made_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingredients (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(50)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id     INT UNSIGNED  NOT NULL,
  ingredient_id INT UNSIGNED  NOT NULL,
  quantity      DECIMAL(10,3) NULL,
  unit          VARCHAR(50)   NULL,
  sort_order    INT UNSIGNED  NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, ingredient_id),
  FOREIGN KEY (recipe_id)     REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_steps (
  recipe_id   INT UNSIGNED NOT NULL,
  step_number INT UNSIGNED NOT NULL,
  instruction TEXT         NOT NULL,
  PRIMARY KEY (recipe_id, step_number),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INT UNSIGNED NOT NULL,
  tag_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)    REFERENCES tags(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS links (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL DEFAULT 1,
  url         VARCHAR(2048) NOT NULL,
  title       VARCHAR(255)  NULL,
  favicon_url VARCHAR(500)  NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- Nutrition tables (from FoodTracker) — with user_id
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS foods (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  barcode         VARCHAR(30)  NULL,
  name            VARCHAR(255) NOT NULL,
  brand           VARCHAR(255) NULL,
  source          ENUM('custom','open_food_facts','usda') NOT NULL DEFAULT 'custom',
  source_id       VARCHAR(100) NULL,
  calories_per100 DECIMAL(8,2) NOT NULL DEFAULT 0,
  carbs_per100    DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per100  DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat_per100      DECIMAL(8,2) NOT NULL DEFAULT 0,
  fiber_per100    DECIMAL(8,2) NULL,
  sodium_per100   DECIMAL(8,2) NULL,
  is_custom       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_barcode    (barcode),
  INDEX idx_source_id  (source, source_id),
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
  user_id        INT UNSIGNED NOT NULL DEFAULT 1,
  calories       INT UNSIGNED NOT NULL DEFAULT 2000,
  carbs_g        INT UNSIGNED NOT NULL DEFAULT 250,
  protein_g      INT UNSIGNED NOT NULL DEFAULT 150,
  fat_g          INT UNSIGNED NOT NULL DEFAULT 65,
  fiber_g        INT UNSIGNED NULL,
  sodium_mg      INT UNSIGNED NULL,
  water_goal_ml  INT UNSIGNED NOT NULL DEFAULT 2000,
  effective_from DATE         NOT NULL DEFAULT (CURRENT_DATE),
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default goals for user 1
INSERT IGNORE INTO user_goals (id, user_id, calories, carbs_g, protein_g, fat_g, water_goal_ml, effective_from)
VALUES (1, 1, 2000, 250, 150, 65, 2000, CURRENT_DATE);

CREATE TABLE IF NOT EXISTS food_log (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL DEFAULT 1,
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
  recipe_id       INT UNSIGNED NULL,
  notes           VARCHAR(500) NULL,
  logged_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (food_id)         REFERENCES foods(id),
  FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id),
  FOREIGN KEY (recipe_id)       REFERENCES recipes(id) ON DELETE SET NULL,
  INDEX idx_user_date  (user_id, log_date),
  INDEX idx_meal_date  (log_date, meal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS barcode_cache (
  barcode    VARCHAR(30)  NOT NULL PRIMARY KEY,
  food_id    INT UNSIGNED NULL,
  fetched_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meal_templates (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL DEFAULT 1,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
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
  user_id   INT UNSIGNED NOT NULL DEFAULT 1,
  log_date  DATE         NOT NULL,
  amount_ml INT UNSIGNED NOT NULL,
  logged_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_date (user_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- Workout tables (Phase 3 — created now, populated in Phase 3)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exercises (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  category         VARCHAR(100) NOT NULL,
  exercise_type    ENUM('weight','cardio','bodyweight','duration') NOT NULL DEFAULT 'weight',
  muscles_primary  JSON         NULL,
  muscles_secondary JSON        NULL,
  is_custom        TINYINT(1)   NOT NULL DEFAULT 0,
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workout_logs (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL DEFAULT 1,
  workout_date     DATE         NOT NULL,
  name             VARCHAR(255) NULL,
  notes            TEXT         NULL,
  duration_minutes INT UNSIGNED NULL,
  calories_burned  INT UNSIGNED NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_date (user_id, workout_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workout_exercises (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workout_log_id INT UNSIGNED NOT NULL,
  exercise_id    INT UNSIGNED NOT NULL,
  sort_order     INT UNSIGNED NOT NULL DEFAULT 0,
  notes          TEXT         NULL,
  FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id)    REFERENCES exercises(id),
  INDEX idx_workout (workout_log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exercise_sets (
  id                  INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  workout_exercise_id INT UNSIGNED  NOT NULL,
  set_number          INT UNSIGNED  NOT NULL,
  reps                INT UNSIGNED  NULL,
  weight_kg           DECIMAL(6,2)  NULL,
  duration_seconds    INT UNSIGNED  NULL,
  distance_meters     DECIMAL(10,2) NULL,
  completed           TINYINT(1)    NOT NULL DEFAULT 1,
  FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE,
  INDEX idx_workout_exercise (workout_exercise_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exercise_goals (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            INT UNSIGNED NOT NULL DEFAULT 1,
  workouts_per_week  INT UNSIGNED NULL,
  minutes_per_week   INT UNSIGNED NULL,
  calories_per_week  INT UNSIGNED NULL,
  effective_from     DATE         NOT NULL DEFAULT (CURRENT_DATE),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
