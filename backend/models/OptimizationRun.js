const { query } = require('../config/database');
const { parseJson } = require('../utils/helpers');

const hydrate = (r) => ({
  ...r,
  config: parseJson(r.config, {}),
  initial_breakdown: parseJson(r.initial_breakdown),
  final_breakdown: parseJson(r.final_breakdown),
  is_published: !!r.is_published,
});

const OptimizationRun = {
  async list(periodId) {
    const rows = await query(
      `SELECT r.*, p.name AS period_name, u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM examination_schedules s WHERE s.run_id = r.id) AS scheduled_count
       FROM optimization_runs r JOIN examination_periods p ON p.id = r.period_id
       LEFT JOIN users u ON u.id = r.created_by
       ${periodId ? 'WHERE r.period_id = ?' : ''} ORDER BY r.id DESC`, periodId ? [periodId] : []);
    return rows.map(hydrate);
  },

  async get(id) {
    const rows = await query(
      `SELECT r.*, p.name AS period_name, p.session_name, p.academic_year
       FROM optimization_runs r JOIN examination_periods p ON p.id = r.period_id WHERE r.id = ?`, [id]);
    return rows.length ? hydrate(rows[0]) : null;
  },

  async getResults(id) {
    const rows = await query('SELECT * FROM optimization_results WHERE run_id = ?', [id]);
    if (!rows.length) return { series: [], logs: [], initial_solution: [], report: null };
    const r = rows[0];
    return { series: parseJson(r.series, []), logs: parseJson(r.logs, []), initial_solution: parseJson(r.initial_solution, []), report: parseJson(r.report) };
  },

  async create({ period_id, name, config, created_by }) {
    const r = await query('INSERT INTO optimization_runs (period_id, name, status, config, created_by) VALUES (?,?,?,?,?)',
      [period_id, name, 'running', JSON.stringify(config), created_by || null]);
    return r.insertId;
  },

  async setStatus(id, status, extra = {}) {
    const sets = ['status = ?'];
    const params = [status];
    for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); params.push(v); }
    params.push(id);
    await query(`UPDATE optimization_runs SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async setValidation(id, status) {
    await query('UPDATE optimization_runs SET validation_status = ? WHERE id = ?', [status, id]);
  },

  async publish(id, periodId) {
    await query('UPDATE optimization_runs SET is_published = 0 WHERE period_id = ?', [periodId]);
    await query('UPDATE optimization_runs SET is_published = 1 WHERE id = ?', [id]);
  },

  async unpublish(id) {
    await query('UPDATE optimization_runs SET is_published = 0 WHERE id = ?', [id]);
  },

  async remove(id) {
    return (await query('DELETE FROM optimization_runs WHERE id = ?', [id])).affectedRows;
  },

  async failStaleRuns() {
    await query("UPDATE optimization_runs SET status = 'failed', error_message = 'Server restarted while the optimization was running', finished_at = NOW() WHERE status IN ('running','paused')");
  },

  async hasActive() {
    const r = await query("SELECT id FROM optimization_runs WHERE status IN ('running','paused') LIMIT 1");
    return r.length ? r[0].id : null;
  },
};

module.exports = OptimizationRun;
