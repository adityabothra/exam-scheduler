const { query, withTransaction } = require('../config/database');

const BASE = `
  SELECT b.*, d.name AS department_name, d.code AS department_code, c.name AS course_name,
         (SELECT COUNT(*) FROM student_enrollments e WHERE e.subject_id = b.id) AS enrolled_count,
         (SELECT COUNT(*) FROM subject_faculty_eligibility x WHERE x.subject_id = b.id) AS eligible_faculty_count
  FROM subjects b
  JOIN departments d ON d.id = b.department_id
  LEFT JOIN courses c ON c.id = b.course_id`;

const Subject = {
  list({ search, department_id, semester } = {}) {
    const where = [];
    const params = [];
    if (search) { where.push('(b.name LIKE ? OR b.code LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (department_id) { where.push('b.department_id = ?'); params.push(department_id); }
    if (semester) { where.push('b.semester = ?'); params.push(semester); }
    return query(`${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.code`, params);
  },

  async get(id) {
    const rows = await query(`${BASE} WHERE b.id = ?`, [id]);
    if (!rows.length) return null;
    const faculty = await query(
      `SELECT f.id, f.faculty_code, f.name FROM subject_faculty_eligibility x JOIN faculty f ON f.id = x.faculty_id
       WHERE x.subject_id = ? ORDER BY f.name`, [id]);
    const students = await query(
      `SELECT s.id, s.student_code, s.name, s.semester FROM student_enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.subject_id = ? ORDER BY s.student_code`, [id]);
    return { ...rows[0], faculty, faculty_ids: faculty.map((f) => f.id), students, student_ids: students.map((s) => s.id) };
  },

  async create(d, facultyIds = []) {
    return withTransaction(async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO subjects (code, name, department_id, course_id, semester, duration_minutes, priority) VALUES (?,?,?,?,?,?,?)',
        [d.code, d.name, d.department_id, d.course_id || null, d.semester, d.duration_minutes, d.priority]);
      if (facultyIds.length) await conn.query('INSERT INTO subject_faculty_eligibility (subject_id, faculty_id) VALUES ?', [facultyIds.map((f) => [r.insertId, f])]);
      return r.insertId;
    });
  },

  async update(id, d, facultyIds) {
    return withTransaction(async (conn) => {
      const [r] = await conn.query(
        'UPDATE subjects SET code=?, name=?, department_id=?, course_id=?, semester=?, duration_minutes=?, priority=? WHERE id=?',
        [d.code, d.name, d.department_id, d.course_id || null, d.semester, d.duration_minutes, d.priority, id]);
      if (Array.isArray(facultyIds)) {
        await conn.query('DELETE FROM subject_faculty_eligibility WHERE subject_id = ?', [id]);
        if (facultyIds.length) await conn.query('INSERT INTO subject_faculty_eligibility (subject_id, faculty_id) VALUES ?', [facultyIds.map((f) => [id, f])]);
      }
      return r.affectedRows;
    });
  },

  async setEnrollments(id, studentIds) {
    return withTransaction(async (conn) => {
      await conn.query('DELETE FROM student_enrollments WHERE subject_id = ?', [id]);
      if (studentIds.length) await conn.query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ?', [studentIds.map((s) => [s, id])]);
    });
  },

  async remove(id) {
    return (await query('DELETE FROM subjects WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = Subject;
