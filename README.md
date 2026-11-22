# ExamAI - AI-Based University Examination Scheduling & Optimization

A full-stack web app that builds university exam timetables with a **real Simulated Annealing optimizer** (no external AI API),
streams the algorithm's execution live to the browser, and validates the result with an independent hard-constraint checker.

**Stack:** React + Vite + Tailwind CSS v4 + React Router + Axios + Recharts + Lucide + React-Toastify · Node.js + Express (MVC) · MySQL · Server-Sent Events.

## Installation

Requirements: Node.js 18+ and MySQL 8+ (MariaDB 10.5+ also works).

```bash
# 1. database user (or just use root)
mysql -uroot -e "CREATE USER 'examapp'@'localhost' IDENTIFIED BY 'examapp123'; GRANT ALL ON exam_scheduler.* TO 'examapp'@'localhost';"
#    the database itself and all tables are created automatically on first start

# 2. install
npm run setup

# 3. configure
cp backend/.env.example backend/.env      # then edit DB_USER / DB_PASSWORD

# 4. run (two terminals)
npm run backend      # API on http://localhost:5000   (creates schema + admin user)
npm run frontend     # UI  on http://localhost:5173
```

Optional: `npm run db:seed` loads the demo dataset from the CLI (or click **Load Demo Dataset** on the dashboard).
Production: `npm run build`, then the backend serves the UI itself at http://localhost:5000.

### Environment variables (`backend/.env`)
| Variable | Default | Meaning |
|---|---|---|
| PORT | 5000 | API port |
| CORS_ORIGIN | http://localhost:5173 | allowed frontend origin(s), comma separated |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | localhost / 3306 / root / (empty) / exam_scheduler | MySQL connection |
| JWT_SECRET | change-me | **set a long random value** |
| JWT_EXPIRES_IN | 12h | session length |
| ADMIN_USERNAME / ADMIN_PASSWORD | admin / admin123 | demo admin created on first start |

## Demo login
**Username:** `admin` **Password:** `admin123` (pre-filled on the login page; change it under Settings).

## Using your own dataset
Open **Import Dataset** in the sidebar (or the *Import My Dataset* button on the dashboard).
- **Whole dataset:** download the blank template (or the filled sample), fill one sheet per table, upload the `.xlsx`. Tick *Replace existing data* to swap out the demo data. Sheets: `departments, courses, faculty, subjects, rooms, students, enrollments, period, timeslots, room_unavailable, faculty_unavailable`.
- **Single table:** pick the table, download its CSV template, upload a `.csv` (or `.xlsx`).
- Rows are matched by code, so re-importing updates instead of duplicating. Bad rows are skipped and listed with their row number.
- Students list their subjects as `CS301;CS302`; subjects may list eligible invigilators as `F001;F002` (blank = any). Only *unavailable* rooms/faculty are listed.
- Examinations are created automatically for subjects that have enrolled students.

## Suggested walkthrough
Dashboard → **Load Demo Dataset** → Examination Management (feasibility check) → **AI Optimizer → Run Optimization** (watch the Monitor)
→ Conflict Detection (independent validation, publish) → Examination Timetable (5 views, edit an exam) → Reports (PDF / Excel / CSV).

## How the Simulated Annealing works
Code: `backend/services/` — `simulatedAnnealing.js`, `scheduleGenerator.js`, `neighborGenerator.js`, `costCalculator.js`, `feasibility.js`.

1. **Initial solution** – constraint-aware construction (most-constrained-exam first, random feasible slot, rooms and invigilators chosen so every hard constraint holds). If impossible, it reports which exams cannot be placed and why.
2. **Cost** – `Cost = w1·C_student + w2·C_faculty + w3·C_room + w4·C_spacing` (terms documented at the top of `costCalculator.js`). Weights, preferred rest gap, max exams/day are configurable in the UI.
3. **Neighbour** – move an exam to another slot, swap two exams' slots, change one room, change one invigilator, or reassign an exam's rooms. Each proposal is checked against **all hard constraints**; invalid ones are discarded (and counted), so the search only visits valid timetables.
4. **Acceptance** – improvement ⇒ accept; otherwise accept with `P = exp(-ΔCost / T)` against a uniform random number.
5. **Cooling** – after `neighborsPerTemperature` attempts: `T ← α·T`.
6. **Termination** – `T ≤ Tmin`, max iterations, optional convergence window, or cancel. Pause/resume/cancel are honoured at checkpoints.
7. **Best solution** – tracked separately from the current one; the best is stored and returned.

Hard constraints (never violated): no student clash · no faculty clash · room capacity (multi-room supported) · room double-booking and room availability · faculty availability and eligibility · exam duration fits its slot · invigilator workload cap. After optimization **and** before publishing, `constraintValidator.js` re-reads the stored timetable from MySQL and re-checks everything with separate, pairwise code. Publishing is blocked if any violation exists.

Live progress (iteration, temperature, costs, acceptance probability, accepted/rejected/valid/invalid counts, time, log) is produced by the running loop and streamed over SSE (`GET /api/optimization/:id/stream`).

## Tests
```bash
npm test      # 18 tests: the 10 required scenarios + validator, determinism, weights, pause/cancel, import parsing (no DB needed)
```

## API overview
`/api/import/*` (templates, bundle, per-table) · `/api/auth` · `/students` (+`/import` CSV) · `/faculty` · `/rooms` · `/subjects` · `/departments` · `/courses` · `/periods` · `/slots` · `/availability/:faculty|room/:id` · `/examinations` · `/optimization/*` · `/schedule/*` · `/reports/:type?format=pdf|xlsx|csv` · `/dashboard`. All except login need a Bearer token.

## Project layout
`backend/{config,controllers,models,routes,services,middleware,utils,db,tests}` · `frontend/src/{components,pages,services,context,hooks,utils}`
