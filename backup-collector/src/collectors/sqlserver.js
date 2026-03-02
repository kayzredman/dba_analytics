const sql = require('mssql');
const { insertMetric } = require('../db');

async function collectSQLServer() {
  console.log("Connecting to SQL Server at:", process.env.SQLSERVER_HOST);

  let pool;
  try {
    pool = await sql.connect({
      user: process.env.SQLSERVER_USER,
      password: process.env.SQLSERVER_PASSWORD,
      server: process.env.SQLSERVER_HOST,
      port: parseInt(process.env.SQLSERVER_PORT),
      database: 'msdb',
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    });
    console.log("SQL Server Connected ✅");
  } catch (err) {
    console.error("SQL Server connection failed ❌", err.message);
    return;
  }

  try {
    console.log("Querying backup history...");
    const result = await pool.request().query(`
      SELECT 
        database_name,
        type,
        backup_start_date,
        backup_finish_date,
        DATEDIFF(MINUTE, backup_start_date, backup_finish_date) duration_minutes,
        backup_size/1024.0/1024/1024/1024 size_gb
      FROM backupset
      WHERE backup_start_date >= DATEADD(DAY,-1,GETDATE())
    `);
    console.log(`Query returned ${result.recordset.length} row(s) ✅`);

    const typeMap = { D: 'FULL', I: 'DIFF', L: 'LOG' };

    for (let row of result.recordset) {
      console.log(`Inserting metric for DB: ${row.database_name}, type: ${typeMap[row.type] || row.type}`);
      await insertMetric([
        "SQLSERVER",
        process.env.SQLSERVER_HOST,
        row.database_name,
        typeMap[row.type] || row.type,
        row.backup_start_date,
        row.backup_finish_date,
        row.duration_minutes,
        row.size_gb,
        "SUCCESS"
      ]);
    }

    console.log("All metrics inserted ✅");
  } catch (err) {
    console.error("SQL Server query/insert failed ❌", err.message);
  } finally {
    await pool.close();
    console.log("SQL Server connection closed.");
  }
}

module.exports = collectSQLServer;