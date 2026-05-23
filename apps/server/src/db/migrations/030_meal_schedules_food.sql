-- @delimiter $$

DROP PROCEDURE IF EXISTS _add_meal_schedule_food_cols$$

CREATE PROCEDURE _add_meal_schedule_food_cols()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'meal_schedules'
      AND column_name  = 'food_id'
  ) THEN
    ALTER TABLE meal_schedules
      ADD COLUMN food_id         INT UNSIGNED  NULL,
      ADD COLUMN serving_size_id INT UNSIGNED  NULL,
      ADD COLUMN quantity        DECIMAL(6,2)  NULL,
      ADD COLUMN recipe_id       INT UNSIGNED  NULL,
      ADD COLUMN recipe_servings DECIMAL(6,2)  NULL,
      ADD COLUMN calories        DECIMAL(8,2)  NULL,
      ADD COLUMN protein_g       DECIMAL(8,2)  NULL,
      ADD COLUMN carbs_g         DECIMAL(8,2)  NULL,
      ADD COLUMN fat_g           DECIMAL(8,2)  NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.key_column_usage
    WHERE table_schema    = DATABASE()
      AND table_name      = 'meal_schedules'
      AND referenced_table_name = 'foods'
  ) THEN
    ALTER TABLE meal_schedules
      ADD CONSTRAINT fk_ms_food         FOREIGN KEY (food_id)         REFERENCES foods(id)          ON DELETE SET NULL,
      ADD CONSTRAINT fk_ms_serving_size FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id)  ON DELETE SET NULL,
      ADD CONSTRAINT fk_ms_recipe       FOREIGN KEY (recipe_id)       REFERENCES recipes(id)        ON DELETE SET NULL;
  END IF;
END$$

CALL _add_meal_schedule_food_cols()$$

DROP PROCEDURE IF EXISTS _add_meal_schedule_food_cols$$
