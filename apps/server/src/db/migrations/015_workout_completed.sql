-- Migration 015: add completed flag to workout_logs
-- Workouts are created immediately when a session starts.
-- completed = 0 means in-progress (not shown in log history).
-- completed = 1 means finished (shown in log history).
SELECT 1; -- placeholder, actual ALTER is done via post-hook in migrate.ts
