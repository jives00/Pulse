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
