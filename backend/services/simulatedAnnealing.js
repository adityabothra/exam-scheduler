/**
 * Simulated Annealing for examination timetabling.
 *
 *   1. Build an initial valid timetable (constraint-aware construction)
 *   2. Evaluate Cost = w1*C_student + w2*C_faculty + w3*C_room + w4*C_spacing
 *   3. Generate a neighbouring timetable (move / swap / change room / change invigilator / reassign rooms)
 *      - proposals violating any hard constraint are discarded
 *   4. dCost = Cost(new) - Cost(current)
 *   5. dCost <= 0  -> accept;   otherwise accept with probability P = exp(-dCost / T)
 *   6. After `neighborsPerTemperature` attempts cool:  T <- alpha * T
 *   7. Stop at T <= Tmin, maxIterations, optional convergence, or cancellation
 *   8. Return the BEST timetable seen (kept separately from the current one)
 *
 * The loop yields to the event loop after every temperature level so the run can be paused,
 * resumed, cancelled and streamed live. Every logged event below is produced by the real loop.
 */
const { ApiError, mulberry32, round } = require('../utils/helpers');
const { DEFAULT_OPTIMIZATION } = require('../config/defaults');
const { computeCost } = require('./costCalculator');
const { generateInitialSolution } = require('./scheduleGenerator');
const { generateNeighbor } = require('./neighborGenerator');
const F = require('./feasibility');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));
const now = () => Number(process.hrtime.bigint() / 1000000n);

function normalizeConfig(raw = {}) {
  const d = DEFAULT_OPTIMIZATION;
  const cfg = {
    ...d, ...raw,
    weights: { ...d.weights, ...(raw.weights || {}) },
    costParams: { ...d.costParams, ...(raw.costParams || {}) },
    moveProbabilities: { ...d.moveProbabilities, ...(raw.moveProbabilities || {}) },
  };
  const num = (k, v) => { const n = Number(v); if (!Number.isFinite(n)) throw new ApiError(400, `${k} must be a number`); return n; };
  cfg.initialTemperature = num('initialTemperature', cfg.initialTemperature);
  cfg.minTemperature = num('minTemperature', cfg.minTemperature);
  cfg.coolingRate = num('coolingRate', cfg.coolingRate);
  cfg.maxIterations = Math.floor(num('maxIterations', cfg.maxIterations));
  cfg.neighborsPerTemperature = Math.floor(num('neighborsPerTemperature', cfg.neighborsPerTemperature));
  cfg.convergenceLevels = Math.floor(num('convergenceLevels', cfg.convergenceLevels || 0));
  cfg.stepDelayMs = Math.max(0, Math.floor(num('stepDelayMs', cfg.stepDelayMs ?? 0)));
  cfg.seed = raw.seed === null || raw.seed === undefined || raw.seed === '' ? null : Math.floor(num('seed', raw.seed));
  for (const k of ['student', 'faculty', 'room', 'spacing']) {
    cfg.weights[k] = num(`weight ${k}`, cfg.weights[k]);
    if (cfg.weights[k] < 0) throw new ApiError(400, 'Cost weights must be zero or positive');
  }
  if (cfg.minTemperature <= 0) throw new ApiError(400, 'Minimum temperature must be greater than 0');
  if (cfg.initialTemperature <= cfg.minTemperature) throw new ApiError(400, 'Initial temperature must be greater than the minimum temperature');
  if (cfg.coolingRate <= 0 || cfg.coolingRate >= 1) throw new ApiError(400, 'Cooling rate (alpha) must be between 0 and 1 (typically 0.90-0.99)');
  if (cfg.maxIterations < 1) throw new ApiError(400, 'Maximum iterations must be at least 1');
  if (cfg.neighborsPerTemperature < 1) throw new ApiError(400, 'Neighbour attempts per temperature must be at least 1');
  if (cfg.convergenceLevels < 0) throw new ApiError(400, 'Convergence window must be 0 (off) or a positive number of temperature levels');
  return cfg;
}

const brief = (c) => ({ student: round(c.student), faculty: round(c.faculty), room: round(c.room), spacing: round(c.spacing), total: round(c.total) });

/**
 * @param P       problem from problemBuilder.makeProblem
 * @param rawCfg  optimisation configuration (see config/defaults.js)
 * @param hooks   { control:{state:'running'|'paused'|'cancelled'}, onProgress(snapshot), onStatus(state) }
 */
