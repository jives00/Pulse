import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

const MIGRATIONS = [
  '001_pulse_initial.sql',
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

  for (const file of MIGRATIONS) {
    const sqlFile = path.join(__dirname, 'migrations', file);
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    console.log(`Running ${file}...`);
    await conn.query(sql);
    console.log(`  done.`);
  }

  console.log('All migrations complete.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
