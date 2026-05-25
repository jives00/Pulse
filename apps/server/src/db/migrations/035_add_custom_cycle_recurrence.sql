-- Add 'custom_cycle' to recurrence_type ENUM for workout_schedules, meal_schedules, and nutrition_schedules
-- Custom cycle allows rotating through exercises with configurable rest days and weekend handling

-- @delimiter $$

DROP PROCEDURE IF EXISTS _add_custom_cycle_enum$$

CREATE PROCEDURE _add_custom_cycle_enum()
BEGIN
  -- Update workout_schedules
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'workout_schedules'
      AND column_type LIKE '%custom_cycle%'
  ) THEN
    ALTER TABLE workout_schedules
      MODIFY COLUMN recurrence_type ENUM('daily','every_other_day','days_of_week','every_x_days','day_of_month','custom_cycle') NOT NULL;
  END IF;

  -- Update meal_schedules
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'meal_schedules'
      AND column_type LIKE '%custom_cycle%'
  ) THEN
    ALTER TABLE meal_schedules
      MODIFY COLUMN recurrence_type ENUM('once','daily','every_other_day','days_of_week','every_x_days','day_of_month','custom_cycle') NOT NULL;
  END IF;

  -- Update nutrition_schedules
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'nutrition_schedules'
      AND column_type LIKE '%custom_cycle%'
  ) THEN
    ALTER TABLE nutrition_schedules
      MODIFY COLUMN recurrence_type ENUM('once','daily','every_other_day','days_of_week','every_x_days','day_of_month','custom_cycle') NOT NULL;
  END IF;
END$$

CALL _add_custom_cycle_enum()$$

DROP PROCEDURE IF EXISTS _add_custom_cycle_enum$$
