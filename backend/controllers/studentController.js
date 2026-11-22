const { parse } = require('csv-parse/sync');
const Student = require('../models/Student');
const { query } = require('../config/database');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');

const schema = {
  student_code: { type: 'string', required: true, max: 30 },
  name: { type: 'string', required: true, max: 120 },
  email: { type: 'email', required: true, max: 150 },
  department_id: { type: 'int', required: true, min: 1 },
  course_id: { type: 'int', nullable: true, min: 1 },
  semester: { type: 'int', required: true, min: 1, max: 12 },
  academic_year: { type: 'string', required: true, max: 9 },
};
const subjectIdsOf = (body) => (body.subject_ids === undefined ? undefined : validate(body, { subject_ids: { type: 'intArray' } }).subject_ids);

exports.list = asyncHandler(async (req, res) => res.json(await Student.list(req.query)));

exports.get = asyncHandler(async (req, res) => {
  const s = await Student.get(req.params.id);
  if (!s) throw new ApiError(404, 'Student not found');
  res.json(s);
});

exports.create = asyncHandler(async (req, res) => {
  const id = await Student.create(validate(req.body, schema), subjectIdsOf(req.body) || []);
  res.status(201).json(await Student.get(id));
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await Student.get(req.params.id))) throw new ApiError(404, 'Student not found');
  await Student.update(req.params.id, validate(req.body, schema), subjectIdsOf(req.body));
  res.json(await Student.get(req.params.id));
});

exports.remove = asyncHandler(async (req, res) => {
  if (!(await Student.remove(req.params.id))) throw new ApiError(404, 'Student not found');
  res.json({ message: 'Student deleted' });
});

exports.setEnrollments = asyncHandler(async (req, res) => {
  if (!(await Student.get(req.params.id))) throw new ApiError(404, 'Student not found');
  const { subject_ids } = validate(req.body, { subject_ids: { type: 'intArray', required: true } });
  await Student.setEnrollments(req.params.id, subject_ids);
  res.json(await Student.get(req.params.id));
});

/**
 * Bulk registration from CSV.
 * Columns: student_code,name,email,department_code,course_code,semester,academic_year,subjects
 * `subjects` is an optional ';'-separated list of subject codes. Existing student codes/emails are skipped.
 */
exports.importCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach a CSV file in the "file" field');
  let records;
  try {
    records = parse(req.file.buffer.toString('utf8'), { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true });
  } catch (e) {
    throw new ApiError(400, `Could not parse CSV: ${e.message}`);
  }
  const depts = Object.fromEntries((await query('SELECT id, code FROM departments')).map((d) => [d.code.toUpperCase(), d.id]));
  const courses = Object.fromEntries((await query('SELECT id, code FROM courses')).map((c) => [c.code.toUpperCase(), c.id]));
  const subjects = Object.fromEntries((await query('SELECT id, code FROM subjects')).map((s) => [s.code.toUpperCase(), s.id]));

  const result = { total: records.length, created: 0, skipped: 0, errors: [] };
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const row = i + 2; // header is row 1
    try {
      const deptId = depts[(r.department_code || '').toUpperCase()];
      if (!deptId) throw new ApiError(400, `Unknown department_code "${r.department_code}"`);
      let courseId = null;
      if (r.course_code) {
        courseId = courses[r.course_code.toUpperCase()];
        if (!courseId) throw new ApiError(400, `Unknown course_code "${r.course_code}"`);
      }
      const subjectIds = [];
      for (const code of (r.subjects || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean)) {
        if (!subjects[code.toUpperCase()]) throw new ApiError(400, `Unknown subject code "${code}"`);
        subjectIds.push(subjects[code.toUpperCase()]);
      }
      const data = validate({ ...r, department_id: deptId, course_id: courseId }, schema);
      const dup = await query('SELECT id FROM students WHERE student_code = ? OR email = ?', [data.student_code, data.email]);
      if (dup.length) { result.skipped++; result.errors.push({ row, message: `Duplicate student_code or email (${data.student_code}) - skipped` }); continue; }
      await Student.create(data, [...new Set(subjectIds)]);
      result.created++;
    } catch (e) {
      result.errors.push({ row, message: e.message });
    }
  }
  res.status(result.created ? 201 : 200).json(result);
});
