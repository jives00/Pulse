-- Migration 039: Remove duplicate goals and milestones created by repeated migration runs.
--
-- 037 is now idempotent (IF NOT EXISTS), so 038 may have re-inserted goal data on a DB
-- where those tables already existed. This migration cleans up the resulting duplicates.
--
-- Goals:    keep min(id) per (user_id, catalog_key, source_id)
-- Milestones: keep min(id) per (goal_id, target_date, target_value) after goal dedup

DELETE g1 FROM goals g1
INNER JOIN goals g2
  ON  g1.user_id     = g2.user_id
  AND g1.catalog_key = g2.catalog_key
  AND (
        (g1.source_id IS NULL     AND g2.source_id IS NULL)
     OR (g1.source_id IS NOT NULL AND g1.source_id = g2.source_id)
      )
  AND g1.id > g2.id;

-- Deduplicate milestones on the same goal with the same target date + value
DELETE m1 FROM goal_milestones m1
INNER JOIN goal_milestones m2
  ON  m1.goal_id       = m2.goal_id
  AND m1.target_date   = m2.target_date
  AND m1.target_value  = m2.target_value
  AND m1.id > m2.id;
