/**
 * Algorithm tests (TEST 1-10). Run with: npm test
 * They use the pure makeProblem()/runSimulatedAnnealing() path, so no database is needed,
 * and verify results with the INDEPENDENT validator (constraintValidator.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const { makeProblem, analyzeFeasibility } = require('../services/problemBuilder');
const { runSimulatedAnnealing } = require('../services/simulatedAnnealing');
const { validateSchedule } = require('../services/constraintValidator');
const { InfeasibleError } = require('../services/scheduleGenerator');
const { buildDemoDataset } = require('../db/demoData');

/** Convert the generated demo dataset into the raw records makeProblem() expects (ids assigned by position). */
function demoRaw() {
  const d = buildDemoDataset();
  const dept = Object.fromEntries(d.departments.map((x, i) => [x.code, i + 1]));
  const subj = Object.fromEntries(d.subjects.map((x, i) => [x.code, i + 1]));
  const fac = Object.fromEntries(d.faculty.map((x, i) => [x.code, i + 1]));
  const room = Object.fromEntries(d.rooms.map((x, i) => [x.code, i + 1]));
  const slots = [];
  const slotId = {};
  for (const [dates, hol] of [[d.examDates, 0], [d.holidayDates, 1]]) {
    for (const date of dates) for (const t of d.templates) {
      const id = slots.length + 1;
      slotId[`${date}|${t.label}`] = id;
      slots.push({ id, slot_date: date, label: t.label, start_time: t.start, end_time: t.end, is_holiday: hol, is_available: 1 });
    }
  }
  slots.sort((a, b) => (a.slot_date + a.start_time).localeCompare(b.slot_date + b.start_time));
  const enrollments = [];
  d.students.forEach((s, i) => s.subjects.forEach((c) => enrollments.push({ student_id: i + 1, subject_id: subj[c] })));
  const eligibility = [];
  for (const s of d.subjects) for (const fc of d.eligibleByDept[s.dept] || []) eligibility.push({ subject_id: subj[s.code], faculty_id: fac[fc] });
  return {
    exams: d.subjects.map((s, i) => ({ id: i + 1, subject_id: subj[s.code], duration_minutes: s.duration, code: s.code, name: s.name, department_id: dept[s.dept], semester: s.semester, priority: s.priority })),
    enrollments, slots,
    rooms: d.rooms.map((r) => ({ id: room[r.code], room_code: r.code, name: r.name, capacity: r.capacity })),
    faculty: d.faculty.map((f) => ({ id: fac[f.code], faculty_code: f.code, name: f.name, max_workload: f.max, department_id: dept[f.dept] })),
    roomUnavailable: Object.entries(d.roomBlocked).flatMap(([rc, l]) => l.map(([dt, lb]) => ({ room_id: room[rc], slot_id: slotId[`${dt}|${lb}`] }))),
    facultyUnavailable: Object.entries(d.facultyBlocked).flatMap(([fc, l]) => l.map(([dt, lb]) => ({ faculty_id: fac[fc], slot_id: slotId[`${dt}|${lb}`] }))),
    eligibility,
    _d: d, _slotId: slotId,
  };
}

/** Translate an optimiser solution into the plain records the validator reads. */
function toValidatorInput(raw, P, sol, extra = {}) {
  const slots = Object.fromEntries(raw.slots.map((s) => [s.id, { ...s, date: s.slot_date }]));
  const rooms = Object.fromEntries(raw.rooms.map((r) => [r.id, { ...r, status: 'available' }]));
  const faculty = Object.fromEntries(raw.faculty.map((f) => [f.id, f]));
  const elig = new Map();
  for (const e of raw.eligibility) { if (!elig.has(e.subject_id)) elig.set(e.subject_id, new Set()); elig.get(e.subject_id).add(e.faculty_id); }
  return {
    slots, rooms, faculty, eligibility: elig, perRoom: P.perRoom,
    roomUnavailable: new Set(raw.roomUnavailable.map((u) => `${u.room_id}:${u.slot_id}`)),
    facultyUnavailable: new Set(raw.facultyUnavailable.map((u) => `${u.faculty_id}:${u.slot_id}`)),
    exams: P.exams.map((ex, e) => ({
      examination_id: ex.id, subject_id: ex.subjectId, code: ex.code, name: ex.name, duration: ex.duration,
      slot_id: P.slots[sol.slot[e]].id, room_ids: sol.rooms[e].map((r) => P.rooms[r].id),
      invigilators: sol.inv[e].map((f) => ({ faculty_id: P.faculty[f].id })), student_ids: ex.studentIds,
    })),
    ...extra,
  };
}

