#!/bin/bash

DB="./.swarm/memory.db"

if [ ! -f "$DB" ]; then
  echo "❌ Database not found: $DB"
  echo "Note: Database is created when SwarmMemoryManager.initialize() is called"
  echo "Run: npm test to trigger database initialization"
  exit 1
fi

if ! command -v sqlite3 &> /dev/null; then
  echo "❌ sqlite3 not installed"
  echo "Install with: sudo apt-get update && sudo apt-get install -y sqlite3"
  exit 1
fi

echo "=== AQE Memory Database Statistics ==="
sqlite3 $DB "
  SELECT 
    'Memory Entries' as table_name, COUNT(*) as count FROM memory_entries
  UNION ALL
  SELECT 'Events', COUNT(*) FROM events
  UNION ALL
  SELECT 'Patterns', COUNT(*) FROM patterns
  UNION ALL
  SELECT 'Performance Metrics', COUNT(*) FROM performance_metrics
  UNION ALL
  SELECT 'Artifacts', COUNT(*) FROM artifacts
  UNION ALL
  SELECT 'Agent Registry', COUNT(*) FROM agent_registry;
"

echo ""
echo "=== Deployment Status (Sprint 1) ==="
sqlite3 -column -header $DB "
  SELECT 
    key,
    substr(value, 1, 80) as status_preview
  FROM memory_entries 
  WHERE key LIKE 'deploy-%' OR key LIKE 'test-%'
  ORDER BY created_at;
"

echo ""
echo "=== Database Size ==="
ls -lh $DB | awk '{print "Size:", $5}'

echo ""
echo "✅ Query complete!"
echo "View full summary: cat docs/reports/SPRINT-1-IMPLEMENTATION-SUMMARY.md"
