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
  collected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collector_logs (
  id            SERIAL PRIMARY KEY,
  service_name  TEXT        NOT NULL,
  status        TEXT        NOT NULL,
  message       TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
