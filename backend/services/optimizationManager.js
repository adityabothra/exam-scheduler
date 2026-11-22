/**
 * Owns the lifecycle of optimisation runs: start, pause, resume, cancel, live streaming (SSE)
 * and persistence of the finished timetable. The annealing itself lives in simulatedAnnealing.js.
 */
const OptimizationRun = require('../models/OptimizationRun');
const Schedule = require('../models/Schedule');
const { withTransaction, query } = require('../config/database');
const { buildProblem, analyzeFeasibility } = require('./problemBuilder');
const { runSimulatedAnnealing, normalizeConfig } = require('./simulatedAnnealing');
const { InfeasibleError } = require('./scheduleGenerator');
const { validateSchedule } = require('./constraintValidator');
const { ApiError, round } = require('../utils/helpers');

const sessions = new Map(); // runId -> live session (kept after completion for late subscribers)
const MAX_LOGS = 5000;
const MAX_POINTS = 1500;

class Session {
  constructor(runId, config) {
    this.runId = runId;
    this.config = config;
    this.control = { state: 'running' };
    this.status = 'running';
    this.subscribers = new Set();
    this.logs = [];
    this.points = [];
    this.last = null;
    this.result = null;
  }
  send(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  broadcast(event, data) { for (const res of this.subscribers) this.send(res, event, data); }
  snapshot() { return { runId: this.runId, status: this.status, config: this.config, last: this.last, logs: this.logs, points: this.points, result: this.result }; }
}

function downsample(arr, max) {
  if (arr.length <= max) return arr;
  const out = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

const toAssignments = (P, sol) => P.exams.map((ex, e) => ({
  examination_id: ex.id,
  slot_id: P.slots[sol.slot[e]].id,
  room_ids: sol.rooms[e].map((r) => P.rooms[r].id),
  // one invigilator per room (perRoom per room), pinned to a room for readable timetables
  invigilators: sol.inv[e].map((f, k) => ({ faculty_id: P.faculty[f].id, room_id: P.rooms[sol.rooms[e][Math.floor(k / P.perRoom)]].id })),
}));

const costJson = (c) => JSON.stringify({ student: round(c.student, 3), faculty: round(c.faculty, 3), room: round(c.room, 3), spacing: round(c.spacing, 3), total: round(c.total, 3), parts: c.parts });

async function startRun({ periodId, config: rawConfig, userId, name }) {
  const config = normalizeConfig(rawConfig); // validates every parameter first
  const active = await OptimizationRun.hasActive();
  if (active) throw new ApiError(409, `Optimization run #${active} is still in progress. Wait for it to finish or cancel it first.`);

  const P = await buildProblem(periodId, config.costParams);
  const feas = analyzeFeasibility(P);
  if (!feas.ok) {
    throw new ApiError(422, 'A valid timetable is not possible with the current data: ' + feas.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' | '), { issues: feas.issues, summary: feas.summary });
  }

  const runName = name || `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const runId = await OptimizationRun.create({ period_id: periodId, name: runName, config, created_by: userId });
  const session = new Session(runId, config);
  sessions.set(runId, session);
  execute(session, P, feas).catch((e) => console.error('[optimizer] unexpected failure', e));
  return runId;
}

async function execute(session, P, feas) {
  const { runId } = session;
  try {
    const res = await runSimulatedAnnealing(P, session.config, {
      control: session.control,
      onProgress: (snap) => {
        const { logs, points, ...rest } = snap;
        session.last = rest;
        session.logs.push(...logs);
        if (session.logs.length > MAX_LOGS) session.logs.splice(100, session.logs.length - MAX_LOGS);
        session.points.push(...points);
        session.broadcast('progress', { ...rest, logs, points });
      },
      onStatus: (st) => { session.status = st; session.broadcast('status', { status: st }); },
    });

    if (res.cancelled) {
      session.status = 'cancelled';
      await OptimizationRun.setStatus(runId, 'cancelled', { iterations: res.stats.iterations, accepted: res.stats.accepted, rejected: res.stats.rejected, invalid_neighbors: res.stats.invalidNeighbors, termination: 'cancelled', duration_ms: Math.round(res.stats.durationMs), finished_at: new Date() });
      session.result = { status: 'cancelled' };
      session.broadcast('complete', { runId, status: 'cancelled' });
      return;
    }

    // ---- persist the BEST solution, then validate it independently from the stored records
    const best = toAssignments(P, res.best);
    const initialAssignments = toAssignments(P, res.initial);
    await withTransaction(async (conn) => {
      await Schedule.saveAssignments(conn, runId, best);
      await conn.query(
        `UPDATE optimization_runs SET status='completed', initial_cost=?, initial_breakdown=?, final_cost=?, final_breakdown=?,
           iterations=?, accepted=?, rejected=?, invalid_neighbors=?, termination=?, duration_ms=?, finished_at=NOW() WHERE id=?`,
        [res.initialCost.total, costJson(res.initialCost), res.bestCost.total, costJson(res.bestCost),
          res.stats.iterations, res.stats.accepted, res.stats.rejected, res.stats.invalidNeighbors, res.termination, Math.round(res.stats.durationMs), runId]);
    });

    const data = await Schedule.loadValidationData(runId);
    const validation = validateSchedule(data);
    await OptimizationRun.setValidation(runId, validation.valid ? 'valid' : 'invalid');

    const series = downsample(session.points, MAX_POINTS);
    const report = {
      validation: { valid: validation.valid, total: validation.total, counts: validation.counts, conflicts: validation.conflicts.slice(0, 200) },
      stats: res.stats, seed: res.seed, termination: res.termination,
      skipped: P.skipped, feasibility: feas.summary, warnings: feas.issues.filter((i) => i.severity === 'warning'),
    };
    await query('INSERT INTO optimization_results (run_id, series, logs, initial_solution, report) VALUES (?,?,?,?,?)',
      [runId, JSON.stringify(series), JSON.stringify(session.logs), JSON.stringify(initialAssignments), JSON.stringify(report)]);

    session.status = 'completed';
    session.result = {
      status: 'completed', termination: res.termination, seed: res.seed, stats: res.stats,
      initialBreakdown: JSON.parse(costJson(res.initialCost)), finalBreakdown: JSON.parse(costJson(res.bestCost)),
      validation: { valid: validation.valid, total: validation.total, counts: validation.counts },
    };
    session.broadcast('complete', { runId, ...session.result });
  } catch (e) {
    const infeasible = e instanceof InfeasibleError;
    session.status = 'failed';
    const message = e.message || 'Optimization failed';
    await OptimizationRun.setStatus(runId, 'failed', { error_message: message, finished_at: new Date() });
    if (infeasible) {
      await query('INSERT INTO optimization_results (run_id, series, logs, initial_solution, report) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE report = VALUES(report)',
        [runId, '[]', JSON.stringify(session.logs), '[]', JSON.stringify({ infeasible: e.report })]);
    } else {
      console.error('[optimizer] run failed', e);
    }
    session.result = { status: 'failed', error: message, infeasible: infeasible ? e.report : null };
    session.broadcast('complete', { runId, ...session.result });
  } finally {
    for (const res of session.subscribers) res.end();
    session.subscribers.clear();
    setTimeout(() => sessions.delete(runId), 30 * 60 * 1000).unref();
  }
}

const live = (runId) => {
  const s = sessions.get(Number(runId));
  if (!s || !['running', 'paused'].includes(s.status)) throw new ApiError(409, 'This optimization is not running');
  return s;
};

async function pause(runId) {
  const s = live(runId);
  if (s.status === 'paused') return s.status;
  s.control.state = 'paused'; s.status = 'paused';
  await OptimizationRun.setStatus(runId, 'paused');
  s.broadcast('status', { status: 'paused' });
  return s.status;
}

async function resume(runId) {
  const s = live(runId);
  s.control.state = 'running'; s.status = 'running';
  await OptimizationRun.setStatus(runId, 'running');
  s.broadcast('status', { status: 'running' });
  return s.status;
}

async function cancel(runId) {
  const s = live(runId);
  s.control.state = 'cancelled'; // the loop notices at its next checkpoint
  s.broadcast('status', { status: 'cancelling' });
  return 'cancelling';
}

/** Server-Sent Events: replays everything so far, then streams live. */
async function subscribe(runId, req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const s = sessions.get(Number(runId));
  if (s) {
    s.send(res, 'snapshot', s.snapshot());
    if (!['running', 'paused'].includes(s.status)) { s.send(res, 'complete', { runId: s.runId, ...s.result }); return res.end(); }
    s.subscribers.add(res);
    const hb = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(hb); s.subscribers.delete(res); });
    return undefined;
  }
  // run finished before this server process started: rebuild the snapshot from the database
  const run = await OptimizationRun.get(runId);
  if (!run) { res.write(`event: error\ndata: ${JSON.stringify({ message: 'Run not found' })}\n\n`); return res.end(); }
  const results = await OptimizationRun.getResults(runId);
  res.write(`event: snapshot\ndata: ${JSON.stringify({ runId: run.id, status: run.status, config: run.config, last: null, logs: results.logs, points: results.series, result: { status: run.status } })}\n\n`);
  res.write(`event: complete\ndata: ${JSON.stringify({ runId: run.id, status: run.status })}\n\n`);
  return res.end();
}

module.exports = { startRun, pause, resume, cancel, subscribe, toAssignments };
