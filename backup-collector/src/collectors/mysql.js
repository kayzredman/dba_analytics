const mysql = require('mysql2/promise');
const { insertMetric, logEvent } = require('../db');

async function collectMySQL() {
  let conn;
  try {
    console.log("Connecting to MySQL/MariaDB at:", process.env.MYSQL_HOST);

    conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
    });

    console.log("MySQL/MariaDB Connected ✅");

    // Ensure the tracking database exists
    const db = process.env.MYSQL_DB || 'backup_monitor';
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
    await conn.query(`USE \`${db}\``);

    // Query backup history from mysql.backup_history (MySQL Enterprise)
    // or fallback to information_schema for general metadata
    // Check if a custom backup log table exists
    const [tables] = await conn.execute(`
      SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'backup_log'
    `);

    if (tables[0].cnt === 0) {
      console.log("No backup_log table found — creating it...");
      await conn.query(`
        CREATE TABLE IF NOT EXISTS backup_log (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          db_name       VARCHAR(255) NOT NULL,
          backup_type   VARCHAR(50)  NOT NULL DEFAULT 'FULL',
          start_time    DATETIME     NOT NULL,
          end_time      DATETIME,
          size_gb       DECIMAL(10,4),
          status        VARCHAR(50)  NOT NULL DEFAULT 'SUCCESS',
          notes         TEXT,
          created_at    DATETIME     NOT NULL DEFAULT NOW()
        )
      `);
      console.log("backup_log table created ✅ — populate it from your mysqldump cron jobs.");
      await logEvent('INFO', 'MySQL: backup_log table created, no records yet');
      return;
    }

    const [rows] = await conn.execute(`
      SELECT
        db_name,
        backup_type,
        start_time,
        end_time,
        TIMESTAMPDIFF(MINUTE, start_time, end_time) AS duration_minutes,
        size_gb,
        status
      FROM backup_log
      WHERE start_time >= NOW() - INTERVAL 7 DAY
      ORDER BY start_time DESC
    `);

    console.log(`Found ${rows.length} backup job(s) ✅`);

    for (const row of rows) {
      await insertMetric([
        'MYSQL',
        process.env.MYSQL_HOST,
        row.db_name,
        row.backup_type,
        row.start_time,
        row.end_time,
        row.duration_minutes,
        row.size_gb,
        row.status,
      ]);
    }

    await logEvent('INFO', `MySQL: collected ${rows.length} backup record(s)`);
  } catch (err) {
    console.error("MySQL Collector Error ❌:", err.message);
    await logEvent('ERROR', `MySQL collector failed: ${err.message}`);
  } finally {
    if (conn) {
      await conn.end();
      console.log("MySQL connection closed.");
    }
  }
}

module.exports = collectMySQL;
