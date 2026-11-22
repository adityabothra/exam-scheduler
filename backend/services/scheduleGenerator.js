/**
 * Constraint-aware construction of the INITIAL solution (Step 1 of Simulated Annealing).
 *
 * This is deliberately not the optimiser: it only has to find *some* valid timetable. It uses a
 * DSATUR-style ordering (always place the exam with the fewest clash-free slots left) and picks a
 * random feasible slot, so the starting point is valid but usually poor — leaving the annealer
 * real work to do. If a construction attempt dead-ends it restarts with the troublesome exam
 * promoted; after many failed attempts it reports exactly which exams cannot be placed and why.
 */
const { shuffle } = require('../utils/helpers');
const F = require('./feasibility');

class InfeasibleError extends Error {
  constructor(message, report) {
    super(message);
    this.name = 'InfeasibleError';
    this.report = report;
  }
}

/** Human-readable explanation of why exam e cannot be placed given the partial solution. */
function diagnose(P, sol, e, rng) {
  const ex = P.exams[e];
  if (!P.eligibleSlots[e].length) {
    const longest = Math.max(0, ...P.slots.filter((s) => s.usable).map((s) => s.len));
    return `no usable time slot is long enough for its ${ex.duration}-minute duration (longest usable slot: ${longest} min)`;
  }
  const clashWith = new Set();
  let clash = 0, noRoom = 0, noFac = 0, bestFreeCap = 0, bestFacCount = 0;
  for (const s of P.eligibleSlots[e]) {
    if (F.studentClash(P, sol, e, s)) {
      clash++;
      const [st, en] = F.interval(P, e, s);
      for (const { j } of P.adj[e]) {
        if (sol.slot[j] < 0) continue;
        const [a, b] = F.interval(P, j, sol.slot[j]);
        if (F.overlap(st, en, a, b)) { clashWith.add(P.exams[j].code); break; }
      }
      continue;
    }
    const rooms = F.pickRooms(P, sol, e, s, rng);
    if (!rooms) {
      noRoom++;
      let cap = 0;
      for (let r = 0; r < P.R; r++) if (F.roomFree(P, sol, r, e, s)) cap += P.roomCap[r];
      bestFreeCap = Math.max(bestFreeCap, cap);
      continue;
    }
    noFac++;
    const loads = F.facLoads(P, sol, e);
    bestFacCount = Math.max(bestFacCount, P.eligibleFac[e].filter((f) => loads[f] < P.facMax[f] && F.facFree(P, sol, f, e, s)).length);
  }
  const parts = [];
  if (clash) parts.push(`${clash} slot(s) clash with students' other exams (${[...clashWith].slice(0, 5).join(', ')})`);
  if (noRoom) parts.push(`${noRoom} slot(s) lack free room capacity (needs ${ex.n} seats, best free capacity ${bestFreeCap})`);
  if (noFac) parts.push(`${noFac} slot(s) lack enough free eligible invigilators (needs ${P.minRooms[e] * P.perRoom}, best available ${bestFacCount})`);
  return `all ${P.eligibleSlots[e].length} candidate slot(s) rejected: ${parts.join('; ')}`;
}

const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/**
 * One construction pass. With stopOnFail=false it keeps going and returns every exam it could not place
 * (used to build the explanation); with stopOnFail=true it aborts at the first dead end (fast restarts).
 */
function constructOnce(P, rng, failures, stopOnFail) {
  const sol = F.emptySolution(P);
  const unplaced = new Set(Array.from({ length: P.E }, (_, i) => i));
  const failed = [];
  while (unplaced.size) {
    let best = -1, bestKey = null;
    for (const e of unplaced) {
      let avail = 0;
      for (const s of P.eligibleSlots[e]) if (!F.studentClash(P, sol, e, s)) avail++;
      const key = [avail, -failures[e], -P.adj[e].length, -P.exams[e].n, -P.exams[e].priority, rng()];
      if (!bestKey || cmp(key, bestKey) < 0) { best = e; bestKey = key; }
    }
    const e = best;
    const candidates = shuffle(P.eligibleSlots[e].filter((s) => !F.studentClash(P, sol, e, s)), rng);
    let placed = false;
    for (const s of candidates) {
      const rooms = F.pickRooms(P, sol, e, s, rng);
      if (!rooms) continue;
      const inv = F.pickInvigilators(P, sol, e, s, rooms.length * P.perRoom, rng, { mode: 'balanced' });
      if (!inv) continue;
      sol.slot[e] = s; sol.rooms[e] = rooms; sol.inv[e] = inv;
      placed = true;
      break;
    }
    unplaced.delete(e);
    if (!placed) {
      failed.push(e);
      if (stopOnFail) return { sol, failed, complete: false };
    }
  }
  return { sol, failed, complete: failed.length === 0 };
}

function generateInitialSolution(P, rng, { maxAttempts = 300 } = {}) {
  if (P.E === 0) throw new InfeasibleError('There are no examinations to schedule.', { unscheduled: [], attempts: 0 });
  const failures = new Array(P.E).fill(0);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = constructOnce(P, rng, failures, true);
    if (r.complete) return { solution: r.sol, attempts: attempt };
    for (const e of r.failed) failures[e] += 1;
  }

  // Could not build a complete valid timetable: run one non-stopping pass to list every offender.
  const last = constructOnce(P, rng, failures, false);
  const unscheduled = last.failed.map((e) => ({
    examinationId: P.exams[e].id, code: P.exams[e].code, name: P.exams[e].name, students: P.exams[e].n,
    reason: diagnose(P, last.sol, e, rng),
  }));
  throw new InfeasibleError(
    `Could not build a valid timetable: ${unscheduled.length} examination(s) cannot be scheduled without violating a hard constraint.`,
    { unscheduled, attempts: maxAttempts, placed: P.E - unscheduled.length });
}

module.exports = { generateInitialSolution, InfeasibleError, diagnose };
