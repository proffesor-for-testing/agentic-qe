#!/bin/bash

# Comprehensive database backup script
# Usage: ./scripts/backup-databases.sh [--compress] [--verify]

set -e

BACKUP_DIR=".agentic-qe/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
COMPRESS=false
VERIFY=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --compress) COMPRESS=true; shift ;;
    --no-verify) VERIFY=false; shift ;;
    *) shift ;;
  esac
done

echo "🔒 Database Backup System"
echo "========================"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup agentdb.db
if [ -f "agentdb.db" ]; then
  echo "Backing up agentdb.db..."
  cp agentdb.db "$BACKUP_DIR/agentdb.db.backup.$TIMESTAMP"

  # Get file size
  size=$(du -h "agentdb.db" | cut -f1)
  echo "  Size: $size"

  # Calculate checksum
  if command -v sha256sum &> /dev/null; then
    sha256sum agentdb.db > "$BACKUP_DIR/agentdb.db.backup.$TIMESTAMP.sha256"
    echo "  ✓ Checksum: $(cat "$BACKUP_DIR/agentdb.db.backup.$TIMESTAMP.sha256" | cut -d' ' -f1)"
  fi
fi

# Backup .agentic-qe databases
for db in .agentic-qe/*.db; do
  if [ -f "$db" ]; then
    dbname=$(basename "$db")
    echo "Backing up $dbname..."
    cp "$db" "$BACKUP_DIR/${dbname}.backup.$TIMESTAMP"

    # Get file size
    size=$(du -h "$db" | cut -f1)
    echo "  Size: $size"

    if command -v sha256sum &> /dev/null; then
      sha256sum "$db" > "$BACKUP_DIR/${dbname}.backup.$TIMESTAMP.sha256"
      echo "  ✓ Checksum: $(cat "$BACKUP_DIR/${dbname}.backup.$TIMESTAMP.sha256" | cut -d' ' -f1)"
    fi
  fi
done

# Backup metadata
cat > "$BACKUP_DIR/backup-metadata.$TIMESTAMP.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "user": "$(whoami)",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'N/A')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'N/A')",
  "compressed": $COMPRESS
}
EOF

echo "  ✓ Metadata saved"

# Compress backups if requested
if [ "$COMPRESS" = true ]; then
  echo ""
  echo "Compressing backups..."
  tar -czf "$BACKUP_DIR/databases-backup-$TIMESTAMP.tar.gz" \
    -C "$BACKUP_DIR" \
    --exclude="*.tar.gz" \
    $(ls -1 "$BACKUP_DIR" | grep "$TIMESTAMP" | grep -v ".tar.gz")

  compressed_size=$(du -h "$BACKUP_DIR/databases-backup-$TIMESTAMP.tar.gz" | cut -f1)
  echo "  ✓ Compressed: databases-backup-$TIMESTAMP.tar.gz ($compressed_size)"

  # Calculate checksum for compressed file
  if command -v sha256sum &> /dev/null; then
    sha256sum "$BACKUP_DIR/databases-backup-$TIMESTAMP.tar.gz" > "$BACKUP_DIR/databases-backup-$TIMESTAMP.tar.gz.sha256"
  fi
fi

# Verify backups
if [ "$VERIFY" = true ]; then
  echo ""
  echo "Verifying backups..."

  verify_failed=0
  for checksum in "$BACKUP_DIR"/*.backup.$TIMESTAMP.sha256; do
    if [ -f "$checksum" ]; then
      cd "$BACKUP_DIR"
      if sha256sum -c "$(basename "$checksum")" --quiet 2>/dev/null; then
        echo "  ✓ Verified: $(basename "$checksum" .sha256)"
      else
        echo "  ✗ FAILED: $(basename "$checksum" .sha256)"
        verify_failed=1
      fi
      cd - > /dev/null
    fi
  done

  if [ $verify_failed -eq 1 ]; then
    echo ""
    echo "❌ Backup verification failed!"
    exit 1
  fi
fi

# Summary
echo ""
echo "✅ Backup complete!"
echo "Location: $BACKUP_DIR"
echo ""
echo "Backed up files:"
ls -lh "$BACKUP_DIR" | grep "$TIMESTAMP" | awk '{print "  " $9 " (" $5 ")"}'

# Clean old backups (keep last 10)
echo ""
echo "Cleaning old backups (keeping last 10)..."
backup_count=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | wc -l)
if [ "$backup_count" -gt 10 ]; then
  old_backups=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | head -n -10)
  for old_timestamp in $old_backups; do
    echo "  Removing backup: $old_timestamp"
    rm -f "$BACKUP_DIR"/*.backup.$old_timestamp* 2>/dev/null || true
  done
fi

echo ""
echo "Total backups: $(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | wc -l)"
