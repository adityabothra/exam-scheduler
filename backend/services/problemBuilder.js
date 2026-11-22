/**
 * Builds the optimisation "problem" from database records.
 *
 * makeProblem() is a PURE function (raw records in, indexed problem out) so the
 * algorithm can be unit-tested without a database. loadRaw()/buildProblem() fetch
 * the records for one examination period from MySQL.
 */
const { query } = require('../config/database');
const { DEFAULT_OPTIMIZATION } = require('../config/defaults');
const { absMinute, dayIndex, timeToMin } = require('../utils/helpers');

async function loadRaw(periodId) {
  const exams = await query(
    `SELECT e.id, e.subject_id, e.duration_minutes, b.code, b.name, b.department_id, b.semester, b.priority
     FROM examinations e JOIN subjects b ON b.id = e.subject_id WHERE e.period_id = ? ORDER BY e.id`, [periodId]);
  const enrollments = await query(
    `SELECT DISTINCT se.subject_id, se.student_id FROM student_enrollments se
     JOIN examinations e ON e.subject_id = se.subject_id WHERE e.period_id = ?`, [periodId]);
  const slots = await query(
    'SELECT id, slot_date, label, start_time, end_time, is_holiday, is_available FROM time_slots WHERE period_id = ? ORDER BY slot_date, start_time', [periodId]);
  const rooms = await query("SELECT id, room_code, name, capacity FROM examination_rooms WHERE status = 'available' ORDER BY id");
  const faculty = await query('SELECT id, faculty_code, name, max_workload, department_id FROM faculty ORDER BY id');
  const roomUnavailable = await query(
    `SELECT ra.room_id, ra.slot_id FROM room_availability ra JOIN time_slots t ON t.id = ra.slot_id
     WHERE t.period_id = ? AND ra.is_available = 0`, [periodId]);
  const facultyUnavailable = await query(
    `SELECT fa.faculty_id, fa.slot_id FROM faculty_availability fa JOIN time_slots t ON t.id = fa.slot_id
     WHERE t.period_id = ? AND fa.is_available = 0`, [periodId]);
  const eligibility = await query('SELECT subject_id, faculty_id FROM subject_faculty_eligibility');
  return { exams, enrollments, slots, rooms, faculty, roomUnavailable, facultyUnavailable, eligibility };
}

async function buildProblem(periodId, costParams = {}) {
  return makeProblem(await loadRaw(periodId), costParams);
}

/**
 * raw = {
 *   exams:[{id, subject_id, duration_minutes, code, name, department_id, semester, priority}],
 *   enrollments:[{subject_id, student_id}],
 *   slots:[{id, slot_date, label, start_time, end_time, is_holiday, is_available}],
 *   rooms:[{id, room_code, name, capacity}],
 *   faculty:[{id, faculty_code, name, max_workload, department_id}],
 *   roomUnavailable:[{room_id, slot_id}], facultyUnavailable:[{faculty_id, slot_id}],
 *   eligibility:[{subject_id, faculty_id}]   // a subject with no rows accepts every faculty member
 * }
 */
