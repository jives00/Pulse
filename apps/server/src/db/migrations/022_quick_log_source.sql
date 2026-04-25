-- Migration 022: extend foods.source ENUM to include 'quick_log' for one-time log entries
ALTER TABLE foods
  MODIFY COLUMN source ENUM('custom','open_food_facts','usda','quick_log') NOT NULL DEFAULT 'custom';
