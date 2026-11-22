/**
 * INDEPENDENT hard-constraint validation.
 *
 * This module shares no code with the optimiser. It works on plain records (as stored in the
 * database after optimisation, or after a manual edit) and re-derives every constraint with
 * straightforward pairwise checks, so a bug in the optimiser cannot hide a violation.
 *
 * input = {
 *   slots:  { [slotId]: { id, date, label, start_time, end_time, is_holiday, is_available } },
 *   exams:  [{ examination_id, subject_id, code, name, duration, slot_id|null, room_ids:[], invigilators:[{faculty_id, room_id}], student_ids:[] }],
 *   rooms:  { [roomId]:  { id, name, capacity, status } },
 *   faculty:{ [facId]:   { id, name, max_workload } },
 *   students:{ [id]: { id, code, name } },              (optional - used for readable messages)
 *   roomUnavailable: Set('roomId:slotId'), facultyUnavailable: Set('facId:slotId'),
 *   eligibility: Map(subjectId -> Set(facultyId)),      (missing/empty = everyone eligible)
 *   perRoom: invigilators required per room
 * }
 */
const { absMinute, timeToMin, fmtDate, fmtTime } = require('../utils/helpers');

const TYPES = {
  student_clash: 'Student examination clash',
  faculty_clash: 'Faculty invigilation clash',
  room_double_booking: 'Room double-booking',
  room_capacity: 'Room capacity violation',
  faculty_unavailable: 'Faculty availability violation',
  room_unavailable: 'Room availability violation',
  invalid_duration: 'Invalid examination duration',
  slot_unavailable: 'Slot unavailable (holiday / disabled)',
  faculty_not_eligible: 'Faculty not eligible for subject',
  faculty_overload: 'Faculty workload exceeded',
  insufficient_invigilators: 'Insufficient invigilators',
  unscheduled_exam: 'Examination not scheduled',
};

const SUGGEST = {
  student_clash: 'Move one of the two examinations to a different, non-overlapping time slot (use Edit on the Timetable page, or re-run the optimizer).',
  faculty_clash: 'Replace the invigilator in one of the examinations with a faculty member who is free at that time.',
  room_double_booking: 'Assign one of the examinations to a different room or move it to another slot.',
  room_capacity: 'Add another room to this examination (combined capacity must cover every student) or choose a larger room.',
  faculty_unavailable: 'Replace this invigilator with an available faculty member, or update their availability if it changed.',
  room_unavailable: 'Choose a different room for this examination or mark the room available for that slot.',
  invalid_duration: 'Move the examination to a longer slot or shorten its duration on the Examination Management page.',
  slot_unavailable: 'Move the examination to a usable (non-holiday, available) slot.',
  faculty_not_eligible: 'Pick an eligible invigilator, or add this faculty member to the subject\'s eligible list.',
  faculty_overload: "Reassign some of this faculty member's duties or raise their maximum workload.",
  insufficient_invigilators: 'Assign one invigilator per examination room.',
  unscheduled_exam: 'Give the examination a time slot, rooms and invigilators.',
};

