const cron = require('node-cron');
const { insertMetric } = require('./db');

console.log("Backup Collector Started...");

cron.schedule('*/5 * * * *', async () => {
  try {
    console.log("Running test insert...");

    await insertMetric([
      "TEST",
      "localhost",
      "demo",
      "FULL",
      new Date(),
      new Date(),
      1,
      0.01,
      "SUCCESS"
    ]);

    console.log("Insert complete.");
  } catch (err) {
    console.error("Collector error:", err);
  }
});