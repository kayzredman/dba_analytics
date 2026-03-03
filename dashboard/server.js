require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host:     process.env.SUPABASE_HOST     || 'supabase-db',
  user:     process.env.SUPABASE_USER     || 'postgres',
  password: process.env.SUPABASE_PASSWORD || 'postgres',
  database: process.env.SUPABASE_DB       || 'postgres',
  port:     5432,
});

// ── helpers ──────────────────────────────────────────────────────────────────
const q = (sql, params) => pool.query(sql, params).then(r => r.rows);

// ── serve static files ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── API routes ───────────────────────────────────────────────────────────────

// ── Servers CRUD ─────────────────────────────────────────────────────────────

// List all servers (passwords never returned)
app.get('/api/servers', async (_, res) => {
  try {
    res.json(await q(`
      SELECT id, db_type, host, port, username, connect_string, label, enabled,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS created_at
      FROM monitored_servers
      ORDER BY db_type, host
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add a new server (encrypts password with pgcrypto)
app.post('/api/servers', async (req, res) => {
  const { db_type, host, port, username, password, connect_string, label } = req.body;
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY not configured on server' });
  if (!db_type || !host || !username || !password)
    return res.status(400).json({ error: 'db_type, host, username and password are required' });
  try {
    const [row] = await q(
      `INSERT INTO monitored_servers
         (db_type, host, port, username, password_enc, connect_string, label)
       VALUES ($1, $2, $3, $4, pgp_sym_encrypt($5, $6), $7, $8)
       RETURNING id, db_type, host, port, username, connect_string, label, enabled`,
      [db_type.toUpperCase(), host, port || null, username, password, masterKey,
       connect_string || null, label || null]
    );
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update server details
app.patch('/api/servers/:id', async (req, res) => {
  const { enabled, label, password, host, port, username, connect_string, db_type } = req.body;
  const masterKey = process.env.MASTER_KEY;
  try {
    let row;
    if (password) {
      if (!masterKey) return res.status(500).json({ error: 'MASTER_KEY not configured' });
      [row] = await q(
        `UPDATE monitored_servers
         SET enabled        = COALESCE($2,  enabled),
             label          = COALESCE($3,  label),
             host           = COALESCE($4,  host),
             port           = COALESCE($5,  port),
             username       = COALESCE($6,  username),
             connect_string = COALESCE($7,  connect_string),
             db_type        = COALESCE($8,  db_type),
             password_enc   = pgp_sym_encrypt($9, $10)
         WHERE id = $1
         RETURNING id, db_type, host, port, username, connect_string, label, enabled`,
        [req.params.id,
         enabled ?? null, label ?? null, host ?? null, port ?? null,
         username ?? null, connect_string ?? null, db_type ?? null,
         password, masterKey]
      );
    } else {
      [row] = await q(
        `UPDATE monitored_servers
         SET enabled        = COALESCE($2,  enabled),
             label          = COALESCE($3,  label),
             host           = COALESCE($4,  host),
             port           = COALESCE($5,  port),
             username       = COALESCE($6,  username),
             connect_string = COALESCE($7,  connect_string),
             db_type        = COALESCE($8,  db_type)
         WHERE id = $1
         RETURNING id, db_type, host, port, username, connect_string, label, enabled`,
        [req.params.id,
         enabled ?? null, label ?? null, host ?? null, port ?? null,
         username ?? null, connect_string ?? null, db_type ?? null]
      );
    }
    if (!row) return res.status(404).json({ error: 'Server not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a server
app.delete('/api/servers/:id', async (req, res) => {
  try {
    await q(`DELETE FROM monitored_servers WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Summary KPIs
app.get('/api/summary', async (_, res) => {
  try {
    const [kpi] = await q(`
      SELECT
        COUNT(DISTINCT db_type || host || database_name) AS databases_monitored,
        COUNT(*)                                          AS total_jobs_30d,
        ROUND(
          COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')::numeric * 100.0
          / NULLIF(COUNT(*), 0), 2
        )                                                 AS overall_success_pct,
        COUNT(*) FILTER (WHERE UPPER(status) <> 'SUCCESS') AS total_failures
      FROM backup_metrics
      WHERE collected_at >= NOW() - INTERVAL '30 days'
    `);
    const [alerts] = await q(
      `SELECT COUNT(*) AS active_alerts FROM backup_alerts WHERE resolved = false`
    );
    const [lastRun] = await q(
      `SELECT MAX(collected_at) AS last_collected FROM backup_metrics`
    );
    res.json({ ...kpi, ...alerts, ...lastRun });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Success rate by DB type
app.get('/api/success-rate', async (_, res) => {
  try {
    res.json(await q('SELECT * FROM vw_backup_success_rate'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Avg backup duration
app.get('/api/duration', async (_, res) => {
  try {
    res.json(await q('SELECT * FROM vw_avg_backup_duration ORDER BY avg_duration_minutes DESC'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Backup size per day (last 30 days)
app.get('/api/size-per-day', async (_, res) => {
  try {
    res.json(await q(`
      SELECT * FROM vw_backup_size_per_day
      WHERE backup_date >= NOW() - INTERVAL '30 days'
      ORDER BY backup_date ASC
    `));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// RPO status
app.get('/api/rpo-status', async (_, res) => {
  try {
    res.json(await q('SELECT * FROM vw_rpo_status'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Monthly trend
app.get('/api/monthly-trend', async (_, res) => {
  try {
    res.json(await q('SELECT * FROM vw_monthly_backup_trend ORDER BY month ASC, db_type'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Active alerts
app.get('/api/alerts', async (_, res) => {
  try {
    res.json(await q(`
      SELECT id, alert_type, db_type, database_name, host, message,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created_at
      FROM backup_alerts
      WHERE resolved = false
      ORDER BY created_at DESC
      LIMIT 50
    `));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Recent backups
app.get('/api/recent', async (_, res) => {
  try {
    res.json(await q(`
      SELECT db_type, host, database_name, backup_type, status,
             size_gb, duration_minutes,
             to_char(backup_start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS backup_start_date
      FROM backup_metrics
      ORDER BY backup_start_date DESC NULLS LAST
      LIMIT 100
    `));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refresh alerts
app.post('/api/refresh-alerts', async (_, res) => {
  try {
    await q('SELECT refresh_backup_alerts()');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Dashboard running on http://0.0.0.0:${PORT}`));
