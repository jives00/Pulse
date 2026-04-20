# Database Schema

All tables are MySQL InnoDB, utf8mb4. User-scoped tables have `user_id INT UNSIGNED NOT NULL` with FK to `users.id`.

### Auth
| Table | Key columns |
|---|---|
| `users` | `id`, `username`, `password_hash`, `email`, `created_at` |
| `invite_tokens` | `id`, `token_hash`, `created_by`, `used_at`, `expires_at` |

### Recipes
| Table | Key columns |
|---|---|
| `recipes` | `id`, `user_id`, `type` (food/cocktail/prepackaged), `name`, `subcategorry`, `photo_key`, `is_favorite`, `prep_time`, `cook_time`, `servings`, `calories`, `carbs_g`, `protein_g`, `fat_g` |
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
| `foods` | `id`, `name`, `brand`, `source` (custom/open_food_facts/usda), `calories_per100`, `carbs_per100`, `protein_per100`, `fat_per100`, `is_custom`, `recipe_id` INT NULL (FK → recipes.id, identifies shadow foods) |
| `serving_sizes` | `id`, `food_id`, `label`, `grams`, `is_default` |
| `food_log` | `id`, `user_id`, `log_date`, `meal` (breakfast/lunch/dinner/snack), `food_id`, `serving_size_id`, `quantity`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `dram_recipe_id` (nullable, links to recipes) |
| `user_goals` | `id`, `user_id`, `calories`, `carbs_g`, `protein_g`, `fat_g`, `water_goal_oz`, `effective_from` |
| `water_log` | `id`, `user_id`, `log_date`, `amount_oz` |
| `meal_templates` | `id`, `user_id`, `name` |
| `meal_template_items` | `id`, `template_id`, `food_id`, `serving_size_id`, `quantity`, `sort_order` |
| `barcode_cache` | `barcode`, `food_id`, `fetched_at` |

### Workouts
| Table | Key	| Key columns |
|---|---|---|
| `exercises` | `id`, `name`, `category`, `exercise_type` (weight/cardio/bodyweight/duration), `muscles_primary` (JSON), `muscles_secondary` (JSON), `is_custom`, `instructions` TEXT NULL, `media_url` VARCHAR(500) NULL, `cover_image_url` VARCHAR(500) NULL, `muscle_image_url` VARCHAR(500) NULL, `notes` TEXT NULL, `tracked_fields` VARCHAR(100) DEFAULT 'reps,weight' (comma-separated: reps/weight/duration/distance/steps) |
| `workout_logs` | `id`, `user_id`, `workout_date`, `name`, `duration_minutes`, `calories_burned`, `started_at` TIMESTAMP NULL, `routine_id` INT NULL (FK to workout_routines), `completed` TINYINT(1) DEFAULT 0 |
| `workout_routines` | `id`, `user_id`, `name`, `notes`, `cover_image_key` VARCHAR(500) NULL, `routine_type` ENUM('strength','bodyweight','cardio_distance','cardio_duration','steps') DEFAULT 'strength', `created_at`, `updated_at` |
| `routine_exercises` | `id`, `routine_id`, `exercise_id`, `sort_order`, `notes` |
| `routine_exercise_sets` | `id`, `routine_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters`, `steps` INT NULL |
| `routine_goals` | `id`, `routine_id` (FK to workout_routines), `user_id`, `target_per_week` INT, `effective_from` DATE — UNIQUE on `(routine_id, user_id)` |
| `workout_exercises` | `id`, `workout_log_id`, `exercise_id`, `sort_order`, `notes` TEXT NULL |
| `exercise_sets` | `id`, `workout_exercise_id`, `set_number`, `reps`, `weight_kg`, `duration_seconds`, `distance_meters`, `steps` INT NULL |
| `exercise_goals` | `	id`, `user_id`, `workouts_per_week`, `minutes_per_week`, `calories_per_week`, `volume_lbs_per_week`, `effective_from` |
| `body_measurements` | `id`, `user_id`, `metric` (weight/waist/bicep/…), `value` DECIMAL, `unit`, `measured_at` DATE, `notes` |
| `body_measurement_goals` | `id`, `user_id`, `metric`, `target_value`, `unit`, `target_date` DATE — UNIQUE on `(user_id, metric)` |

### Links
| Table | Key columns |
|---|---|
| `links` | `id`, `api_user_id`, `url`, `title`, `favicon_url`, `category` ENUM('food','drinks','nutrition','exercise','other') DEFAULT 'other', `created_at` |
