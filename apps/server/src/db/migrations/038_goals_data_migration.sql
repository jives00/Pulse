-- Migration 038: Data migration from legacy goal tables → unified goals table
-- Run AFTER 037_goals_overhaul.sql (schema must exist)
-- Legacy tables are NOT dropped here — drop manually after verifying results
--
-- Tables migrated:
--   body_measurement_goals → goals (one row per metric)
--   exercise_goals          → goals (up to 3 rows per user: workouts, minutes, volume)
--   routine_goals           → goals (one row per routine)
--   custom_goals            → goals (mappable metric_types only)
--   goal_checkpoints        → goal_milestones (best-effort by metric match)
--
-- Unmappable rows are recorded in _migration_review for manual inspection.

-- ─── Review table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS _migration_review (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  source_table VARCHAR(50)  NOT NULL,
  source_id    INT          NOT NULL,
  reason       VARCHAR(200) NOT NULL,
  raw_data     JSON         NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Step 1: body_measurement_goals → goals ────────────────────────────────────

INSERT INTO goals (
  user_id, catalog_key, name, category, card_type,
  start_value, target_value, unit,
  started_at, deadline, show_on_dashboard, status
)
SELECT
  bmg.user_id,
  CASE bmg.metric
    WHEN 'weight'      THEN 'body_weight'
    WHEN 'waist'       THEN 'body_waist'
    WHEN 'bicep'       THEN 'body_bicep'
    WHEN 'chest'       THEN 'body_chest'
    WHEN 'hips'        THEN 'body_hips'
    WHEN 'body_fat'    THEN 'body_fat_pct'
    WHEN 'muscle_mass' THEN 'body_muscle_mass'
    WHEN 'water_pct'   THEN 'body_water_pct'
    ELSE CONCAT('body_', bmg.metric)
  END,
  CONCAT(
    CASE bmg.metric
      WHEN 'weight'      THEN 'Weight'
      WHEN 'waist'       THEN 'Waist'
      WHEN 'bicep'       THEN 'Bicep'
      WHEN 'chest'       THEN 'Chest'
      WHEN 'hips'        THEN 'Hips'
      WHEN 'body_fat'    THEN 'Body Fat %'
      WHEN 'muscle_mass' THEN 'Muscle Mass'
      WHEN 'water_pct'   THEN 'Water %'
      ELSE bmg.metric
    END,
    ' Goal'
  ),
  'body',
  'line_chart',
  (
    SELECT bm.value FROM body_measurements bm
    WHERE bm.user_id = bmg.user_id AND bm.metric = bmg.metric
    ORDER BY bm.measured_at DESC LIMIT 1
  ),
  bmg.target_value,
  bmg.unit,
  CURDATE(),
  bmg.target_date,
  bmg.show_on_dashboard,
  'active'
FROM body_measurement_goals bmg;

-- ─── Step 2: exercise_goals (most recent per user) → goals ────────────────────

-- 2a: workouts_per_week
INSERT INTO goals (user_id, catalog_key, name, category, card_type, target_value, unit, started_at, show_on_dashboard, status)
SELECT eg.user_id, 'exercise_workouts_per_week', 'Workouts per Week', 'exercise', 'line_chart',
       eg.workouts_per_week, 'workouts', eg.effective_from, eg.show_on_dashboard, 'active'
FROM exercise_goals eg
INNER JOIN (
  SELECT user_id, MAX(effective_from) AS max_date FROM exercise_goals GROUP BY user_id
) latest ON eg.user_id = latest.user_id AND eg.effective_from = latest.max_date
WHERE eg.workouts_per_week IS NOT NULL;

-- 2b: minutes_per_week
INSERT INTO goals (user_id, catalog_key, name, category, card_type, target_value, unit, started_at, show_on_dashboard, status)
SELECT eg.user_id, 'exercise_minutes_per_week', 'Minutes per Week', 'exercise', 'line_chart',
       eg.minutes_per_week, 'min', eg.effective_from, eg.show_on_dashboard, 'active'
FROM exercise_goals eg
INNER JOIN (
  SELECT user_id, MAX(effective_from) AS max_date FROM exercise_goals GROUP BY user_id
) latest ON eg.user_id = latest.user_id AND eg.effective_from = latest.max_date
WHERE eg.minutes_per_week IS NOT NULL;

-- 2c: volume_lbs_per_week
INSERT INTO goals (user_id, catalog_key, name, category, card_type, target_value, unit, started_at, show_on_dashboard, status)
SELECT eg.user_id, 'exercise_volume_per_week', 'Weekly Volume', 'exercise', 'line_chart',
       eg.volume_lbs_per_week, 'lbs', eg.effective_from, eg.show_on_dashboard, 'active'
FROM exercise_goals eg
INNER JOIN (
  SELECT user_id, MAX(effective_from) AS max_date FROM exercise_goals GROUP BY user_id
) latest ON eg.user_id = latest.user_id AND eg.effective_from = latest.max_date
WHERE eg.volume_lbs_per_week IS NOT NULL;

-- ─── Step 3: routine_goals → goals ────────────────────────────────────────────

INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, source_id, source_name, target_value, unit, started_at, status)
SELECT
  rg.user_id,
  'exercise_routine_sessions',
  CONCAT(wr.name, ' Sessions/Week'),
  'exercise',
  'line_chart',
  'routine',
  rg.routine_id,
  wr.name,
  rg.target_per_week,
  'sessions',
  rg.effective_from,
  'active'
