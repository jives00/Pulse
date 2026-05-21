-- Additional weight carried during bodyweight exercises (e.g. weighted vest, dumbbells during lunges)
ALTER TABLE exercise_sets ADD COLUMN additional_weight_kg DECIMAL(6,2) NULL;
ALTER TABLE routine_exercise_sets ADD COLUMN additional_weight_kg DECIMAL(6,2) NULL;
