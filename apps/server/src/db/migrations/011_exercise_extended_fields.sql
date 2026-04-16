-- @delimiter $$
-- Migration 011: add cover_image_url, notes, muscle_image_url, and track_weight to exercises

DROP PROCEDURE IF EXISTS _m011 $$
CREATE PROCEDURE _m011()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'cover_image_url'
  ) THEN
    ALTER TABLE exercises ADD COLUMN cover_image_url VARCHAR(500) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'notes'
  ) THEN
    ALTER TABLE exercises ADD COLUMN notes TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'muscle_image_url'
  ) THEN
    ALTER TABLE exercises ADD COLUMN muscle_image_url VARCHAR(500) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'track_weight'
  ) THEN
    ALTER TABLE exercises ADD COLUMN track_weight TINYINT(1) NOT NULL DEFAULT 1;
  END IF;
END $$
CALL _m011() $$
DROP PROCEDURE IF EXISTS _m011 $$
