const { query } = require('../config/database');
const Schedule = require('../models/Schedule');
const OptimizationRun = require('../models/OptimizationRun');
const { Period } = require('../models/TimeSlot');
const { validateSchedule } = require('../services/constraintValidator');
const { asyncHandler, parseJson, timeToMin, round } = require('../utils/helpers');

const one = async (sql, p = []) => Object.values((await query(sql, p))[0])[0];

/** Every number on the dashboard is computed from MySQL on each request. */
exports.stats = asyncHandler(async (req, res) => {
  const period = req.query.period_id ? await Period.get(req.query.period_id) : await Period.getActive();
  const totals = {
    students: await one('SELECT COUNT(*) FROM students'),
    faculty: await one('SELECT COUNT(*) FROM faculty'),
    subjects: await one('SELECT COUNT(*) FROM subjects'),
    rooms: await one('SELECT COUNT(*) FROM examination_rooms'),
    departments: await one('SELECT COUNT(*) FROM departments'),
  };
  if (!period) return res.json({ totals, period: null, hasSchedule: false });

  const usableSlots = await one('SELECT COUNT(*) FROM time_slots WHERE period_id = ? AND is_holiday = 0 AND is_available = 1', [period.id]);
  const totalExams = await one('SELECT COUNT(*) FROM examinations WHERE period_id = ?', [period.id]);
  const runId = await Schedule.currentRunId(period.id);
  const base = { totals, period, usableSlots, totalExams, runId, hasSchedule: !!runId };
  if (!runId) return res.json({ ...base, scheduledExams: 0, conflicts: 0, roomUtilization: 0, facultyUtilization: 0, studentCoverage: 0, charts: null });

  const run = await OptimizationRun.get(runId);
  const exams = await Schedule.loadExams(runId);
  const validation = validateSchedule(await Schedule.loadValidationData(runId));

  // exams per day / per slot
  const perDay = {}, perSlot = {};
  for (const e of exams) {
    perDay[e.slot_date] = (perDay[e.slot_date] || 0) + 1;
    const key = `${e.slot_label} ${String(e.start_time).slice(0, 5)}`;
    perSlot[key] = (perSlot[key] || 0) + 1;
  }
  // room utilisation: share of usable slots in which each room is booked
  const roomRows = await query("SELECT id, name, capacity FROM examination_rooms WHERE status = 'available' ORDER BY name");
  const roomBookings = {};
  for (const e of exams) for (const r of e.rooms) roomBookings[r.id] = (roomBookings[r.id] || 0) + 1;
  const roomUtil = roomRows.map((r) => ({ name: r.name, exams: roomBookings[r.id] || 0, utilization: usableSlots ? round(((roomBookings[r.id] || 0) / usableSlots) * 100, 1) : 0 }));
  const roomUtilization = roomUtil.length && usableSlots ? round((roomUtil.reduce((a, r) => a + r.exams, 0) / (roomUtil.length * usableSlots)) * 100, 1) : 0;

  // faculty workload
  const facRows = await query('SELECT id, name, max_workload FROM faculty ORDER BY name');
  const duty = {};
  for (const e of exams) for (const i of e.invigilators) duty[i.faculty_id] = (duty[i.faculty_id] || 0) + 1;
  const workload = facRows.map((f) => ({ name: f.name.replace(/^(Dr|Prof)\.\s*/, ''), duties: duty[f.id] || 0, max: f.max_workload }));
  const totalMax = facRows.reduce((a, f) => a + f.max_workload, 0);
  const facultyUtilization = totalMax ? round((workload.reduce((a, w) => a + w.duties, 0) / totalMax) * 100, 1) : 0;

  // student coverage: enrolled students whose every exam is scheduled
  const enrolled = await query('SELECT DISTINCT student_id FROM student_enrollments');
  const scheduledSubjects = new Set(exams.map((e) => e.subject_id));
  const missing = await query('SELECT DISTINCT student_id FROM student_enrollments WHERE subject_id NOT IN (?)', [scheduledSubjects.size ? [...scheduledSubjects] : [0]]);
  const covered = enrolled.length - missing.length;

  const series = (await OptimizationRun.getResults(runId)).series;
  const conflictStats = Object.entries(validation.counts).map(([type, count]) => ({ type, count }));

  res.json({
    ...base, run: { id: run.id, name: run.name, status: run.status, is_published: run.is_published, validation_status: run.validation_status, initial_cost: run.initial_cost, final_cost: run.final_cost },
    scheduledExams: exams.length, conflicts: validation.total, roomUtilization, facultyUtilization,
    studentCoverage: enrolled.length ? round((covered / enrolled.length) * 100, 1) : 0, studentsCovered: covered, studentsEnrolled: enrolled.length,
    charts: {
      examsPerDay: Object.entries(perDay).sort().map(([date, count]) => ({ date, count })),
      examsPerSlot: Object.entries(perSlot).map(([slot, count]) => ({ slot, count })),
      roomUtilization: roomUtil, facultyWorkload: workload,
      costComparison: [
        { name: 'Student', initial: round(run.initial_breakdown?.student ?? 0), optimized: round(run.final_breakdown?.student ?? 0) },
        { name: 'Faculty', initial: round(run.initial_breakdown?.faculty ?? 0), optimized: round(run.final_breakdown?.faculty ?? 0) },
        { name: 'Room', initial: round(run.initial_breakdown?.room ?? 0), optimized: round(run.final_breakdown?.room ?? 0) },
        { name: 'Spacing', initial: round(run.initial_breakdown?.spacing ?? 0), optimized: round(run.final_breakdown?.spacing ?? 0) },
        { name: 'Total', initial: round(run.initial_cost ?? 0), optimized: round(run.final_cost ?? 0) },
      ],
      conflictStats, convergence: series,
    },
  });
});

exports.systemInfo = asyncHandler(async (req, res) => {
  const Setting = require('../models/Setting');
  res.json({ university_name: await Setting.get('university_name', 'University') });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const Setting = require('../models/Setting');
  const name = String(req.body.university_name || '').trim();
  if (!name) return res.status(400).json({ error: 'University name is required' });
  await Setting.set('university_name', name.slice(0, 120));
  res.json({ university_name: name });
});

exports.loadDemo = asyncHandler(async (req, res) => {
  const { loadDemoDataset } = require('../db/demoData');
  res.json({ message: 'Demo dataset loaded', summary: await loadDemoDataset() });
});

exports.clearData = asyncHandler(async (req, res) => {
  const { clearAllData } = require('../db/demoData');
  await clearAllData();
  res.json({ message: 'All university data cleared' });
});
