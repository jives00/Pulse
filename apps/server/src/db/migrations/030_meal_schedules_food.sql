-- Add food/recipe fields to meal_schedules for macro tracking
ALTER TABLE meal_schedules ADD COLUMN (
  food_id           INT UNSIGNED NULL,
  serving_size_id   INT UNSIGNED NULL,
  quantity          DECIMAL(6,2) NULL,
  recipe_id         INT UNSIGNED NULL,
  recipe_servings   DECIMAL(6,2) NULL,
  calories          DECIMAL(8,2) NULL,
  protein_g         DECIMAL(8,2) NULL,
  carbs_g           DECIMAL(8,2) NULL,
  fat_g             DECIMAL(8,2) NULL,
  FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE SET NULL,
  FOREIGN KEY (serving_size_id) REFERENCES serving_sizes(id) ON DELETE SET NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
);
