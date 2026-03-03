const cron = require('node-cron');
const collectSQLServer = require('./collectors/sqlserver');
const collectOracle = require('./collectors/oracle');
const collectMySQL = require('./collectors/mysql');

console.log("Backup Collector Started...");

// Run immediately on startup
(async () => {
  // try { await collectSQLServer(); } catch (err) { console.error("SQL Collector error:", err); }
  try { await collectOracle(); } catch (err) { console.error("Oracle Collector error:", err); }
  try { await collectMySQL(); } catch (err) { console.error("MySQL Collector error:", err); }
})();

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

cron.schedule('0 * * * *', async () => {
  try {
    await collectMySQL();
  } catch (err) {
    console.error("MySQL Collector error:", err);
  }
});