async function runSimulatedAnnealing(P, rawCfg, hooks = {}) {
  const cfg = normalizeConfig(rawCfg);
  const control = hooks.control || { state: 'running' };
  const seed = cfg.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(seed);
  const costOf = (sol) => computeCost(P, sol, cfg.weights, cfg.costParams);

  const startedAt = now();
  let pausedMs = 0;
  const elapsed = () => now() - startedAt - pausedMs;

  let pendingLogs = [];
  let pendingPoints = [];
  const log = (iteration, level, message) => pendingLogs.push({ iteration, level, message, ts: Date.now() });

  // ---------------- Step 1 & 2: initial solution and its cost
  const { solution: initial, attempts } = generateInitialSolution(P, rng);
  const initialCost = costOf(initial);
  let current = initial, currentCost = initialCost;
  let best = initial, bestCost = initialCost;

  const stats = { accepted: 0, rejected: 0, valid: 0, invalid: 0, uphill: 0 };
  let T = cfg.initialTemperature;
  let iter = 0, level = 0, lastImproveLevel = 0, lastP = 1;
  const levelsEstimate = Math.ceil(Math.log(cfg.minTemperature / cfg.initialTemperature) / Math.log(cfg.coolingRate));
  const sampleEvery = Math.max(1, Math.ceil(Math.min(cfg.maxIterations, levelsEstimate * cfg.neighborsPerTemperature) / 600));

  log(0, 'info', `Initial solution generated by constraint-aware construction (attempt ${attempts}) - cost ${round(initialCost.total)} (student ${round(initialCost.student)}, faculty ${round(initialCost.faculty)}, room ${round(initialCost.room)}, spacing ${round(initialCost.spacing)}), seed ${seed}`);
  log(0, 'info', `Annealing started: T0=${cfg.initialTemperature}, Tmin=${cfg.minTemperature}, alpha=${cfg.coolingRate}, ${cfg.neighborsPerTemperature} neighbours per level, max ${cfg.maxIterations} iterations`);
  pendingPoints.push({ iteration: 0, current: initialCost.total, best: initialCost.total, temperature: T });

  const snapshot = () => {
    const tempProgress = Math.log(cfg.initialTemperature / Math.max(T, cfg.minTemperature)) / Math.log(cfg.initialTemperature / cfg.minTemperature);
    return {
      iteration: iter, temperature: T, level,
      currentCost: currentCost.total, bestCost: bestCost.total,
      acceptanceProbability: lastP,
      accepted: stats.accepted, rejected: stats.rejected, validNeighbors: stats.valid, invalidNeighbors: stats.invalid, uphillAccepted: stats.uphill,
      percent: Math.min(100, Math.max(iter / cfg.maxIterations, tempProgress) * 100),
      elapsedMs: elapsed(),
      currentBreakdown: brief(currentCost), bestBreakdown: brief(bestCost), initialBreakdown: brief(initialCost),
      logs: pendingLogs, points: pendingPoints,
    };
  };
  const flush = () => {
    if (hooks.onProgress) hooks.onProgress(snapshot());
    pendingLogs = [];
    pendingPoints = [];
  };

  /** Flush progress, honour pause/cancel, then yield (optionally with a visible delay). Returns true if cancelled. */
  const checkpoint = async (delayMs) => {
    flush();
    if (control.state === 'paused') {
      const t0 = now();
      if (hooks.onStatus) hooks.onStatus('paused');
      while (control.state === 'paused') await sleep(100);
      pausedMs += now() - t0;
      if (control.state === 'running' && hooks.onStatus) hooks.onStatus('running');
    }
    if (delayMs) await sleep(delayMs); else await tick();
    return control.state === 'cancelled';
  };

  flush();
  let termination = null;
  let cancelled = false;

  // ---------------- Steps 3-7: annealing loop
  outer:
  while (true) {
    if (T <= cfg.minTemperature) { termination = 'min_temperature'; break; }
    if (iter >= cfg.maxIterations) { termination = 'max_iterations'; break; }

    let levelAccepted = 0, levelAttempts = 0, uphillLogged = 0;
    for (let k = 0; k < cfg.neighborsPerTemperature && iter < cfg.maxIterations; k++) {
      iter++; levelAttempts++;
      const verbose = iter <= 8; // narrate the first iterations in full detail
      const nb = generateNeighbor(P, current, rng, cfg.moveProbabilities);

      if (!nb.valid) {
        stats.invalid++;
        if (verbose) log(iter, 'warning', `Neighbour (${nb.move}) discarded: violates hard constraints - ${nb.reason}`);
      } else {
        stats.valid++;
        const nbCost = costOf(nb.solution);
        const delta = nbCost.total - currentCost.total;
        let accept;
        let r = null;
        if (delta < 0) { lastP = 1; accept = true; }
        else { lastP = Math.exp(-delta / T); r = rng(); accept = r < lastP; }

        if (verbose) log(iter, 'info', `Neighbour generated (${nb.move}): ${nb.description}; cost ${round(nbCost.total)} (delta ${delta >= 0 ? '+' : ''}${round(delta)})`);

        if (accept) {
          stats.accepted++; levelAccepted++;
          current = nb.solution; currentCost = nbCost;
          if (delta > 0) {
            stats.uphill++;
            if (uphillLogged++ < 3) log(iter, 'accept', `Higher-cost solution accepted using probability: delta=+${round(delta)}, T=${round(T, 3)}, P=exp(-delta/T)=${round(lastP, 4)}, random=${round(r, 4)}`);
          } else if (verbose) {
            log(iter, 'accept', `New solution accepted (improvement ${round(delta)})`);
          }
          if (currentCost.total < bestCost.total - 1e-9) {
            const prev = bestCost.total;
            best = current; bestCost = currentCost; lastImproveLevel = level;
            log(iter, 'success', `Best solution improved: ${round(prev)} -> ${round(bestCost.total)} (${nb.description})`);
          }
        } else {
          stats.rejected++;
          if (verbose) log(iter, 'reject', `Solution rejected: delta=+${round(delta)}, P=${round(lastP, 4)}, random=${round(r, 4)} >= P`);
        }
      }

      if (iter % sampleEvery === 0) pendingPoints.push({ iteration: iter, current: currentCost.total, best: bestCost.total, temperature: T });
      if (iter % 500 === 0 && (await checkpoint(0))) { cancelled = true; break outer; }
    }

    // ---------------- Step 6: cooling
    level++;
    const oldT = T;
    T = cfg.coolingRate * T;
    pendingPoints.push({ iteration: iter, current: currentCost.total, best: bestCost.total, temperature: oldT });
    log(iter, 'temperature', `Temperature reduced: ${round(oldT, 4)} -> ${round(T, 4)} (level ${level}; ${levelAccepted}/${levelAttempts} accepted at this level; best ${round(bestCost.total)})`);

    if (cfg.convergenceLevels > 0 && level - lastImproveLevel >= cfg.convergenceLevels) {
      termination = 'converged';
      log(iter, 'info', `Convergence: best cost has not improved for ${cfg.convergenceLevels} temperature levels`);
      break;
    }
    if (await checkpoint(cfg.stepDelayMs)) { cancelled = true; break; }
  }

  if (cancelled) termination = 'cancelled';
  log(iter, cancelled ? 'warning' : 'success',
    cancelled ? 'Optimization cancelled by the administrator.'
      : `Optimization completed (${termination.replace('_', ' ')}). Best cost ${round(bestCost.total)} vs initial ${round(initialCost.total)}.`);
  pendingPoints.push({ iteration: iter, current: currentCost.total, best: bestCost.total, temperature: T });
  flush();

  // ---------------- Step 8: the returned timetable is the best seen, and it must be valid
  const violations = F.verifyAll(P, best);
  if (violations.length && !cancelled) {
    throw new Error(`Internal error: best solution violates hard constraints (exam indices ${violations.join(', ')})`);
  }

  return {
    cancelled, termination, seed, config: cfg,
    initial, initialCost, best, bestCost,
    stats: {
      iterations: iter, accepted: stats.accepted, rejected: stats.rejected, validNeighbors: stats.valid,
      invalidNeighbors: stats.invalid, uphillAccepted: stats.uphill, levels: level,
      durationMs: elapsed(), finalTemperature: T, constructionAttempts: attempts,
    },
  };
}

module.exports = { runSimulatedAnnealing, normalizeConfig };
