const Room = require('../models/Room');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');
const timetable = require('../services/timetableService');

const schema = {
  room_code: { type: 'string', required: true, max: 20 },
  name: { type: 'string', required: true, max: 80 },
  building: { type: 'string', required: true, max: 80 },
  floor: { type: 'int', min: -2, max: 100, default: 0 },
  capacity: { type: 'int', required: true, min: 1, max: 10000 },
  room_type: { type: 'string', enum: ['classroom', 'lecture_hall', 'laboratory', 'auditorium'], default: 'classroom' },
  status: { type: 'string', enum: ['available', 'unavailable'], default: 'available' },
};

exports.list = asyncHandler(async (req, res) => {
  const rooms = await Room.list(req.query);
  // Utilisation = exam bookings of the current schedule / usable slots in its period.
  const usage = await timetable.roomUsageSummary(req.query.runId);
  res.json(rooms.map((r) => ({ ...r, ...(usage.byRoom[r.id] || { exam_count: 0, utilization: 0 }), usable_slots: usage.usableSlots })));
});

exports.get = asyncHandler(async (req, res) => {
  const r = await Room.get(req.params.id);
  if (!r) throw new ApiError(404, 'Room not found');
  res.json(r);
});

exports.create = asyncHandler(async (req, res) => {
  const id = await Room.create(validate(req.body, schema));
  res.status(201).json(await Room.get(id));
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await Room.get(req.params.id))) throw new ApiError(404, 'Room not found');
  await Room.update(req.params.id, validate(req.body, schema));
  res.json(await Room.get(req.params.id));
});

exports.remove = asyncHandler(async (req, res) => {
  if (!(await Room.remove(req.params.id))) throw new ApiError(404, 'Room not found');
  res.json({ message: 'Room deleted' });
});

exports.schedule = asyncHandler(async (req, res) => {
  const r = await Room.get(req.params.id);
  if (!r) throw new ApiError(404, 'Room not found');
  res.json(await timetable.roomTimetable(r, req.query.runId));
});
