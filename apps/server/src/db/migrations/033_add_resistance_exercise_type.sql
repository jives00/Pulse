-- Add 'resistance' exercise type for reps-only exercises (no weight, not bodyweight)
ALTER TABLE exercises MODIFY COLUMN exercise_type ENUM('weight', 'bodyweight', 'cardio', 'duration', 'resistance') NOT NULL DEFAULT 'weight';

-- Update Deadbug to resistance type (assuming it exists and was bodyweight)
UPDATE exercises SET exercise_type = 'resistance' WHERE LOWER(name) = 'deadbug';
