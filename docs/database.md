# Database Schema

All tables are MySQL InnoDB, utf8mb4. User-scoped tables have `user_id INT UNSIGNED NOT NULL` with FK to `users.id`.

### Auth
| Table | Key columns |
|---|---|
| `users` | `id`, `username`, `password_hash`, `email`, `height_cm` DECIMAL(5,1) NULL, `sex` ENUM('male','female') NULL, `dob` DATE NULL, `activity_level` ENUM('sedentary','lightly_active','moderately_active','very_active') DEFAULT 'sedentary', `created_at` |
| `invite_tokens` | `id`, `token_hash`, `created_by`, `used_at`, `expires_at` |

### Recipes
| Table | Key columns |
|---|---|
| `recipes` | `id`, `user_id`, `type` (food/cocktail/prepackaged), `name`, `subcategory`, `photo_key`, `is_favorite`, `prep_time`, `cook_time`, `servings`, `calories`, `carbs_g`, `protein_g`, `fat_g` |
| `recipe_ingredients` | `recipe_id`, `ingredient_id`, `quantity`, `unit`, `sort_order` |
| `recipe_steps` | `recipe_id`, `step_number`, `instruction` |
| `recipe_log` | `id`, `recipe_id`, `user_id`, `made_at` |
| `ingredients` | `id`, `name`, `category` |
| `tags` | `id`, `name` (global, not user-scoped) |
| `recipe_tags` | `recipe_id`, `tag_id` |
| `tag_definitions` | `id`, `user_id`, `name`, `category` (ENUM: health/cuisine/category) — per-user predefined tag lists; seeded with defaults on first GET |
| `recipe_barcodes` | `barcode` VARCHAR(64) PK, `recipe_id` INT UNSIGNED (FK → recipes.id CASCADE), `created_at` — maps a barcode to a food-type recipe; one barcode per recipe |

### Nutrition
| Table | Key columns |
|---|---|
| `foods` | `id`, `name`, `brand`, `source` ENUM('custom','open_food_facts','usda','quick_log'), `calories_per100`, `carbs_per100`, `protein_per100`, `fat_per100`, `is_custom`, `recipe_id` INT NULL (FK → recipes.id, identifies shadow foods) |
| `serving_sizes` | `id`, `food_id`, `label`, `grams`, `is_default` |
| `food_log` | `id`, `user_id`, `log_date`, `meal` (breakfast/lunch/dinner/snack), `food_id`, `serving_size_id`, `quantity`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `dram_recipe_id` (nullable, links to recipes) |
| `user_goals` | `id`, `user_id`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `water_goal_oz`, `weekly_calories`, `weekly_protein_g`, `weekly_carbs_g`, `weekly_fat_g`, `weekly_water_goal_oz`, `effective_from` |
| `water_log` | `id`, `user_id`, `log_date`, `amount_oz` |
| `meal_templates` | `id`, `user_id`, `name` |
| `meal_template_items` | `id`, `template_id`, `food_id`, `serving_size_id`, `quantity`, `sort_order` |
| `barcode_cache` | `barcode`, `food_id`, `fetched_at` |

### Steps
| Table | Key columns |
|---|---|
| `steps_log` | `id`, `user_id`, `log_date` DATE, `steps` INT, `source` ENUM('manual','pedometer','health_connect') DEFAULT 'manual', `logged_at` — UNIQUE on `(user_id, log_date)` |

### Workouts
| Table | Key columns |
|---|---|
| `exercises` | `id`, `name`, `category`, `exercise_type` ENUM('weight','cardio','bodyweight','duration','resistance'), `muscles_primary` (JSON), `muscles_secondary` (JSON), `is_custom`, `instructions` TEXT NULL, `media_url`, `cover_image_url`, `muscle_image_url`, `notes` TEXT NULL, `tracked_fields` VARCHAR(100) DEFAULT 'reps,weight' |
| `workout_logs` | `id`, `user_id`, `workout_date`, `name`, `duration_minutes`, `calories_burned`, `started_at` TIMESTAMP NULL, `paused_at` TIMESTAMP NULL, `total_paused_seconds` INT DEFAULT 0, `routine_id` INT NULL (FK to workout_routines), `completed` TINYINT(1) DEFAULT 0 |
| `workout_routines` | `id`, `user_id`, `name`, `notes`, `cover_image_key`, `routine_type` ENUM('strength','bodyweight','cardio_distance','cardio_duration','steps') DEFAULT 'strength', `created_at`, `updated_at` |
| `routine_exercises` | `id`, `routine_id`, `exercise_id`, `sort_order`, `notes` |
| `routine_exercise_sets` | `id`, `routine_exercise_id`, `set_number`, `reps`, `weight_kg`, `additional_weight_kg` DECIMAL(6,2) NULL, `duration_seconds`, `distance_meters`, `steps` INT NULL |
| `routine_goals` | `id`, `routine_id` (FK to workout_routines), `user_id`, `target_per_week` INT, `effective_from` DATE — UNIQUE on `(routine_id, user_id)` |
| `workout_exercises` | `id`, `workout_log_id`, `exercise_id`, `sort_order`, `notes` TEXT NULL |
| `exercise_sets` | `id`, `workout_exercise_id`, `set_number`, `reps`, `weight_kg`, `additional_weight_kg` DECIMAL(6,2) NULL, `duration_seconds`, `distance_meters`, `steps` INT NULL |
| `exercise_goals` | `id`, `user_id`, `workouts_per_week`, `minutes_per_week`, `calories_per_week`, `volume_lbs_per_week`, `effective_from` |
| `body_measurements` | `id`, `user_id`, `metric` (weight/waist/bicep/…), `value` DECIMAL, `unit`, `measured_at` DATE, `notes` |
| `body_measurement_goals` | `id`, `user_id`, `metric`, `target_value`, `unit`, `target_date` DATE — UNIQUE on `(user_id, metric)` |

