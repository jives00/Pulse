-- Migration 016: replace track_weight with tracked_fields
-- tracked_fields is a comma-separated list of: reps, weight, duration, distance
-- Defaults are set per exercise_type in the post-migration hook in migrate.ts
-- This file is intentionally empty; all work is done in the hook.
SELECT 1;
