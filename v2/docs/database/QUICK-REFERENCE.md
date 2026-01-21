# AgentDB v2.0 Quick Reference Card

## 📋 Essential Tables

### Core Learning
```sql
episodes              -- Historical learning data (1,759 rows)
test_patterns         -- Reusable test templates
pattern_usage         -- Pattern effectiveness tracking
learning_metrics      -- Improvement over time
```

### Reinforcement Learning
```sql
q_values              -- Q-learning state-action values
learning_experiences  -- Experience replay buffer
```

### Discovery
```sql
pattern_similarity_index  -- Pre-computed similarities
pattern_fts              -- Full-text search (virtual)
```

---

## 🚀 Common Queries

### Find Best Patterns
```sql
SELECT pattern_name, success_rate, usage_count
FROM test_patterns
WHERE framework = 'jest' AND success_rate >= 0.8
ORDER BY success_rate DESC LIMIT 10;
```

### Track Agent Progress
```sql
SELECT DATE(timestamp, 'unixepoch') as date,
       AVG(coverage_percent) as coverage
FROM learning_metrics
WHERE agent_type = 'qe-test-generator'
  AND timestamp >= strftime('%s', 'now', '-30 days')
GROUP BY DATE(timestamp, 'unixepoch');
```

### Search Patterns (Full-Text)
```sql
SELECT p.pattern_name, bm25(pattern_fts) as relevance
FROM pattern_fts
JOIN test_patterns p ON pattern_fts.rowid = p.rowid
WHERE pattern_fts MATCH 'authentication error'
ORDER BY relevance DESC;
```

### High-Coverage Episodes
```sql
SELECT session_id, task, coverage_after, test_count
FROM episodes
WHERE coverage_after >= 80.0
  AND success = 1
ORDER BY coverage_after DESC;
```

---

## 📊 Key Views

```sql
v_pattern_performance      -- Pattern metrics + usage stats
v_agent_learning_progress  -- Agent improvement dashboard
v_top_patterns            -- High-performing patterns
```

---

## 🔍 Performance Indexes

```sql
-- Episodes
idx_episodes_framework     -- (test_framework, test_type)
idx_episodes_coverage      -- (coverage_after DESC)

-- Patterns
idx_patterns_framework_type -- (framework, pattern_type)
idx_patterns_success_rate   -- (success_rate DESC)
idx_patterns_dedup (UNIQUE) -- (code_signature_hash, framework)

-- Learning
idx_metrics_agent          -- (agent_id, timestamp)
idx_metrics_improvement    -- (improvement_percentage DESC)
```

---

## 🎯 Key Metrics

### Episodes Table
- **1,759 episodes** migrated
- **New columns**: test_framework, test_type, coverage_before/after
- **Constraints**: reward (0-1), coverage (0-100)

### Test Patterns Table
- **0 patterns** currently (ready for data)
- **10+ indexes** for fast queries
- **Deduplication**: code_signature_hash + framework
- **Trend tracking**: improving/declining/stable

### Performance Targets
- Pattern lookup: **< 1ms**
- Framework filter: **< 10ms**
- Full-text search: **< 100ms**
- Aggregate queries: **< 100ms**

---

## 🔧 Useful Commands

### Database Statistics
```sql
SELECT COUNT(*) FROM episodes;
SELECT COUNT(*) FROM test_patterns;
SELECT COUNT(*) FROM learning_metrics;
```

### Schema Version
```sql
SELECT * FROM schema_version WHERE version = '2.0.0';
```

### Rebuild Performance
```sql
REINDEX;
ANALYZE;
VACUUM;
```

### Clear Cache
```sql
DELETE FROM pattern_stats_cache
WHERE strftime('%s', 'now') > expires_at;
```

---

## 📈 Data Types

```
TEXT        - Strings, JSON
INTEGER     - Timestamps (Unix epoch), counts
REAL        - Rates (0-1), percentages (0-100)
BOOLEAN     - 0 or 1
JSON        - Validated with CHECK(json_valid(...))
BLOB        - Vector embeddings
```

---

## 🎨 Pattern Types

```
edge-case      error-handling    integration
boundary       unit              e2e
performance    security          accessibility
regression     smoke             contract
mutation
```

---

## 🧪 Frameworks Supported

```
jest           mocha            vitest
playwright     cypress          ava
tape           jasmine          qunit
testcafe
```

---

## 📊 Metric Types

```
coverage           -- Test coverage %
quality            -- Test quality score
latency            -- Execution time
success_rate       -- Success percentage
improvement        -- Overall improvement
accuracy           -- Prediction accuracy
test_count         -- Number of tests
pattern_reuse      -- Pattern reuse rate
code_quality       -- Code quality score
```

---

## 🔄 Triggers (Auto-Execute)

```sql
update_pattern_stats    -- Updates on pattern usage
update_pattern_trend    -- Detects improving/declining
patterns_ai/ad/au       -- Syncs FTS index
```

---

## 💾 SQLite Settings

```sql
PRAGMA journal_mode = WAL;        -- Concurrent access
PRAGMA cache_size = -64000;       -- 64MB cache
PRAGMA synchronous = NORMAL;      -- Balanced performance
PRAGMA mmap_size = 268435456;     -- 256MB mmap
```

---

## 🚨 Common Troubleshooting

### Database Locked
```bash
lsof | grep agentdb.db
pkill -f agentdb
```

### Slow Queries
```sql
EXPLAIN QUERY PLAN SELECT ...;
REINDEX;
ANALYZE;
```

### Check Integrity
```bash
echo "PRAGMA integrity_check;" | sqlite3 agentdb.db
```

---

## 📁 File Locations

```
agentdb.db                               -- Main database
docs/database/schema-v2.sql             -- Schema definition
docs/database/schema-v2.md              -- Full documentation
docs/database/migration-v1-to-v2.md     -- Migration guide
docs/database/example-queries.sql       -- Query examples
```

---

## 🎯 Quick Migration

```bash
# 1. Backup
cp agentdb.db agentdb-backup.db

# 2. Create v2.0
node create-v2-schema.js

# 3. Migrate episodes
node migrate-episodes.js

# 4. Verify
node verify-migration.js

# 5. Switch
mv agentdb.db agentdb-v1.db
mv agentdb-v2.db agentdb.db
```

**Time**: 3-5 minutes
**Data Loss**: None (100% preserved)

---

## 📞 Support

**Documentation**: `/workspaces/agentic-qe-cf/docs/database/`
**Examples**: `example-queries.sql`
**Schema**: `schema-v2.sql` (500+ lines)
**Guide**: `schema-v2.md` (1,200+ lines)

---

**Version**: 2.0.0
**Date**: 2025-11-16
**Status**: Production Ready
**Episodes Preserved**: 1,759 / 1,759 ✅
