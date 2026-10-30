import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME,
  user: env.DB_USER, password: env.DB_PASSWORD,
  waitForConnections: true, connectionLimit: 10, queueLimit: 50,
  connectTimeout: 3000, timezone: 'Z', decimalNumbers: false,
  multipleStatements: false
});
pool.on('connection',connection=>{connection.query("SET time_zone = '+00:00'");});
export async function checkDatabase() {
  await pool.query('SELECT 1');
}
