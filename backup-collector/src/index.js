const cron = require('node-cron');
const { insertMetric } = require('./db');
const collectSQLServer = require('./collectors/sqlserver');

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

cron.schedule('0 * * * *', async () => {
  try {
    await collectSQLServer();
  } catch (err) {
    console.error("SQL Collector error:", err);
  }
});