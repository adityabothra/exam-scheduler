const OptimizationRun = require('../models/OptimizationRun');
const Setting = require('../models/Setting');
const { Period } = require('../models/TimeSlot');
const manager = require('../services/optimizationManager');
const { buildProblem, analyzeFeasibility } = require('../services/problemBuilder');
const { normalizeConfig } = require('../services/simulatedAnnealing');
const { DEFAULT_OPTIMIZATION } = require('../config/defaults');
const { ApiError, asyncHandler } = require('../utils/helpers');

exports.getConfig = asyncHandler(async (req, res) => {
  res.json({ config: await Setting.getOptimizationDefaults(), factory: DEFAULT_OPTIMIZATION });
});

exports.saveConfig = asyncHandler(async (req, res) => {
  const cfg = normalizeConfig(req.body); // throws 400 on invalid values
  await Setting.set('optimization_defaults', cfg);
  res.json({ config: cfg });
});

exports.resetConfig = asyncHandler(async (req, res) => {
  await Setting.set('optimization_defaults', DEFAULT_OPTIMIZATION);
  res.json({ config: DEFAULT_OPTIMIZATION });
});

exports.feasibility = asyncHandler(async (req, res) => {
  const period = req.query.period_id ? await Period.get(req.query.period_id) : await Period.getActive();
  if (!period) throw new ApiError(400, 'No examination period exists yet');
  const cfg = await Setting.getOptimizationDefaults();
  res.json(analyzeFeasibility(await buildProblem(period.id, cfg.costParams)));
});

exports.start = asyncHandler(async (req, res) => {
  const { period_id, name, ...cfg } = req.body || {};
  const period = period_id ? await Period.get(period_id) : await Period.getActive();
  if (!period) throw new ApiError(400, 'No examination period exists yet. Create one under Time Slots first.');
  const saved = await Setting.getOptimizationDefaults();
  const merged = { ...saved, ...cfg, weights: { ...saved.weights, ...(cfg.weights || {}) }, costParams: { ...saved.costParams, ...(cfg.costParams || {}) } };
  const runId = await manager.startRun({ periodId: period.id, config: merged, userId: req.user.id, name });
  res.status(202).json({ runId, message: 'Optimization started' });
});

exports.stream = asyncHandler(async (req, res) => manager.subscribe(req.params.id, req, res));

exports.pause = asyncHandler(async (req, res) => res.json({ status: await manager.pause(req.params.id) }));
exports.resume = asyncHandler(async (req, res) => res.json({ status: await manager.resume(req.params.id) }));
exports.cancel = asyncHandler(async (req, res) => res.json({ status: await manager.cancel(req.params.id) }));

exports.active = asyncHandler(async (req, res) => res.json({ runId: await OptimizationRun.hasActive() }));

exports.history = asyncHandler(async (req, res) => res.json(await OptimizationRun.list(req.query.period_id)));

exports.getRun = asyncHandler(async (req, res) => {
  const run = await OptimizationRun.get(req.params.id);
  if (!run) throw new ApiError(404, 'Run not found');
  res.json({ run, results: await OptimizationRun.getResults(req.params.id) });
});

exports.compare = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
  if (ids.length < 2) throw new ApiError(400, 'Provide at least two run ids, e.g. ?ids=1,2');
  const out = [];
  for (const id of ids) {
    const run = await OptimizationRun.get(id);
    if (!run) throw new ApiError(404, `Run ${id} not found`);
    out.push({ ...run, results: undefined, series: (await OptimizationRun.getResults(id)).series });
  }
  res.json(out);
});

exports.removeRun = asyncHandler(async (req, res) => {
  const run = await OptimizationRun.get(req.params.id);
  if (!run) throw new ApiError(404, 'Run not found');
  if (['running', 'paused'].includes(run.status)) throw new ApiError(409, 'Cancel the run before deleting it');
  await OptimizationRun.remove(req.params.id);
  res.json({ message: 'Run deleted' });
});
