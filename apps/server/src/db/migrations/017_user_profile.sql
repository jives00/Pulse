-- Migration 017: user profile fields for BMR/TDEE calculation
-- height_cm, sex, dob, activity_level added via post-migration hook in migrate.ts
-- (MySQL <8 workaround — no ADD COLUMN IF NOT EXISTS)
SELECT 1;
