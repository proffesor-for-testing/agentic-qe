-- Merge V3 unique data to Root database
-- Run with: sqlite3 .agentic-qe/memory.db < scripts/merge-v3-to-root.sql

-- Attach V3 database
ATTACH DATABASE 'v3/.agentic-qe/memory.db' AS v3db;

-- ============================================================================
-- Merge SONA Patterns (schema compatible)
-- ============================================================================
INSERT OR IGNORE INTO sona_patterns
SELECT * FROM v3db.sona_patterns
WHERE id NOT IN (SELECT id FROM sona_patterns);

-- ============================================================================
-- Merge GOAP Actions (explicit columns due to schema difference)
-- V3 has extra 'qe_domain' column, root has 'duration_estimate' vs 'estimated_duration_ms'
-- ============================================================================
INSERT OR IGNORE INTO goap_actions (
  id, name, description, agent_type, preconditions, effects,
  cost, duration_estimate, success_rate, execution_count, category,
  created_at, updated_at
)
SELECT
  id, name, description, agent_type, preconditions, effects,
  cost, estimated_duration_ms, success_rate, execution_count, category,
  created_at, updated_at
FROM v3db.goap_actions
WHERE id NOT IN (SELECT id FROM goap_actions);

-- ============================================================================
-- Merge KV Store entries (schema compatible - both have same columns)
-- ============================================================================
INSERT OR IGNORE INTO kv_store (key, namespace, value, created_at, expires_at)
SELECT key, namespace, value, created_at, expires_at
FROM v3db.kv_store
WHERE namespace || ':' || key NOT IN (SELECT namespace || ':' || key FROM kv_store);

-- ============================================================================
-- Verify merge counts
-- ============================================================================
SELECT 'sona_patterns' as table_name, COUNT(*) as count FROM sona_patterns
UNION ALL
SELECT 'goap_actions', COUNT(*) FROM goap_actions
UNION ALL
SELECT 'kv_store', COUNT(*) FROM kv_store;

-- Detach
DETACH DATABASE v3db;
