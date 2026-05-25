ALTER TABLE steps_log MODIFY COLUMN source ENUM('manual', 'pedometer', 'health_connect') NOT NULL DEFAULT 'manual';
