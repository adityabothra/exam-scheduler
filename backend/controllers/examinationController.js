const Examination = require('../models/Examination');
const { Period } = require('../models/TimeSlot');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');
const { buildProblem, analyzeFeasibility } = require('../services/problemBuilder');

const resolvePeriod = async (id) => {
  const p = id ? await Period.get(id) : await Period.getActive();
  if (!p) throw new ApiError(400, 'No examination period exists yet. Create one under Time Slots first.');
  return p;
};

exports.list = asyncHandler(async (req, res) => {
  const period = await resolvePeriod(req.query.period_id);
  res.json({ period, examinations: await Examination.list(period.id) });
});

exports.create = asyncHandler(async (req, res) => {
  const d = validate(req.body, {
    subject_id: { type: 'int', required: true, min: 1 },
    period_id: { type: 'int', min: 1 },
    duration_minutes: { type: 'int', min: 15, max: 600 },
  });
  const period = await resolvePeriod(d.period_id);
  const id = await Examination.create({ ...d, period_id: period.id });
  if (!id) throw new ApiError(404, 'Subject not found');
  res.status(201).json(await Examination.get(id));
});

exports.generate = asyncHandler(async (req, res) => {
  const period = await resolvePeriod(req.body.period_id);
  const created = await Examination.generateForPeriod(period.id);
  res.json({ created, message: created ? `${created} examination(s) created from subjects with enrolled students` : 'All subjects with enrolled students already have an examination in this period' });
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await Examination.get(req.params.id))) throw new ApiError(404, 'Examination not found');
  const d = validate(req.body, { duration_minutes: { type: 'int', required: true, min: 15, max: 600 } });
  await Examination.update(req.params.id, d);
  res.json(await Examination.get(req.params.id));
});

exports.remove = asyncHandler(async (req, res) => {
  if (!(await Examination.remove(req.params.id))) throw new ApiError(404, 'Examination not found');
  res.json({ message: 'Examination deleted' });
});

/** Pre-flight analysis: explains up front whether a valid timetable can possibly exist. */
exports.feasibility = asyncHandler(async (req, res) => {
  const period = await resolvePeriod(req.query.period_id);
  const problem = await buildProblem(period.id);
  res.json({ period, ...analyzeFeasibility(problem) });
});
