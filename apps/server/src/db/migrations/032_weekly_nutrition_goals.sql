-- @delimiter $$

DROP PROCEDURE IF EXISTS _add_weekly_nutrition_goal_cols$$

CREATE PROCEDURE _add_weekly_nutrition_goal_cols()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'user_goals'
      AND column_name  = 'weekly_calories'
  ) THEN
    ALTER TABLE user_goals
      ADD COLUMN weekly_calories      INT UNSIGNED  NULL AFTER water_goal_oz,
      ADD COLUMN weekly_protein_g     DECIMAL(8,2)  NULL AFTER weekly_calories,
      ADD COLUMN weekly_carbs_g       DECIMAL(8,2)  NULL AFTER weekly_protein_g,
      ADD COLUMN weekly_fat_g         DECIMAL(8,2)  NULL AFTER weekly_carbs_g,
      ADD COLUMN weekly_water_goal_oz DECIMAL(8,2)  NULL AFTER weekly_fat_g;
  END IF;
END$$

CALL _add_weekly_nutrition_goal_cols()$$

DROP PROCEDURE IF EXISTS _add_weekly_nutrition_goal_cols$$
