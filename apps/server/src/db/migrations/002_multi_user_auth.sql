-- Phase 2: Drop DEFAULT 1 from user_id columns now that admin user is seeded.
-- Running this again after it's already applied is safe (no-op in MySQL).

ALTER TABLE recipes       MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE recipe_log    MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE links         MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE user_goals    MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE food_log      MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE meal_templates MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE water_log     MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE workout_logs  MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
ALTER TABLE exercise_goals MODIFY COLUMN user_id INT UNSIGNED NOT NULL;
