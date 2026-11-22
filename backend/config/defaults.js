/** Default Simulated Annealing configuration and cost parameters (editable in the UI). */
const DEFAULT_OPTIMIZATION = {
  initialTemperature: 100,
  minTemperature: 0.1,
  coolingRate: 0.95,            // alpha: T_new = alpha * T_current
  maxIterations: 20000,
  neighborsPerTemperature: 50,  // neighbour attempts at each temperature level
  seed: null,                   // optional: same seed => identical run
  convergenceLevels: 0,         // stop if best cost has not improved for N temperature levels (0 = off)
  stepDelayMs: 25,              // pause after each temperature level so the live monitor is watchable (0 = full speed)
  weights: { student: 1.0, faculty: 0.8, room: 0.5, spacing: 1.2 }, // w1..w4
  costParams: {
    minSpacingHours: 18,        // preferred minimum rest between a student's consecutive exams
    maxExamsPerDay: 2,          // per student
    maxDailyMinutes: 360,       // per student
    invigilatorsPerRoom: 1,
  },
  moveProbabilities: { moveSlot: 0.30, swapSlots: 0.20, changeRoom: 0.15, changeFaculty: 0.20, reassignRooms: 0.15 },
};

const DEFAULT_SETTINGS = {
  university_name: 'Meridian State University',
  optimization_defaults: JSON.stringify(DEFAULT_OPTIMIZATION),
};

module.exports = { DEFAULT_OPTIMIZATION, DEFAULT_SETTINGS };