function makeProblem(raw, costParams = {}) {
  const params = { ...DEFAULT_OPTIMIZATION.costParams, ...costParams };

  const studentsBySubject = new Map();
  for (const en of raw.enrollments) {
    if (!studentsBySubject.has(en.subject_id)) studentsBySubject.set(en.subject_id, []);
    studentsBySubject.get(en.subject_id).push(en.student_id);
  }

  const skipped = [];
  const exams = [];
  for (const ex of raw.exams) {
    const sids = studentsBySubject.get(ex.subject_id) || [];
    if (!sids.length) {
      skipped.push({ examinationId: ex.id, code: ex.code, reason: 'no enrolled students' });
      continue;
    }
    exams.push({
      idx: exams.length, id: ex.id, subjectId: ex.subject_id, code: ex.code, name: ex.name,
      departmentId: ex.department_id, semester: ex.semester, priority: ex.priority || 3,
      duration: ex.duration_minutes, studentIds: sids, n: sids.length,
    });
  }

  const slots = raw.slots.map((s, idx) => {
    const start = absMinute(s.slot_date, s.start_time);
    return {
      idx, id: s.id, date: String(s.slot_date).slice(0, 10), label: s.label,
      startTime: s.start_time, endTime: s.end_time,
      dayIndex: dayIndex(s.slot_date), start, len: timeToMin(s.end_time) - timeToMin(s.start_time),
      usable: !s.is_holiday && !!s.is_available,
    };
  });
  const rooms = raw.rooms.map((r, idx) => ({ idx, id: r.id, code: r.room_code, name: r.name, capacity: r.capacity }));
  const faculty = raw.faculty.map((f, idx) => ({ idx, id: f.id, code: f.faculty_code, name: f.name, maxWorkload: f.max_workload, departmentId: f.department_id }));

  const E = exams.length, S = slots.length, R = rooms.length, F = faculty.length;
  const slotIdx = new Map(slots.map((s) => [s.id, s.idx]));
  const roomIdx = new Map(rooms.map((r) => [r.id, r.idx]));
  const facIdx = new Map(faculty.map((f) => [f.id, f.idx]));

  const roomAvail = new Uint8Array(R * S).fill(1);
  for (const u of raw.roomUnavailable) if (roomIdx.has(u.room_id) && slotIdx.has(u.slot_id)) roomAvail[roomIdx.get(u.room_id) * S + slotIdx.get(u.slot_id)] = 0;
  const facAvail = new Uint8Array(F * S).fill(1);
  for (const u of raw.facultyUnavailable) if (facIdx.has(u.faculty_id) && slotIdx.has(u.slot_id)) facAvail[facIdx.get(u.faculty_id) * S + slotIdx.get(u.slot_id)] = 0;

  // Slots an exam may use: usable (not holiday / unavailable) and long enough for the exam duration.
  const slotEligible = new Uint8Array(E * S);
  const eligibleSlots = exams.map((ex) => {
    const list = [];
    for (const s of slots) if (s.usable && s.len >= ex.duration) { list.push(s.idx); slotEligible[ex.idx * S + s.idx] = 1; }
    return list;
  });

  // Eligible invigilators per exam.
  const eligBySubject = new Map();
  for (const el of raw.eligibility) {
    if (!eligBySubject.has(el.subject_id)) eligBySubject.set(el.subject_id, new Set());
    eligBySubject.get(el.subject_id).add(el.faculty_id);
  }
  const facEligible = new Uint8Array(E * F);
  const eligibleFac = exams.map((ex) => {
    const set = eligBySubject.get(ex.subjectId);
    const list = [];
    for (const f of faculty) if (!set || set.has(f.id)) { list.push(f.idx); facEligible[ex.idx * F + f.idx] = 1; }
    return list;
  });

  // Students and the conflict graph (two exams conflict when a student sits both).
  const studentIndex = new Map();
  const studentExams = [];
  const shared = new Uint16Array(E * E);
  exams.forEach((ex) => {
    for (const sid of ex.studentIds) {
      if (!studentIndex.has(sid)) { studentIndex.set(sid, studentExams.length); studentExams.push([]); }
      studentExams[studentIndex.get(sid)].push(ex.idx);
    }
  });
  for (const list of studentExams) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) { shared[list[a] * E + list[b]]++; shared[list[b] * E + list[a]]++; }
  }
  const adj = exams.map(() => []);
  for (let i = 0; i < E; i++) for (let j = 0; j < E; j++) if (i !== j && shared[i * E + j]) adj[i].push({ j, shared: shared[i * E + j] });

  // Minimum rooms needed for an exam if every room were free (used to tell legitimate multi-room use from waste).
  const capsDesc = rooms.map((r) => r.capacity).sort((a, b) => b - a);
  const totalCapacity = capsDesc.reduce((a, b) => a + b, 0);
  const minRooms = exams.map((ex) => {
    let sum = 0;
    for (let k = 0; k < capsDesc.length; k++) { sum += capsDesc[k]; if (sum >= ex.n) return k + 1; }
    return Infinity;
  });

  // Same-date neighbouring slots (for "invigilation next to an unavailable period").
  const prevSlot = new Int32Array(S).fill(-1);
  const nextSlot = new Int32Array(S).fill(-1);
  for (let i = 0; i < S; i++) {
    if (i > 0 && slots[i - 1].date === slots[i].date) prevSlot[i] = i - 1;
    if (i < S - 1 && slots[i + 1].date === slots[i].date) nextSlot[i] = i + 1;
  }

  const dates = [...new Set(slots.filter((s) => s.usable).map((s) => s.date))].sort();

  return {
    E, S, R, F, exams, slots, rooms, faculty, skipped,
    slotIdx, roomIdx, facIdx,
    roomCap: Int32Array.from(rooms.map((r) => r.capacity)),
    facMax: Int32Array.from(faculty.map((f) => f.maxWorkload)),
    roomAvail, facAvail, slotEligible, eligibleSlots, facEligible, eligibleFac,
    studentExams, studentIds: [...studentIndex.keys()], shared, adj, minRooms, totalCapacity,
    prevSlot, nextSlot, dates,
    perRoom: Math.max(1, params.invigilatorsPerRoom | 0), params,
  };
}

