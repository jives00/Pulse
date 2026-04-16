-- @delimiter $$
-- Migration 013: add category column to links

DROP PROCEDURE IF EXISTS _m013 $$
CREATE PROCEDURE _m013()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'links' AND COLUMN_NAME = 'category'
  ) THEN
    ALTER TABLE links ADD COLUMN category ENUM('food','drinks','nutrition','exercise','other') NOT NULL DEFAULT 'other';
  END IF;
END $$
CALL _m013() $$
DROP PROCEDURE IF EXISTS _m013 $$
