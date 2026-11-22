const { query } = require('../config/database');

const Department = {
  list() {
    return query(`
      SELECT d.*,
        (SELECT COUNT(*) FROM courses c  WHERE c.department_id = d.id)  AS course_count,
        (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id)  AS student_count,
        (SELECT COUNT(*) FROM faculty f  WHERE f.department_id = d.id)  AS faculty_count,
        (SELECT COUNT(*) FROM subjects b WHERE b.department_id = d.id)  AS subject_count
      FROM departments d ORDER BY d.code`);
  },
  async get(id) {
    const r = await query('SELECT * FROM departments WHERE id = ?', [id]);
    return r[0] || null;
  },
  async create({ code, name }) {
    const r = await query('INSERT INTO departments (code, name) VALUES (?,?)', [code.toUpperCase(), name]);
    return r.insertId;
  },
  async update(id, { code, name }) {
    const r = await query('UPDATE departments SET code = ?, name = ? WHERE id = ?', [code.toUpperCase(), name, id]);
    return r.affectedRows;
  },
  async remove(id) {
    return (await query('DELETE FROM departments WHERE id = ?', [id])).affectedRows;
  },
};

const Course = {
  list({ department_id } = {}) {
    const params = [];
    let where = '';
    if (department_id) { where = 'WHERE c.department_id = ?'; params.push(department_id); }
    return query(`
      SELECT c.*, d.name AS department_name, d.code AS department_code,
        (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id) AS student_count
      FROM courses c JOIN departments d ON d.id = c.department_id ${where} ORDER BY c.code`, params);
  },
  async get(id) {
    const r = await query('SELECT * FROM courses WHERE id = ?', [id]);
    return r[0] || null;
  },
  async create({ department_id, code, name }) {
    const r = await query('INSERT INTO courses (department_id, code, name) VALUES (?,?,?)', [department_id, code.toUpperCase(), name]);
    return r.insertId;
  },
  async update(id, { department_id, code, name }) {
    return (await query('UPDATE courses SET department_id = ?, code = ?, name = ? WHERE id = ?', [department_id, code.toUpperCase(), name, id])).affectedRows;
  },
  async remove(id) {
    return (await query('DELETE FROM courses WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = { Department, Course };