FROM routine_goals rg
INNER JOIN workout_routines wr ON wr.id = rg.routine_id;

-- ─── Step 4: custom_goals → goals (mappable types) ────────────────────────────

-- 4a: body_measurement
INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, status)
SELECT
  cg.user_id,
  CASE cg.source_key
    WHEN 'weight'      THEN 'body_weight'
    WHEN 'waist'       THEN 'body_waist'
    WHEN 'bicep'       THEN 'body_bicep'
    WHEN 'chest'       THEN 'body_chest'
    WHEN 'hips'        THEN 'body_hips'
    WHEN 'body_fat'    THEN 'body_fat_pct'
    WHEN 'muscle_mass' THEN 'body_muscle_mass'
    WHEN 'water_pct'   THEN 'body_water_pct'
    ELSE CONCAT('body_', cg.source_key)
  END,
  cg.name, 'body', 'line_chart', 'measurement',
  cg.target_value, cg.unit, DATE(cg.created_at), cg.target_date,
  cg.show_on_dashboard, cg.sort_order, 'active'
FROM custom_goals cg
WHERE cg.metric_type = 'body_measurement';

-- 4b: nutrition_daily_avg
INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, status)
SELECT
  cg.user_id,
  CASE cg.source_key
    WHEN 'calories' THEN 'nutrition_calories_daily_avg'
    WHEN 'protein'  THEN 'nutrition_protein_daily_avg'
    WHEN 'carbs'    THEN 'nutrition_carbs_daily_avg'
    WHEN 'fat'      THEN 'nutrition_fat_daily_avg'
    ELSE CONCAT('nutrition_', cg.source_key, '_daily_avg')
  END,
  cg.name, 'nutrition', 'line_chart', 'nutrition',
  cg.target_value, cg.unit, DATE(cg.created_at), cg.target_date,
  cg.show_on_dashboard, cg.sort_order, 'active'
FROM custom_goals cg
WHERE cg.metric_type = 'nutrition_daily_avg';

-- 4c: exercise_max_weight
INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, source_id, source_name, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, status)
SELECT
  cg.user_id,
  'exercise_max_weight',
  cg.name, 'exercise', 'progress_bar', 'exercise', cg.source_id,
  e.name,
  cg.target_value, cg.unit, DATE(cg.created_at), cg.target_date,
  cg.show_on_dashboard, cg.sort_order, 'active'
FROM custom_goals cg
LEFT JOIN exercises e ON e.id = cg.source_id
WHERE cg.metric_type = 'exercise_max_weight';

-- 4d: exercise_weekly_volume
INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, source_id, source_name, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, status)
SELECT
  cg.user_id,
  'exercise_weekly_volume_lift',
  cg.name, 'exercise', 'line_chart', 'exercise', cg.source_id,
  e.name,
  cg.target_value, cg.unit, DATE(cg.created_at), cg.target_date,
  cg.show_on_dashboard, cg.sort_order, 'active'
FROM custom_goals cg
LEFT JOIN exercises e ON e.id = cg.source_id
WHERE cg.metric_type = 'exercise_weekly_volume';

-- 4e: exercise_weekly_sessions
INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, source_id, source_name, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, status)
SELECT
  cg.user_id,
  'exercise_routine_sessions',
  cg.name, 'exercise', 'line_chart', 'routine', cg.source_id,
  wr.name,
  cg.target_value, cg.unit, DATE(cg.created_at), cg.target_date,
  cg.show_on_dashboard, cg.sort_order, 'active'
