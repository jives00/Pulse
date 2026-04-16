-- @delimiter $$
-- Migration 005: add dram_recipe_id to food_log

DROP PROCEDURE IF EXISTS _m005 $$
CREATE PROCEDURE _m005()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'food_log' AND COLUMN_NAME = 'dram_recipe_id'
  ) THEN
    ALTER TABLE food_log
      ADD COLUMN dram_recipe_id INT UNSIGNED NULL,
      ADD CONSTRAINT fk_food_log_recipe
        FOREIGN KEY (dram_recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
  END IF;
END $$
CALL _m005() $$
DROP PROCEDURE IF EXISTS _m005 $$
