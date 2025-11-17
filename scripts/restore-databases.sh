#!/bin/bash

# Database restore script
# Usage: ./scripts/restore-databases.sh <backup-timestamp> [--verify] [--force]

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-timestamp> [--verify] [--force]"
  echo ""
  echo "Available backups:"
  if [ -d ".agentic-qe/backups" ]; then
    ls -1 .agentic-qe/backups/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | while read timestamp; do
      metadata_file=".agentic-qe/backups/backup-metadata.$timestamp.json"
      if [ -f "$metadata_file" ]; then
        date=$(jq -r '.date' "$metadata_file" 2>/dev/null || echo "N/A")
        git_branch=$(jq -r '.git_branch' "$metadata_file" 2>/dev/null || echo "N/A")
        echo "  $timestamp - $date (branch: $git_branch)"
      else
        echo "  $timestamp"
      fi
    done
  else
    echo "  No backups found"
  fi
  exit 1
fi

TIMESTAMP=$1
BACKUP_DIR=".agentic-qe/backups"
VERIFY=true
FORCE=false

shift
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-verify) VERIFY=false; shift ;;
    --force) FORCE=true; shift ;;
    *) shift ;;
  esac
done

echo "🔄 Database Restore System"
echo "========================="
echo "Restoring from: $TIMESTAMP"
echo ""

# Check if backup exists
if ! ls "$BACKUP_DIR"/*.backup.$TIMESTAMP &> /dev/null; then
  echo "❌ Backup not found: $TIMESTAMP"
  exit 1
fi

# Show backup metadata
metadata_file="$BACKUP_DIR/backup-metadata.$TIMESTAMP.json"
if [ -f "$metadata_file" ]; then
  echo "Backup Information:"
  echo "  Date: $(jq -r '.date' "$metadata_file")"
  echo "  Git Branch: $(jq -r '.git_branch' "$metadata_file")"
  echo "  Git Commit: $(jq -r '.git_commit' "$metadata_file")"
  echo ""
fi

# Warning and confirmation
if [ "$FORCE" != true ]; then
  echo "⚠️  WARNING: This will overwrite current databases!"
  echo ""
  echo "Current databases that will be affected:"
  for backup in "$BACKUP_DIR"/*.backup.$TIMESTAMP; do
    if [ -f "$backup" ]; then
      original=$(basename "$backup" | sed "s/.backup.$TIMESTAMP//")
      if [ "$original" = "agentdb.db" ]; then
        target="agentdb.db"
      else
        target=".agentic-qe/$original"
      fi

      if [ -f "$target" ]; then
        current_size=$(du -h "$target" | cut -f1)
        backup_size=$(du -h "$backup" | cut -f1)
        echo "  $target ($current_size → $backup_size)"
      else
        backup_size=$(du -h "$backup" | cut -f1)
        echo "  $target (new, $backup_size)"
      fi
    fi
  done

  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

# Create backup of current state before restore
echo ""
echo "Creating safety backup of current state..."
safety_backup_timestamp=$(date +%Y%m%d-%H%M%S)
if [ -f "agentdb.db" ]; then
  cp agentdb.db "$BACKUP_DIR/agentdb.db.safety.$safety_backup_timestamp"
fi
for db in .agentic-qe/*.db; do
  if [ -f "$db" ]; then
    dbname=$(basename "$db")
    cp "$db" "$BACKUP_DIR/${dbname}.safety.$safety_backup_timestamp"
  fi
done
echo "  ✓ Safety backup created: $safety_backup_timestamp"

# Restore each database
echo ""
echo "Restoring databases..."
restore_failed=0

for backup in "$BACKUP_DIR"/*.backup.$TIMESTAMP; do
  if [ -f "$backup" ]; then
    # Extract original filename
    original=$(basename "$backup" | sed "s/.backup.$TIMESTAMP//")

    # Determine target path
    if [ "$original" = "agentdb.db" ]; then
      target="agentdb.db"
    else
      target=".agentic-qe/$original"
    fi

    target_dir=$(dirname "$target")

    echo "Restoring $original..."

    # Verify checksum before restore
    if [ "$VERIFY" = true ] && [ -f "$backup.sha256" ]; then
      cd "$BACKUP_DIR"
      if sha256sum -c "$(basename "$backup.sha256")" --quiet 2>/dev/null; then
        echo "  ✓ Checksum verified"
      else
        echo "  ✗ Checksum verification failed"
        restore_failed=1
        cd - > /dev/null
        continue
      fi
      cd - > /dev/null
    fi

    # Create target directory if needed
    mkdir -p "$target_dir"

    # Restore file
    cp "$backup" "$target"
    restored_size=$(du -h "$target" | cut -f1)
    echo "  ✓ Restored: $target ($restored_size)"
  fi
done

if [ $restore_failed -eq 1 ]; then
  echo ""
  echo "❌ Some files failed to restore!"
  echo "Safety backup available at: $safety_backup_timestamp"
  exit 1
fi

echo ""
echo "✅ Restore complete!"
echo ""
echo "Safety backup created: $safety_backup_timestamp"
echo "  Use this to rollback if needed:"
echo "  ./scripts/restore-databases.sh $safety_backup_timestamp --force"
