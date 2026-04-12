-- MyNetDiary water import
-- mysql -u USER -p DBNAME < import_mnd_water.sql

START TRANSACTION;

INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-11', 64.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-12', 72.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-13', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-14', 20.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-15', 60.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-16', 60.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-17', 76.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-18', 60.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-19', 68.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-20', 28.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-21', 76.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-22', 60.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-23', 60.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-24', 60.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-25', 84.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-26', 76.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-27', 96.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-28', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-29', 100.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-30', 100.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-03-31', 88.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-01', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-02', 96.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-03', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-04', 88.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-05', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-06', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-07', 108.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-08', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-09', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-10', 80.0);
INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (1, '2026-04-11', 80.0);

COMMIT;
