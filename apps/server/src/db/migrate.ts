import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
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

  const sqlFile = path.join(__dirname, 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(sqlFile, 'utf-8');

  console.log('Running migration 001_initial_schema.sql...');
  await conn.query(sql);
  console.log('✅ Migration complete.');
  await conn.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
