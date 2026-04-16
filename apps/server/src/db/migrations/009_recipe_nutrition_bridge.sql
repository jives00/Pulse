-- @delimiter $$
-- Migration 009: recipe barcodes table + recipe_id column on foods (shadow food records)

CREATE TABLE IF NOT EXISTS recipe_barcodes (
  barcode     VARCHAR(64)  NOT NULL,
  recipe_id   INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (barcode),
  CONSTRAINT fk_rb_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 $$

DROP PROCEDURE IF EXISTS _m009 $$
CREATE PROCEDURE _m009()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'foods' AND COLUMN_NAME = 'recipe_id'
  ) THEN
    ALTER TABLE foods
      ADD COLUMN recipe_id INT UNSIGNED NULL,
      ADD CONSTRAINT fk_food_recipe
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
  END IF;
END $$
CALL _m009() $$
DROP PROCEDURE IF EXISTS _m009 $$
