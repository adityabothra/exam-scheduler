/**
 * Dataset import: load a university's own data from an Excel workbook (one sheet per entity)
 * or from a single CSV/Excel file for one entity. Rows are upserted by their unique code, so the
 * same file can be re-imported after corrections. A bad row never aborts the import: it is
 * reported with its row number and the remaining rows continue.
 *
 * Import order matters (later sheets reference earlier ones by code):
 *   departments -> courses -> faculty -> subjects -> rooms -> students -> enrollments
 *   -> period -> timeslots -> room_unavailable -> faculty_unavailable
 */
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const { query } = require('../config/database');
const { Period } = require('../models/TimeSlot');
const { ApiError, timeToMin } = require('../utils/helpers');
const { EMAIL_RE } = require('../utils/validate');
const { buildDemoDataset } = require('../db/demoData');

// ---------------------------------------------------------------- value helpers
const normKey = (k) => String(k ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const pad = (n) => String(n).padStart(2, '0');

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) return cellValue(v.result);
    if (v.text !== undefined) return String(v.text);
    if (v.hyperlink) return String(v.hyperlink);
    return '';
  }
  return v;
}
const s = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim());
const blank = (v) => s(v) === '';

function toInt(v, label, { min, max, def } = {}) {
  if (blank(v)) { if (def !== undefined) return def; throw new Error(`${label} is required`); }
  const n = Number(s(v));
  if (!Number.isInteger(n)) throw new Error(`${label} must be a whole number (got "${s(v)}")`);
  if (min !== undefined && n < min) throw new Error(`${label} must be at least ${min}`);
  if (max !== undefined && n > max) throw new Error(`${label} must be at most ${max}`);
  return n;
}

function toBool(v, def = false) {
  if (blank(v)) return def;
  return ['1', 'true', 'yes', 'y', 'x'].includes(s(v).toLowerCase());
}

/** Accepts Date, Excel serial number, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. Returns YYYY-MM-DD. */
function toDate(v, label = 'date') {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = s(v);
  if (!t) throw new Error(`${label} is required`);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = t.slice(0, 10);
    if (Number.isNaN(Date.parse(d))) throw new Error(`${label} "${t}" is not a valid date`);
    return d;
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const d = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    if (Number.isNaN(Date.parse(d))) throw new Error(`${label} "${t}" is not a valid date (use DD/MM/YYYY)`);
    return d;
  }
  if (/^\d+(\.\d+)?$/.test(t) && Number(t) > 20000) return new Date(Math.round((Number(t) - 25569) * 86400000)).toISOString().slice(0, 10);
  throw new Error(`${label} "${t}" is not a valid date (use YYYY-MM-DD)`);
}

/** Accepts Date (time-only cell), Excel fraction of a day, "9:00", "09:00:00", "9:00 AM". Returns HH:MM:SS. */
function toTime(v, label = 'time') {
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:00`;
  const t = s(v);
  if (!t) throw new Error(`${label} is required`);
  if (/^0?\.\d+$|^0$|^1$/.test(t) && !t.includes(':')) {
    const mins = Math.round(Number(t) * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}:00`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(t);
  if (!m) throw new Error(`${label} "${t}" is not a valid time (use HH:MM)`);
  let h = Number(m[1]);
  if (m[3]) { h %= 12; if (m[3].toLowerCase() === 'pm') h += 12; }
  if (h > 23 || Number(m[2]) > 59) throw new Error(`${label} "${t}" is not a valid time`);
  return `${pad(h)}:${m[2]}:00`;
}

const codes = (v) => s(v).split(/[;|,]/).map((x) => x.trim()).filter(Boolean);

// ---------------------------------------------------------------- DB helpers
async function upsert(table, keyCol, key, data) {
  const cols = Object.keys(data);
  const existing = (await query(`SELECT id FROM ${table} WHERE ${keyCol} = ?`, [key]))[0];
  if (existing) {
    await query(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => data[c]), existing.id]);
    return { id: existing.id, action: 'updated' };
  }
  const r = await query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => data[c]));
  return { id: r.insertId, action: 'created' };
}

async function codeMap(table, col) {
  return Object.fromEntries((await query(`SELECT id, ${col} AS code FROM ${table}`)).map((r) => [String(r.code).toUpperCase(), r.id]));
}
const need = (map, code, what) => {
  const id = map[String(code).toUpperCase()];
  if (!id) throw new Error(`Unknown ${what} "${code}" - import or add it first`);
  return id;
};

