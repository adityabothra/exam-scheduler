const { Department, Course } = require('../models/Department');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');

const deptSchema = { code: { type: 'string', required: true, max: 20 }, name: { type: 'string', required: true, max: 120 } };
const courseSchema = {
  department_id: { type: 'int', required: true, min: 1 },
  code: { type: 'string', required: true, max: 20 },
  name: { type: 'string', required: true, max: 120 },
};

exports.listDepartments = asyncHandler(async (req, res) => res.json(await Department.list()));
exports.createDepartment = asyncHandler(async (req, res) => {
  const id = await Department.create(validate(req.body, deptSchema));
  res.status(201).json(await Department.get(id));
});
exports.updateDepartment = asyncHandler(async (req, res) => {
  if (!(await Department.get(req.params.id))) throw new ApiError(404, 'Department not found');
  await Department.update(req.params.id, validate(req.body, deptSchema));
  res.json(await Department.get(req.params.id));
});
exports.deleteDepartment = asyncHandler(async (req, res) => {
  if (!(await Department.remove(req.params.id))) throw new ApiError(404, 'Department not found');
  res.json({ message: 'Department deleted' });
});

exports.listCourses = asyncHandler(async (req, res) => res.json(await Course.list({ department_id: req.query.department_id })));
exports.createCourse = asyncHandler(async (req, res) => {
  const id = await Course.create(validate(req.body, courseSchema));
  res.status(201).json(await Course.get(id));
});
exports.updateCourse = asyncHandler(async (req, res) => {
  if (!(await Course.get(req.params.id))) throw new ApiError(404, 'Course not found');
  await Course.update(req.params.id, validate(req.body, courseSchema));
  res.json(await Course.get(req.params.id));
});
exports.deleteCourse = asyncHandler(async (req, res) => {
  if (!(await Course.remove(req.params.id))) throw new ApiError(404, 'Course not found');
  res.json({ message: 'Course deleted' });
});
