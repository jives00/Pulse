-- Add dram_recipe_id to food_log to link a logged food entry back to a recipe.
-- This column was added manually via ALTER TABLE on the production DB on 2026-03-29.
-- Running this migration is safe (IF NOT EXISTS guard via COLUMN_NAME check isn't
-- supported in plain SQL, so we use a conditional approach via stored procedure).

ALTER TABLE food_log
  ADD COLUMN IF NOT EXISTS dram_recipe_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_food_log_recipe
    FOREIGN KEY IF NOT EXISTS (dram_recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
