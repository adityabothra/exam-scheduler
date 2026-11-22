const Schedule = require('../models/Schedule');
const OptimizationRun = require('../models/OptimizationRun');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Room = require('../models/Room');
const { query } = require('../config/database');
const timetable = require('../services/timetableService');
const { validateSchedule } = require('../services/constraintValidator');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');

const runIdOf = async (req) => {
  const id = req.query.runId || req.params.runId || (await Schedule.currentRunId(req.query.period_id));
  if (!id) throw new ApiError(404, 'No timetable has been generated yet. Run the AI Optimizer first.');
  return Number(id);
};
const requireRun = async (id) => {
  const run = await OptimizationRun.get(id);
  if (!run) throw new ApiError(404, 'Schedule run not found');
  return run;
};

exports.current = asyncHandler(async (req, res) => {
  const id = await Schedule.currentRunId(req.query.period_id);
  res.json({ runId: id, run: id ? await OptimizationRun.get(id) : null });
});

exports.complete = asyncHandler(async (req, res) => res.json(await timetable.complete(req.query.runId, req.query.period_id, req.query)));

exports.student = asyncHandler(async (req, res) => {
  // accepts the numeric id OR the student code (e.g. S26001)
  const key = req.params.id;
  const found = /^\d+$/.test(key) ? await Student.get(key) : await Student.get((await Student.findByCode(key))?.id || 0);
  if (!found) throw new ApiError(404, 'Student not found');
  res.json(await timetable.studentTimetable(found, req.query.runId));
});

exports.faculty = asyncHandler(async (req, res) => {
  const f = await Faculty.get(req.params.id);
  if (!f) throw new ApiError(404, 'Faculty member not found');
  res.json(await timetable.facultyTimetable(f, req.query.runId));
});

exports.room = asyncHandler(async (req, res) => {
  const r = await Room.get(req.params.id);
  if (!r) throw new ApiError(404, 'Room not found');
  res.json(await timetable.roomTimetable(r, req.query.runId));
});

/** Independent validation: re-reads the stored timetable from MySQL and re-checks every hard constraint. */
exports.validateRun = asyncHandler(async (req, res) => {
  const id = await runIdOf(req);
  await requireRun(id);
  const data = await Schedule.loadValidationData(id);
  const result = validateSchedule(data);
  await OptimizationRun.setValidation(id, result.valid ? 'valid' : 'invalid');
  if (!result.valid) await OptimizationRun.unpublish(id);
  res.json({ runId: id, ...result });
});

exports.publish = asyncHandler(async (req, res) => {
  const id = await runIdOf(req);
  const run = await requireRun(id);
  if (run.status !== 'completed') throw new ApiError(409, 'Only completed runs can be published');
  // never trust the stored flag: validate again right now
  const result = validateSchedule(await Schedule.loadValidationData(id));
  await OptimizationRun.setValidation(id, result.valid ? 'valid' : 'invalid');
  if (!result.valid) {
    throw new ApiError(422, `Cannot publish: ${result.total} hard-constraint violation(s) found. Resolve them on the Conflict Detection page first.`, { counts: result.counts });
  }
  await OptimizationRun.publish(id, run.period_id);
  res.json({ message: 'Timetable published', runId: id });
});

exports.unpublish = asyncHandler(async (req, res) => {
  const id = await runIdOf(req);
  await requireRun(id);
  await OptimizationRun.unpublish(id);
  res.json({ message: 'Timetable unpublished' });
});

/**
 * Manual adjustment of one examination (admin Step 18).
 * body: { slot_id, room_ids: [], invigilator_ids: [] }  - saved even if it creates conflicts so the
 * validator can show them; any change resets validation and un-publishes the run.
 */
exports.editExam = asyncHandler(async (req, res) => {
  const runId = Number(req.params.runId);
  const run = await requireRun(runId);
  if (run.status !== 'completed') throw new ApiError(409, 'Only completed runs can be edited');
  const examId = Number(req.params.examId);
  const exam = (await query('SELECT id, period_id FROM examinations WHERE id = ?', [examId]))[0];
  if (!exam || exam.period_id !== run.period_id) throw new ApiError(404, 'Examination not found in this run\'s period');
  const d = validate(req.body, {
    slot_id: { type: 'int', required: true, min: 1 },
    room_ids: { type: 'intArray', required: true },
    invigilator_ids: { type: 'intArray', required: true },
  });
  const slot = (await query('SELECT id FROM time_slots WHERE id = ? AND period_id = ?', [d.slot_id, run.period_id]))[0];
  if (!slot) throw new ApiError(400, 'Slot does not belong to this examination period');
  if (!d.room_ids.length) throw new ApiError(400, 'Select at least one room');
  const perRoom = Math.max(1, Number(run.config?.costParams?.invigilatorsPerRoom) || 1);
  // spread invigilators across the chosen rooms in order
  const invigilators = d.invigilator_ids.map((fid, k) => ({ faculty_id: fid, room_id: d.room_ids[Math.min(Math.floor(k / perRoom), d.room_ids.length - 1)] }));
  await Schedule.replaceAssignment(runId, examId, { slot_id: d.slot_id, room_ids: d.room_ids, invigilators });
  const result = validateSchedule(await Schedule.loadValidationData(runId));
  await OptimizationRun.setValidation(runId, result.valid ? 'valid' : 'invalid');
  res.json({ message: result.valid ? 'Saved - timetable is valid' : `Saved - ${result.total} conflict(s) detected`, validation: { valid: result.valid, total: result.total, counts: result.counts, conflicts: result.conflicts } });
});
