const { query } = require('../config/database');
const { DEFAULT_OPTIMIZATION } = require('../config/defaults');
const { parseJson } = require('../utils/helpers');

const Setting = {
  async getAll() {
    const rows = await query('SELECT setting_key, setting_value FROM system_settings');
    return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  },

  async get(key, fallback = null) {
    const rows = await query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]);
    return rows.length ? rows[0].setting_value : fallback;
  },

  async set(key, value) {
    await query(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [key, typeof value === 'string' ? value : JSON.stringify(value)]
    );
  },

  /** Saved optimisation defaults merged over the factory defaults. */
  async getOptimizationDefaults() {
    const saved = parseJson(await this.get('optimization_defaults'), {});
    return {
      ...DEFAULT_OPTIMIZATION,
      ...saved,
      weights: { ...DEFAULT_OPTIMIZATION.weights, ...(saved.weights || {}) },
      costParams: { ...DEFAULT_OPTIMIZATION.costParams, ...(saved.costParams || {}) },
      moveProbabilities: { ...DEFAULT_OPTIMIZATION.moveProbabilities, ...(saved.moveProbabilities || {}) },
    };
  },
};

module.exports = Setting;
