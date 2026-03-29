-- Per-user predefined tag definitions with category
CREATE TABLE IF NOT EXISTS tag_definitions (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id  INT UNSIGNED NOT NULL,
  name     VARCHAR(100) NOT NULL,
  category ENUM('health', 'cuisine', 'category') NOT NULL,
  UNIQUE KEY uq_user_tag (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