/**
 * Pre-flight analysis. Explains BEFORE optimisation whether a valid timetable can possibly exist.
 * Returns { ok, issues:[{severity:'error'|'warning', code, message, examination?}], summary }.
 */
function analyzeFeasibility(P) {
  const issues = [];
  const err = (code, message, examination) => issues.push({ severity: 'error', code, message, examination });
  const warn = (code, message, examination) => issues.push({ severity: 'warning', code, message, examination });

  const usableSlots = P.slots.filter((s) => s.usable).length;
  if (P.E === 0) err('no_exams', 'There are no examinations to schedule. Use "Generate from subjects" on the Examination Management page (subjects need enrolled students).');
  if (usableSlots === 0) err('no_slots', 'There are no usable time slots (all slots are holidays/unavailable, or none were created).');
  if (P.R === 0) err('no_rooms', 'There are no available examination rooms.');
  if (P.F === 0) err('no_faculty', 'There are no faculty members to invigilate.');
  for (const sk of P.skipped) warn('no_students', `${sk.code} has no enrolled students and will be left out of the optimisation.`, sk.code);

  let dutyNeed = 0;
  for (const ex of P.exams) {
    if (!P.eligibleSlots[ex.idx].length && usableSlots) {
      const longest = Math.max(0, ...P.slots.filter((s) => s.usable).map((s) => s.len));
      err('duration_too_long', `${ex.code}: needs ${ex.duration} min but the longest usable slot is ${longest} min, so no slot can hold it.`, ex.code);
    }
    if (P.R && P.minRooms[ex.idx] === Infinity) {
      err('capacity', `${ex.code}: ${ex.n} students exceed the combined capacity of all rooms (${P.totalCapacity} seats).`, ex.code);
      continue;
    }
    if (P.R) {
      const need = P.minRooms[ex.idx] * P.perRoom;
      dutyNeed += need;
      if (P.eligibleFac[ex.idx].length < need) {
        err('invigilators', `${ex.code}: needs at least ${need} invigilator(s) but only ${P.eligibleFac[ex.idx].length} faculty are eligible.`, ex.code);
      }
    }
  }
  const totalDutyCap = P.faculty.reduce((a, f) => a + f.maxWorkload, 0);
  if (P.F && dutyNeed > totalDutyCap) {
    err('workload', `The exams need at least ${dutyNeed} invigilation duties but total faculty workload capacity is only ${totalDutyCap}.`);
  }

  // Lower bound: a set of exams that pairwise share students needs that many distinct, non-overlapping slots.
  let clique = [];
  for (let start = 0; start < P.E; start++) {
    const c = [start];
    const cand = P.adj[start].map((a) => a.j).sort((a, b) => P.adj[b].length - P.adj[a].length);
    for (const j of cand) if (c.every((k) => P.shared[k * P.E + j] > 0)) c.push(j);
    if (c.length > clique.length) clique = c;
  }
  if (clique.length > usableSlots && usableSlots > 0) {
    err('clique', `${clique.length} examinations (${clique.map((i) => P.exams[i].code).join(', ')}) all share students pairwise, so they need ${clique.length} separate time slots, but only ${usableSlots} usable slots exist.`);
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  return {
    ok: errors === 0,
    issues,
    summary: {
      examinations: P.E, usableSlots, totalSlots: P.S, rooms: P.R, totalRoomCapacity: P.totalCapacity,
      faculty: P.F, students: P.studentIds.length, largestConflictGroup: clique.length,
      minimumInvigilationDuties: dutyNeed, totalFacultyCapacity: totalDutyCap,
    },
  };
}

module.exports = { loadRaw, buildProblem, makeProblem, analyzeFeasibility };
