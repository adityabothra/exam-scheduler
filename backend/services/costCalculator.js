/**
 * Objective function:   Cost = w1*C_student + w2*C_faculty + w3*C_room + w4*C_spacing
 *
 * Hard constraints are NOT part of the cost - they are enforced by feasibility.js and the
 * independent validator. Every term below is a soft preference; lower is better.
 *
 * C_student  (per student)  same-day pairs C(k,2)*4  +  6 per exam above maxExamsPerDay
 *                           +  3 per hour above maxDailyMinutes
 * C_spacing  (per student)  for each pair of consecutive exams with rest gap g hours < minSpacingHours:
 *                           10*((min-g)/min)^2        +  0.5 * sum_d (exams_on_date_d - mean)^2  (even spread)
 * C_faculty                 1*sum_f (load_f - mean)^2  +  3 per duty above 75% of max workload
 *                           +  2 per extra same-day duty  +  1.5 per duty next to an unavailable slot
 * C_room     (per exam)     10*(wasted seats / total seats)  +  8 per room beyond the minimum possible
 *                           +  0.5 * sum_r (exams_in_room_r - mean)^2
 */
const K = {
  SAME_DAY_PAIR: 4, EXCESS_EXAM: 6, EXCESS_HOUR: 3,
  GAP_SCALE: 10, EVENNESS: 0.5,
  IMBALANCE: 1, OVER_SOFTCAP: 3, SAME_DAY_DUTY: 2, NEAR_UNAVAILABLE: 1.5, SOFTCAP_RATIO: 0.75,
  WASTE: 10, EXTRA_ROOM: 8, ROOM_BALANCE: 0.5,
};

function computeCost(P, sol, weights, paramsOverride) {
  const prm = { ...P.params, ...(paramsOverride || {}) };
  const w = { student: 1, faculty: 1, room: 1, spacing: 1, ...weights };

  // ---------- students: C_student and the gap part of C_spacing
  let sSame = 0, sExcess = 0, sHours = 0, spGap = 0;
  for (const list of P.studentExams) {
    if (list.length < 2) continue;
    const items = list
      .map((e) => { const st = P.slots[sol.slot[e]].start; return { start: st, end: st + P.exams[e].duration, day: P.slots[sol.slot[e]].dayIndex, dur: P.exams[e].duration }; })
      .sort((a, b) => a.start - b.start);
    let i = 0;
    while (i < items.length) {
      let k = 0, minutes = 0;
      const day = items[i].day;
      while (i < items.length && items[i].day === day) { k++; minutes += items[i].dur; i++; }
      sSame += (k * (k - 1)) / 2 * K.SAME_DAY_PAIR;
      sExcess += Math.max(0, k - prm.maxExamsPerDay) * K.EXCESS_EXAM;
      sHours += (Math.max(0, minutes - prm.maxDailyMinutes) / 60) * K.EXCESS_HOUR;
    }
    if (prm.minSpacingHours > 0) {
      for (let a = 0; a + 1 < items.length; a++) {
        const gapH = Math.max(0, (items[a + 1].start - items[a].end) / 60);
        if (gapH < prm.minSpacingHours) spGap += ((prm.minSpacingHours - gapH) / prm.minSpacingHours) ** 2 * K.GAP_SCALE;
      }
    }
  }

  // ---------- spacing: even spread of exams across the usable dates
  let spEven = 0;
  if (P.dates.length > 1) {
    const perDate = new Map(P.dates.map((d) => [d, 0]));
    for (let e = 0; e < P.E; e++) { const d = P.slots[sol.slot[e]].date; if (perDate.has(d)) perDate.set(d, perDate.get(d) + 1); }
    const mean = P.E / P.dates.length;
    for (const c of perDate.values()) spEven += (c - mean) ** 2;
    spEven *= K.EVENNESS;
  }

  // ---------- faculty
  const loads = new Int32Array(P.F);
  const dayDuty = new Map();
  let fNear = 0;
  for (let e = 0; e < P.E; e++) {
    const s = sol.slot[e];
    for (const f of sol.inv[e]) {
      loads[f]++;
      const key = f * 100000 + P.slots[s].dayIndex % 100000;
      dayDuty.set(key, (dayDuty.get(key) || 0) + 1);
      const ps = P.prevSlot[s], ns = P.nextSlot[s];
      if (ps >= 0 && !P.facAvail[f * P.S + ps]) fNear++;
      if (ns >= 0 && !P.facAvail[f * P.S + ns]) fNear++;
    }
  }
  let total = 0;
  for (let f = 0; f < P.F; f++) total += loads[f];
  const meanLoad = P.F ? total / P.F : 0;
  let fImb = 0, fOver = 0;
  for (let f = 0; f < P.F; f++) {
    fImb += (loads[f] - meanLoad) ** 2;
    fOver += Math.max(0, loads[f] - Math.ceil(K.SOFTCAP_RATIO * P.facMax[f]));
  }
  let fSame = 0;
  for (const d of dayDuty.values()) fSame += Math.max(0, d - 1);
  const cFacultyParts = {
    imbalance: K.IMBALANCE * fImb, overSoftCap: K.OVER_SOFTCAP * fOver,
    sameDayDuties: K.SAME_DAY_DUTY * fSame, nearUnavailable: K.NEAR_UNAVAILABLE * fNear,
  };

  // ---------- rooms
  const usage = new Int32Array(P.R);
  let rWaste = 0, rExtra = 0;
  for (let e = 0; e < P.E; e++) {
    let cap = 0;
    for (const r of sol.rooms[e]) { cap += P.roomCap[r]; usage[r]++; }
    rWaste += K.WASTE * Math.max(0, (cap - P.exams[e].n) / cap);
    rExtra += K.EXTRA_ROOM * Math.max(0, sol.rooms[e].length - P.minRooms[e]);
  }
  let rBal = 0;
  if (P.R) {
    const meanUse = P.E ? Array.from(usage).reduce((a, b) => a + b, 0) / P.R : 0;
    for (let r = 0; r < P.R; r++) rBal += (usage[r] - meanUse) ** 2;
    rBal *= K.ROOM_BALANCE;
  }

  const student = sSame + sExcess + sHours;
  const spacing = spGap + spEven;
  const faculty = cFacultyParts.imbalance + cFacultyParts.overSoftCap + cFacultyParts.sameDayDuties + cFacultyParts.nearUnavailable;
  const room = rWaste + rExtra + rBal;

  return {
    student, faculty, room, spacing,
    total: w.student * student + w.faculty * faculty + w.room * room + w.spacing * spacing,
    parts: {
      student: { sameDayPairs: sSame, excessExamsPerDay: sExcess, excessDailyHours: sHours },
      spacing: { shortRestGaps: spGap, uneven: spEven },
      faculty: cFacultyParts,
      room: { wastedSeats: rWaste, extraRooms: rExtra, unbalancedUse: rBal },
    },
  };
}

module.exports = { computeCost, COST_CONSTANTS: K };
