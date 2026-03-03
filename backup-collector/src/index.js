const cron = require('node-cron');
const collectSQLServer = require('./collectors/sqlserver');
const collectOracle   = require('./collectors/oracle');
const collectMySQL    = require('./collectors/mysql');
const { ensureSchema, getMonitoredServers, seedServersFromEnv, logEvent } = require('./db');

const COLLECTORS = {
  SQLSERVER: collectSQLServer,
  ORACLE:    collectOracle,
  MYSQL:     collectMySQL,
};

async function runAllCollectors() {
  let servers;
  try {
    servers = await getMonitoredServers();
    console.log(`\n▶ Found ${servers.length} enabled server(s) to collect from`);
  } catch (err) {
    console.error('Failed to load monitored_servers:', err.message);
    await logEvent('ERROR', `Failed to load monitored_servers: ${err.message}`);
    return;
  }

  for (const server of servers) {
    const collect = COLLECTORS[server.db_type?.toUpperCase()];
    if (!collect) {
      console.warn(`No collector registered for db_type: ${server.db_type}`);
      continue;
    }
    console.log(`\n── ${server.label || server.host} [${server.db_type}] ──`);
    try {
      await collect(server);
      await logEvent('INFO', `Collected from ${server.host} (${server.db_type})`);
    } catch (err) {
      console.error(`Collector error for ${server.host}:`, err.message);
      await logEvent('ERROR', `Collector failed for ${server.host} (${server.db_type}): ${err.message}`);
    }
  }
  console.log('\n✅ Collection cycle complete');
}

console.log('Backup Collector Started...');

(async () => {
  try {
    await ensureSchema();
    await seedServersFromEnv();
  } catch (err) {
    console.error('Startup error:', err.message);
  }
  await runAllCollectors();
})();

// Run every hour
cron.schedule('0 * * * *', runAllCollectors);