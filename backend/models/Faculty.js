const { query } = require('../config/database');

const BASE = `
  SELECT f.*, d.name AS department_name, d.code AS department_code,
         (SELECT COUNT(*) FROM subject_faculty_eligibility x WHERE x.faculty_id = f.id) AS eligible_subject_count,
         (SELECT COUNT(*) FROM faculty_availability a WHERE a.faculty_id = f.id AND a.is_available = 0) AS unavailable_slot_count
  FROM faculty f JOIN departments d ON d.id = f.department_id`;

const Faculty = {
  list({ search, department_id } = {}) {
    const where = [];
    const params = [];
    if (search) {
      where.push('(f.name LIKE ? OR f.faculty_code LIKE ? OR f.email LIKE ? OR f.designation LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department_id) { where.push('f.department_id = ?'); params.push(department_id); }
    return query(`${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.faculty_code`, params);
  },

  async get(id) {
    const rows = await query(`${BASE} WHERE f.id = ?`, [id]);
    if (!rows.length) return null;
    const subjects = await query(
      `SELECT b.id, b.code, b.name FROM subject_faculty_eligibility x JOIN subjects b ON b.id = x.subject_id
       WHERE x.faculty_id = ? ORDER BY b.code`, [id]);
    return { ...rows[0], eligible_subjects: subjects };
  },

  async create(d) {
    const r = await query(
      'INSERT INTO faculty (faculty_code, name, email, department_id, designation, max_workload) VALUES (?,?,?,?,?,?)',
      [d.faculty_code, d.name, d.email, d.department_id, d.designation, d.max_workload]);
    return r.insertId;
  },

  async update(id, d) {
    const r = await query(
      'UPDATE faculty SET faculty_code=?, name=?, email=?, department_id=?, designation=?, max_workload=? WHERE id=?',
      [d.faculty_code, d.name, d.email, d.department_id, d.designation, d.max_workload, id]);
    return r.affectedRows;
  },

  async remove(id) {
    return (await query('DELETE FROM faculty WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = Faculty;
