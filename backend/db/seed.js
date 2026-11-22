/** Loads the demo dataset into MySQL. Run: npm run db:seed  (replaces existing university data) */
const { initDatabase } = require('./migrate');
const { loadDemoDataset } = require('./demoData');

(async () => {
  try {
    await initDatabase();
    const summary = await loadDemoDataset();
    console.log('Demo dataset loaded:', summary);
    process.exit(0);
  } catch (e) {
    console.error('Seeding failed:', e.message);
    process.exit(1);
  }
})();
