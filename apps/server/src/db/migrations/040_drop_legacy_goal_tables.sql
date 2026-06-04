-- Migration 040: Drop legacy goal tables
-- Prerequisites: All Phase 3 code migrations complete and deployed.
-- These tables are fully superseded by the goals / goal_milestones / goal_progress tables.
-- Data was migrated in 038_goals_data_migration.sql and verified clean (empty _migration_review).
--
-- Run in this order to respect FK dependencies.

DROP TABLE IF EXISTS goal_checkpoints;
DROP TABLE IF EXISTS custom_goals;
DROP TABLE IF EXISTS routine_goals;
DROP TABLE IF EXISTS body_measurement_goals;
DROP TABLE IF EXISTS exercise_goals;
DROP TABLE IF EXISTS _migration_review;

-- user_goals is intentionally NOT dropped here.
-- It holds operational nutrition targets that drive food log rings and is still written to
-- by /api/nutrition-targets. It is a permanent operational table, not a legacy goal table.
