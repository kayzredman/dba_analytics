#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# mysqldump_with_log.sh
# Runs a full mysqldump and logs the result into backup_monitor.backup_log
#
# Usage:
#   ./mysqldump_with_log.sh <DATABASE_NAME>
#
# Example cron (runs daily at 2 AM):
#   0 2 * * * /opt/scripts/mysqldump_with_log.sh IHSEDB >> /var/log/backup_monitor.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
DB_NAME="${1:?Usage: $0 <DATABASE_NAME>}"
MYSQL_USER="DBA"
MYSQL_PASSWORD="password123\$"
BACKUP_DIR="/dailyBacks"
DATE_TAG=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/full_${DATE_TAG}.sql"
MIN_SIZE_BYTES=10000          # files smaller than this are treated as FAILED
# ─────────────────────────────────────────────────────────────────────────────

MYSQL_CMD="mysql -u${MYSQL_USER} -p${MYSQL_PASSWORD}"
START_TIME=$(date +"%Y-%m-%d %H:%M:%S")

echo "[$(date)] Starting FULL backup of ${DB_NAME} -> ${BACKUP_FILE}"

# ── Run mysqldump ─────────────────────────────────────────────────────────────
DUMP_STATUS="SUCCESS"
DUMP_NOTES=""
mysqldump \
  -u"${MYSQL_USER}" \
  -p"${MYSQL_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  "${DB_NAME}" > "${BACKUP_FILE}" 2>/tmp/dump_err.txt || {
    DUMP_STATUS="FAILED"
    DUMP_NOTES=$(cat /tmp/dump_err.txt | tr "'" '"' | head -c 500)
  }

END_TIME=$(date +"%Y-%m-%d %H:%M:%S")

# ── Verify file size ──────────────────────────────────────────────────────────
FILE_SIZE_BYTES=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || echo 0)
SIZE_GB=$(awk "BEGIN { printf \"%.4f\", ${FILE_SIZE_BYTES}/1073741824 }")

if [[ "${DUMP_STATUS}" == "SUCCESS" && "${FILE_SIZE_BYTES}" -lt "${MIN_SIZE_BYTES}" ]]; then
  DUMP_STATUS="FAILED"
  DUMP_NOTES="Dump file suspiciously small: ${FILE_SIZE_BYTES} bytes"
fi

echo "[$(date)] Status: ${DUMP_STATUS} | Size: ${SIZE_GB} GB"

# ── Log to backup_monitor.backup_log ─────────────────────────────────────────
${MYSQL_CMD} backup_monitor <<EOF
INSERT INTO backup_log (db_name, backup_type, start_time, end_time, size_gb, status, notes)
VALUES (
  '${DB_NAME}',
  'FULL',
  '${START_TIME}',
  '${END_TIME}',
  ${SIZE_GB},
  '${DUMP_STATUS}',
  '${BACKUP_FILE} — ${FILE_SIZE_BYTES} bytes${DUMP_NOTES:+ | }${DUMP_NOTES}'
);
EOF

echo "[$(date)] Logged to backup_monitor.backup_log ✅"