async function periodIdOf(ctx) {
  if (ctx.periodId) return ctx.periodId;
  const p = await Period.getActive();
  if (!p) throw new Error('No examination period exists - add a "period" sheet (or create one on the Time Slots page) first');
  ctx.periodId = p.id;
  return p.id;
}

// ---------------------------------------------------------------- entity specs
const ROOM_TYPES = ['classroom', 'lecture_hall', 'laboratory', 'auditorium'];

const SPECS = {
  departments: {
    title: 'Departments',
    columns: ['code', 'name'], required: ['code', 'name'],
    help: { code: 'Short unique code, e.g. CSE', name: 'Full department name' },
    async run(row, ctx) {
      if (blank(row.code) || blank(row.name)) throw new Error('code and name are required');
      return (await upsert('departments', 'code', s(row.code).toUpperCase(), { code: s(row.code).toUpperCase(), name: s(row.name) })).action;
    },
  },
  courses: {
    title: 'Courses',
    columns: ['code', 'name', 'department_code'], required: ['code', 'name', 'department_code'],
    help: { code: 'Unique course code, e.g. BTCSE', name: 'Course name', department_code: 'Existing department code' },
    async run(row, ctx) {
      if (blank(row.code) || blank(row.name)) throw new Error('code and name are required');
      const dept = need(ctx.maps.dept, s(row.department_code), 'department_code');
      return (await upsert('courses', 'code', s(row.code).toUpperCase(), { department_id: dept, code: s(row.code).toUpperCase(), name: s(row.name) })).action;
    },
  },
  faculty: {
    title: 'Faculty',
    columns: ['faculty_code', 'name', 'email', 'department_code', 'designation', 'max_workload'], required: ['faculty_code', 'name', 'email', 'department_code'],
    help: { faculty_code: 'Unique faculty ID', name: 'Full name', email: 'Unique email', department_code: 'Existing department code', designation: 'e.g. Professor (default Assistant Professor)', max_workload: 'Max invigilation duties (default 6)' },
    async run(row, ctx) {
      if (blank(row.faculty_code) || blank(row.name)) throw new Error('faculty_code and name are required');
      if (!EMAIL_RE.test(s(row.email))) throw new Error(`email "${s(row.email)}" is not valid`);
      return (await upsert('faculty', 'faculty_code', s(row.faculty_code), {
        faculty_code: s(row.faculty_code), name: s(row.name), email: s(row.email),
        department_id: need(ctx.maps.dept, s(row.department_code), 'department_code'),
        designation: blank(row.designation) ? 'Assistant Professor' : s(row.designation), max_workload: toInt(row.max_workload, 'max_workload', { min: 1, max: 100, def: 6 }),
      })).action;
    },
  },
  subjects: {
    title: 'Subjects',
    columns: ['code', 'name', 'department_code', 'course_code', 'semester', 'duration_minutes', 'priority', 'eligible_faculty'], required: ['code', 'name', 'department_code', 'semester'],
    help: { code: 'Unique subject code, e.g. CS301', name: 'Subject name', department_code: 'Existing department code', course_code: 'Optional course code', semester: '1-12', duration_minutes: 'Exam length (default 180)', priority: '1-5 (default 3)', eligible_faculty: 'Optional faculty_codes separated by ; (blank = any faculty)' },
    async run(row, ctx) {
      if (blank(row.code) || blank(row.name)) throw new Error('code and name are required');
      const eligible = codes(row.eligible_faculty).map((c) => need(ctx.maps.faculty, c, 'faculty code in eligible_faculty'));
      const data = {
        code: s(row.code).toUpperCase(), name: s(row.name), department_id: need(ctx.maps.dept, s(row.department_code), 'department_code'),
        course_id: blank(row.course_code) ? null : need(ctx.maps.course, s(row.course_code), 'course_code'),
        semester: toInt(row.semester, 'semester', { min: 1, max: 12 }), duration_minutes: toInt(row.duration_minutes, 'duration_minutes', { min: 15, max: 600, def: 180 }),
        priority: toInt(row.priority, 'priority', { min: 1, max: 5, def: 3 }),
      };
      const r = await upsert('subjects', 'code', data.code, data);
      if (eligible.length) {
        await query('DELETE FROM subject_faculty_eligibility WHERE subject_id = ?', [r.id]);
        await query('INSERT INTO subject_faculty_eligibility (subject_id, faculty_id) VALUES ?', [[...new Set(eligible)].map((f) => [r.id, f])]);
      }
      return r.action;
    },
  },
  rooms: {
    title: 'Examination rooms',
    columns: ['room_code', 'name', 'building', 'floor', 'capacity', 'room_type', 'status'], required: ['room_code', 'name', 'capacity'],
    help: { room_code: 'Unique room ID', name: 'Room name', building: 'Building (default Main)', floor: 'Floor number (default 0)', capacity: 'Seats (> 0)', room_type: 'classroom | lecture_hall | laboratory | auditorium', status: 'available | unavailable' },
    async run(row) {
      if (blank(row.room_code) || blank(row.name)) throw new Error('room_code and name are required');
      const type = blank(row.room_type) ? 'classroom' : normKey(row.room_type);
      if (!ROOM_TYPES.includes(type)) throw new Error(`room_type must be one of ${ROOM_TYPES.join(', ')}`);
      const status = blank(row.status) ? 'available' : s(row.status).toLowerCase();
      if (!['available', 'unavailable'].includes(status)) throw new Error('status must be available or unavailable');
      return (await upsert('examination_rooms', 'room_code', s(row.room_code), {
        room_code: s(row.room_code), name: s(row.name), building: blank(row.building) ? 'Main' : s(row.building),
        floor: toInt(row.floor, 'floor', { min: -2, max: 100, def: 0 }), capacity: toInt(row.capacity, 'capacity', { min: 1, max: 10000 }), room_type: type, status,
      })).action;
    },
  },
  students: {
    title: 'Students',
    columns: ['student_code', 'name', 'email', 'department_code', 'course_code', 'semester', 'academic_year', 'subjects'], required: ['student_code', 'name', 'email', 'department_code', 'semester'],
    help: { student_code: 'Unique student ID', name: 'Full name', email: 'Unique email', department_code: 'Existing department code', course_code: 'Optional course code', semester: '1-12', academic_year: 'e.g. 2026-2027', subjects: 'Subject codes separated by ; (replaces this student\'s enrolments)' },
    async run(row, ctx) {
      if (blank(row.student_code) || blank(row.name)) throw new Error('student_code and name are required');
      if (!EMAIL_RE.test(s(row.email))) throw new Error(`email "${s(row.email)}" is not valid`);
      const subjectIds = [...new Set(codes(row.subjects).map((c) => need(ctx.maps.subject, c, 'subject code')))];
      const r = await upsert('students', 'student_code', s(row.student_code), {
        student_code: s(row.student_code), name: s(row.name), email: s(row.email),
        department_id: need(ctx.maps.dept, s(row.department_code), 'department_code'), course_id: blank(row.course_code) ? null : need(ctx.maps.course, s(row.course_code), 'course_code'),
        semester: toInt(row.semester, 'semester', { min: 1, max: 12 }), academic_year: blank(row.academic_year) ? '2026-2027' : s(row.academic_year),
      });
      if (subjectIds.length) {
        await query('DELETE FROM student_enrollments WHERE student_id = ?', [r.id]);
        await query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ?', [subjectIds.map((sid) => [r.id, sid])]);
      }
      return r.action;
    },
  },
  enrollments: {
    title: 'Enrolments (extra)',
    columns: ['student_code', 'subject_code'], required: ['student_code', 'subject_code'],
    help: { student_code: 'Existing student ID', subject_code: 'Existing subject code' },
    async run(row, ctx) {
      const st = need(ctx.maps.student, s(row.student_code), 'student_code');
      const sb = need(ctx.maps.subject, s(row.subject_code), 'subject_code');
      const r = await query('INSERT IGNORE INTO student_enrollments (student_id, subject_id) VALUES (?, ?)', [st, sb]);
      return r.affectedRows ? 'created' : 'unchanged';
    },
  },
  period: {
    title: 'Examination period',
    columns: ['name', 'session_name', 'academic_year', 'start_date', 'end_date'], required: ['name', 'start_date', 'end_date'],
    help: { name: 'Unique period name', session_name: 'Printed on reports, e.g. Winter 2026 End-Semester', academic_year: 'e.g. 2026-2027', start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD' },
    async run(row, ctx) {
      if (blank(row.name)) throw new Error('name is required');
      const start = toDate(row.start_date, 'start_date'), end = toDate(row.end_date, 'end_date');
      if (end < start) throw new Error('end_date must not be before start_date');
      const r = await upsert('examination_periods', 'name', s(row.name), { name: s(row.name), session_name: blank(row.session_name) ? s(row.name) : s(row.session_name), academic_year: blank(row.academic_year) ? '2026-2027' : s(row.academic_year), start_date: start, end_date: end });
      await query('UPDATE examination_periods SET is_active = (id = ?)', [r.id]);
      ctx.periodId = r.id;
      return r.action;
    },
  },
  timeslots: {
    title: 'Dates & time slots',
    columns: ['date', 'label', 'start_time', 'end_time', 'is_holiday', 'is_available'], required: ['date', 'label', 'start_time', 'end_time'],
    help: { date: 'YYYY-MM-DD (must be inside the period)', label: 'e.g. Morning', start_time: 'HH:MM', end_time: 'HH:MM', is_holiday: 'yes/no (default no)', is_available: 'yes/no (default yes)' },
    async run(row, ctx) {
      const pid = await periodIdOf(ctx);
      const period = await Period.get(pid);
      const date = toDate(row.date, 'date'), start = toTime(row.start_time, 'start_time'), end = toTime(row.end_time, 'end_time');
      if (blank(row.label)) throw new Error('label is required');
      if (timeToMin(end) <= timeToMin(start)) throw new Error('end_time must be after start_time');
      if (date < String(period.start_date).slice(0, 10) || date > String(period.end_date).slice(0, 10)) throw new Error(`date ${date} is outside the period (${period.start_date} to ${period.end_date})`);
      const existing = (await query('SELECT id FROM time_slots WHERE period_id = ? AND slot_date = ? AND start_time = ?', [pid, date, start]))[0];
      const vals = [s(row.label), end, toBool(row.is_holiday, false) ? 1 : 0, toBool(row.is_available, true) ? 1 : 0];
      if (existing) { await query('UPDATE time_slots SET label=?, end_time=?, is_holiday=?, is_available=? WHERE id=?', [...vals, existing.id]); return 'updated'; }
      await query('INSERT INTO time_slots (period_id, slot_date, start_time, label, end_time, is_holiday, is_available) VALUES (?,?,?,?,?,?,?)', [pid, date, start, ...vals]);
      return 'created';
    },
  },
  room_unavailable: unavailableSpec('room', 'room_code', 'room_availability', 'room_id', 'Room unavailability'),
  faculty_unavailable: unavailableSpec('faculty', 'faculty_code', 'faculty_availability', 'faculty_id', 'Faculty unavailability'),
};

function unavailableSpec(mapKey, codeCol, table, idCol, title) {
  return {
    title,
    columns: [codeCol, 'date', 'slot_label'], required: [codeCol, 'date'],
    help: { [codeCol]: `Existing ${codeCol}`, date: 'YYYY-MM-DD', slot_label: 'Slot label (e.g. Morning). Blank = every slot that day' },
    async run(row, ctx) {
      const id = need(ctx.maps[mapKey], s(row[codeCol]), codeCol);
      const pid = await periodIdOf(ctx);
      const date = toDate(row.date, 'date');
      const slots = blank(row.slot_label)
        ? await query('SELECT id FROM time_slots WHERE period_id = ? AND slot_date = ?', [pid, date])
        : await query('SELECT id FROM time_slots WHERE period_id = ? AND slot_date = ? AND LOWER(label) = LOWER(?)', [pid, date, s(row.slot_label)]);
      if (!slots.length) throw new Error(`No time slot on ${date}${blank(row.slot_label) ? '' : ` labelled "${s(row.slot_label)}"`} - add it to the timeslots sheet first`);
      for (const sl of slots) await query(`INSERT INTO ${table} (${idCol}, slot_id, is_available) VALUES (?,?,0) ON DUPLICATE KEY UPDATE is_available = 0`, [id, sl.id]);
      return 'created';
    },
  };
}

const ORDER = ['departments', 'courses', 'faculty', 'subjects', 'rooms', 'students', 'enrollments', 'period', 'timeslots', 'room_unavailable', 'faculty_unavailable'];
const ALIASES = { department: 'departments', course: 'courses', teachers: 'faculty', staff: 'faculty', subject: 'subjects', room: 'rooms', classrooms: 'rooms', student: 'students', enrolment: 'enrollments', enrolments: 'enrollments', enrollment: 'enrollments', periods: 'period', exam_period: 'period', time_slots: 'timeslots', slots: 'timeslots', timeslot: 'timeslots', room_availability: 'room_unavailable', faculty_availability: 'faculty_unavailable' };
const entityName = (n) => { const k = normKey(n); return SPECS[k] ? k : ALIASES[k] || null; };

// ---------------------------------------------------------------- parsing
const isEmptyRow = (o) => Object.values(o).every(blank) || String(Object.values(o)[0] ?? '').trim().startsWith('#');

function parseCsv(buffer) {
  let records;
  try { records = parse(buffer, { columns: (h) => h.map(normKey), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }); }
  catch (e) { throw new ApiError(400, `Could not read the CSV file: ${e.message}`); }
  return records;
}

async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new ApiError(400, 'Could not read the Excel file. Upload a .xlsx workbook (not .xls).'); }
  const sheets = [];
  wb.eachSheet((ws) => {
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => { headers[i] = normKey(cellValue(c.value)); });
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = cellValue(row.getCell(i).value); });
      if (headers.some(Boolean) && !isEmptyRow(o)) rows.push({ ...o, __row: r });
    }
    sheets.push({ name: ws.name, headers: headers.filter(Boolean), rows });
  });
  return sheets;
}

