/**
 * Creates the database (if missing), applies schema.sql, and ensures the demo
 * administrator and default settings exist. Idempotent. Run: npm run db:init
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { DEFAULT_SETTINGS } = require('../config/defaults');

async function initDatabase() {
  const { database, ...conn } = config.db;
  const admin = await mysql.createConnection({ ...conn, multipleStatements: true });
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${database}\``);
    await admin.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

    const [users] = await admin.query('SELECT id FROM users WHERE username = ?', [config.adminUsername]);
    if (!users.length) {
      const hash = await bcrypt.hash(config.adminPassword, 10);
      await admin.query('INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)', [
        config.adminUsername, hash, 'System Administrator', 'admin',
      ]);
    }
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      await admin.query('INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [k, v]);
    }
  } finally {
    await admin.end();
  }
}

module.exports = { initDatabase };

if (require.main === module) {
  initDatabase()
    .then(() => { console.log(`Database "${config.db.database}" is ready. Admin user: ${config.adminUsername}`); process.exit(0); })
    .catch((e) => { console.error('Database initialisation failed:', e.message); process.exit(1); });
}
