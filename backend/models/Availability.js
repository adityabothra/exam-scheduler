const { query, withTransaction } = require('../config/database');

const TABLES = {
  faculty: { table: 'faculty_availability', col: 'faculty_id', entity: 'faculty', label: 'name' },
  room: { table: 'room_availability', col: 'room_id', entity: 'examination_rooms', label: 'name' },
};

function cfg(type) {
  const c = TABLES[type];
  if (!c) throw Object.assign(new Error('Availability type must be "faculty" or "room"'), { status: 400 });
  return c;
}

const Availability = {
  /** All slots of a period with this entity's availability flag (absent row = available). */
  async forEntity(type, entityId, periodId) {
    const c = cfg(type);
    return query(
      `SELECT t.id AS slot_id, t.slot_date, t.label, t.start_time, t.end_time, t.is_holiday, t.is_available AS slot_available,
              COALESCE(a.is_available, 1) AS is_available
       FROM time_slots t LEFT JOIN ${c.table} a ON a.slot_id = t.id AND a.${c.col} = ?
       WHERE t.period_id = ? ORDER BY t.slot_date, t.start_time`, [entityId, periodId]);
  },

  /** changes = [{ slot_id, is_available }] — unavailable rows are stored, available rows are removed. */
  async apply(type, entityId, changes) {
    const c = cfg(type);
    await withTransaction(async (conn) => {
      for (const ch of changes) {
        if (ch.is_available) {
          await conn.query(`DELETE FROM ${c.table} WHERE ${c.col} = ? AND slot_id = ?`, [entityId, ch.slot_id]);
        } else {
          await conn.query(
            `INSERT INTO ${c.table} (${c.col}, slot_id, is_available) VALUES (?,?,0) ON DUPLICATE KEY UPDATE is_available = 0`,
            [entityId, ch.slot_id]);
        }
      }
    });
  },

  /** Matrix data for the overview heat-map: entities, slots, and the unavailable slot ids per entity. */
  async overview(type, periodId) {
    const c = cfg(type);
    const entities = await query(`SELECT id, name FROM ${c.entity} ORDER BY name`);
    const slots = await query('SELECT id, slot_date, label, start_time, end_time, is_holiday FROM time_slots WHERE period_id = ? ORDER BY slot_date, start_time', [periodId]);
    const rows = await query(
      `SELECT a.${c.col} AS entity_id, a.slot_id FROM ${c.table} a JOIN time_slots t ON t.id = a.slot_id
       WHERE t.period_id = ? AND a.is_available = 0`, [periodId]);
    const unavailable = {};
    for (const r of rows) (unavailable[r.entity_id] ||= []).push(r.slot_id);
    return { entities, slots, unavailable };
  },
};

module.exports = Availability;
