const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.SUPABASE_HOST,
  user:     process.env.SUPABASE_USER,
  password: process.env.SUPABASE_PASSWORD,
  database: process.env.SUPABASE_DB,
});

// ── Schema bootstrap (safe to run on every startup) ──────────────────────────
async function ensureSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitored_servers (
      id              SERIAL PRIMARY KEY,
      db_type         TEXT        NOT NULL,
      host            TEXT        NOT NULL,
      port            INT,
      username        TEXT        NOT NULL,
      password_enc    BYTEA       NOT NULL,
      connect_string  TEXT,
      label           TEXT,
      enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_monitored_servers UNIQUE (db_type, host)
    )
  `);
}

// ── Fetch all enabled servers, decrypting passwords ───────────────────────────
async function getMonitoredServers() {
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) throw new Error('MASTER_KEY env var is not set');
  const result = await pool.query(
    `SELECT id, db_type, host, port, username,
            pgp_sym_decrypt(password_enc, $1) AS password,
            connect_string, label
     FROM monitored_servers
     WHERE enabled = TRUE
     ORDER BY db_type, host`,
    [masterKey]
  );
  return result.rows;
}

// ── Seed initial servers from .env on first run ───────────────────────────────
async function seedServersFromEnv() {
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) {
    console.warn('MASTER_KEY not set — skipping env seed');
    return;
  }

  const { rows } = await pool.query('SELECT COUNT(*) AS cnt FROM monitored_servers');
  if (parseInt(rows[0].cnt) > 0) {
    console.log(`monitored_servers already has ${rows[0].cnt} row(s) — skipping seed`);
    return;
  }

  const candidates = [
    process.env.SQLSERVER_HOST && {
      db_type:        'SQLSERVER',
      host:           process.env.SQLSERVER_HOST,
      port:           parseInt(process.env.SQLSERVER_PORT) || 1433,
      username:       process.env.SQLSERVER_USER,
      password:       process.env.SQLSERVER_PASSWORD,
      connect_string: null,
      label:          'SQL Server (seeded from env)',
    },
    (process.env.ORACLE_CONNECT_STRING || process.env.ORACLE_HOST) && {
      db_type:        'ORACLE',
      host:           process.env.ORACLE_HOST || '',
      port:           1521,
      username:       process.env.ORACLE_USER,
      password:       process.env.ORACLE_PASSWORD,
      connect_string: process.env.ORACLE_CONNECT_STRING || null,
      label:          'Oracle (seeded from env)',
    },
    process.env.MYSQL_HOST && {
      db_type:        'MYSQL',
      host:           process.env.MYSQL_HOST,
      port:           parseInt(process.env.MYSQL_PORT) || 3306,
      username:       process.env.MYSQL_USER,
      password:       process.env.MYSQL_PASSWORD,
      connect_string: null,
      label:          'MySQL (seeded from env)',
    },
  ].filter(Boolean);

  for (const s of candidates) {
    await pool.query(
      `INSERT INTO monitored_servers
         (db_type, host, port, username, password_enc, connect_string, label)
       VALUES ($1, $2, $3, $4, pgp_sym_encrypt($5, $6), $7, $8)
       ON CONFLICT (db_type, host) DO NOTHING`,
      [s.db_type, s.host, s.port, s.username, s.password, masterKey, s.connect_string, s.label]
    );
  }

  console.log(`Seeded ${candidates.length} server(s) from env into monitored_servers ✅`);
}

// ── Insert a backup metric row ────────────────────────────────────────────────
async function insertMetric([
  db_type, host, database_name, backup_type,
  backup_start_date, backup_finish_date, duration_minutes, size_gb, status,
]) {
  await pool.query(
    `INSERT INTO backup_metrics
       (db_type, host, database_name, backup_type, backup_start_date,
        backup_finish_date, duration_minutes, size_gb, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (db_type, host, database_name, backup_type, backup_start_date)
     DO NOTHING`,
    [db_type, host, database_name, backup_type,
     backup_start_date, backup_finish_date, duration_minutes, size_gb, status]
  );
}

// ── Log a collector event ─────────────────────────────────────────────────────
async function logEvent(status, message) {
  await pool.query(
    `INSERT INTO collector_logs (service_name, status, message)
     VALUES ($1, $2, $3)`,
    ['backup-collector', status, message]
  );
}

module.exports = { ensureSchema, getMonitoredServers, seedServersFromEnv, insertMetric, logEvent };