// ---------------------------------------------------------------- import runner
async function loadMaps() {
  return {
    dept: await codeMap('departments', 'code'), course: await codeMap('courses', 'code'), faculty: await codeMap('faculty', 'faculty_code'),
    subject: await codeMap('subjects', 'code'), room: await codeMap('examination_rooms', 'room_code'), student: await codeMap('students', 'student_code'),
  };
}

async function importRows(entity, rows, headers, ctx) {
  const spec = SPECS[entity];
  const result = { entity, title: spec.title, total: rows.length, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] };
  const missing = spec.required.filter((c) => !headers.includes(c));
  if (missing.length) {
    result.failed = rows.length;
    result.errors.push({ row: 1, message: `Missing required column(s): ${missing.join(', ')}. Expected columns: ${spec.columns.join(', ')}` });
    return result;
  }
  ctx.maps = await loadMaps();
  for (let i = 0; i < rows.length; i++) {
    const rowNo = rows[i].__row || i + 2;
    try {
      const action = await spec.run(rows[i], ctx);
      result[action] += 1;
    } catch (e) {
      result.failed += 1;
      let msg = e.message;
      if (e.code === 'ER_DUP_ENTRY') msg = `Duplicate value: ${/Duplicate entry '([^']*)'/.exec(e.sqlMessage || '')?.[1] || ''} already exists (email/name must be unique)`;
      if (result.errors.length < 50) result.errors.push({ row: rowNo, message: msg });
    }
  }
  return result;
}

