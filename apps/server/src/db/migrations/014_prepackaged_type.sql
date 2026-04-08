-- Migration 014: promote 'prepackaged' from subcategory to first-class recipe type
-- Data migration: UPDATE recipes SET type = 'prepackaged', subcategory = NULL WHERE type = 'food' AND subcategory = 'prepackaged';
-- (Run the UPDATE manually on EC2 after deploying this migration)
SELECT 1;
