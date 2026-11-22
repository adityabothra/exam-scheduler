const { query, withTransaction } = require('../config/database');

const Period = {
  list() {
    return query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM time_slots t WHERE t.period_id = p.id) AS slot_count,
        (SELECT COUNT(*) FROM time_slots t WHERE t.period_id = p.id AND t.is_holiday = 0 AND t.is_available = 1) AS usable_slot_count,
        (SELECT COUNT(*) FROM examinations e WHERE e.period_id = p.id) AS exam_count
      FROM examination_periods p ORDER BY p.start_date DESC`);
  },
  async get(id) {
    const r = await query('SELECT * FROM examination_periods WHERE id = ?', [id]);
    return r[0] || null;
  },
  /** The active period, or the most recent one when none is flagged active. */
  async getActive() {
    const r = await query('SELECT * FROM examination_periods ORDER BY is_active DESC, start_date DESC LIMIT 1');
    return r[0] || null;
  },
  async create(d) {
    return withTransaction(async (conn) => {
      const [cnt] = await conn.query('SELECT COUNT(*) AS n FROM examination_periods');
      const makeActive = d.is_active || cnt[0].n === 0;
      if (makeActive) await conn.query('UPDATE examination_periods SET is_active = 0');
      const [r] = await conn.query(
        'INSERT INTO examination_periods (name, session_name, academic_year, start_date, end_date, is_active) VALUES (?,?,?,?,?,?)',
        [d.name, d.session_name, d.academic_year, d.start_date, d.end_date, makeActive ? 1 : 0]);
      return r.insertId;
    });
  },
  async update(id, d) {
    return (await query(
      'UPDATE examination_periods SET name=?, session_name=?, academic_year=?, start_date=?, end_date=? WHERE id=?',
      [d.name, d.session_name, d.academic_year, d.start_date, d.end_date, id])).affectedRows;
  },
  async activate(id) {
    await withTransaction(async (conn) => {
      await conn.query('UPDATE examination_periods SET is_active = 0');
      await conn.query('UPDATE examination_periods SET is_active = 1 WHERE id = ?', [id]);
    });
  },
  async remove(id) {
    return (await query('DELETE FROM examination_periods WHERE id = ?', [id])).affectedRows;
  },
};

const Slot = {
  list(periodId) {
    return query(
      `SELECT t.*, (SELECT COUNT(*) FROM examination_schedules s WHERE s.slot_id = t.id) AS schedule_refs
       FROM time_slots t WHERE t.period_id = ? ORDER BY t.slot_date, t.start_time`, [periodId]);
  },
  async get(id) {
    const r = await query('SELECT * FROM time_slots WHERE id = ?', [id]);
    return r[0] || null;
  },
  async create(d) {
    const r = await query(
      'INSERT INTO time_slots (period_id, slot_date, label, start_time, end_time, is_holiday, is_available) VALUES (?,?,?,?,?,?,?)',
      [d.period_id, d.slot_date, d.label, d.start_time, d.end_time, d.is_holiday ? 1 : 0, d.is_available ? 1 : 0]);
    return r.insertId;
  },
  /** Creates (dates x templates) slots, skipping combinations that already exist. */
  async bulkCreate(periodId, dates, templates, isHoliday) {
    let created = 0;
    await withTransaction(async (conn) => {
      for (const date of dates) {
        for (const t of templates) {
          const [r] = await conn.query(
            `INSERT IGNORE INTO time_slots (period_id, slot_date, label, start_time, end_time, is_holiday, is_available)
             VALUES (?,?,?,?,?,?,1)`,
            [periodId, date, t.label, t.start_time, t.end_time, isHoliday ? 1 : 0]);
          created += r.affectedRows;
        }
      }
    });
    return created;
  },
  async update(id, d) {
    return (await query(
      'UPDATE time_slots SET slot_date=?, label=?, start_time=?, end_time=?, is_holiday=?, is_available=? WHERE id=?',
      [d.slot_date, d.label, d.start_time, d.end_time, d.is_holiday ? 1 : 0, d.is_available ? 1 : 0, id])).affectedRows;
  },
  async setHolidayForDate(periodId, date, isHoliday) {
    return (await query('UPDATE time_slots SET is_holiday = ? WHERE period_id = ? AND slot_date = ?', [isHoliday ? 1 : 0, periodId, date])).affectedRows;
  },
  async remove(id) {
    return (await query('DELETE FROM time_slots WHERE id = ?', [id])).affectedRows;
  },
};

module.exports = { Period, Slot };