### Scheduling
| Table | Key columns |
|---|---|
| `workout_schedules` | `id`, `user_id`, `routine_id` INT NULL (FK), `exercise_id` INT NULL (FK), `label`, `is_rest_day` TINYINT(1), `recurrence_type` ENUM('daily','every_other_day','days_of_week','every_x_days','day_of_month','custom_cycle'), `recurrence_config` JSON, `start_date`, `end_date` NULL |
| `workout_schedule_log` | `id`, `schedule_id`, `scheduled_date`, `status` ENUM('completed','skipped','rest'), `workout_log_id` INT NULL — UNIQUE on `(schedule_id, scheduled_date)` |
| `meal_schedules` | `id`, `user_id`, `meal_slot` ENUM('breakfast','lunch','dinner','snack') NULL, `label`, `recurrence_type` ENUM('once','daily','every_other_day','days_of_week','every_x_days','day_of_month','custom_cycle'), `recurrence_config` JSON, `start_date`, `end_date` NULL |
| `nutrition_schedules` | `id`, `user_id`, `day_type_id` INT NULL (FK → day_type_presets), `calories`, `protein_g`, `carbs_g`, `fat_g`, `water_goal_oz`, `recurrence_type` ENUM (same as meal_schedules), `recurrence_config` JSON, `start_date`, `end_date` NULL |

### Meal Planning
| Table | Key columns |
|---|---|
| `meal_plan_entries` | `id`, `user_id`, `plan_date`, `meal` ENUM('breakfast','lunch','dinner','snack'), `food_id` INT NULL, `serving_size_id` INT NULL, `quantity`, `recipe_id` INT NULL, `recipe_servings`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `sort_order` |
| `meal_plan_templates` | `id`, `user_id`, `name` — named reusable week templates |
| `meal_plan_template_items` | `id`, `template_id`, `day_of_week` TINYINT (0=Mon, 6=Sun), `meal` ENUM, `food_id` INT NULL, `serving_size_id` INT NULL, `quantity`, `recipe_id` INT NULL, `recipe_servings`, macros, `sort_order` |

### Goals & Day Types
| Table | Key columns |
|---|---|
| `custom_goals` | `id`, `user_id`, `name`, `category` ENUM('body','nutrition','exercise'), `metric_type` ENUM(exercise_max_weight/exercise_weekly_volume/daily_steps_avg/body_measurement/nutrition_daily_avg/…), `source_type`, `source_id` INT NULL, `source_key`, `target_value`, `unit`, `target_date` DATE NULL, `sort_order` |
| `goal_checkpoints` | `id`, `user_id`, `metric`, `target_value`, `unit`, `target_date` DATE, `notes`, `created_at`, `updated_at` |
| `day_type_presets` | `id`, `user_id`, `name` VARCHAR(50) — named day types (e.g. "Rest Day", "Workout Day") with optional macro overrides: `calories`, `protein_g`, `carbs_g`, `fat_g`, `water_goal_oz` |
| `daily_nutrition_overrides` | `id`, `user_id`, `date` DATE, `day_type_id` INT NULL (FK → day_type_presets), macro columns — UNIQUE on `(user_id, date)` |

### Links
| Table | Key columns |
|---|---|
| `links` | `id`, `api_user_id`, `url`, `title`, `favicon_url`, `category` ENUM('food','drinks','nutrition','exercise','other') DEFAULT 'other', `created_at` |
