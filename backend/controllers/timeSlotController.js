const { Period, Slot } = require('../models/TimeSlot');
const { ApiError, asyncHandler, timeToMin, dayIndex } = require('../utils/helpers');
const { validate } = require('../utils/validate');

const periodSchema = {
  name: { type: 'string', required: true, max: 120 },
  session_name: { type: 'string', required: true, max: 80 },
  academic_year: { type: 'string', required: true, max: 9 },
  start_date: { type: 'date', required: true },
  end_date: { type: 'date', required: true },
  is_active: { type: 'bool' },
};
const slotSchema = {
  period_id: { type: 'int', required: true, min: 1 },
  slot_date: { type: 'date', required: true },
  label: { type: 'string', required: true, max: 40 },
  start_time: { type: 'time', required: true },
  end_time: { type: 'time', required: true },
  is_holiday: { type: 'bool', default: false },
  is_available: { type: 'bool', default: true },
};

function checkPeriodDates(p) {
  if (dayIndex(p.end_date) < dayIndex(p.start_date)) throw new ApiError(400, 'End date must not be before start date');
}
async function checkSlot(d) {
  if (timeToMin(d.end_time) <= timeToMin(d.start_time)) throw new ApiError(400, 'Slot end time must be after its start time');
  const period = await Period.get(d.period_id);
  if (!period) throw new ApiError(400, 'Examination period not found');
  const di = dayIndex(d.slot_date);
  if (di < dayIndex(period.start_date) || di > dayIndex(period.end_date)) {
    throw new ApiError(400, `Slot date ${d.slot_date} is outside the period (${period.start_date} to ${period.end_date})`);
  }
}

// ---- periods
exports.listPeriods = asyncHandler(async (req, res) => res.json(await Period.list()));
exports.activePeriod = asyncHandler(async (req, res) => res.json(await Period.getActive()));
exports.createPeriod = asyncHandler(async (req, res) => {
  const d = validate(req.body, periodSchema);
  checkPeriodDates(d);
  res.status(201).json(await Period.get(await Period.create(d)));
});
exports.updatePeriod = asyncHandler(async (req, res) => {
  if (!(await Period.get(req.params.id))) throw new ApiError(404, 'Period not found');
  const d = validate(req.body, periodSchema);
  checkPeriodDates(d);
  await Period.update(req.params.id, d);
  res.json(await Period.get(req.params.id));
});
exports.activatePeriod = asyncHandler(async (req, res) => {
  if (!(await Period.get(req.params.id))) throw new ApiError(404, 'Period not found');
  await Period.activate(req.params.id);
  res.json(await Period.get(req.params.id));
});
exports.deletePeriod = asyncHandler(async (req, res) => {
  if (!(await Period.remove(req.params.id))) throw new ApiError(404, 'Period not found');
  res.json({ message: 'Period deleted' });
});

// ---- slots
exports.listSlots = asyncHandler(async (req, res) => {
  const periodId = req.query.period_id || (await Period.getActive())?.id;
  res.json(periodId ? await Slot.list(periodId) : []);
});
exports.createSlot = asyncHandler(async (req, res) => {
  const d = validate(req.body, slotSchema);
  await checkSlot(d);
  res.status(201).json(await Slot.get(await Slot.create(d)));
});
exports.bulkCreateSlots = asyncHandler(async (req, res) => {
  const { period_id, dates, is_holiday } = validate(req.body, {
    period_id: { type: 'int', required: true, min: 1 },
    is_holiday: { type: 'bool', default: false },
  });
  const rawDates = req.body.dates;
  const templates = req.body.templates;
  if (!Array.isArray(rawDates) || !rawDates.length) throw new ApiError(400, 'Provide at least one date');
  if (!Array.isArray(templates) || !templates.length) throw new ApiError(400, 'Provide at least one slot template (label, start_time, end_time)');
  const tpl = templates.map((t) => validate(t, {
    label: { type: 'string', required: true, max: 40 },
    start_time: { type: 'time', required: true },
    end_time: { type: 'time', required: true },
  }));
  const dts = rawDates.map((d) => validate({ d }, { d: { type: 'date', required: true } }).d);
  for (const t of tpl) if (timeToMin(t.end_time) <= timeToMin(t.start_time)) throw new ApiError(400, `Slot "${t.label}": end time must be after start time`);
  for (const date of dts) await checkSlot({ period_id, slot_date: date, start_time: tpl[0].start_time, end_time: tpl[0].end_time });
  const created = await Slot.bulkCreate(period_id, dts, tpl, is_holiday);
  res.status(201).json({ created, skipped_existing: dts.length * tpl.length - created });
});
exports.updateSlot = asyncHandler(async (req, res) => {
  const existing = await Slot.get(req.params.id);
  if (!existing) throw new ApiError(404, 'Slot not found');
  const d = validate({ ...existing, ...req.body, period_id: existing.period_id }, slotSchema);
  await checkSlot(d);
  await Slot.update(req.params.id, d);
  res.json(await Slot.get(req.params.id));
});
exports.setHoliday = asyncHandler(async (req, res) => {
  const { period_id, date, is_holiday } = validate(req.body, {
    period_id: { type: 'int', required: true, min: 1 },
    date: { type: 'date', required: true },
    is_holiday: { type: 'bool', required: true },
  });
  const n = await Slot.setHolidayForDate(period_id, date, is_holiday);
  res.json({ updated: n });
});
exports.deleteSlot = asyncHandler(async (req, res) => {
  if (!(await Slot.remove(req.params.id))) throw new ApiError(404, 'Slot not found');
  res.json({ message: 'Slot deleted' });
});
