-- Migration 041: deduplicate body_measurements and add UNIQUE constraint
-- Root cause: WeightGurus sync deduplication bug caused duplicate rows on every hourly run.
-- Fix: keep the earliest-created row per (user_id, metric, measured_at), then enforce uniqueness.

-- Step 1: delete duplicates, keeping the row with the lowest id per (user_id, metric, measured_at)
DELETE bm FROM body_measurements bm
INNER JOIN (
  SELECT MIN(id) AS keep_id, user_id, metric, measured_at
  FROM body_measurements
  GROUP BY user_id, metric, measured_at
  HAVING COUNT(*) > 1
) dup ON bm.user_id = dup.user_id AND bm.metric = dup.metric AND bm.measured_at = dup.measured_at
WHERE bm.id > dup.keep_id;

-- Step 2: add UNIQUE constraint so the sync can't create duplicates again
ALTER TABLE body_measurements
  ADD UNIQUE KEY uq_user_metric_date (user_id, metric, measured_at);
