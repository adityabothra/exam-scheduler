/**
 * Report generation. Every report is built as { title, subtitle, sections:[{heading, columns, rows}] }
 * from live database records, then rendered to CSV, Excel or PDF.
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');
const Schedule = require('./../models/Schedule');
const OptimizationRun = require('../models/OptimizationRun');
const timetable = require('./timetableService');
const { validateSchedule } = require('./constraintValidator');
const { ApiError, fmtDate, fmtTime, round } = require('../utils/helpers');

const roomNames = (e) => e.rooms.map((r) => r.name).join(', ');
const invNames = (e) => e.invigilators.map((i) => i.name).join(', ');
const when = (e) => [fmtDate(e.slot_date), `${fmtTime(e.start_time)}-${fmtTime(e.end_time)}`];

const EXAM_COLS = ['Date', 'Time', 'Subject Code', 'Subject', 'Department', 'Sem', 'Students', 'Duration (min)', 'Rooms', 'Invigilators'];
const examRow = (e) => [...when(e), e.subject_code, e.subject_name, e.department_code, e.semester, e.student_count, e.duration_minutes, roomNames(e), invNames(e)];

async function build(type, { runId, id, filters = {} }) {
  const run = runId ? await Schedule.getRun(Number(runId)) : null;
  const rid = run ? run.id : await Schedule.currentRunId();
  if (!rid && type !== 'optimization') throw new ApiError(404, 'No timetable has been generated yet. Run the AI Optimizer first.');
  const theRun = run || (rid ? await Schedule.getRun(rid) : null);
  if (!theRun) throw new ApiError(404, 'No optimization run found');
  const info = await Schedule.universityInfo(theRun.period_id);
  const exams = await Schedule.loadExams(theRun.id);
  const base = { info, run: theRun, generated: new Date().toISOString().slice(0, 16).replace('T', ' ') };

  switch (type) {
    case 'complete':
      return { ...base, title: 'Complete Examination Timetable', sections: [{ heading: 'All examinations', columns: EXAM_COLS, rows: exams.map(examRow) }] };

    case 'student': {
      const sql = id ? 'SELECT * FROM students WHERE id = ?' : 'SELECT * FROM students ORDER BY student_code';
      const students = await query(sql, id ? [id] : []);
      if (id && !students.length) throw new ApiError(404, 'Student not found');
      const enr = await query('SELECT student_id, subject_id FROM student_enrollments');
      const bySt = {};
      for (const r of enr) (bySt[r.student_id] ||= new Set()).add(r.subject_id);
      const rows = [];
      for (const s of students) {
        const mine = exams.filter((e) => bySt[s.id]?.has(e.subject_id));
        for (const e of mine) rows.push([s.student_code, s.name, ...when(e), e.subject_code, e.subject_name, roomNames(e)]);
      }
      return { ...base, title: id ? `Student Examination Schedule - ${students[0].student_code} ${students[0].name}` : 'Student-wise Examination Schedule', sections: [{ heading: 'Student schedules', columns: ['Student ID', 'Name', 'Date', 'Time', 'Subject Code', 'Subject', 'Rooms'], rows }] };
    }

    case 'faculty': {
      const rows = [];
      const fac = await query('SELECT id, name, max_workload FROM faculty ORDER BY name');
      for (const f of fac) {
        const duties = exams.filter((e) => e.invigilators.some((i) => i.faculty_id === f.id));
        if (id && Number(id) !== f.id) continue;
        for (const e of duties) rows.push([f.name, ...when(e), e.subject_code, e.subject_name, e.invigilators.filter((i) => i.faculty_id === f.id).map((i) => (e.rooms.find((r) => r.id === i.room_id) || {}).name || '').join(', '), `${duties.length}/${f.max_workload}`]);
      }
      return { ...base, title: 'Faculty-wise Invigilation Schedule', sections: [{ heading: 'Invigilation duties', columns: ['Faculty', 'Date', 'Time', 'Subject Code', 'Subject', 'Room', 'Workload'], rows }] };
    }

    case 'room': {
      const rooms = await query('SELECT id, name, capacity FROM examination_rooms ORDER BY name');
      const rows = [];
      for (const r of rooms) {
        if (id && Number(id) !== r.id) continue;
        for (const e of exams.filter((x) => x.rooms.some((y) => y.id === r.id))) rows.push([r.name, r.capacity, ...when(e), e.subject_code, e.subject_name, e.student_count]);
      }
      return { ...base, title: 'Room-wise Examination Schedule', sections: [{ heading: 'Room bookings', columns: ['Room', 'Capacity', 'Date', 'Time', 'Subject Code', 'Subject', 'Students'], rows }] };
    }

    case 'department': {
      const depts = await query('SELECT id, code, name FROM departments ORDER BY code');
      const sections = [];
      for (const d of depts) {
        if (id && Number(id) !== d.id) continue;
        const list = exams.filter((e) => e.department_id === d.id && (!filters.semester || e.semester === Number(filters.semester)));
        if (list.length) sections.push({ heading: `${d.code} - ${d.name}`, columns: EXAM_COLS, rows: list.map(examRow) });
      }
      return { ...base, title: 'Department-wise Examination Schedule', sections: sections.length ? sections : [{ heading: 'No examinations', columns: EXAM_COLS, rows: [] }] };
    }

    case 'conflicts': {
      const v = validateSchedule(await Schedule.loadValidationData(theRun.id));
      const rows = v.conflicts.map((c) => [c.label, c.subject_code || '', c.related?.name || '', c.date || '', c.time || '', c.explanation, c.suggestion]);
      return { ...base, title: 'Conflict Detection Report', summary: [['Status', v.valid ? 'VALID - no hard-constraint violations' : `INVALID - ${v.total} violation(s)`], ['Examinations checked', v.checkedExaminations]], sections: [{ heading: 'Hard-constraint violations', columns: ['Type', 'Examination', 'Related', 'Date', 'Time', 'Explanation', 'Suggested resolution'], rows }] };
    }

    case 'optimization': {
      const run2 = await OptimizationRun.get(theRun.id);
      const res = await OptimizationRun.getResults(theRun.id);
      const ib = run2.initial_breakdown || {}, fb = run2.final_breakdown || {};
      const imp = (a, b) => (a ? `${round(((a - b) / a) * 100, 1)}%` : '-');
      const w = run2.config.weights || {};
      return {
        ...base, title: 'AI Optimization Performance Report',
        summary: [
          ['Run', `#${run2.id} ${run2.name}`], ['Algorithm', 'Simulated Annealing'], ['Termination', run2.termination || '-'],
          ['Iterations', run2.iterations], ['Accepted / Rejected', `${run2.accepted} / ${run2.rejected}`], ['Invalid neighbours discarded', run2.invalid_neighbors],
          ['Execution time (ms)', run2.duration_ms], ['Initial temperature', run2.config.initialTemperature], ['Minimum temperature', run2.config.minTemperature],
          ['Cooling rate (alpha)', run2.config.coolingRate], ['Neighbours per temperature', run2.config.neighborsPerTemperature], ['Random seed', res.report?.seed ?? run2.config.seed ?? '-'],
          ['Weights (w1 student, w2 faculty, w3 room, w4 spacing)', `${w.student}, ${w.faculty}, ${w.room}, ${w.spacing}`],
          ['Hard-constraint validation', run2.validation_status],
        ],
        sections: [{
          heading: 'Cost breakdown', columns: ['Component', 'Initial', 'Optimized', 'Improvement'],
          rows: ['student', 'faculty', 'room', 'spacing'].map((k) => [k[0].toUpperCase() + k.slice(1) + ' cost', round(ib[k] ?? 0), round(fb[k] ?? 0), imp(ib[k], fb[k])])
            .concat([['TOTAL COST', round(run2.initial_cost ?? 0), round(run2.final_cost ?? 0), imp(run2.initial_cost, run2.final_cost)]]),
        }],
      };
    }
    default:
      throw new ApiError(400, `Unknown report type "${type}"`);
  }
}

const header = (r) => [r.info.university_name, `Examination session: ${r.info.session_name || r.info.period_name}`, `Academic year: ${r.info.academic_year}`, `Generated: ${r.generated}`, `Timetable run: #${r.run.id} ${r.run.name}`];

function toCsv(r) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = header(r).map((h) => esc(h));
  lines.push('', esc(r.title));
  for (const [k, v] of r.summary || []) lines.push(`${esc(k)},${esc(v)}`);
  for (const s of r.sections) {
    lines.push('', esc(s.heading), s.columns.map(esc).join(','));
    for (const row of s.rows) lines.push(row.map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

async function toXlsx(r) {
  const wb = new ExcelJS.Workbook();
  wb.creator = r.info.university_name;
  const ws = wb.addWorksheet(r.title.slice(0, 28).replace(/[\\/*?:[\]]/g, ''));
  let row = 1;
  const put = (vals, style) => { const x = ws.getRow(row++); vals.forEach((v, i) => { x.getCell(i + 1).value = v; }); if (style) style(x); return x; };
  put([r.info.university_name], (x) => { x.font = { bold: true, size: 16, color: { argb: 'FF1E3A8A' } }; });
  put([r.title], (x) => { x.font = { bold: true, size: 13 }; });
  header(r).slice(1).forEach((h) => put([h], (x) => { x.font = { color: { argb: 'FF555555' } }; }));
  row++;
  for (const [k, v] of r.summary || []) put([k, v], (x) => { x.getCell(1).font = { bold: true }; });
  for (const s of r.sections) {
    row++;
    put([s.heading], (x) => { x.font = { bold: true, size: 12 }; });
    put(s.columns, (x) => { x.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; }); });
    for (const rw of s.rows) put(rw);
  }
  ws.columns.forEach((c) => {
    let max = 10;
    c.eachCell({ includeEmpty: false }, (cell) => { max = Math.min(60, Math.max(max, String(cell.value ?? '').length + 2)); });
    c.width = max;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(r) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 72;

    doc.fillColor('#1e3a8a').fontSize(18).text(r.info.university_name);
    doc.fillColor('#111').fontSize(13).text(r.title);
    doc.fillColor('#555').fontSize(9).text(header(r).slice(1).join('   |   ')).moveDown(0.6);
    for (const [k, v] of r.summary || []) doc.fillColor('#111').fontSize(9).text(`${k}: `, { continued: true }).fillColor('#333').text(String(v));
    if (r.summary) doc.moveDown(0.5);

    for (const s of r.sections) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.fillColor('#1e3a8a').fontSize(11).text(s.heading).moveDown(0.3);
      // width weights: wide text columns get more room
      const weights = s.columns.map((c) => (/Explanation|Suggested|Invigilators|Subject$|Rooms|Related/.test(c) ? 2.6 : /Date|Time/.test(c) ? 1.4 : 1));
      const sum = weights.reduce((a, b) => a + b, 0);
      const widths = weights.map((w) => (w / sum) * W);
      const drawRow = (cells, head) => {
        const y0 = doc.y;
        doc.fontSize(7.5);
        const h = Math.max(...cells.map((c, i) => doc.heightOfString(String(c ?? ''), { width: widths[i] - 6 }))) + 6;
        if (y0 + h > doc.page.height - 40) { doc.addPage(); return drawRow(cells, head); }
        if (head) doc.rect(36, y0, W, h).fill('#1e3a8a');
        let x = 36;
        cells.forEach((c, i) => { doc.fillColor(head ? '#fff' : '#222').text(String(c ?? ''), x + 3, y0 + 3, { width: widths[i] - 6 }); x += widths[i]; });
        doc.y = y0 + h;
        if (!head) doc.moveTo(36, doc.y).lineTo(36 + W, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        return undefined;
      };
      drawRow(s.columns, true);
      if (!s.rows.length) doc.fillColor('#777').fontSize(9).text('No records.');
      s.rows.forEach((rw) => drawRow(rw, false));
      doc.moveDown(1);
    }
    doc.end();
  });
}

async function render(type, format, opts) {
  const r = await build(type, opts);
  const safe = `${type}-report-run${r.run.id}`;
  if (format === 'csv') return { buffer: Buffer.from(toCsv(r), 'utf8'), contentType: 'text/csv; charset=utf-8', filename: `${safe}.csv` };
  if (format === 'xlsx' || format === 'excel') return { buffer: await toXlsx(r), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${safe}.xlsx` };
  if (format === 'pdf') return { buffer: await toPdf(r), contentType: 'application/pdf', filename: `${safe}.pdf` };
  throw new ApiError(400, 'Format must be pdf, xlsx or csv');
}

module.exports = { render, build };
