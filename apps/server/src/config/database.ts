import mysql from 'mysql2/promise';
import { env } from './env';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  timezone: '+00:00',
});

// mysql2's `timezone` option only affects client-side parsing — it does NOT send
// SET time_zone to MySQL. Send it explicitly so MySQL returns all datetimes in UTC,
// which matches what mysql2 expects when timezone: '+00:00' is set.
// pool.on('connection') fires with the raw (callback-style) connection at runtime,
// even when using mysql2/promise. Cast to any to use the callback overload.
pool.on('connection', (connection) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (connection as any).query("SET time_zone = '+00:00'", (err: unknown) => {
    if (err) console.error('Failed to set MySQL session timezone:', err);
  });
});
