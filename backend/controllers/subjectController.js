const Subject = require('../models/Subject');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');

const schema = {
  code: { type: 'string', required: true, max: 20 },
  name: { type: 'string', required: true, max: 150 },
  department_id: { type: 'int', required: true, min: 1 },
  course_id: { type: 'int', nullable: true, min: 1 },
  semester: { type: 'int', required: true, min: 1, max: 12 },
  duration_minutes: { type: 'int', min: 15, max: 600, default: 180 },
  priority: { type: 'int', min: 1, max: 5, default: 3 },
};
const facultyIdsOf = (body) => (body.faculty_ids === undefined ? undefined : validate(body, { faculty_ids: { type: 'intArray' } }).faculty_ids);

exports.list = asyncHandler(async (req, res) => res.json(await Subject.list(req.query)));

exports.get = asyncHandler(async (req, res) => {
  const s = await Subject.get(req.params.id);
  if (!s) throw new ApiError(404, 'Subject not found');
  res.json(s);
});

exports.create = asyncHandler(async (req, res) => {
  const id = await Subject.create(validate(req.body, schema), facultyIdsOf(req.body) || []);
  res.status(201).json(await Subject.get(id));
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await Subject.get(req.params.id))) throw new ApiError(404, 'Subject not found');
  await Subject.update(req.params.id, validate(req.body, schema), facultyIdsOf(req.body));
  res.json(await Subject.get(req.params.id));
});

exports.remove = asyncHandler(async (req, res) => {
  if (!(await Subject.remove(req.params.id))) throw new ApiError(404, 'Subject not found');
  res.json({ message: 'Subject deleted' });
});

exports.setEnrollments = asyncHandler(async (req, res) => {
  if (!(await Subject.get(req.params.id))) throw new ApiError(404, 'Subject not found');
  const { student_ids } = validate(req.body, { student_ids: { type: 'intArray', required: true } });
  await Subject.setEnrollments(req.params.id, student_ids);
  res.json(await Subject.get(req.params.id));
});
