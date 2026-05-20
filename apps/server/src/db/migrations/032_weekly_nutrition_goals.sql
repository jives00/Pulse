ALTER TABLE user_goals
  ADD COLUMN weekly_calories   INT UNSIGNED  NULL AFTER water_goal_oz,
  ADD COLUMN weekly_protein_g  DECIMAL(8,2)  NULL AFTER weekly_calories,
  ADD COLUMN weekly_carbs_g    DECIMAL(8,2)  NULL AFTER weekly_protein_g,
  ADD COLUMN weekly_fat_g      DECIMAL(8,2)  NULL AFTER weekly_carbs_g,
  ADD COLUMN weekly_water_goal_oz DECIMAL(8,2) NULL AFTER weekly_fat_g;
