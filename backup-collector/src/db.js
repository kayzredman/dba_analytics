const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.SUPABASE_HOST,
  user: process.env.SUPABASE_USER,
  password: process.env.SUPABASE_PASSWORD,
  database: process.env.SUPABASE_DB,
});

async function insertMetric(data) {
 await pool.query(`
  INSERT INTO backup_metrics (...)
  VALUES (...)
  ON CONFLICT DO NOTHING
`);
}

async function logEvent(status, message) {
  await pool.query(
    `INSERT INTO collector_logs(service_name,status,message)
     VALUES ($1,$2,$3)`,
    ["backup-collector", status, message]
  );
}

module.exports = { insertMetric, logEvent };