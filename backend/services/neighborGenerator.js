/**
 * Neighbourhood operators for Simulated Annealing (Step 3).
 *
 *   moveSlot       move one exam to another date/time slot
 *   swapSlots      swap the slots of two exams
 *   changeRoom     replace one assigned room with another free room
 *   changeFaculty  replace one invigilator with another eligible, free faculty member
 *   reassignRooms  pick a completely new room set for an exam
 *
 * Every proposal is verified against ALL hard constraints before it is returned. A proposal that
 * cannot be repaired into a valid timetable is reported as { valid: false } and never reaches the
 * acceptance test, so the annealer only ever walks through valid timetables.
 */
const F = require('./feasibility');

function chooseMove(rng, probs) {
  const entries = Object.entries(probs);
  const total = entries.reduce((a, [, p]) => a + p, 0);
  let r = rng() * total;
  for (const [name, p] of entries) { r -= p; if (r <= 0) return name; }
  return entries[0][0];
}

const randInt = (rng, n) => Math.floor(rng() * n);

/** Give exam e (already placed at slot s) rooms + invigilators, reusing its old ones when still valid. */
function resourcesFor(P, sol, e, s, oldRooms, oldInv, rng) {
  sol.rooms[e] = null; sol.inv[e] = null; // an exam never blocks itself
  const rooms = oldRooms && oldRooms.every((r) => F.roomFree(P, sol, r, e, s)) ? oldRooms : F.pickRooms(P, sol, e, s, rng);
  if (!rooms) return false;
  sol.rooms[e] = rooms;
  const need = rooms.length * P.perRoom;
  const keep = (oldInv || []).filter((f) => F.facFree(P, sol, f, e, s)).slice(0, need);
  const inv = F.pickInvigilators(P, sol, e, s, need, rng, { keep, mode: 'random' });
  if (!inv) return false;
  sol.inv[e] = inv;
  return true;
}

function generateNeighbor(P, sol, rng, probs) {
  const move = chooseMove(rng, probs);
  const ns = F.cloneSolution(sol);
  const changed = [];
  let description = '';
  const fail = (reason) => ({ valid: false, move, reason });

  switch (move) {
    case 'moveSlot': {
      const e = randInt(rng, P.E);
      const options = P.eligibleSlots[e].filter((s) => s !== sol.slot[e]);
      if (!options.length) return fail('no alternative slot');
      const s = options[randInt(rng, options.length)];
      if (F.studentClash(P, ns, e, s)) return fail('student clash');
      const from = F.slotName(P, sol.slot[e]);
      ns.slot[e] = s;
      if (!resourcesFor(P, ns, e, s, sol.rooms[e], sol.inv[e], rng)) return fail('no free rooms/invigilators in that slot');
      changed.push(e);
      description = `Moved ${P.exams[e].code} from ${from} to ${F.slotName(P, s)}`;
      break;
    }
    case 'swapSlots': {
      if (P.E < 2) return fail('fewer than two exams');
      const e1 = randInt(rng, P.E);
      let e2 = randInt(rng, P.E - 1);
      if (e2 >= e1) e2++;
      const s1 = sol.slot[e1], s2 = sol.slot[e2];
      if (s1 === s2) return fail('exams already share a slot');
      if (!P.slotEligible[e1 * P.S + s2] || !P.slotEligible[e2 * P.S + s1]) return fail('slot too short for the other exam');
      ns.slot[e1] = s2; ns.slot[e2] = s1;
      if (F.studentClash(P, ns, e1, s2) || F.studentClash(P, ns, e2, s1)) return fail('student clash');
      const [r1, i1, r2, i2] = [sol.rooms[e1], sol.inv[e1], sol.rooms[e2], sol.inv[e2]];
      ns.rooms[e1] = ns.rooms[e2] = ns.inv[e1] = ns.inv[e2] = null; // release both before re-assigning
      if (!resourcesFor(P, ns, e1, s2, r1, i1, rng)) return fail('no free rooms/invigilators after swap');
      if (!resourcesFor(P, ns, e2, s1, r2, i2, rng)) return fail('no free rooms/invigilators after swap');
      changed.push(e1, e2);
      description = `Swapped ${P.exams[e1].code} (${F.slotName(P, s1)}) with ${P.exams[e2].code} (${F.slotName(P, s2)})`;
      break;
    }
    case 'changeRoom': {
      const e = randInt(rng, P.E);
      const s = sol.slot[e];
      const cur = sol.rooms[e];
      const out = cur[randInt(rng, cur.length)];
      const options = [];
      for (let r = 0; r < P.R; r++) if (!cur.includes(r) && F.roomFree(P, ns, r, e, s)) options.push(r);
      if (!options.length) return fail('no free room to switch to');
      const incoming = options[randInt(rng, options.length)];
      const next = cur.map((r) => (r === out ? incoming : r));
      if (next.reduce((a, r) => a + P.roomCap[r], 0) < P.exams[e].n) return fail('replacement room too small');
      ns.rooms[e] = next;
      changed.push(e);
      description = `Changed room of ${P.exams[e].code}: ${P.rooms[out].name} -> ${P.rooms[incoming].name}`;
      break;
    }
    case 'changeFaculty': {
      const e = randInt(rng, P.E);
      const s = sol.slot[e];
      const cur = sol.inv[e];
      if (!cur.length) return fail('no invigilators');
      const k = randInt(rng, cur.length);
      const loads = F.facLoads(P, ns);
      const options = P.eligibleFac[e].filter((f) => !cur.includes(f) && loads[f] + 1 <= P.facMax[f] && F.facFree(P, ns, f, e, s));
      if (!options.length) return fail('no free eligible faculty');
      const incoming = options[randInt(rng, options.length)];
      const next = cur.slice();
      next[k] = incoming;
      ns.inv[e] = next;
      changed.push(e);
      description = `Changed invigilator of ${P.exams[e].code}: ${P.faculty[cur[k]].name} -> ${P.faculty[incoming].name}`;
      break;
    }
    case 'reassignRooms': {
      const e = randInt(rng, P.E);
      const s = sol.slot[e];
      ns.rooms[e] = null; ns.inv[e] = null;
      const rooms = F.pickRooms(P, ns, e, s, rng);
      if (!rooms) return fail('no feasible room set');
      if (rooms.length === sol.rooms[e].length && rooms.every((r) => sol.rooms[e].includes(r))) return fail('identical room set');
      ns.rooms[e] = rooms;
      const need = rooms.length * P.perRoom;
      const keep = sol.inv[e].filter((f) => F.facFree(P, ns, f, e, s)).slice(0, need);
      const inv = F.pickInvigilators(P, ns, e, s, need, rng, { keep, mode: 'random' });
      if (!inv) return fail('not enough invigilators for the new rooms');
      ns.inv[e] = inv;
      changed.push(e);
      description = `Reassigned rooms of ${P.exams[e].code}: [${sol.rooms[e].map((r) => P.rooms[r].name).join(', ')}] -> [${rooms.map((r) => P.rooms[r].name).join(', ')}]`;
      break;
    }
    default:
      return fail('unknown move');
  }

  // Defence in depth: independently re-verify every hard constraint for each touched exam.
  for (const e of changed) if (!F.verifyExam(P, ns, e)) return fail('hard-constraint verification failed');
  if (!F.workloadOk(P, ns)) return fail('invigilator workload exceeded');
  return { valid: true, move, solution: ns, changed, description };
}

module.exports = { generateNeighbor };
