const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.SUPABASE_HOST,
  user: process.env.SUPABASE_USER,
  password: process.env.SUPABASE_PASSWORD,
  database: process.env.SUPABASE_DB,
});

async function insertMetric([
  db_type,
  host,
  database_name,
  backup_type,
  backup_start_date,
  backup_finish_date,
  duration_minutes,
  size_gb,
  status,
]) {
  await pool.query(
    `INSERT INTO backup_metrics
      (db_type, host, database_name, backup_type, backup_start_date, backup_finish_date, duration_minutes, size_gb, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (db_type, host, database_name, backup_type, backup_start_date) DO NOTHING`,
    [db_type, host, database_name, backup_type, backup_start_date, backup_finish_date, duration_minutes, size_gb, status]
  );
}

async function logEvent(status, message) {
  await pool.query(
    `INSERT INTO collector_logs(service_name,status,message)
     VALUES ($1,$2,$3)`,
    ["backup-collector", status, message]
  );
}

module.exports = { insertMetric, logEvent };