function validateSchedule(input) {
  const { slots, rooms, faculty, students = {}, roomUnavailable = new Set(), facultyUnavailable = new Set(), eligibility = new Map(), perRoom = 1 } = input;
  const conflicts = [];

  const add = (type, exam, related, explanation, extra = {}) => {
    const slot = exam && exam.slot_id ? slots[exam.slot_id] : null;
    conflicts.push({
      type, label: TYPES[type], severity: 'hard',
      examination_id: exam ? exam.examination_id : null,
      subject_code: exam ? exam.code : null,
      subject_name: exam ? exam.name : null,
      related, date: slot ? String(slot.date).slice(0, 10) : null,
      time: slot ? `${fmtTime(slot.start_time)}-${fmtTime(slot.end_time)}` : null,
      slot_label: slot ? slot.label : null,
      explanation, suggestion: SUGGEST[type], ...extra,
    });
  };
  const when = (exam) => {
    const s = slots[exam.slot_id];
    return s ? `${fmtDate(s.date)} ${fmtTime(s.start_time)}` : 'unscheduled';
  };

  const placed = [];
  for (const ex of input.exams) {
    if (!ex.slot_id || !slots[ex.slot_id]) { add('unscheduled_exam', ex, null, `${ex.code} (${ex.name}) has no time slot assigned.`); continue; }
    const slot = slots[ex.slot_id];
    const start = absMinute(slot.date, slot.start_time);
    const slotLen = timeToMin(slot.end_time) - timeToMin(slot.start_time);
    const item = { ex, slot, start, end: start + ex.duration };
    placed.push(item);

    // --- slot validity & duration (constraint 6)
    if (slot.is_holiday || !slot.is_available) {
      add('slot_unavailable', ex, { type: 'slot', id: slot.id, name: slot.label }, `${ex.code} is scheduled on ${fmtDate(slot.date)} ${slot.label}, which is ${slot.is_holiday ? 'a holiday' : 'disabled'}.`);
    }
    if (ex.duration > slotLen) {
      add('invalid_duration', ex, { type: 'slot', id: slot.id, name: slot.label },
        `${ex.code} lasts ${ex.duration} min but slot ${slot.label} (${fmtTime(slot.start_time)}-${fmtTime(slot.end_time)}) is only ${slotLen} min long, so it does not fit.`);
    }

    // --- rooms (constraints 3 and 4)
    const roomIds = ex.room_ids || [];
    const seats = roomIds.reduce((a, id) => a + ((rooms[id] && rooms[id].capacity) || 0), 0);
    if (!roomIds.length) {
      add('room_capacity', ex, null, `${ex.code} has no examination room assigned for its ${ex.student_ids.length} students.`);
    } else if (seats < ex.student_ids.length) {
      add('room_capacity', ex, { type: 'room', id: roomIds[0], name: roomIds.map((id) => rooms[id] && rooms[id].name).join(', ') },
        `${ex.code} has ${ex.student_ids.length} students but its assigned rooms (${roomIds.map((id) => rooms[id] && rooms[id].name).join(', ')}) seat only ${seats}.`);
    }
    for (const id of roomIds) {
      const r = rooms[id];
      if (!r || r.status !== 'available' || roomUnavailable.has(`${id}:${slot.id}`)) {
        add('room_unavailable', ex, { type: 'room', id, name: r ? r.name : `#${id}` }, `Room ${r ? r.name : id} is not available for ${ex.code} on ${when(ex)}.`);
      }
    }

    // --- invigilators (constraint 5 + staffing)
    const inv = ex.invigilators || [];
    const required = roomIds.length * perRoom;
    if (inv.length < required) {
      add('insufficient_invigilators', ex, null, `${ex.code} uses ${roomIds.length} room(s) and needs ${required} invigilator(s) but has ${inv.length}.`);
    }
    const elig = eligibility.get(ex.subject_id);
    const seen = new Set();
    for (const { faculty_id: fid } of inv) {
      const f = faculty[fid];
      const rel = { type: 'faculty', id: fid, name: f ? f.name : `#${fid}` };
      if (seen.has(fid)) { add('faculty_clash', ex, rel, `${rel.name} is listed twice as invigilator of ${ex.code}.`); continue; }
      seen.add(fid);
      if (facultyUnavailable.has(`${fid}:${slot.id}`)) {
        add('faculty_unavailable', ex, rel, `${rel.name} is marked unavailable on ${when(ex)} but invigilates ${ex.code}.`);
      }
      if (elig && elig.size && !elig.has(fid)) {
        add('faculty_not_eligible', ex, rel, `${rel.name} is not on the eligible invigilator list for ${ex.code}.`);
      }
    }
  }

  // --- pairwise overlap checks (constraints 1, 2, 4)
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (!(a.start < b.end && b.start < a.end)) continue;

      const common = a.ex.student_ids.filter((s) => b.ex.student_ids.includes(s));
      if (common.length) {
        const names = common.slice(0, 4).map((id) => (students[id] ? students[id].code : `#${id}`)).join(', ');
        add('student_clash', a.ex, { type: 'student', id: common[0], name: names, count: common.length, other_examination_id: b.ex.examination_id },
          `${common.length} student(s) (${names}${common.length > 4 ? ', ...' : ''}) are enrolled in both ${a.ex.code} and ${b.ex.code}, which overlap on ${when(a.ex)}.`,
          { other_subject_code: b.ex.code, students: common });
      }
      for (const rid of (a.ex.room_ids || []).filter((r) => (b.ex.room_ids || []).includes(r))) {
        const rn = rooms[rid] ? rooms[rid].name : `#${rid}`;
        add('room_double_booking', a.ex, { type: 'room', id: rid, name: rn, other_examination_id: b.ex.examination_id },
          `Room ${rn} is used by both ${a.ex.code} and ${b.ex.code} at overlapping times on ${when(a.ex)}.`, { other_subject_code: b.ex.code });
      }
      const aF = (a.ex.invigilators || []).map((x) => x.faculty_id);
      for (const fid of (b.ex.invigilators || []).map((x) => x.faculty_id).filter((f) => aF.includes(f))) {
        const fn = faculty[fid] ? faculty[fid].name : `#${fid}`;
        add('faculty_clash', a.ex, { type: 'faculty', id: fid, name: fn, other_examination_id: b.ex.examination_id },
          `${fn} invigilates both ${a.ex.code} and ${b.ex.code} at overlapping times on ${when(a.ex)}.`, { other_subject_code: b.ex.code });
      }
    }
  }

  // --- workload cap
  const duties = new Map();
  for (const it of placed) for (const { faculty_id: fid } of it.ex.invigilators || []) duties.set(fid, (duties.get(fid) || 0) + 1);
  for (const [fid, n] of duties) {
    const f = faculty[fid];
    if (f && n > f.max_workload) {
      add('faculty_overload', null, { type: 'faculty', id: fid, name: f.name }, `${f.name} has ${n} invigilation duties but their maximum workload is ${f.max_workload}.`);
    }
  }

  const counts = {};
  for (const c of conflicts) counts[c.type] = (counts[c.type] || 0) + 1;
  return { valid: conflicts.length === 0, conflicts, counts, total: conflicts.length, checkedExaminations: input.exams.length };
}

module.exports = { validateSchedule, CONFLICT_TYPES: TYPES };
