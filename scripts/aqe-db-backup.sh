#!/usr/bin/env bash
#
# AQE learning-DB backup + restore.
#
# WHY: .agentic-qe/memory.db holds 1K+ irreplaceable learning records. In this
# dev container it lives on a macOS virtiofs bind mount that has corrupted the
# DB twice (2026-06-08, 2026-07-07). This tool makes CONSISTENT, integrity-
# verified snapshots to a durable location that survives a container crash or
# rebuild.
#
# SAFE PRIMITIVE: uses SQLite `VACUUM INTO` from a READ-ONLY connection. Unlike
# `cp`, this cannot capture a torn mid-checkpoint state while writers are active,
# and it verifies the result before promoting it. Backups that fail integrity
# are discarded and raise an alert marker instead of overwriting a good one.
#
# Usage:
#   scripts/aqe-db-backup.sh backup            # make one verified snapshot (default)
#   scripts/aqe-db-backup.sh list              # list existing verified backups
#   scripts/aqe-db-backup.sh restore <file>    # restore a backup (backs up current first)
#   scripts/aqe-db-backup.sh loop [SECONDS]    # run backup every SECONDS (default 1800)
#
# Env:
#   AQE_PROJECT_DIR   project root (default: /workspaces/agentic-qe)
#   AQE_BACKUP_DIR    backup destination (default: $ROOT/.agentic-qe/backups/verified)
#   AQE_KEEP_ROTATING number of fine-grained snapshots to keep (default 12)
#   AQE_KEEP_DAILY    number of daily snapshots to keep (default 14)
#
set -euo pipefail

ROOT="${AQE_PROJECT_DIR:-/workspaces/agentic-qe}"
DB="$ROOT/.agentic-qe/memory.db"
DEST="${AQE_BACKUP_DIR:-$ROOT/.agentic-qe/backups/verified}"
LOG="$DEST/backup.log"
ALERT="$DEST/BACKUP.ALERT"
KEEP_ROTATING="${AQE_KEEP_ROTATING:-12}"
KEEP_DAILY="${AQE_KEEP_DAILY:-14}"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
logline() { mkdir -p "$DEST"; echo "[$(ts)] $*" >>"$LOG"; }

do_backup() {
  [ -f "$DB" ] || { logline "ERROR: source DB missing: $DB"; echo "ERROR: $DB missing" >&2; return 2; }
  mkdir -p "$DEST"
  local stamp inflight final day pat exp chk
  stamp="$(date +%Y%m%dT%H%M%S)"
  day="$(date +%Y%m%d)"
  inflight="$DEST/.inflight-$stamp.db"
  final="$DEST/memory-$stamp.db"

  # Consistent snapshot from a read-only connection (safe with concurrent writers).
  if ! sqlite3 "file:$DB?mode=ro" "VACUUM INTO '$inflight';" 2>>"$LOG"; then
    logline "ERROR: VACUUM INTO failed"; rm -f "$inflight"; return 3
  fi

  # Verify BEFORE promoting — never let a bad backup replace a good one.
  chk="$(sqlite3 "$inflight" "PRAGMA integrity_check;" 2>>"$LOG" | head -1)"
  if [ "$chk" != "ok" ]; then
    logline "ALERT: backup integrity FAILED ($chk) — discarding, keeping prior good backups"
    rm -f "$inflight"; : >"$ALERT"; return 11
  fi
  pat="$(sqlite3 "$inflight" "SELECT COUNT(*) FROM qe_patterns;" 2>/dev/null || echo '?')"
  exp="$(sqlite3 "$inflight" "SELECT COUNT(*) FROM captured_experiences;" 2>/dev/null || echo '?')"

  mv "$inflight" "$final"
  # Newest-of-day snapshot (hardlink: shares storage, survives rotation of memory-*).
  ln -f "$final" "$DEST/daily-$day.db"
  # Clear any stale alert once a good backup lands.
  rm -f "$ALERT"

  # Rotation.
  ls -1t "$DEST"/memory-*.db 2>/dev/null | tail -n +$((KEEP_ROTATING + 1)) | xargs -r rm -f
  ls -1t "$DEST"/daily-*.db  2>/dev/null | tail -n +$((KEEP_DAILY + 1))   | xargs -r rm -f

  logline "OK memory-$stamp.db ($(du -h "$final" | cut -f1)) patterns=$pat experiences=$exp"
  echo "OK: $final (patterns=$pat experiences=$exp, integrity=ok)"
}

do_list() {
  mkdir -p "$DEST"
  echo "Backups in $DEST:"
  ls -1t "$DEST"/memory-*.db "$DEST"/daily-*.db 2>/dev/null | while read -r f; do
    printf "  %-40s %6s  %s\n" "$(basename "$f")" "$(du -h "$f" | cut -f1)" "$(date -r "$f" '+%Y-%m-%d %H:%M')"
  done || echo "  (none)"
}

do_restore() {
  local src="$1"
  [ -f "$src" ] || { echo "ERROR: backup not found: $src" >&2; return 2; }
  local chk; chk="$(sqlite3 "$src" "PRAGMA integrity_check;" 2>/dev/null | head -1)"
  [ "$chk" = "ok" ] || { echo "ERROR: backup fails integrity_check ($chk); refusing to restore" >&2; return 3; }
  # Back up the CURRENT db before overwriting (data-protection rule).
  if [ -f "$DB" ]; then
    local pre="$DB.pre-restore-$(date +%s)"
    cp "$DB" "$pre"; echo "Current DB saved to: $pre"
  fi
  # Remove stale WAL/SHM belonging to the old file, then copy the verified backup in.
  rm -f "$DB-wal" "$DB-shm"
  cp "$src" "$DB"
  echo "Restored $src -> $DB"
  echo "Post-restore: patterns=$(sqlite3 "file:$DB?mode=ro" 'SELECT COUNT(*) FROM qe_patterns;') experiences=$(sqlite3 "file:$DB?mode=ro" 'SELECT COUNT(*) FROM captured_experiences;')"
  logline "RESTORE from $(basename "$src")"
}

do_loop() {
  local interval="${1:-1800}"
  logline "loop started (interval=${interval}s)"
  while true; do
    do_backup || logline "backup cycle returned non-zero"
    sleep "$interval"
  done
}

cmd="${1:-backup}"
case "$cmd" in
  backup)  do_backup ;;
  list)    do_list ;;
  restore) shift; do_restore "${1:?usage: restore <backup-file>}" ;;
  loop)    shift; do_loop "${1:-1800}" ;;
  *) echo "usage: $0 {backup|list|restore <file>|loop [seconds]}" >&2; exit 1 ;;
esac
