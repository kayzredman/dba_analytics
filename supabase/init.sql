
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- MONITORED SERVERS (dynamic DB registry with encrypted creds)
-- ============================================================
CREATE TABLE IF NOT EXISTS monitored_servers (
  id              SERIAL PRIMARY KEY,
  db_type         TEXT        NOT NULL,  -- SQLSERVER | ORACLE | MYSQL
  host            TEXT        NOT NULL,
  port            INT,
  username        TEXT        NOT NULL,
  password_enc    BYTEA       NOT NULL,  -- AES-256 via pgp_sym_encrypt
  connect_string  TEXT,                  -- Oracle only
  label           TEXT,                  -- friendly name, e.g. "Finance SQL Server"
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_monitored_servers UNIQUE (db_type, host)
);

CREATE TABLE IF NOT EXISTS backup_metrics (
  id                  SERIAL PRIMARY KEY,
  db_type             TEXT        NOT NULL,
  host                TEXT        NOT NULL,
  database_name       TEXT        NOT NULL,
  backup_type         TEXT        NOT NULL,
  backup_start_date   TIMESTAMPTZ,
  backup_finish_date  TIMESTAMPTZ,
  duration_minutes    NUMERIC,
  size_gb             NUMERIC,
  status              TEXT        NOT NULL,
  collected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_backup_metrics UNIQUE (db_type, host, database_name, backup_type, backup_start_date)
);

CREATE TABLE IF NOT EXISTS collector_logs (
  id            SERIAL PRIMARY KEY,
  service_name  TEXT        NOT NULL,
  status        TEXT        NOT NULL,
  message       TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ANALYTICS LAYER
-- ============================================================

-- STEP 1: Success Rate per DB Type
CREATE OR REPLACE VIEW vw_backup_success_rate AS
SELECT
  db_type,
  COUNT(*)                                                        AS total_jobs,
  COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')              AS successful,
  COUNT(*) FILTER (WHERE UPPER(status) != 'SUCCESS')             AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS') * 100.0
    / NULLIF(COUNT(*), 0), 2
  )                                                               AS success_pct
FROM backup_metrics
WHERE collected_at >= NOW() - INTERVAL '30 days'
GROUP BY db_type
ORDER BY success_pct DESC;

-- STEP 2: Average Backup Duration
CREATE OR REPLACE VIEW vw_avg_backup_duration AS
SELECT
  db_type, host, database_name, backup_type,
  ROUND(AVG(duration_minutes), 2)   AS avg_duration_minutes,
  ROUND(MAX(duration_minutes), 2)   AS max_duration_minutes,
  ROUND(MIN(duration_minutes), 2)   AS min_duration_minutes,
  COUNT(*)                           AS job_count
FROM backup_metrics
WHERE duration_minutes IS NOT NULL
  AND collected_at >= NOW() - INTERVAL '30 days'
GROUP BY db_type, host, database_name, backup_type
ORDER BY avg_duration_minutes DESC;

-- STEP 3: Total Backup Size per DB per Day
CREATE OR REPLACE VIEW vw_backup_size_per_day AS
SELECT
  DATE(backup_start_date AT TIME ZONE 'UTC')  AS backup_date,
  db_type, database_name,
  ROUND(SUM(size_gb), 3)                       AS total_size_gb,
  COUNT(*)                                     AS job_count
FROM backup_metrics
WHERE size_gb IS NOT NULL AND backup_start_date IS NOT NULL
GROUP BY DATE(backup_start_date AT TIME ZONE 'UTC'), db_type, database_name
ORDER BY backup_date DESC, total_size_gb DESC;

