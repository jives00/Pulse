-- Migration 009: recipe barcodes + recipe_id column on foods (shadow food records)
-- recipe_barcodes: CREATE TABLE runs here (IF NOT EXISTS is safe for new tables)
-- foods.recipe_id: ALTER TABLE runs via post-migration hook in migrate.ts

CREATE TABLE IF NOT EXISTS recipe_barcodes (
  barcode     VARCHAR(64)  NOT NULL,
  recipe_id   INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (barcode),
  CONSTRAINT fk_rb_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
