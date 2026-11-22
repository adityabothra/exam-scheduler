const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { initDatabase } = require('./db/migrate');
const OptimizationRun = require('./models/OptimizationRun');

const app = express();
app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);

// Serve the built frontend when present (npm run build in /frontend)
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', notFound);
app.use(errorHandler);

async function start() {
  await initDatabase();
  await OptimizationRun.failStaleRuns();
  return app.listen(config.port, () => console.log(`Exam scheduler API listening on http://localhost:${config.port}`));
}

if (require.main === module) {
  start().catch((e) => { console.error('Failed to start:', e.message); process.exit(1); });
}

module.exports = { app, start };