-- STEP 4: RPO Status
CREATE OR REPLACE VIEW vw_rpo_status AS
SELECT
  db_type, host, database_name,
  MAX(backup_start_date)                                          AS last_backup_time,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(backup_start_date))) / 3600, 2)
                                                                  AS hours_since_last_backup,
  CASE
    WHEN MAX(backup_start_date) < NOW() - INTERVAL '24 hours' THEN 'RPO VIOLATION'
    WHEN MAX(backup_start_date) < NOW() - INTERVAL '12 hours' THEN 'WARNING'
    ELSE 'OK'
  END                                                             AS rpo_status
FROM backup_metrics
WHERE backup_start_date IS NOT NULL
GROUP BY db_type, host, database_name
ORDER BY hours_since_last_backup DESC;

-- STEP 5: Monthly Backup Growth Trend
CREATE OR REPLACE VIEW vw_monthly_backup_trend AS
SELECT
  TO_CHAR(DATE_TRUNC('month', backup_start_date), 'YYYY-MM')    AS month,
  db_type,
  ROUND(SUM(size_gb), 3)                                         AS total_size_gb,
  COUNT(*)                                                        AS total_jobs,
  COUNT(*) FILTER (WHERE UPPER(status) = 'SUCCESS')              AS successful_jobs,
  COUNT(*) FILTER (WHERE UPPER(status) != 'SUCCESS')             AS failed_jobs
FROM backup_metrics
WHERE backup_start_date IS NOT NULL
GROUP BY DATE_TRUNC('month', backup_start_date), db_type
ORDER BY month DESC, db_type;

-- STEP 6: Alerts Table
CREATE TABLE IF NOT EXISTS backup_alerts (
  id            SERIAL PRIMARY KEY,
  alert_type    TEXT        NOT NULL,
  db_type       TEXT        NOT NULL,
  host          TEXT        NOT NULL,
  database_name TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  severity      TEXT        NOT NULL DEFAULT 'WARNING',
  resolved      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION refresh_backup_alerts()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM backup_alerts WHERE resolved = FALSE;

  INSERT INTO backup_alerts (alert_type, db_type, host, database_name, message, severity)
  SELECT 'RPO_VIOLATION', db_type, host, database_name,
    FORMAT('No successful backup in the last 24 hours. Last backup: %s',
           TO_CHAR(MAX(backup_start_date), 'YYYY-MM-DD HH24:MI')), 'CRITICAL'
  FROM backup_metrics WHERE backup_start_date IS NOT NULL
  GROUP BY db_type, host, database_name
  HAVING MAX(backup_start_date) < NOW() - INTERVAL '24 hours';

  INSERT INTO backup_alerts (alert_type, db_type, host, database_name, message, severity)
  SELECT DISTINCT 'BACKUP_FAILED', db_type, host, database_name,
    FORMAT('Backup job failed at %s (type: %s)',
           TO_CHAR(backup_start_date, 'YYYY-MM-DD HH24:MI'), backup_type), 'WARNING'
  FROM backup_metrics
  WHERE UPPER(status) != 'SUCCESS' AND collected_at >= NOW() - INTERVAL '24 hours';

  INSERT INTO backup_alerts (alert_type, db_type, host, database_name, message, severity)
  SELECT DISTINCT ON (m.db_type, m.host, m.database_name)
    'SIZE_SPIKE', m.db_type, m.host, m.database_name,
    FORMAT('Backup size %s GB is more than 2x the 30-day average (%s GB)',
           TO_CHAR(m.size_gb, 'FM999990.00'), TO_CHAR(a.avg_size, 'FM999990.00')), 'WARNING'
  FROM backup_metrics m
  JOIN (
    SELECT db_type, host, database_name, AVG(size_gb) AS avg_size
    FROM backup_metrics WHERE size_gb IS NOT NULL
      AND collected_at >= NOW() - INTERVAL '30 days'
    GROUP BY db_type, host, database_name
  ) a USING (db_type, host, database_name)
  WHERE m.size_gb > a.avg_size * 2
    AND m.collected_at >= NOW() - INTERVAL '24 hours'
    AND m.size_gb IS NOT NULL;
END;
$$;
