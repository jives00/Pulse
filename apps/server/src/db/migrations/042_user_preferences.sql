-- @delimiter $$
-- Migration 042: user preferences — feature toggles, dashboard layout, goal card config
-- NULL means "all defaults" for every column here; resolved by the api-client catalog
-- helpers (resolveFeatures / resolveLayout / resolveGoalCard) on read. No backfill.

DROP PROCEDURE IF EXISTS _m042 $$
CREATE PROCEDURE _m042()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'enabled_features'
  ) THEN
    ALTER TABLE users ADD COLUMN enabled_features JSON NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'dashboard_layout'
  ) THEN
    ALTER TABLE users ADD COLUMN dashboard_layout JSON NULL;
  END IF;

  -- NOTE: goal card presentation belongs to the unified goals system (table `goals`,
  -- served by /api/goals-v2) introduced in migrations 037-040 — not the legacy
  -- `user_goals` nutrition-targets table.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'card_config'
  ) THEN
    ALTER TABLE goals ADD COLUMN card_config JSON NULL;
  END IF;
END $$
CALL _m042() $$
DROP PROCEDURE IF EXISTS _m042 $$
