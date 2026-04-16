-- @delimiter $$
-- Migration 008: add instructions and media_url to exercises

DROP PROCEDURE IF EXISTS _m008 $$
CREATE PROCEDURE _m008()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'instructions'
  ) THEN
    ALTER TABLE exercises ADD COLUMN instructions TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'media_url'
  ) THEN
    ALTER TABLE exercises ADD COLUMN media_url VARCHAR(500) NULL;
  END IF;
END $$
CALL _m008() $$
DROP PROCEDURE IF EXISTS _m008 $$
