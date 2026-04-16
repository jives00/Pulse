-- @delimiter $$
-- Migration 017: user profile fields for BMR/TDEE calculation

DROP PROCEDURE IF EXISTS _m017 $$
CREATE PROCEDURE _m017()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'height_cm'
  ) THEN
    ALTER TABLE users ADD COLUMN height_cm DECIMAL(5,1) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sex'
  ) THEN
    ALTER TABLE users ADD COLUMN sex ENUM('male','female') NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'dob'
  ) THEN
    ALTER TABLE users ADD COLUMN dob DATE NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'activity_level'
  ) THEN
    ALTER TABLE users ADD COLUMN activity_level ENUM('sedentary','lightly_active','moderately_active','very_active') NOT NULL DEFAULT 'sedentary';
  END IF;

  UPDATE users SET height_cm = 167.6, sex = 'male', dob = '1980-02-16', activity_level = 'sedentary'
  WHERE id = 1 AND height_cm IS NULL;
END $$
CALL _m017() $$
DROP PROCEDURE IF EXISTS _m017 $$