/** One uploaded file. Excel: the sheet named after the entity (or the first sheet). CSV: the whole file. */
async function importSingle(entity, file, ctx = {}) {
  if (!SPECS[entity]) throw new ApiError(400, `Unknown import type "${entity}". Choose one of: ${ORDER.join(', ')}`);
  const isXlsx = /\.xlsx$/i.test(file.originalname || '') || file.mimetype?.includes('spreadsheetml');
  let rows, headers;
  if (isXlsx) {
    const sheets = await parseWorkbook(file.buffer);
    const sheet = sheets.find((x) => entityName(x.name) === entity) || sheets[0];
    if (!sheet) throw new ApiError(400, 'The workbook has no sheets');
    ({ rows, headers } = sheet);
  } else {
    rows = parseCsv(file.buffer).map((r, i) => ({ ...r, __row: i + 2 })).filter((r) => !isEmptyRow(r));
    headers = rows.length ? Object.keys(rows[0]) : [];
  }
  if (!rows.length) throw new ApiError(400, 'The file has no data rows (only a header row or empty).');
  return importRows(entity, rows, headers, ctx);
}

/** Whole workbook: every recognised sheet, in dependency order. */
async function importWorkbook(file) {
  const sheets = await parseWorkbook(file.buffer);
  const byEntity = {};
  const ignored = [];
  for (const sh of sheets) {
    const e = entityName(sh.name);
    if (e) byEntity[e] = sh; else if (normKey(sh.name) !== 'instructions' && normKey(sh.name) !== 'readme') ignored.push(sh.name);
  }
  if (!Object.keys(byEntity).length) throw new ApiError(400, `No recognised sheets found. Name the sheets: ${ORDER.join(', ')} (download the template for the exact layout).`);
  const ctx = {};
  const results = [];
  for (const e of ORDER) {
    if (byEntity[e] && byEntity[e].rows.length) results.push(await importRows(e, byEntity[e].rows, byEntity[e].headers, ctx));
  }
  return { results, ignored_sheets: ignored, periodId: ctx.periodId || null };
}

