-- MyNetDiary food import
-- Run inside a transaction for safety:
-- mysql -u USER -p DBNAME < import_mnd_food.sql

START TRANSACTION;

-- ============================================================
-- 1. Upsert foods
-- ============================================================
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Cheerios protein cereal cookies & creme by General Mills', 'mnd:52730379', 'custom', 1, 225.0, 36.0, 12.0, 3.75);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('2% reduced fat ultra-filtered milk by Fairlife', 'mnd:14077003', 'custom', 1, 90.0, 4.5, 9.75, 3.375);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('French bread pepperoni pizzas by Red Baron', 'mnd:21897439', 'custom', 1, 380.0, 46.0, 15.0, 15.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Low-moisture part-skim mozzarella string cheese by Great Value', 'mnd:26868397', 'custom', 1, 80.0, 0.0, 7.0, 6.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Low lift chicken', 'mnd:67545423', 'custom', 1, 720.0, 99.0, 47.0, 15.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Fiber well fit gummies natural peach strawberry berry by Vitafusion', 'mnd:1691321', 'custom', 1, 10.0, 7.0, 0.0, 0.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Extra strength vitamin d3 5000 IU strawberry peach gummies by Nature Made', 'mnd:26787471', 'custom', 1, 15.0, 3.0, 0.0, 0.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Zero carb protein powder creamy vanilla flavored by Isopure', 'mnd:58445789', 'custom', 1, 110.0, 0.0, 25.0, 0.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Micronized creatine powder unflavored by Optimum Nutrition', 'mnd:63756942', 'custom', 1, 0.0, 0.0, 0.0, 0.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Zero added sugar lowfat greek yogurt vanilla by Chobani', 'mnd:45582759', 'custom', 1, 140.0, 9.0, 20.0, 3.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Protein + penne by Barilla', 'mnd:50100387', 'custom', 1, 190.0, 38.0, 10.0, 1.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Blackened atlantic salmon fillets skinless by Marketside', 'mnd:52771614', 'custom', 1, 150.0, 1.0, 25.0, 6.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Rosa hello fresh', 'mnd:33650355', 'custom', 1, 820.0, 78.0, 54.0, 31.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Oatmeal cream pie sandwich cookies by Little Debbie', 'mnd:25906785', 'custom', 1, 170.0, 26.0, 1.0, 7.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Power flapjacks buttermilk by Kodiak', 'mnd:43516073', 'custom', 1, 210.0, 28.0, 16.0, 4.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Butter rich syrup by Pearl Milling Company', 'mnd:35177288', 'custom', 1, 100.0, 26.0, 0.0, 0.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Beef vegetables empanadas by Maspanadas', 'mnd:43884576', 'custom', 1, 200.0006, 25.3334, 8.0, 8.0);
INSERT IGNORE INTO foods (name, brand, source, is_custom, calories_per100, carbs_per100, protein_per100, fat_per100) VALUES ('Great value 0% nonfat greek yogurt plain by Walmart', 'mnd:35920745', 'custom', 1, 133.3335, 12.0, 22.6667, 0.0);

-- ============================================================
-- 2. Upsert serving_sizes (1 serving = 100 virtual grams)
-- ============================================================
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:52730379' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:14077003' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:21897439' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:26868397' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:67545423' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:1691321' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:26787471' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:58445789' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:63756942' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:45582759' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:50100387' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:52771614' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:33650355' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:25906785' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:43516073' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:35177288' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:43884576' LIMIT 1;
INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) SELECT id, '1 serving', 100, 1 FROM foods WHERE brand = 'mnd:35920745' LIMIT 1;

-- ============================================================
-- 3. Insert food_log entries
-- ============================================================
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'breakfast', f.id, ss.id, 1.0, 225.0, 36.0, 12.0, 3.75 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:52730379' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'breakfast', f.id, ss.id, 1.0, 90.0, 4.5, 9.75, 3.375 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:14077003' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'lunch', f.id, ss.id, 1.0, 380.0, 46.0, 15.0, 15.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:21897439' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'lunch', f.id, ss.id, 1.0, 80.0, 0.0, 7.0, 6.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:26868397' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'dinner', f.id, ss.id, 1.0, 720.0, 99.0, 47.0, 15.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:67545423' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'dinner', f.id, ss.id, 1.0, 10.0, 7.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:1691321' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'dinner', f.id, ss.id, 1.0, 15.0, 3.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:26787471' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'snack', f.id, ss.id, 1.0, 110.0, 0.0, 25.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:58445789' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'snack', f.id, ss.id, 1.0, 0.0, 0.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:63756942' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-09', 'snack', f.id, ss.id, 1.0, 140.0, 9.0, 20.0, 3.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:45582759' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'breakfast', f.id, ss.id, 1.0, 225.0, 36.0, 12.0, 3.75 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:52730379' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'breakfast', f.id, ss.id, 1.0, 90.0, 4.5, 9.75, 3.375 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:14077003' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'lunch', f.id, ss.id, 1.0, 190.0, 38.0, 10.0, 1.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:50100387' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'lunch', f.id, ss.id, 1.0, 150.0, 1.0, 25.0, 6.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:52771614' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'dinner', f.id, ss.id, 1.0, 10.0, 7.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:1691321' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'dinner', f.id, ss.id, 1.0, 15.0, 3.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:26787471' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'dinner', f.id, ss.id, 1.0, 820.0, 78.0, 54.0, 31.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:33650355' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'snack', f.id, ss.id, 1.0, 110.0, 0.0, 25.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:58445789' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'snack', f.id, ss.id, 1.0, 0.0, 0.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:63756942' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-10', 'snack', f.id, ss.id, 1.0, 140.0, 9.0, 20.0, 3.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:45582759' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'breakfast', f.id, ss.id, 1.0, 170.0, 26.0, 1.0, 7.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:25906785' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'breakfast', f.id, ss.id, 1.0, 210.0, 28.0, 16.0, 4.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:43516073' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'breakfast', f.id, ss.id, 1.0, 100.0, 26.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:35177288' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'lunch', f.id, ss.id, 1.0, 200.0006, 25.3334, 8.0, 8.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:43884576' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'dinner', f.id, ss.id, 1.0, 10.0, 7.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:1691321' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'dinner', f.id, ss.id, 1.0, 15.0, 3.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:26787471' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'dinner', f.id, ss.id, 1.0, 820.0, 78.0, 54.0, 31.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:33650355' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'snack', f.id, ss.id, 1.0, 110.0, 0.0, 25.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:58445789' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'snack', f.id, ss.id, 1.0, 0.0, 0.0, 0.0, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:63756942' LIMIT 1;
INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity, calories, carbs_g, protein_g, fat_g) SELECT 1, '2026-04-11', 'snack', f.id, ss.id, 1.0, 133.3335, 12.0, 22.6667, 0.0 FROM foods f JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' WHERE f.brand = 'mnd:35920745' LIMIT 1;

COMMIT;
