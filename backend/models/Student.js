const { query, withTransaction } = require('../config/database');

const BASE = `
  SELECT s.*, d.name AS department_name, d.code AS department_code,
         c.name AS course_name, c.code AS course_code,
         (SELECT COUNT(*) FROM student_enrollments e WHERE e.student_id = s.id) AS enrolled_count
  FROM students s
  JOIN departments d ON d.id = s.department_id
  LEFT JOIN courses c ON c.id = s.course_id`;

const Student = {
  list({ search, department_id, course_id, semester, subject_id } = {}) {
    const where = [];
    const params = [];
    if (search) {
      where.push('(s.name LIKE ? OR s.student_code LIKE ? OR s.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department_id) { where.push('s.department_id = ?'); params.push(department_id); }
    if (course_id) { where.push('s.course_id = ?'); params.push(course_id); }
    if (semester) { where.push('s.semester = ?'); params.push(semester); }
    if (subject_id) { where.push('s.id IN (SELECT student_id FROM student_enrollments WHERE subject_id = ?)'); params.push(subject_id); }
    return query(`${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.student_code LIMIT 5000`, params);
  },

  async get(id) {
    const rows = await query(`${BASE} WHERE s.id = ?`, [id]);
    if (!rows.length) return null;
    const subjects = await query(
      `SELECT b.id, b.code, b.name, b.semester, b.duration_minutes
       FROM student_enrollments e JOIN subjects b ON b.id = e.subject_id
       WHERE e.student_id = ? ORDER BY b.code`, [id]);
    return { ...rows[0], subjects, subject_ids: subjects.map((s) => s.id) };
  },

  async findByCode(code) {
    const r = await query('SELECT id FROM students WHERE student_code = ?', [code]);
    return r[0] || null;
  },

  async create(data, subjectIds = []) {
    return withTransaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO students (student_code, name, email, department_id, course_id, semester, academic_year)
         VALUES (?,?,?,?,?,?,?)`,
        [data.student_code, data.name, data.email, data.department_id, data.course_id || null, data.semester, data.academic_year]);
      if (subjectIds.length) {
        await conn.query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ?', [subjectIds.map((sid) => [r.insertId, sid])]);
      }
      return r.insertId;
    });
  },

  async update(id, data, subjectIds) {
    return withTransaction(async (conn) => {
      const [r] = await conn.query(
        `UPDATE students SET student_code=?, name=?, email=?, department_id=?, course_id=?, semester=?, academic_year=? WHERE id=?`,
        [data.student_code, data.name, data.email, data.department_id, data.course_id || null, data.semester, data.academic_year, id]);
      if (Array.isArray(subjectIds)) {
        await conn.query('DELETE FROM student_enrollments WHERE student_id = ?', [id]);
        if (subjectIds.length) await conn.query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ?', [subjectIds.map((sid) => [id, sid])]);
      }
      return r.affectedRows;
    });
  },

  async setEnrollments(id, subjectIds) {
    return withTransaction(async (conn) => {
      await conn.query('DELETE FROM student_enrollments WHERE student_id = ?', [id]);
      if (subjectIds.length) await conn.query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ?', [subjectIds.map((sid) => [id, sid])]);
    });
  },

  async remove(id) {
    return (await query('DELETE FROM students WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = Student;