const FAST = { stepDelayMs: 0, seed: 11, maxIterations: 4000 };
let cache;
async function solved() {
  if (cache) return cache;
  const raw = demoRaw();
  const P = makeProblem(raw);
  const res = await runSimulatedAnnealing(P, FAST);
  cache = { raw, P, res, input: toValidatorInput(raw, P, res.best) };
  return cache;
}
const countType = (input, type) => validateSchedule(input).conflicts.filter((c) => c.type === type).length;

test('TEST 1: a student enrolled in several subjects never gets simultaneous examinations', async () => {
  const { input } = await solved();
  assert.strictEqual(countType(input, 'student_clash'), 0);
});

test('TEST 2: no faculty member invigilates two simultaneous examinations', async () => {
  const { input } = await solved();
  assert.strictEqual(countType(input, 'faculty_clash'), 0);
});

test('TEST 3: room capacity is never exceeded (multi-room exams cover all students)', async () => {
  const { input, P } = await solved();
  assert.strictEqual(countType(input, 'room_capacity'), 0);
  const hs = input.exams.find((e) => e.code === 'HS101');
  assert.ok(hs.room_ids.length >= 2, 'HS101 (40 students, largest room 30) must use several rooms');
  assert.ok(hs.room_ids.reduce((a, id) => a + input.rooms[id].capacity, 0) >= P.exams.find((e) => e.code === 'HS101').n);
});

test('TEST 4: a room is never double-booked', async () => {
  const { input } = await solved();
  assert.strictEqual(countType(input, 'room_double_booking'), 0);
});

test('TEST 5: unavailable faculty are never assigned', async () => {
  const { input } = await solved();
  assert.strictEqual(countType(input, 'faculty_unavailable'), 0);
  assert.strictEqual(countType(input, 'faculty_not_eligible'), 0);
});

test('TEST 6: unavailable rooms are never assigned', async () => {
  const { input } = await solved();
  assert.strictEqual(countType(input, 'room_unavailable'), 0);
});

test('TEST 7: every examination receives a valid date and time (no holidays, duration fits)', async () => {
  const { input, P } = await solved();
  assert.strictEqual(input.exams.length, P.E);
  for (const ex of input.exams) {
    const slot = input.slots[ex.slot_id];
    assert.ok(slot, `${ex.code} has a slot`);
    assert.ok(!slot.is_holiday, `${ex.code} is not on a holiday`);
  }
  assert.strictEqual(countType(input, 'invalid_duration'), 0);
  assert.strictEqual(countType(input, 'slot_unavailable'), 0);
});

test('TEST 8: all exams are scheduled, otherwise the unschedulable ones are reported with reasons', async () => {
  const { P } = await solved();
  assert.strictEqual(analyzeFeasibility(P).ok, true);

  // Impossible: only one slot but several conflicting exams -> must explain, never silently emit an invalid timetable
  const raw = demoRaw();
  raw.slots = raw.slots.filter((s) => !s.is_holiday).slice(0, 1);
  raw.roomUnavailable = []; raw.facultyUnavailable = [];
  const P2 = makeProblem(raw);
  const feas = analyzeFeasibility(P2);
  assert.strictEqual(feas.ok, false);
  assert.ok(feas.issues.some((i) => i.severity === 'error' && /slot/i.test(i.message)));
  await assert.rejects(() => runSimulatedAnnealing(P2, FAST), (e) => {
    assert.ok(e instanceof InfeasibleError);
    assert.ok(e.report.unscheduled.length > 0 && e.report.unscheduled.every((u) => u.reason && u.code));
    return true;
  });

  // Capacity impossible: more students than all rooms combined
  const raw3 = demoRaw();
  raw3.rooms = raw3.rooms.slice(0, 1);
  const f3 = analyzeFeasibility(makeProblem(raw3));
  assert.ok(f3.issues.some((i) => i.code === 'capacity'));
});

