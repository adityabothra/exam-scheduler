/** Shared helpers: errors, async wrapper, JSON parsing, date/time arithmetic, seeded PRNG. */

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** 'HH:MM[:SS]' -> minutes after midnight */
function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 'HH:MM:SS' -> 'HH:MM' */
const fmtTime = (t) => String(t).slice(0, 5);

/** 'YYYY-MM-DD' -> whole days since the Unix epoch (timezone independent) */
function dayIndex(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Absolute minute on a global timeline for a slot start. */
const absMinute = (dateStr, timeStr) => dayIndex(dateStr) * 1440 + timeToMin(timeStr);

function fmtDate(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Deterministic PRNG (mulberry32). Same seed -> same optimisation run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : n);
const toInt = (v, fallback = null) => (Number.isInteger(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);

module.exports = {
  ApiError, asyncHandler, parseJson, timeToMin, fmtTime, dayIndex, absMinute, fmtDate,
  mulberry32, shuffle, round, toInt,
};
