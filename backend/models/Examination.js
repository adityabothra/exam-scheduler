const { query } = require('../config/database');

const Examination = {
  list(periodId) {
    return query(`
      SELECT e.id, e.subject_id, e.period_id, e.duration_minutes,
             b.code AS subject_code, b.name AS subject_name, b.semester, b.priority,
             b.department_id, d.name AS department_name, d.code AS department_code,
             (SELECT COUNT(*) FROM student_enrollments se WHERE se.subject_id = b.id) AS student_count
      FROM examinations e
      JOIN subjects b ON b.id = e.subject_id
      JOIN departments d ON d.id = b.department_id
      WHERE e.period_id = ? ORDER BY b.code`, [periodId]);
  },

  async get(id) {
    const r = await query('SELECT * FROM examinations WHERE id = ?', [id]);
    return r[0] || null;
  },

  async create({ subject_id, period_id, duration_minutes }) {
    const sub = (await query('SELECT duration_minutes FROM subjects WHERE id = ?', [subject_id]))[0];
    if (!sub) return null;
    const r = await query('INSERT INTO examinations (subject_id, period_id, duration_minutes) VALUES (?,?,?)',
      [subject_id, period_id, duration_minutes || sub.duration_minutes]);
    return r.insertId;
  },

  /** Creates an exam event for every subject that has enrolled students and is not yet in the period. */
  async generateForPeriod(periodId) {
    const r = await query(`
      INSERT INTO examinations (subject_id, period_id, duration_minutes)
      SELECT b.id, ?, b.duration_minutes FROM subjects b
      WHERE EXISTS (SELECT 1 FROM student_enrollments se WHERE se.subject_id = b.id)
        AND NOT EXISTS (SELECT 1 FROM examinations e WHERE e.subject_id = b.id AND e.period_id = ?)`, [periodId, periodId]);
    return r.affectedRows;
  },

  async update(id, { duration_minutes }) {
    return (await query('UPDATE examinations SET duration_minutes = ? WHERE id = ?', [duration_minutes, id])).affectedRows;
  },

  async remove(id) {
    return (await query('DELETE FROM examinations WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = Examination;
