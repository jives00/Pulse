-- Migration 013: add category column to links
-- Post-migration hook in migrate.ts handles the ALTER TABLE (MySQL <8 compatibility)
SELECT 1;