test('TEST 9: optimised cost is compared against, and is lower than, the initial cost', async () => {
  const { res } = await solved();
  assert.ok(res.initialCost.total > 0);
  assert.ok(res.bestCost.total < res.initialCost.total, `best ${res.bestCost.total} < initial ${res.initialCost.total}`);
  assert.ok(res.bestCost.total <= res.initialCost.total);
  const w = res.config.weights;
  const recomputed = w.student * res.bestCost.student + w.faculty * res.bestCost.faculty + w.room * res.bestCost.room + w.spacing * res.bestCost.spacing;
  assert.ok(Math.abs(recomputed - res.bestCost.total) < 1e-6, 'Cost = w1*Cs + w2*Cf + w3*Cr + w4*Csp');
});

test('TEST 10: the final timetable passes independent hard-constraint validation', async () => {
  const { input } = await solved();
  const v = validateSchedule(input);
  assert.strictEqual(v.valid, true, JSON.stringify(v.conflicts.slice(0, 3)));
});

test('validator detects injected violations (it does not trust the optimiser)', async () => {
  const { input } = await solved();
  const bad = JSON.parse(JSON.stringify({ ...input, rooms: input.rooms, slots: input.slots }));
  Object.assign(bad, { rooms: input.rooms, faculty: input.faculty, eligibility: input.eligibility, roomUnavailable: input.roomUnavailable, facultyUnavailable: input.facultyUnavailable, perRoom: input.perRoom });
  // force two exams that share students into the same slot
  const a = bad.exams.find((e) => e.code === 'CS301');
  const b = bad.exams.find((e) => e.code === 'CS302');
  b.slot_id = a.slot_id;
  const v = validateSchedule(bad);
  assert.ok(v.conflicts.some((c) => c.type === 'student_clash'));
  assert.ok(v.conflicts.every((c) => c.explanation && c.suggestion));
});

test('same seed reproduces the same optimisation (deterministic)', async () => {
  const a = await runSimulatedAnnealing(makeProblem(demoRaw()), { ...FAST, maxIterations: 1500 });
  const b = await runSimulatedAnnealing(makeProblem(demoRaw()), { ...FAST, maxIterations: 1500 });
  assert.strictEqual(a.bestCost.total, b.bestCost.total);
  assert.strictEqual(a.stats.accepted, b.stats.accepted);
});

test('higher spacing weight spreads exams at least as evenly', async () => {
  const lo = await runSimulatedAnnealing(makeProblem(demoRaw()), { ...FAST, weights: { spacing: 0.1 } });
  const hi = await runSimulatedAnnealing(makeProblem(demoRaw()), { ...FAST, weights: { spacing: 5 } });
  assert.ok(hi.bestCost.spacing <= lo.bestCost.spacing + 1e-9, `spacing cost ${hi.bestCost.spacing} <= ${lo.bestCost.spacing}`);
});

test('pause / resume / cancel are honoured by the running algorithm', async () => {
  const control = { state: 'running' };
  const statuses = [];
  let progressed = 0;
  const run = runSimulatedAnnealing(makeProblem(demoRaw()), { stepDelayMs: 5, seed: 3 }, {
    control, onStatus: (s) => statuses.push(s),
    onProgress: () => { progressed++; if (progressed === 3) control.state = 'paused'; },
  });
  await new Promise((r) => setTimeout(r, 300));
  const frozen = progressed;
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(progressed, frozen, 'no progress while paused');
  control.state = 'running';
  await new Promise((r) => setTimeout(r, 100));
  control.state = 'cancelled';
  const res = await run;
  assert.ok(res.cancelled);
  assert.ok(statuses.includes('paused') && statuses.includes('running'));
});
