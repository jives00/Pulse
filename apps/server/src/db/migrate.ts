import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

async function migrate() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  // Run base schema migration
  const sql001 = fs.readFileSync(path.join(__dirname, 'migrations', '001_pulse_initial.sql'), 'utf-8');
  console.log('Running 001_pulse_initial.sql...');
  await conn.query(sql001);
  console.log('  done.');

  // Seed admin user if no users exist yet
  const [userRows] = await conn.query('SELECT id FROM users LIMIT 1');
  if ((userRows as any[]).length === 0) {
    const username = env.AUTH_USERNAME ?? 'admin';
    const password = env.AUTH_PASSWORD ?? 'changeme';
    const passwordHash = await bcrypt.hash(password, 12);
    await conn.query(
      'INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)',
      [username, passwordHash]
    );
    console.log(`  Seeded admin user '${username}' with password from AUTH_PASSWORD env var.`);
  }

  // Run Phase 2 migration — drops DEFAULT 1 from user_id columns
  const sql002 = fs.readFileSync(path.join(__dirname, 'migrations', '002_multi_user_auth.sql'), 'utf-8');
  console.log('Running 002_multi_user_auth.sql...');
  await conn.query(sql002);
  console.log('  done.');

  console.log('All migrations complete.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
