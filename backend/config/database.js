const mysql = require('mysql2/promise');
const config = require('./index');

// dateStrings keeps DATE/TIME columns as plain 'YYYY-MM-DD' / 'HH:MM:SS' strings,
// which avoids every timezone-shift bug when comparing exam intervals.
const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  decimalNumbers: true,
  charset: 'utf8mb4',
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run fn(conn) inside a transaction; commits on success, rolls back on any error. */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
