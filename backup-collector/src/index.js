const cron = require('node-cron');
const { insertMetric } = require('./db');
const collectSQLServer = require('./collectors/sqlserver');
const collectOracle = require('./collectors/oracle');

console.log("Backup Collector Started...");

// Run immediately on startup
(async () => {
  // try { await collectSQLServer(); } catch (err) { console.error("SQL Collector error:", err); }
  try { await collectOracle(); } catch (err) { console.error("Oracle Collector error:", err); }
})();

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

cron.schedule('0 * * * *', async () => {
  try {
    await collectOracle();
  } catch (err) {
    console.error("Oracle Collector error:", err);
  }
});