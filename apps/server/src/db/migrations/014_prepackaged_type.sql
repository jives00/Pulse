-- Migration 014: promote 'prepackaged' from subcategory to first-class recipe type
UPDATE recipes SET type = 'prepackaged', subcategory = NULL WHERE type = 'food' AND subcategory = 'prepackaged';
