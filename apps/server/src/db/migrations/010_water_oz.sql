-- @delimiter $$
-- Migration 010: switch water storage from ml to oz

DROP PROCEDURE IF EXISTS _m010 $$
CREATE PROCEDURE _m010()
BEGIN
  -- water_log: amount_ml → amount_oz
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'water_log' AND COLUMN_NAME = 'amount_ml'
  ) THEN
    ALTER TABLE water_log ADD COLUMN amount_oz INT UNSIGNED NOT NULL DEFAULT 0;
    UPDATE water_log SET amount_oz = ROUND(amount_ml / 29.5735);
    ALTER TABLE water_log DROP COLUMN amount_ml;
  END IF;

  -- user_goals: water_goal_ml → water_goal_oz
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_goals' AND COLUMN_NAME = 'water_goal_ml'
  ) THEN
    ALTER TABLE user_goals ADD COLUMN water_goal_oz INT UNSIGNED NOT NULL DEFAULT 64;
    UPDATE user_goals SET water_goal_oz = ROUND(water_goal_ml / 29.5735);
    ALTER TABLE user_goals DROP COLUMN water_goal_ml;
  END IF;
END $$
CALL _m010() $$
DROP PROCEDURE IF EXISTS _m010 $$
