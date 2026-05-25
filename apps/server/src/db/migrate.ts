import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Discover migration files by reading the directory and sorting by filename.
 * The numeric prefix (001_, 002_, …) guarantees correct order without any
 * manual list to maintain.
 */
function discoverMigrations(): string[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const prefixCount: Record<string, string[]> = {};
  for (const f of files) {
    const prefix = f.match(/^(\d+)/)?.[1] ?? f;
    (prefixCount[prefix] ??= []).push(f);
  }
  const collisions = Object.entries(prefixCount).filter(([, names]) => names.length > 1);
  if (collisions.length > 0) {
    const detail = collisions.map(([p, names]) => `  prefix ${p}: ${names.join(', ')}`).join('\n');
    throw new Error(`Duplicate migration prefixes found:\n${detail}`);
  }

  return files;
}

/**
 * Split a SQL file into individual statements.
 *
 * If the file contains the pragma `-- @delimiter $$` (used for stored
 * procedures), statements are split on `$$` and DELIMITER directives are
 * stripped. Otherwise statements are split on `;`.
 *
 * Blank / comment-only chunks are discarded.
 */
function splitStatements(sql: string): string[] {
  const useProc = /^--\s*@delimiter\s+\$\$/im.test(sql);

  let chunks: string[];
  if (useProc) {
    chunks = sql
      .replace(/^DELIMITER\s+\S+\s*$/gim, '')  // strip DELIMITER directives
      .split('$$');
  } else {
    chunks = sql.split(';');
  }

  return chunks
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const noComments = s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      return noComments.length > 0;
    });
}

async function runFile(conn: mysql.Connection, filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf-8');
  const statements = splitStatements(sql);

  for (const stmt of statements) {
    await conn.query(stmt);
  }
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const migrations = discoverMigrations();
  console.log(`Found ${migrations.length} migration files.`);

  for (const file of migrations) {
    const [rows] = await conn.query(
      'SELECT name FROM schema_migrations WHERE name = ?', [file]
    );
    if ((rows as any[]).length > 0) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }

    const sqlFile = path.join(MIGRATIONS_DIR, file);
    console.log(`Running ${file}...`);
    await runFile(conn, sqlFile);

    // After 001: seed admin user if users table is empty
    if (file === '001_pulse_initial.sql') {
      const [userRows] = await conn.query('SELECT id FROM users LIMIT 1');
      if ((userRows as any[]).length === 0) {
        const username = 'admin';
        const password = 'changeme';
        const passwordHash = await bcrypt.hash(password, 12);
        await conn.query(
          'INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)',
          [username, passwordHash]
        );
        console.log(`  Seeded admin user '${username}'.`);
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
