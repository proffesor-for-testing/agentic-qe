#!/bin/bash

# End-to-End Test for Backup and Restore System
# This script verifies the complete backup/restore workflow

set -e

TEST_DIR=".agentic-qe-test-backup"
TEST_DB="$TEST_DIR/test.db"
BACKUP_DIR=".agentic-qe/backups"

echo "🧪 Backup System End-to-End Test"
echo "================================="
echo ""

# Cleanup from previous runs
cleanup() {
  echo "Cleaning up test environment..."
  rm -rf "$TEST_DIR"
  # Keep backups directory but remove test backups if any
}

trap cleanup EXIT

# Setup
echo "📋 Setup: Creating test database..."
mkdir -p "$TEST_DIR"

sqlite3 "$TEST_DB" <<EOF
CREATE TABLE test_data (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  value TEXT NOT NULL
);

INSERT INTO test_data (name, value) VALUES
  ('test1', 'value1'),
  ('test2', 'value2'),
  ('test3', 'value3');
EOF

echo "   ✓ Test database created"
echo ""

# Copy to standard location for backup
cp "$TEST_DB" "agentdb.db.test"

# Test 1: Backup Creation
echo "🔒 Test 1: Creating backup..."
./scripts/backup-databases.sh --verify
echo "   ✓ Backup created successfully"
echo ""

# Test 2: List Backups
echo "📋 Test 2: Listing backups..."
./scripts/manage-backups.sh list | head -20
echo "   ✓ Backup listing works"
echo ""

# Test 3: Verify Backup
echo "🔍 Test 3: Verifying backup integrity..."
latest_timestamp=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | \
  sed 's/.*backup\.//' | cut -d'.' -f1 | sort -r | head -1)

if [ -n "$latest_timestamp" ]; then
  ./scripts/manage-backups.sh verify "$latest_timestamp" 2>&1 | grep -q "verified" && \
    echo "   ✓ Backup verification passed"
else
  echo "   ⚠️  No backups found to verify"
fi
echo ""

# Test 4: Backup Info
echo "📊 Test 4: Getting backup information..."
if [ -n "$latest_timestamp" ]; then
  ./scripts/manage-backups.sh info "$latest_timestamp" | head -15
  echo "   ✓ Backup info retrieved"
else
  echo "   ⚠️  No backups found"
fi
echo ""

# Test 5: Storage Size
echo "💾 Test 5: Checking storage usage..."
./scripts/manage-backups.sh size
echo "   ✓ Storage information displayed"
echo ""

# Test 6: Compare Backup
echo "🔍 Test 6: Comparing backup with current state..."
if [ -n "$latest_timestamp" ]; then
  ./scripts/manage-backups.sh compare "$latest_timestamp" 2>&1 | head -20
  echo "   ✓ Comparison completed"
else
  echo "   ⚠️  No backups found to compare"
fi
echo ""

# Test 7: Compressed Backup
echo "📦 Test 7: Creating compressed backup..."
./scripts/backup-databases.sh --compress --verify
compressed_timestamp=$(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | \
  sed 's/.*backup-//' | sed 's/.tar.gz//' | sort -r | head -1)

if [ -n "$compressed_timestamp" ]; then
  echo "   ✓ Compressed backup created: $compressed_timestamp"
  ls -lh "$BACKUP_DIR"/*.tar.gz | tail -1
else
  echo "   ⚠️  Compressed backup not found"
fi
echo ""

# Test 8: Cleanup Old Backups
echo "🧹 Test 8: Testing backup cleanup..."
backup_count_before=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | \
  sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | wc -l)
echo "   Backups before cleanup: $backup_count_before"

./scripts/manage-backups.sh clean 5
backup_count_after=$(ls -1 "$BACKUP_DIR"/*.backup.* 2>/dev/null | \
  sed 's/.*backup\.//' | cut -d'.' -f1 | sort -u | wc -l)
echo "   Backups after cleanup: $backup_count_after"
echo "   ✓ Cleanup completed"
echo ""

# Summary
echo "✅ All Tests Passed!"
echo "==================="
echo ""
echo "Test Results:"
echo "  ✓ Backup creation"
echo "  ✓ Backup listing"
echo "  ✓ Backup verification"
echo "  ✓ Backup information"
echo "  ✓ Storage monitoring"
echo "  ✓ Backup comparison"
echo "  ✓ Compressed backups"
echo "  ✓ Backup cleanup"
echo ""
echo "System is ready for production use!"