// ---------------------------------------------------------------- templates
function sheetsFromDemo() {
  const d = buildDemoDataset();
  const facEmail = (n) => `${n.toLowerCase().replace(/^(dr|prof)\.\s*/, '').replace(/\s+/g, '.')}@meridian.edu`;
  const subjectEligible = (dept) => (d.eligibleByDept[dept] || []).join(';');
  return {
    departments: d.departments.map((x) => [x.code, x.name]),
    courses: d.courses.map((x) => [x.code, x.name, x.dept]),
    faculty: d.faculty.map((x) => [x.code, x.name, facEmail(x.name), x.dept, x.designation, x.max]),
    subjects: d.subjects.map((x) => [x.code, x.name, x.dept, '', x.semester, x.duration, x.priority, subjectEligible(x.dept)]),
    rooms: d.rooms.map((x) => [x.code, x.name, x.building, x.floor, x.capacity, x.type, 'available']),
    students: d.students.map((x) => [x.code, x.name, x.email, x.dept, x.course, x.semester, x.academic_year, x.subjects.join(';')]),
    enrollments: [],
    period: [[d.period.name, d.period.session_name, d.period.academic_year, d.period.start_date, d.period.end_date]],
    timeslots: [...d.examDates.map((dt) => [dt, false]), ...d.holidayDates.map((dt) => [dt, true])].flatMap(([dt, hol]) => d.templates.map((t) => [dt, t.label, t.start.slice(0, 5), t.end.slice(0, 5), hol ? 'yes' : 'no', 'yes'])),
    room_unavailable: Object.entries(d.roomBlocked).flatMap(([rc, l]) => l.map(([dt, lb]) => [rc, dt, lb])),
    faculty_unavailable: Object.entries(d.facultyBlocked).flatMap(([fc, l]) => l.map(([dt, lb]) => [fc, dt, lb])),
  };
}

