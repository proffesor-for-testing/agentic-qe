#!/bin/bash
#
# Post-Task Sync Hook
# Syncs Claude Flow memories to AQE V3 database after task completion
#
# This ensures all learning captured by Claude Code tasks
# is persisted to AQE's database for cross-session learning.
#
# Install in settings.json:
#   "hooks": {
#     "post-task": {
#       "command": "bash .claude/hooks/post-task-sync.sh"
#     }
#   }

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_FLOW_STORE="$PROJECT_ROOT/.claude-flow/memory/store.json"
AQE_V3_DB="$PROJECT_ROOT/v3/.agentic-qe/memory.db"
SYNC_LOG="$PROJECT_ROOT/.agentic-qe/sync.log"

# Create log directory if needed
mkdir -p "$(dirname "$SYNC_LOG")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$SYNC_LOG"
}

# Check if files exist
if [[ ! -f "$CLAUDE_FLOW_STORE" ]]; then
  log "SKIP: Claude Flow store not found"
  exit 0
fi

if [[ ! -f "$AQE_V3_DB" ]]; then
  log "SKIP: AQE V3 database not found"
  exit 0
fi

# Get entry counts before sync
CF_ENTRIES=$(cat "$CLAUDE_FLOW_STORE" 2>/dev/null | jq '.entries | length // (keys | length)' 2>/dev/null || echo "0")
AQE_CF_ENTRIES=$(sqlite3 "$AQE_V3_DB" "SELECT COUNT(*) FROM kv_store WHERE key LIKE 'cf:%'" 2>/dev/null || echo "0")

# Skip if already in sync
if [[ "$CF_ENTRIES" == "$AQE_CF_ENTRIES" ]]; then
  log "SKIP: Already in sync ($CF_ENTRIES entries)"
  exit 0
fi

log "SYNC: Claude Flow has $CF_ENTRIES entries, AQE has $AQE_CF_ENTRIES synced"

# Run sync via Node.js if available
if command -v node &> /dev/null; then
  # Try TypeScript sync first
  if [[ -f "$PROJECT_ROOT/v3/dist/sync/claude-flow-bridge.js" ]]; then
    node -e "
      const { syncClaudeFlowToAQE } = require('$PROJECT_ROOT/v3/dist/sync/claude-flow-bridge.js');
      syncClaudeFlowToAQE({ projectRoot: '$PROJECT_ROOT' })
        .then(r => console.log('Synced:', r.entriesSynced))
        .catch(e => console.error('Sync error:', e.message));
    " 2>> "$SYNC_LOG"
    log "DONE: Node.js sync completed"
    exit 0
  fi
fi

# Fallback: Direct SQLite sync
log "FALLBACK: Using SQLite direct sync"

# Read Claude Flow entries and insert into AQE
node << 'EOFNODE'
const fs = require('fs');
const path = require('path');

const projectRoot = process.env.PROJECT_ROOT || process.cwd();
const claudeFlowPath = path.join(projectRoot, '.claude-flow', 'memory', 'store.json');
const aqeDbPath = path.join(projectRoot, 'v3', '.agentic-qe', 'memory.db');

try {
  const store = JSON.parse(fs.readFileSync(claudeFlowPath, 'utf-8'));
  const entries = store.entries || store;

  const Database = require('better-sqlite3');
  const db = new Database(aqeDbPath);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
    VALUES (?, ?, ?, ?)
  `);

  let count = 0;
  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith('_') || key === 'version') continue;
    insert.run(
      'cf:' + key,
      'claude-flow',
      JSON.stringify(value),
      Date.now()
    );
    count++;
  }

  db.close();
  console.log('Synced', count, 'entries');
} catch (e) {
  console.error('Sync failed:', e.message);
  process.exit(1);
}
EOFNODE

log "DONE: Fallback sync completed"
