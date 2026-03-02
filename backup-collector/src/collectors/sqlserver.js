const sql = require('mssql');
const { insertMetric, logEvent } = require('../db');

const config = {
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  server: process.env.SQLSERVER_HOST,
  database: process.env.SQLSERVER_DB,
  options: {
    encrypt: process.env.SQLSERVER_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQLSERVER_TRUST_CERT === 'true',
  },
};

async function collectSqlServerBackups() {
  let pool;
  try {
    pool = await sql.connect(config);

    const result = await pool.request().query(`
      SELECT
        bs.database_name,
        bs.type                             AS backup_type,
        bs.backup_start_date,
        bs.backup_finish_date,
        bs.backup_size,
        bs.compressed_backup_size,
        bmf.physical_device_name           AS backup_file,
        CASE bs.type
          WHEN 'D' THEN 'FULL'
          WHEN 'I' THEN 'DIFFERENTIAL'
          WHEN 'L' THEN 'LOG'
          ELSE bs.type
        END AS backup_type_label
      FROM msdb.dbo.backupset bs
      JOIN msdb.dbo.backupmediafamily bmf
        ON bs.media_set_id = bmf.media_set_id
      WHERE bs.backup_finish_date >= DATEADD(HOUR, -24, GETDATE())
      ORDER BY bs.backup_finish_date DESC
    `);

    for (const row of result.recordset) {
      const durationSeconds = row.backup_finish_date && row.backup_start_date
        ? Math.round((new Date(row.backup_finish_date) - new Date(row.backup_start_date)) / 1000)
        : null;

      const sizeMb = row.compressed_backup_size
        ? parseFloat((row.compressed_backup_size / 1024 / 1024).toFixed(2))
        : row.backup_size
          ? parseFloat((row.backup_size / 1024 / 1024).toFixed(2))
          : null;

      await insertMetric([
        'SQLSERVER',
        process.env.SQLSERVER_HOST,
        row.database_name,
        row.backup_type_label,
        row.backup_start_date,
        row.backup_finish_date,
        durationSeconds,
        sizeMb,
        'SUCCESS',
      ]);
    }

    await logEvent('INFO', `SQL Server: collected ${result.recordset.length} backup record(s)`);
  } catch (err) {
    console.error('SQL Server collector error:', err);
    await logEvent('ERROR', `SQL Server collector failed: ${err.message}`);
  } finally {
    if (pool) await pool.close();
  }
}

module.exports = { collectSqlServerBackups };
