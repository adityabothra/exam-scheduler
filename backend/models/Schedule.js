const { query, withTransaction } = require('../config/database');
const Setting = require('./Setting');
const { parseJson } = require('../utils/helpers');

const Schedule = {
  /** Published run of the period if any, else the latest completed run. */
  async currentRunId(periodId) {
    const p = periodId ? [periodId] : [];
    const pf = periodId ? 'AND period_id = ?' : '';
    let r = await query(`SELECT id FROM optimization_runs WHERE is_published = 1 ${pf} ORDER BY id DESC LIMIT 1`, p);
    if (!r.length) r = await query(`SELECT id FROM optimization_runs WHERE status = 'completed' ${pf} ORDER BY id DESC LIMIT 1`, p);
    return r.length ? r[0].id : null;
  },

  async getRun(runId) {
    const r = await query(
      `SELECT r.*, p.name AS period_name, p.session_name, p.academic_year
       FROM optimization_runs r JOIN examination_periods p ON p.id = r.period_id WHERE r.id = ?`, [runId]);
    if (!r.length) return null;
    const run = r[0];
    run.config = parseJson(run.config, {});
    run.initial_breakdown = parseJson(run.initial_breakdown);
    run.final_breakdown = parseJson(run.final_breakdown);
    return run;
  },

  /** Every scheduled examination of a run with its slot, rooms, invigilators and student count. */
  async loadExams(runId) {
    const rows = await query(
      `SELECT sc.id AS schedule_id, sc.examination_id, sc.slot_id, e.subject_id, e.duration_minutes,
              b.code AS subject_code, b.name AS subject_name, b.semester, b.department_id, b.course_id,
              d.code AS department_code, d.name AS department_name,
              t.slot_date, t.label AS slot_label, t.start_time, t.end_time,
              (SELECT COUNT(*) FROM student_enrollments se WHERE se.subject_id = b.id) AS student_count
       FROM examination_schedules sc
       JOIN examinations e ON e.id = sc.examination_id
       JOIN subjects b ON b.id = e.subject_id
       JOIN departments d ON d.id = b.department_id
       JOIN time_slots t ON t.id = sc.slot_id
       WHERE sc.run_id = ? ORDER BY t.slot_date, t.start_time, b.code`, [runId]);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.schedule_id);
    const rooms = await query(
      `SELECT a.schedule_id, r.id, r.room_code, r.name, r.building, r.capacity
       FROM examination_room_assignments a JOIN examination_rooms r ON r.id = a.room_id WHERE a.schedule_id IN (?) ORDER BY r.capacity DESC, r.id`, [ids]);
    const inv = await query(
      `SELECT a.schedule_id, f.id AS faculty_id, f.faculty_code, f.name, a.room_id
       FROM faculty_invigilator_assignments a JOIN faculty f ON f.id = a.faculty_id WHERE a.schedule_id IN (?) ORDER BY a.id`, [ids]);
    const byS = (list) => list.reduce((m, x) => { (m[x.schedule_id] ||= []).push(x); return m; }, {});
    const rm = byS(rooms), iv = byS(inv);
    return rows.map((r) => {
      const rl = rm[r.schedule_id] || [];
      return {
        ...r, slot_date: String(r.slot_date).slice(0, 10),
        rooms: rl, invigilators: iv[r.schedule_id] || [],
        total_capacity: rl.reduce((a, x) => a + x.capacity, 0),
      };
    });
  },

  /** Student ids per subject for the subjects scheduled in a run. */
  async studentsBySubject(subjectIds) {
    if (!subjectIds.length) return {};
    const rows = await query('SELECT subject_id, student_id FROM student_enrollments WHERE subject_id IN (?)', [subjectIds]);
    const m = {};
    for (const r of rows) (m[r.subject_id] ||= []).push(r.student_id);
    return m;
  },

  /** Everything validateSchedule() needs, read straight from the database. */
  async loadValidationData(runId) {
    const run = await this.getRun(runId);
    if (!run) return null;
    const exams = await this.loadExams(runId);
    const periodExams = await query(
      `SELECT e.id AS examination_id, e.subject_id, e.duration_minutes, b.code, b.name FROM examinations e JOIN subjects b ON b.id = e.subject_id WHERE e.period_id = ?`, [run.period_id]);
    const bySubject = await this.studentsBySubject([...new Set(periodExams.map((e) => e.subject_id))]);

    const scheduled = new Map(exams.map((e) => [e.examination_id, e]));
    const examList = periodExams
      .filter((e) => (bySubject[e.subject_id] || []).length > 0) // exams without students are not part of the optimisation
      .map((e) => {
        const s = scheduled.get(e.examination_id);
        return {
          examination_id: e.examination_id, subject_id: e.subject_id, code: e.code, name: e.name,
          duration: s ? s.duration_minutes : e.duration_minutes,
          slot_id: s ? s.slot_id : null,
          room_ids: s ? s.rooms.map((r) => r.id) : [],
          invigilators: s ? s.invigilators.map((i) => ({ faculty_id: i.faculty_id, room_id: i.room_id })) : [],
          student_ids: bySubject[e.subject_id] || [],
        };
      });

    const slots = {};
    for (const s of await query('SELECT * FROM time_slots WHERE period_id = ?', [run.period_id])) slots[s.id] = { ...s, date: String(s.slot_date).slice(0, 10) };
    const rooms = {};
    for (const r of await query('SELECT id, name, capacity, status FROM examination_rooms')) rooms[r.id] = r;
    const faculty = {};
    for (const f of await query('SELECT id, name, max_workload FROM faculty')) faculty[f.id] = f;
    const students = {};
    for (const s of await query('SELECT id, student_code AS code, name FROM students')) students[s.id] = s;
    const roomUnavailable = new Set((await query('SELECT room_id, slot_id FROM room_availability WHERE is_available = 0')).map((r) => `${r.room_id}:${r.slot_id}`));
    const facultyUnavailable = new Set((await query('SELECT faculty_id, slot_id FROM faculty_availability WHERE is_available = 0')).map((r) => `${r.faculty_id}:${r.slot_id}`));
    const eligibility = new Map();
    for (const el of await query('SELECT subject_id, faculty_id FROM subject_faculty_eligibility')) {
      if (!eligibility.has(el.subject_id)) eligibility.set(el.subject_id, new Set());
      eligibility.get(el.subject_id).add(el.faculty_id);
    }
    const perRoom = Math.max(1, Number(run.config?.costParams?.invigilatorsPerRoom) || 1);
    return { run, slots, exams: examList, rooms, faculty, students, roomUnavailable, facultyUnavailable, eligibility, perRoom };
  },

  /** Persist an optimiser solution (arrays of plain database ids) for a run. */
  async saveAssignments(conn, runId, assignments) {
    for (const a of assignments) {
      const [r] = await conn.query('INSERT INTO examination_schedules (run_id, examination_id, slot_id) VALUES (?,?,?)', [runId, a.examination_id, a.slot_id]);
      if (a.room_ids.length) await conn.query('INSERT INTO examination_room_assignments (schedule_id, room_id) VALUES ?', [a.room_ids.map((rid) => [r.insertId, rid])]);
      if (a.invigilators.length) {
        await conn.query('INSERT INTO faculty_invigilator_assignments (schedule_id, faculty_id, room_id) VALUES ?', [a.invigilators.map((i) => [r.insertId, i.faculty_id, i.room_id || null])]);
      }
    }
  },

  /** Replace one examination's slot/rooms/invigilators inside a run (manual adjustment). */
  async replaceAssignment(runId, examinationId, { slot_id, room_ids, invigilators }) {
    return withTransaction(async (conn) => {
      const [ex] = await conn.query('SELECT id FROM examination_schedules WHERE run_id = ? AND examination_id = ?', [runId, examinationId]);
      let scheduleId;
      if (ex.length) {
        scheduleId = ex[0].id;
        await conn.query('UPDATE examination_schedules SET slot_id = ? WHERE id = ?', [slot_id, scheduleId]);
        await conn.query('DELETE FROM examination_room_assignments WHERE schedule_id = ?', [scheduleId]);
        await conn.query('DELETE FROM faculty_invigilator_assignments WHERE schedule_id = ?', [scheduleId]);
      } else {
        const [r] = await conn.query('INSERT INTO examination_schedules (run_id, examination_id, slot_id) VALUES (?,?,?)', [runId, examinationId, slot_id]);
        scheduleId = r.insertId;
      }
      if (room_ids.length) await conn.query('INSERT INTO examination_room_assignments (schedule_id, room_id) VALUES ?', [room_ids.map((rid) => [scheduleId, rid])]);
      if (invigilators.length) await conn.query('INSERT INTO faculty_invigilator_assignments (schedule_id, faculty_id, room_id) VALUES ?', [invigilators.map((i) => [scheduleId, i.faculty_id, i.room_id || null])]);
      await conn.query("UPDATE optimization_runs SET validation_status = 'unvalidated', is_published = 0 WHERE id = ?", [runId]);
    });
  },

  async universityInfo(periodId) {
    const name = await Setting.get('university_name', 'University');
    const rows = periodId ? await query('SELECT session_name, academic_year, name FROM examination_periods WHERE id = ?', [periodId]) : [];
    return { university_name: name, session_name: rows[0]?.session_name || '', academic_year: rows[0]?.academic_year || '', period_name: rows[0]?.name || '' };
  },
};

module.exports = Schedule;
