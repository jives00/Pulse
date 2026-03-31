-- Migration 008: add instructions and media_url to exercises
-- Actual ALTER TABLE statements run via migrate.ts post-migration hook
-- (MySQL <8 lacks ADD COLUMN IF NOT EXISTS)
SELECT 1;
