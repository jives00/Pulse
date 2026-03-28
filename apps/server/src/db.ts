import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'dramuser',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dram',
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