FROM custom_goals cg
LEFT JOIN workout_routines wr ON wr.id = cg.source_id
WHERE cg.metric_type = 'exercise_weekly_sessions';

-- 4f: daily_steps_avg
INSERT INTO goals (user_id, catalog_key, name, category, card_type, source_type, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, status)
SELECT
  cg.user_id,
  'activity_steps_daily_avg',
  cg.name, 'activity', 'line_chart', 'steps',
  cg.target_value, cg.unit, DATE(cg.created_at), cg.target_date,
  cg.show_on_dashboard, cg.sort_order, 'active'
FROM custom_goals cg
WHERE cg.metric_type = 'daily_steps_avg';

-- ─── Step 5: Flag unmappable custom_goals ─────────────────────────────────────

INSERT INTO _migration_review (source_table, source_id, reason, raw_data)
SELECT
  'custom_goals', cg.id,
  CONCAT('metric_type "', cg.metric_type, '" has no catalog equivalent — review manually'),
  JSON_OBJECT(
    'id', cg.id, 'name', cg.name, 'category', cg.category,
    'metric_type', cg.metric_type, 'source_type', cg.source_type,
    'source_key', cg.source_key, 'target_value', cg.target_value,
    'unit', cg.unit, 'target_date', cg.target_date
  )
FROM custom_goals cg
WHERE cg.metric_type NOT IN (
  'exercise_max_weight', 'exercise_weekly_volume', 'exercise_weekly_sessions',
  'daily_steps_avg', 'body_measurement', 'nutrition_daily_avg'
);

-- ─── Step 6: goal_checkpoints → goal_milestones (best-effort by metric) ───────

INSERT INTO goal_milestones (goal_id, user_id, target_value, target_date, notes)
SELECT
  g.id,
  gc.user_id,
  gc.target_value,
  gc.target_date,
  gc.notes
FROM goal_checkpoints gc
INNER JOIN goals g
  ON g.user_id = gc.user_id
  AND g.status = 'active'
  AND g.catalog_key = CASE gc.metric
    WHEN 'weight'      THEN 'body_weight'
    WHEN 'waist'       THEN 'body_waist'
    WHEN 'bicep'       THEN 'body_bicep'
    WHEN 'chest'       THEN 'body_chest'
    WHEN 'hips'        THEN 'body_hips'
    WHEN 'body_fat'    THEN 'body_fat_pct'
    WHEN 'muscle_mass' THEN 'body_muscle_mass'
    WHEN 'water_pct'   THEN 'body_water_pct'
    ELSE gc.metric
  END;

-- Flag unmatched checkpoints
INSERT INTO _migration_review (source_table, source_id, reason, raw_data)
SELECT
  'goal_checkpoints', gc.id,
  CONCAT('No active goal matched metric "', gc.metric, '" — assign manually'),
  JSON_OBJECT(
    'id', gc.id, 'metric', gc.metric,
    'target_value', gc.target_value, 'unit', gc.unit,
    'target_date', gc.target_date, 'notes', gc.notes
  )
FROM goal_checkpoints gc
WHERE NOT EXISTS (
  SELECT 1 FROM goals g
  WHERE g.user_id = gc.user_id
    AND g.status = 'active'
    AND g.catalog_key = CASE gc.metric
      WHEN 'weight'      THEN 'body_weight'
      WHEN 'waist'       THEN 'body_waist'
      WHEN 'bicep'       THEN 'body_bicep'
      WHEN 'chest'       THEN 'body_chest'
      WHEN 'hips'        THEN 'body_hips'
      WHEN 'body_fat'    THEN 'body_fat_pct'
      WHEN 'muscle_mass' THEN 'body_muscle_mass'
      WHEN 'water_pct'   THEN 'body_water_pct'
      ELSE gc.metric
    END
);

-- ─── Step 7: Summary ──────────────────────────────────────────────────────────

SELECT 'goals migrated' AS label, COUNT(*) AS count FROM goals
UNION ALL
SELECT 'milestones migrated', COUNT(*) FROM goal_milestones
UNION ALL
SELECT 'items needing review', COUNT(*) FROM _migration_review;

-- Show anything that needs manual attention
SELECT source_table, source_id, reason FROM _migration_review ORDER BY source_table, source_id;
