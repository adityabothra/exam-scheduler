const Availability = require('../models/Availability');
const Faculty = require('../models/Faculty');
const Room = require('../models/Room');
const { Period, Slot } = require('../models/TimeSlot');
const { ApiError, asyncHandler } = require('../utils/helpers');

const entityOf = async (type, id) => {
  if (type !== 'faculty' && type !== 'room') throw new ApiError(400, 'Type must be "faculty" or "room"');
  const e = type === 'faculty' ? await Faculty.get(id) : await Room.get(id);
  if (!e) throw new ApiError(404, `${type === 'faculty' ? 'Faculty member' : 'Room'} not found`);
  return e;
};
const resolvePeriod = async (q) => {
  const p = q.period_id ? await Period.get(q.period_id) : await Period.getActive();
  if (!p) throw new ApiError(400, 'No examination period exists yet. Create one under Time Slots first.');
  return p;
};

exports.overview = asyncHandler(async (req, res) => {
  const period = await resolvePeriod(req.query);
  res.json({ period, ...(await Availability.overview(req.params.type, period.id)) });
});

exports.get = asyncHandler(async (req, res) => {
  const entity = await entityOf(req.params.type, req.params.id);
  const period = await resolvePeriod(req.query);
  res.json({ entity, period, slots: await Availability.forEntity(req.params.type, entity.id, period.id) });
});

/** body: { period_id?, slots: [{ slot_id, is_available }] } */
exports.update = asyncHandler(async (req, res) => {
  const entity = await entityOf(req.params.type, req.params.id);
  const period = await resolvePeriod({ period_id: req.body.period_id });
  const changes = req.body.slots;
  if (!Array.isArray(changes)) throw new ApiError(400, 'slots must be an array of { slot_id, is_available }');
  const valid = new Set((await Slot.list(period.id)).map((s) => s.id));
  const clean = changes.map((c) => {
    if (!valid.has(Number(c.slot_id))) throw new ApiError(400, `Slot ${c.slot_id} does not belong to the selected period`);
    return { slot_id: Number(c.slot_id), is_available: !!c.is_available };
  });
  await Availability.apply(req.params.type, entity.id, clean);
  res.json({ slots: await Availability.forEntity(req.params.type, entity.id, period.id) });
});