async function buildTemplateWorkbook(kind = 'blank') {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet('Instructions');
  info.columns = [{ width: 24 }, { width: 22 }, { width: 90 }];
  const bold = (row) => { row.font = { bold: true }; };
  bold(info.addRow(['ExamAI dataset import template']));
  info.addRow(['Fill one sheet per entity (leave a sheet empty to skip it), then upload this file on the Import Data page.']);
  info.addRow(['Sheets are imported in this order, and later sheets refer to earlier ones by code: ' + ORDER.join(' > ')]);
  info.addRow(['Re-importing is safe: rows with an existing code are updated, not duplicated. Student/subject "subjects" and "eligible_faculty" lists use ; as separator.']);
  info.addRow(['Dates: YYYY-MM-DD (or DD/MM/YYYY). Times: HH:MM (24 hour). Yes/no columns accept yes/no/true/false/1/0.']);
  info.addRow([]);
  const hdr = info.addRow(['Sheet', 'Column', 'Meaning']);
  bold(hdr);
  for (const e of ORDER) {
    SPECS[e].columns.forEach((c, i) => info.addRow([i === 0 ? e : '', SPECS[e].required.includes(c) ? `${c} *` : c, SPECS[e].help[c] || '']));
  }
  info.addRow([]);
  info.addRow(['* = required column']);

  const data = kind === 'sample' ? sheetsFromDemo() : {};
  for (const e of ORDER) {
    const ws = wb.addWorksheet(e);
    ws.columns = SPECS[e].columns.map((c) => ({ header: c, key: c, width: Math.max(16, c.length + 4) }));
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of data[e] || []) ws.addRow(row);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvTemplate(entity, withSample = false) {
  const spec = SPECS[entity];
  if (!spec) throw new ApiError(404, `Unknown import type "${entity}"`);
  const esc = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = withSample ? sheetsFromDemo()[entity] || [] : [];
  return [spec.columns.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n') + '\r\n';
}

const describe = () => ORDER.map((e) => ({ entity: e, title: SPECS[e].title, columns: SPECS[e].columns.map((c) => ({ name: c, required: SPECS[e].required.includes(c), help: SPECS[e].help[c] || '' })) }));

module.exports = { importSingle, importWorkbook, buildTemplateWorkbook, csvTemplate, describe, ORDER, toDate, toTime, entityName, sheetsFromDemo };
