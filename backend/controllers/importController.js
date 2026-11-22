const multer = require('multer');
const importer = require('../services/importService');
const Examination = require('../models/Examination');
const { Period } = require('../models/TimeSlot');
const { clearAllData } = require('../db/demoData');
const { ApiError, asyncHandler } = require('../utils/helpers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
exports.uploadFile = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 10 MB' : err.message));
  if (!req.file) return next(new ApiError(400, 'Attach a file in the "file" field'));
  return next();
});

const truthy = (v) => v === true || v === 'true' || v === '1' || v === 'on';

/** Create examination events for every subject that now has enrolled students. */
async function autoExams(periodId) {
  const period = periodId ? await Period.get(periodId) : await Period.getActive();
  return period ? Examination.generateForPeriod(period.id) : 0;
}

exports.describe = asyncHandler(async (req, res) => res.json(importer.describe()));

exports.template = asyncHandler(async (req, res) => {
  const kind = req.query.kind === 'sample' ? 'sample' : 'blank';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="examai-${kind === 'sample' ? 'sample-dataset' : 'import-template'}.xlsx"`);
  res.send(await importer.buildTemplateWorkbook(kind));
});

exports.entityTemplate = asyncHandler(async (req, res) => {
  const csv = importer.csvTemplate(req.params.entity, req.query.kind === 'sample');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}-template.csv"`);
  res.send(csv);
});

/** POST /import/bundle  (multipart: file=.xlsx, replace=true|false, generate_exams=true|false) */
exports.bundle = asyncHandler(async (req, res) => {
  if (!/\.xlsx$/i.test(req.file.originalname)) throw new ApiError(400, 'Upload an Excel workbook (.xlsx). For CSV files use the single-file import.');
  const replace = truthy(req.body.replace);
  if (replace) await clearAllData();
  const out = await importer.importWorkbook(req.file);
  const created = req.body.generate_exams === 'false' ? 0 : await autoExams(out.periodId);
  const failed = out.results.reduce((a, r) => a + r.failed, 0);
  res.status(failed && !out.results.some((r) => r.created || r.updated) ? 422 : 200).json({ ...out, replaced: replace, examinations_created: created });
});

/** POST /import/:entity  (multipart: file=.csv or .xlsx) */
exports.entity = asyncHandler(async (req, res) => {
  const result = await importer.importSingle(req.params.entity, req.file, {});
  const created = req.body.generate_exams === 'false' ? 0 : await autoExams(null);
  res.status(result.failed && !result.created && !result.updated ? 422 : 200).json({ results: [result], ignored_sheets: [], replaced: false, examinations_created: created });
});
