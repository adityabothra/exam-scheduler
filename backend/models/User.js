const { query } = require('../config/database');

const User = {
  async findByUsername(username) {
    const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  },
  async findById(id) {
    const rows = await query('SELECT id, username, full_name, role FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  },
  async create({ username, password_hash, full_name, role = 'admin' }) {
    const r = await query('INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)', [username, password_hash, full_name, role]);
    return r.insertId;
  },
  async updatePassword(id, password_hash) {
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
  },
};

module.exports = User;
