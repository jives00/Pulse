-- Remove duplicate routine_goals rows, keeping the one with the highest id per (user_id, routine_id, effective_from)
DELETE rg1
FROM routine_goals rg1
JOIN routine_goals rg2
  ON rg2.user_id = rg1.user_id
  AND rg2.routine_id = rg1.routine_id
  AND rg2.effective_from = rg1.effective_from
  AND rg2.id > rg1.id;

-- Add unique constraint so ON DUPLICATE KEY UPDATE actually fires
ALTER TABLE routine_goals
  ADD UNIQUE KEY uq_routine_goals_user_routine_date (user_id, routine_id, effective_from);
