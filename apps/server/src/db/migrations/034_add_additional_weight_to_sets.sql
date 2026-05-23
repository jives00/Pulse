-- @delimiter $$

DROP PROCEDURE IF EXISTS _add_additional_weight_cols$$

CREATE PROCEDURE _add_additional_weight_cols()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'exercise_sets'
      AND column_name  = 'additional_weight_kg'
  ) THEN
    ALTER TABLE exercise_sets ADD COLUMN additional_weight_kg DECIMAL(6,2) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'routine_exercise_sets'
      AND column_name  = 'additional_weight_kg'
  ) THEN
    ALTER TABLE routine_exercise_sets ADD COLUMN additional_weight_kg DECIMAL(6,2) NULL;
  END IF;
END$$

CALL _add_additional_weight_cols()$$

DROP PROCEDURE IF EXISTS _add_additional_weight_cols$$
