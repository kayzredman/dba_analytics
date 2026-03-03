const oracledb = require('oracledb');
const { insertMetric } = require('../db');

// Enable Thick mode for older Oracle DB versions (pre-12.1)
try {
  oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_21' });
} catch (err) {
  // Already initialized or not needed
}

// server: { host, port, username, password, connect_string, label, db_type }
async function collectOracle(server) {
  let conn;

  try {
    console.log(`Connecting to Oracle: ${server.label || server.host}`);

    const connConfig = {
      user:          server.username,
      password:      server.password,
      connectString: server.connect_string,
      connectTimeout: 10,
    };

    if (server.username?.toLowerCase() === 'sys') {
      connConfig.privilege = oracledb.SYSDBA;
    }

    console.log(`Connecting as ${connConfig.user}, SYSDBA: ${!!connConfig.privilege}`);
    conn = await oracledb.getConnection(connConfig);

    console.log("Oracle Connected ✅");

    // Diagnostic: check Oracle version and if RMAN view exists
    const versionResult = await conn.execute(
      `SELECT version FROM v$instance`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`Oracle version: ${versionResult.rows[0].VERSION}`);

    const viewCheck = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM v$fixed_table WHERE name = 'V$RMAN_BACKUP_JOB_DETAILS'`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(`v$rman_backup_job_details exists: ${viewCheck.rows[0].CNT > 0}`);

    const result = await conn.execute(
      `SELECT 
        input_type,
        start_time,
        end_time,
        ROUND(elapsed_seconds/60) AS duration_minutes,
        ROUND(output_bytes/1024/1024/1024,2) AS output_gb,
        status
      FROM v$rman_backup_job_details
      WHERE start_time > SYSDATE - 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT } // 👈 VERY IMPORTANT
    );

    console.log(`Found ${result.rows.length} backup jobs`);

    for (const row of result.rows) {
      // Extract SID/service from connect string (handles both host/service and SID format)
      const cs = server.connect_string || '';
      const dbName = cs.includes('SID=')
        ? cs.match(/SID=([^)]+)/)?.[1]
        : cs.split('/')[1] || cs;
      const hostName = server.host || cs.match(/HOST=([^)]+)/)?.[1] || cs;

      await insertMetric([
        'ORACLE',
        hostName,
        dbName,
        row.INPUT_TYPE,
        row.START_TIME,
        row.END_TIME,
        row.DURATION_MINUTES,
        row.OUTPUT_GB,
        row.STATUS
      ]);
    }

  } catch (err) {
    console.error("Oracle Collection Error ❌:", err.message);
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log("Oracle connection closed.");
      } catch (closeErr) {
        console.error("Error closing Oracle connection:", closeErr.message);
      }
    }
  }
}

module.exports = collectOracle;