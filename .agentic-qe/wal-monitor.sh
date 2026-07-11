#!/usr/bin/env bash
# Option C monitor: periodic integrity check + rotating backup of memory.db.
# Read-only integrity probe; backs up only when healthy; alerts (marker + exit) on failure.
set -u
DB=".agentic-qe/memory.db"
LOG=".agentic-qe/wal-monitor.log"
INTERVAL=1800   # 30 min
while true; do
  TS=$(date +%Y-%m-%dT%H:%M:%S)
  chk=$(sqlite3 "file:${DB}?mode=ro" "PRAGMA quick_check;" 2>&1 | head -1)
  if [ "$chk" = "ok" ]; then
    # rotating backup: keep last 6 monitor backups
    cp "$DB" "${DB}.moncopy-$(date +%s)" 2>/dev/null
    ls -1t ${DB}.moncopy-* 2>/dev/null | tail -n +7 | xargs -r rm -f
    echo "[$TS] OK ($(sqlite3 "file:${DB}?mode=ro" 'SELECT COUNT(*) FROM qe_patterns;' 2>/dev/null) patterns) journal=$(sqlite3 "file:${DB}?mode=ro" 'PRAGMA journal_mode;' 2>/dev/null)" >> "$LOG"
  else
    echo "[$TS] ALERT integrity FAILED: $chk" >> "$LOG"
    touch ".agentic-qe/wal-monitor.ALERT"
    exit 11   # non-zero exit notifies the session
  fi
  sleep "$INTERVAL"
done
