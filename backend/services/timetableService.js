/** Builds every timetable view dynamically from the database records of one schedule run. */
const { query } = require('../config/database');
const Schedule = require('../models/Schedule');
const { absMinute, timeToMin, fmtTime } = require('../utils/helpers');

async function resolveRun(runId, periodId) {
  const id = runId ? Number(runId) : await Schedule.currentRunId(periodId);
  if (!id) return { run: null, exams: [] };
  const run = await Schedule.getRun(id);
  return { run, exams: run ? await Schedule.loadExams(id) : [] };
}

const endTime = (e) => {
  const m = timeToMin(e.start_time) + e.duration_minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const card = (e) => ({
  examination_id: e.examination_id, schedule_id: e.schedule_id, subject_id: e.subject_id,
  subject_code: e.subject_code, subject_name: e.subject_name,
  department_id: e.department_id, department_code: e.department_code, department_name: e.department_name,
  semester: e.semester, course_id: e.course_id, student_count: e.student_count, duration_minutes: e.duration_minutes,
  slot_id: e.slot_id, date: e.slot_date, slot_label: e.slot_label,
  start_time: fmtTime(e.start_time), end_time: fmtTime(e.end_time), exam_end_time: endTime(e),
  rooms: e.rooms, invigilators: e.invigilators, total_capacity: e.total_capacity,
});

/** Calendar grid: rows = date+slot, columns = rooms. */
async function complete(runId, periodId, filters = {}) {
  const { run, exams } = await resolveRun(runId, periodId);
  if (!run) return { run: null, rows: [], rooms: [], exams: [] };
  const list = exams.filter((e) =>
    (!filters.department_id || e.department_id === Number(filters.department_id)) &&
    (!filters.semester || e.semester === Number(filters.semester)) &&
    (!filters.course_id || e.course_id === Number(filters.course_id)) &&
    (!filters.date || e.slot_date === filters.date));
  const rooms = await query('SELECT id, room_code, name, building, capacity FROM examination_rooms ORDER BY building, floor, room_code');
  const slots = await query('SELECT id, slot_date, label, start_time, end_time, is_holiday FROM time_slots WHERE period_id = ? ORDER BY slot_date, start_time', [run.period_id]);
  const bySlot = {};
  for (const e of list) (bySlot[e.slot_id] ||= []).push(card(e));
  const rows = slots.filter((s) => !s.is_holiday || bySlot[s.id]).map((s) => ({
    slot_id: s.id, date: String(s.slot_date).slice(0, 10), label: s.label, start_time: fmtTime(s.start_time), end_time: fmtTime(s.end_time),
    holiday: !!s.is_holiday, exams: bySlot[s.id] || [],
  }));
  const usedRooms = new Set(list.flatMap((e) => e.rooms.map((r) => r.id)));
  return { run: await runSummary(run), rows, rooms: rooms.filter((r) => usedRooms.has(r.id) || !filters.department_id), exams: list.map(card), info: await Schedule.universityInfo(run.period_id) };
}

async function runSummary(run) {
  return { id: run.id, name: run.name, period_id: run.period_id, period_name: run.period_name, status: run.status, is_published: !!run.is_published, validation_status: run.validation_status, final_cost: run.final_cost, initial_cost: run.initial_cost, finished_at: run.finished_at };
}

async function studentTimetable(student, runId) {
  const { run, exams } = await resolveRun(runId);
  const subjects = await query('SELECT subject_id FROM student_enrollments WHERE student_id = ?', [student.id]);
  const mine = new Set(subjects.map((s) => s.subject_id));
  const items = exams.filter((e) => mine.has(e.subject_id)).map(card)
    .sort((a, b) => absMinute(a.date, a.start_time) - absMinute(b.date, b.start_time));
  let prevEnd = null;
  const sequence = items.map((it, i) => {
    const start = absMinute(it.date, it.start_time);
    const gap = prevEnd === null ? null : start - prevEnd;
    prevEnd = start + it.duration_minutes;
    return { ...it, sequence: i + 1, gap_minutes: gap, gap_hours: gap === null ? null : Math.round((gap / 60) * 10) / 10 };
  });
  const enrolled = mine.size;
  return { student, run: run ? await runSummary(run) : null, enrolled_subjects: enrolled, scheduled_count: sequence.length, unscheduled_count: enrolled - sequence.length, sequence };
}

async function facultyTimetable(faculty, runId) {
  const { run, exams } = await resolveRun(runId);
  const duties = [];
  for (const e of exams) {
    for (const inv of e.invigilators) {
      if (inv.faculty_id !== faculty.id) continue;
      const room = e.rooms.find((r) => r.id === inv.room_id) || e.rooms[0];
      duties.push({ ...card(e), duty_room: room || null });
    }
  }
  duties.sort((a, b) => absMinute(a.date, a.start_time) - absMinute(b.date, b.start_time));
  const total = duties.length;
  return {
    faculty, run: run ? await runSummary(run) : null, duties, total_duties: total,
    total_hours: Math.round((duties.reduce((a, d) => a + d.duration_minutes, 0) / 60) * 10) / 10,
    max_workload: faculty.max_workload, workload_percent: faculty.max_workload ? Math.round((total / faculty.max_workload) * 100) : 0,
  };
}

async function roomTimetable(room, runId) {
  const { run, exams } = await resolveRun(runId);
  const bookings = exams.filter((e) => e.rooms.some((r) => r.id === room.id)).map((e) => {
    const c = card(e);
    const perRoomSeats = e.rooms.length === 1 ? e.student_count : Math.min(room.capacity, e.student_count);
    return { ...c, occupancy: perRoomSeats, capacity: room.capacity, occupancy_percent: Math.round((perRoomSeats / room.capacity) * 100), shared_with_rooms: e.rooms.filter((r) => r.id !== room.id).map((r) => r.name) };
  }).sort((a, b) => absMinute(a.date, a.start_time) - absMinute(b.date, b.start_time));
  return { room, run: run ? await runSummary(run) : null, bookings, booking_count: bookings.length };
}

async function roomUsageSummary(runId) {
  const { run, exams } = await resolveRun(runId);
  if (!run) return { byRoom: {}, usableSlots: 0 };
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM time_slots WHERE period_id = ? AND is_holiday = 0 AND is_available = 1', [run.period_id]);
  const byRoom = {};
  for (const e of exams) for (const r of e.rooms) byRoom[r.id] = { exam_count: (byRoom[r.id]?.exam_count || 0) + 1 };
  for (const v of Object.values(byRoom)) v.utilization = n ? Math.round((v.exam_count / n) * 1000) / 10 : 0;
  return { byRoom, usableSlots: n };
}

module.exports = { resolveRun, complete, studentTimetable, facultyTimetable, roomTimetable, roomUsageSummary, card };
