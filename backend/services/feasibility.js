/**
 * Hard-constraint primitives used while the optimiser builds and mutates solutions.
 *
 * A solution is { slot: Int32Array(E), rooms: Array<int[]|null>, inv: Array<int[]|null> }
 * (all indices into the Problem arrays). An exam occupies the interval
 * [slot.start, slot.start + duration); two exams "overlap" when those intervals intersect.
 *
 * Hard constraints covered here:
 *   1 student clash   2 faculty clash   3 room capacity   4 room clash + room availability
 *   5 faculty availability + eligibility   6 duration fits the slot (via slotEligible)
 *   + invigilator workload cap and "one invigilator per room" staffing.
 */
const { shuffle } = require('../utils/helpers');

const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

function emptySolution(P) {
  return { slot: new Int32Array(P.E).fill(-1), rooms: new Array(P.E).fill(null), inv: new Array(P.E).fill(null) };
}

/** Shallow clone: the inner room/invigilator arrays are treated as immutable and replaced, never edited. */
function cloneSolution(sol) {
  return { slot: sol.slot.slice(), rooms: sol.rooms.slice(), inv: sol.inv.slice() };
}

const interval = (P, e, s) => { const st = P.slots[s].start; return [st, st + P.exams[e].duration]; };

/** Would exam e at slot s overlap any already-placed exam that shares a student with it? */
function studentClash(P, sol, e, s) {
  const [st, en] = interval(P, e, s);
  for (const { j } of P.adj[e]) {
    const sj = sol.slot[j];
    if (sj < 0) continue;
    const [a, b] = interval(P, j, sj);
    if (overlap(st, en, a, b)) return true;
  }
  return false;
}

function roomFree(P, sol, r, e, s) {
  if (!P.roomAvail[r * P.S + s]) return false;
  const [st, en] = interval(P, e, s);
  for (let j = 0; j < P.E; j++) {
    if (j === e || sol.slot[j] < 0 || !sol.rooms[j] || !sol.rooms[j].includes(r)) continue;
    const [a, b] = interval(P, j, sol.slot[j]);
    if (overlap(st, en, a, b)) return false;
  }
  return true;
}

function facFree(P, sol, f, e, s) {
  if (!P.facAvail[f * P.S + s]) return false;
  const [st, en] = interval(P, e, s);
  for (let j = 0; j < P.E; j++) {
    if (j === e || sol.slot[j] < 0 || !sol.inv[j] || !sol.inv[j].includes(f)) continue;
    const [a, b] = interval(P, j, sol.slot[j]);
    if (overlap(st, en, a, b)) return false;
  }
  return true;
}

/** Duties per faculty member, optionally ignoring one exam (the one being re-assigned). */
function facLoads(P, sol, exceptExam = -1) {
  const loads = new Int32Array(P.F);
  for (let j = 0; j < P.E; j++) if (j !== exceptExam && sol.inv[j]) for (const f of sol.inv[j]) loads[f]++;
  return loads;
}

/** Random feasible set of rooms for exam e at slot s, or null if the free capacity is insufficient. */
function pickRooms(P, sol, e, s, rng) {
  const n = P.exams[e].n;
  const free = [];
  let freeCap = 0;
  for (let r = 0; r < P.R; r++) if (roomFree(P, sol, r, e, s)) { free.push(r); freeCap += P.roomCap[r]; }
  if (freeCap < n) return null;

  const fits = free.filter((r) => P.roomCap[r] >= n).sort((a, b) => P.roomCap[a] - P.roomCap[b]);
  if (fits.length && rng() < 0.85) return [fits[Math.floor(rng() * Math.min(3, fits.length))]]; // best-fit-ish single room

  const order = shuffle(free, rng).sort((a, b) => P.roomCap[b] * (0.7 + 0.6 * rng()) - P.roomCap[a] * (0.7 + 0.6 * rng()));
  const chosen = [];
  let sum = 0;
  for (const r of order) { chosen.push(r); sum += P.roomCap[r]; if (sum >= n) break; }
  // drop redundant rooms (smallest first) while capacity still suffices
  for (const r of chosen.slice().sort((a, b) => P.roomCap[a] - P.roomCap[b])) {
    if (chosen.length > 1 && sum - P.roomCap[r] >= n) { chosen.splice(chosen.indexOf(r), 1); sum -= P.roomCap[r]; }
  }
  return chosen;
}

/**
 * Choose `count` invigilators for exam e at slot s. `keep` are invigilators to retain (already validated).
 * mode 'balanced' prefers lightly loaded faculty (used by initialisation); 'random' keeps the search diverse.
 */
function pickInvigilators(P, sol, e, s, count, rng, { keep = [], mode = 'random' } = {}) {
  const loads = facLoads(P, sol, e);
  for (const f of keep) loads[f]++;
  const cand = P.eligibleFac[e].filter((f) => !keep.includes(f) && loads[f] + 1 <= P.facMax[f] && facFree(P, sol, f, e, s));
  const need = count - keep.length;
  if (need < 0) return keep.slice(0, count);
  if (cand.length < need) return null;
  let ordered = shuffle(cand, rng);
  if (mode === 'balanced') ordered = ordered.sort((a, b) => loads[a] - loads[b]);
  return keep.concat(ordered.slice(0, need));
}

/** Full check of ONE exam against every other exam. */
function verifyExam(P, sol, e) {
  const s = sol.slot[e];
  if (s < 0 || !P.slotEligible[e * P.S + s]) return false;
  if (studentClash(P, sol, e, s)) return false;
  const rooms = sol.rooms[e];
  const inv = sol.inv[e];
  if (!rooms || !rooms.length || !inv) return false;
  if (new Set(rooms).size !== rooms.length) return false;
  let cap = 0;
  for (const r of rooms) { cap += P.roomCap[r]; if (!roomFree(P, sol, r, e, s)) return false; }
  if (cap < P.exams[e].n) return false;
  if (inv.length !== rooms.length * P.perRoom || new Set(inv).size !== inv.length) return false;
  for (const f of inv) if (!P.facEligible[e * P.F + f] || !facFree(P, sol, f, e, s)) return false;
  return true;
}

function workloadOk(P, sol) {
  const loads = facLoads(P, sol);
  for (let f = 0; f < P.F; f++) if (loads[f] > P.facMax[f]) return false;
  return true;
}

/** Verify every exam; returns the list of failing exam indices (empty = fully valid). */
function verifyAll(P, sol) {
  const bad = [];
  for (let e = 0; e < P.E; e++) if (!verifyExam(P, sol, e)) bad.push(e);
  if (!workloadOk(P, sol)) bad.push(-1);
  return bad;
}

const slotName = (P, s) => `${P.slots[s].date} ${P.slots[s].label}`;

module.exports = {
  overlap, emptySolution, cloneSolution, interval, studentClash, roomFree, facFree, facLoads,
  pickRooms, pickInvigilators, verifyExam, workloadOk, verifyAll, slotName,
};
