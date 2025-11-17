#!/bin/bash

# Backup management script
# Usage: ./scripts/manage-backups.sh <command> [options]

set -e

BACKUP_DIR=".agentic-qe/backups"

show_usage() {
  cat <<EOF
Usage: $0 <command> [options]

Commands:
  list              List all backups with details
  clean [N]         Remove old backups (keep last N, default: 10)
  verify [timestamp] Verify backup integrity
  compare <timestamp> Compare backup with current databases
  info <timestamp>   Show detailed backup information
  size              Show total backup storage usage

Examples:
  $0 list
  $0 clean 5
  $0 verify 20250116-120000
  $0 compare 20250116-120000
  $0 info 20250116-120000
  $0 size
EOF
}

list_backups() {
  echo "📦 Available Backups"
  echo "==================="
  echo ""

  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.backup.* 2>/dev/null)" ]; then
    echo "No backups found."
    return
  fi

  # Get unique timestamps
  timestamps=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -ur)

  total_backups=0
  for timestamp in $timestamps; do
    total_backups=$((total_backups + 1))

    # Count files in this backup
    file_count=$(ls -1 "$BACKUP_DIR"/*.backup.$timestamp 2>/dev/null | wc -l)

    # Calculate total size
    total_size=$(du -ch "$BACKUP_DIR"/*.backup.$timestamp 2>/dev/null | tail -n1 | cut -f1)

    # Get metadata if available
    metadata_file="$BACKUP_DIR/backup-metadata.$timestamp.json"
    if [ -f "$metadata_file" ]; then
      date=$(jq -r '.date' "$metadata_file" 2>/dev/null || echo "N/A")
      git_branch=$(jq -r '.git_branch' "$metadata_file" 2>/dev/null || echo "N/A")
      git_commit=$(jq -r '.git_commit' "$metadata_file" 2>/dev/null | cut -c1-8 || echo "N/A")
      compressed=$(jq -r '.compressed' "$metadata_file" 2>/dev/null || echo "false")

      echo "[$total_backups] $timestamp"
      echo "    Date: $date"
      echo "    Files: $file_count | Size: $total_size"
      echo "    Branch: $git_branch ($git_commit)"
      if [ "$compressed" = "true" ]; then
        compressed_file="$BACKUP_DIR/databases-backup-$timestamp.tar.gz"
        if [ -f "$compressed_file" ]; then
          compressed_size=$(du -h "$compressed_file" | cut -f1)
          echo "    Compressed: $compressed_size"
        fi
      fi
    else
      echo "[$total_backups] $timestamp ($file_count files, $total_size)"
    fi
    echo ""
  done

  echo "Total backups: $total_backups"
}

clean_backups() {
  keep=${1:-10}

  echo "🧹 Cleaning Old Backups"
  echo "======================"
  echo "Keeping last $keep backups..."
  echo ""

  backup_count=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | wc -l)

  if [ "$backup_count" -le "$keep" ]; then
    echo "No cleanup needed. Total backups: $backup_count"
    return
  fi

  old_backups=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | head -n -$keep)

  removed=0
  for old_timestamp in $old_backups; do
    echo "Removing backup: $old_timestamp"
    rm -f "$BACKUP_DIR"/*.$old_timestamp* 2>/dev/null || true
    removed=$((removed + 1))
  done

  echo ""
  echo "✅ Removed $removed old backup(s)"
  echo "Remaining: $(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | wc -l)"
}

verify_backup() {
  timestamp=$1

  if [ -z "$timestamp" ]; then
    # Verify all backups
    echo "🔍 Verifying All Backups"
    echo "======================="
    echo ""

    timestamps=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | sed 's/.*backup\.//' | cut -d'.' -f1 | sort -ur)

    for ts in $timestamps; do
      echo "Verifying backup: $ts"
      verify_single_backup "$ts"
      echo ""
    done
  else
    echo "🔍 Verifying Backup: $timestamp"
    echo "======================="
    echo ""
    verify_single_backup "$timestamp"
  fi
}

verify_single_backup() {
  timestamp=$1
  verify_failed=0

  for checksum in "$BACKUP_DIR"/*.backup.$timestamp.sha256; do
    if [ -f "$checksum" ]; then
      cd "$BACKUP_DIR"
      filename=$(basename "$checksum" .sha256)
      if sha256sum -c "$(basename "$checksum")" --quiet 2>/dev/null; then
        echo "  ✓ $filename"
      else
        echo "  ✗ $filename - CHECKSUM MISMATCH!"
        verify_failed=1
      fi
      cd - > /dev/null
    fi
  done

  if [ $verify_failed -eq 0 ]; then
    echo "  ✅ All files verified"
  else
    echo "  ❌ Verification failed!"
    return 1
  fi
}

compare_backup() {
  timestamp=$1

  if [ -z "$timestamp" ]; then
    echo "Error: Timestamp required"
    echo "Usage: $0 compare <timestamp>"
    exit 1
  fi

  echo "🔍 Comparing Backup with Current State"
  echo "======================================"
  echo "Backup: $timestamp"
  echo ""

  for backup in "$BACKUP_DIR"/*.backup.$timestamp; do
    if [ -f "$backup" ]; then
      original=$(basename "$backup" | sed "s/.backup.$timestamp//")

      if [ "$original" = "agentdb.db" ]; then
        current="agentdb.db"
      else
        current=".agentic-qe/$original"
      fi

      echo "$original:"

      if [ ! -f "$current" ]; then
        echo "  Current: NOT FOUND"
        echo "  Backup:  $(du -h "$backup" | cut -f1)"
      else
        current_hash=$(sha256sum "$current" | cut -d' ' -f1)
        backup_hash=$(sha256sum "$backup" | cut -d' ' -f1)

        current_size=$(du -h "$current" | cut -f1)
        backup_size=$(du -h "$backup" | cut -f1)

        echo "  Current: $current_size ($current_hash)"
        echo "  Backup:  $backup_size ($backup_hash)"

        if [ "$current_hash" = "$backup_hash" ]; then
          echo "  Status:  ✓ IDENTICAL"
        else
          echo "  Status:  ✗ DIFFERENT"

          # Show size difference
          current_bytes=$(stat -f%z "$current" 2>/dev/null || stat -c%s "$current")
          backup_bytes=$(stat -f%z "$backup" 2>/dev/null || stat -c%s "$backup")
          diff_bytes=$((current_bytes - backup_bytes))

          if [ $diff_bytes -gt 0 ]; then
            echo "  Diff:    +$diff_bytes bytes (current is larger)"
          elif [ $diff_bytes -lt 0 ]; then
            echo "  Diff:    $diff_bytes bytes (backup is larger)"
          fi
        fi
      fi
      echo ""
    fi
  done
}

show_info() {
  timestamp=$1

  if [ -z "$timestamp" ]; then
    echo "Error: Timestamp required"
    echo "Usage: $0 info <timestamp>"
    exit 1
  fi

  echo "📋 Backup Information"
  echo "===================="
  echo "Timestamp: $timestamp"
  echo ""

  # Show metadata
  metadata_file="$BACKUP_DIR/backup-metadata.$timestamp.json"
  if [ -f "$metadata_file" ]; then
    echo "Metadata:"
    jq '.' "$metadata_file"
    echo ""
  fi

  # List files
  echo "Files:"
  for backup in "$BACKUP_DIR"/*.backup.$timestamp; do
    if [ -f "$backup" ]; then
      filename=$(basename "$backup")
      size=$(du -h "$backup" | cut -f1)
      checksum=""
      if [ -f "$backup.sha256" ]; then
        checksum=$(cat "$backup.sha256" | cut -d' ' -f1 | cut -c1-16)
      fi
      echo "  $filename ($size) [$checksum...]"
    fi
  done
}

show_size() {
  echo "💾 Backup Storage Usage"
  echo "======================"
  echo ""

  if [ ! -d "$BACKUP_DIR" ]; then
    echo "No backups directory found."
    return
  fi

  total_size=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo "Total: $total_size"
  echo ""

  echo "By type:"

  # Database backups
  db_size=$(du -ch "$BACKUP_DIR"/*.backup.* 2>/dev/null | tail -n1 | cut -f1 || echo "0")
  echo "  Database backups: $db_size"

  # Compressed archives
  tar_size=$(du -ch "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n1 | cut -f1 || echo "0")
  echo "  Compressed archives: $tar_size"

  # Checksums and metadata
  meta_size=$(du -ch "$BACKUP_DIR"/*.{sha256,json} 2>/dev/null | tail -n1 | cut -f1 || echo "0")
  echo "  Checksums/metadata: $meta_size"
}

# Main command dispatcher
if [ -z "$1" ]; then
  show_usage
  exit 1
fi

command=$1
shift

case $command in
  list)
    list_backups
    ;;
  clean)
    clean_backups "$@"
    ;;
  verify)
    verify_backup "$@"
    ;;
  compare)
    compare_backup "$@"
    ;;
  info)
    show_info "$@"
    ;;
  size)
    show_size
    ;;
  *)
    echo "Unknown command: $command"
    echo ""
    show_usage
    exit 1
    ;;
esac
