const { query } = require('../config/database');

const Room = {
  list({ search, room_type, status } = {}) {
    const where = [];
    const params = [];
    if (search) {
      where.push('(r.name LIKE ? OR r.room_code LIKE ? OR r.building LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (room_type) { where.push('r.room_type = ?'); params.push(room_type); }
    if (status) { where.push('r.status = ?'); params.push(status); }
    return query(
      `SELECT r.*, (SELECT COUNT(*) FROM room_availability a WHERE a.room_id = r.id AND a.is_available = 0) AS unavailable_slot_count
       FROM examination_rooms r ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.building, r.floor, r.room_code`, params);
  },

  async get(id) {
    const r = await query('SELECT * FROM examination_rooms WHERE id = ?', [id]);
    return r[0] || null;
  },

  async create(d) {
    const r = await query(
      'INSERT INTO examination_rooms (room_code, name, building, floor, capacity, room_type, status) VALUES (?,?,?,?,?,?,?)',
      [d.room_code, d.name, d.building, d.floor, d.capacity, d.room_type, d.status]);
    return r.insertId;
  },

  async update(id, d) {
    return (await query(
      'UPDATE examination_rooms SET room_code=?, name=?, building=?, floor=?, capacity=?, room_type=?, status=? WHERE id=?',
      [d.room_code, d.name, d.building, d.floor, d.capacity, d.room_type, d.status, id])).affectedRows;
  },

  async remove(id) {
    return (await query('DELETE FROM examination_rooms WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = Room;
