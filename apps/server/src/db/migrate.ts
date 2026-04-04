import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const MIGRATIONS = [
  '001_pulse_initial.sql',
  '002_multi_user_auth.sql',
  '003_seed_exercises.sql',
  '004_tag_definitions.sql',
  '005_food_log_dram_recipe_id.sql',
  '006_body_measurements.sql',
  '008_exercise_fields.sql',
  '009_recipe_nutrition_bridge.sql',
  '010_water_oz.sql',
  '011_exercise_extended_fields.sql',
  '012_routine_cover_image.sql',
];

async function migrate() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  // Ensure migration tracking table exists
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const file of MIGRATIONS) {
    const [rows] = await conn.query(
      'SELECT name FROM schema_migrations WHERE name = ?', [file]
    );
    if ((rows as any[]).length > 0) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }

    const sqlFile = path.join(__dirname, 'migrations', file);
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    console.log(`Running ${file}...`);
    await conn.query(sql);

    // After 001: seed admin user if users table is empty
    if (file === '001_pulse_initial.sql') {
      const [userRows] = await conn.query('SELECT id FROM users LIMIT 1');
      if ((userRows as any[]).length === 0) {
        const username = env.AUTH_USERNAME ?? 'admin';
        const password = env.AUTH_PASSWORD ?? 'changeme';
        const passwordHash = await bcrypt.hash(password, 12);
        await conn.query(
          'INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)',
          [username, passwordHash]
        );
        console.log(`  Seeded admin user '${username}'.`);
      }
    }

    // Post-migration hooks for schema changes that can't use IF NOT EXISTS in SQL
    if (file === '005_food_log_dram_recipe_id.sql') {
      const [cols] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'food_log'
           AND COLUMN_NAME  = 'dram_recipe_id'`
      );
      if ((cols as any[]).length === 0) {
        await conn.query(
          `ALTER TABLE food_log
             ADD COLUMN dram_recipe_id INT UNSIGNED NULL,
             ADD CONSTRAINT fk_food_log_recipe
               FOREIGN KEY (dram_recipe_id) REFERENCES recipes(id) ON DELETE SET NULL`
        );
        console.log('  Added food_log.dram_recipe_id column.');
      } else {
        console.log('  food_log.dram_recipe_id already exists, skipping ALTER.');
      }
    }

    // Post-migration hook for 006: ALTER TABLE may fail if column already exists
    if (file === '006_body_measurements.sql') {
      const [cols] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'exercise_goals'
           AND COLUMN_NAME  = 'volume_lbs_per_week'`
      );
      if ((cols as any[]).length === 0) {
        await conn.query(
          `ALTER TABLE exercise_goals ADD COLUMN volume_lbs_per_week INT UNSIGNED NULL`
        );
        console.log('  Added exercise_goals.volume_lbs_per_week column.');
      } else {
        console.log('  exercise_goals.volume_lbs_per_week already exists, skipping ALTER.');
      }
    }

    if (file === '008_exercise_fields.sql') {
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises'
           AND COLUMN_NAME IN ('instructions', 'media_url')`
      );
      const existing = (cols as any[]).map((r) => r.COLUMN_NAME);
      if (!existing.includes('instructions')) {
        await conn.query(`ALTER TABLE exercises ADD COLUMN instructions TEXT NULL`);
        console.log('  Added exercises.instructions column.');
      }
      if (!existing.includes('media_url')) {
        await conn.query(`ALTER TABLE exercises ADD COLUMN media_url VARCHAR(500) NULL`);
        console.log('  Added exercises.media_url column.');
      }
    }

    if (file === '009_recipe_nutrition_bridge.sql') {
      const [cols] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'foods'
           AND COLUMN_NAME  = 'recipe_id'`
      );
      if ((cols as any[]).length === 0) {
        await conn.query(
          `ALTER TABLE foods
             ADD COLUMN recipe_id INT UNSIGNED NULL,
             ADD CONSTRAINT fk_food_recipe
               FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE`
        );
        console.log('  Added foods.recipe_id column.');
      } else {
        console.log('  foods.recipe_id already exists, skipping ALTER.');
      }
    }

    if (file === '010_water_oz.sql') {
      // water_log: amount_ml → amount_oz
      const [wlCols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'water_log'
           AND COLUMN_NAME IN ('amount_ml', 'amount_oz')`
      );
      const wlExisting = (wlCols as any[]).map((r) => r.COLUMN_NAME);
      if (wlExisting.includes('amount_ml') && !wlExisting.includes('amount_oz')) {
        await conn.query(`ALTER TABLE water_log ADD COLUMN amount_oz INT UNSIGNED NOT NULL DEFAULT 0`);
        await conn.query(`UPDATE water_log SET amount_oz = ROUND(amount_ml / 29.5735)`);
        await conn.query(`ALTER TABLE water_log DROP COLUMN amount_ml`);
        console.log('  Migrated water_log.amount_ml → amount_oz.');
      } else {
        console.log('  water_log.amount_oz already exists or amount_ml already removed, skipping.');
      }

      // user_goals: water_goal_ml → water_goal_oz
      const [ugCols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_goals'
           AND COLUMN_NAME IN ('water_goal_ml', 'water_goal_oz')`
      );
      const ugExisting = (ugCols as any[]).map((r) => r.COLUMN_NAME);
      if (ugExisting.includes('water_goal_ml') && !ugExisting.includes('water_goal_oz')) {
        await conn.query(`ALTER TABLE user_goals ADD COLUMN water_goal_oz INT UNSIGNED NOT NULL DEFAULT 64`);
        await conn.query(`UPDATE user_goals SET water_goal_oz = ROUND(water_goal_ml / 29.5735)`);
        await conn.query(`ALTER TABLE user_goals DROP COLUMN water_goal_ml`);
        console.log('  Migrated user_goals.water_goal_ml → water_goal_oz.');
      } else {
        console.log('  user_goals.water_goal_oz already exists or water_goal_ml already removed, skipping.');
      }
    }

    if (file === '011_exercise_extended_fields.sql') {
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exercises'
           AND COLUMN_NAME IN ('cover_image_url', 'notes', 'muscle_image_url')`
      );
      const existing = (cols as any[]).map((r) => r.COLUMN_NAME);
      if (!existing.includes('cover_image_url')) {
        await conn.query(`ALTER TABLE exercises ADD COLUMN cover_image_url VARCHAR(500) NULL`);
        console.log('  Added exercises.cover_image_url column.');
      }
      if (!existing.includes('notes')) {
        await conn.query(`ALTER TABLE exercises ADD COLUMN notes TEXT NULL`);
        console.log('  Added exercises.notes column.');
      }
      if (!existing.includes('muscle_image_url')) {
        await conn.query(`ALTER TABLE exercises ADD COLUMN muscle_image_url VARCHAR(500) NULL`);
        console.log('  Added exercises.muscle_image_url column.');
      }
      if (!existing.includes('track_weight')) {
        await conn.query(`ALTER TABLE exercises ADD COLUMN track_weight TINYINT(1) NOT NULL DEFAULT 1`);
        console.log('  Added exercises.track_weight column.');
      }
    }

    if (file === '012_routine_cover_image.sql') {
      const [cols] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'workout_routines'
           AND COLUMN_NAME  = 'cover_image_key'`
      );
      if ((cols as any[]).length === 0) {
        await conn.query(`ALTER TABLE workout_routines ADD COLUMN cover_image_key VARCHAR(500) NULL`);
        console.log('  Added workout_routines.cover_image_key column.');
      } else {
        console.log('  workout_routines.cover_image_key already exists, skipping ALTER.');
      }
    }

    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`  done.`);
  }

  console.log('All migrations complete.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
