const Faculty = require('../models/Faculty');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');
const timetable = require('../services/timetableService');

const schema = {
  faculty_code: { type: 'string', required: true, max: 30 },
  name: { type: 'string', required: true, max: 120 },
  email: { type: 'email', required: true, max: 150 },
  department_id: { type: 'int', required: true, min: 1 },
  designation: { type: 'string', required: true, max: 60 },
  max_workload: { type: 'int', min: 1, max: 100, default: 6 },
};

exports.list = asyncHandler(async (req, res) => res.json(await Faculty.list(req.query)));

exports.get = asyncHandler(async (req, res) => {
  const f = await Faculty.get(req.params.id);
  if (!f) throw new ApiError(404, 'Faculty member not found');
  res.json(f);
});

exports.create = asyncHandler(async (req, res) => {
  const id = await Faculty.create(validate(req.body, schema));
  res.status(201).json(await Faculty.get(id));
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await Faculty.get(req.params.id))) throw new ApiError(404, 'Faculty member not found');
  await Faculty.update(req.params.id, validate(req.body, schema));
  res.json(await Faculty.get(req.params.id));
});

exports.remove = asyncHandler(async (req, res) => {
  if (!(await Faculty.remove(req.params.id))) throw new ApiError(404, 'Faculty member not found');
  res.json({ message: 'Faculty member deleted' });
});

/** Invigilation duties and workload in the chosen (or current) schedule run. */
exports.schedule = asyncHandler(async (req, res) => {
  const f = await Faculty.get(req.params.id);
  if (!f) throw new ApiError(404, 'Faculty member not found');
  res.json(await timetable.facultyTimetable(f, req.query.runId));
});
