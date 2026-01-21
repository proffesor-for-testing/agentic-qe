# AgentDB Migration Guide: v1.0 to v2.0

## Overview

This guide walks through migrating from the fragmented v1.0 database structure (3 separate databases) to the unified v2.0 schema.

### Current State (v1.0)

- **agentdb.db**: 1,759 episodes
- **patterns.db**: 0 patterns (schema exists, no data yet)
- **memory.db**: Q-values, learning_metrics, experiences

### Target State (v2.0)

- **Single unified database** with all data
- **Enhanced schema** with test-specific columns
- **Improved indexes** for < 100ms queries
- **Full-text search** for pattern discovery
- **Automated triggers** for metric updates

---

## Pre-Migration Checklist

- [ ] Backup all existing databases
- [ ] Verify database locations
- [ ] Check available disk space (estimate: 2x current size during migration)
- [ ] Review schema changes in `schema-v2.sql`
- [ ] Test migration on a copy first

---

## Migration Steps

### Step 1: Backup Existing Databases

```bash
# Create backup directory
mkdir -p /workspaces/agentic-qe-cf/.agentic-qe/backup-$(date +%Y%m%d)

# Backup all databases
cp /workspaces/agentic-qe-cf/agentdb.db \
   /workspaces/agentic-qe-cf/.agentic-qe/backup-$(date +%Y%m%d)/

cp /workspaces/agentic-qe-cf/.agentic-qe/patterns.db \
   /workspaces/agentic-qe-cf/.agentic-qe/backup-$(date +%Y%m%d)/

cp /workspaces/agentic-qe-cf/.agentic-qe/memory.db \
   /workspaces/agentic-qe-cf/.agentic-qe/backup-$(date +%Y%m%d)/
```

### Step 2: Create New v2.0 Database

```bash
# Create new database with v2.0 schema
cd /workspaces/agentic-qe-cf

# Apply schema
node -e "
const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('./agentdb-v2.db');
const schema = fs.readFileSync('./docs/database/schema-v2.sql', 'utf8');

db.exec(schema);
console.log('✅ Schema v2.0 created successfully');
db.close();
"
```

### Step 3: Migrate Episodes from agentdb.db

```javascript
// migrate-episodes.js
const Database = require('better-sqlite3');

const oldDb = new Database('./agentdb.db', { readonly: true });
const newDb = new Database('./agentdb-v2.db');

console.log('Migrating episodes...');

// Get all episodes from old database
const episodes = oldDb.prepare('SELECT * FROM episodes').all();

console.log(`Found ${episodes.length} episodes to migrate`);

// Prepare insert statement for new database
const insertStmt = newDb.prepare(`
  INSERT INTO episodes (
    id, ts, session_id, task, input, output, critique,
    reward, success, latency_ms, tokens_used, tags, metadata, created_at,
    test_framework, test_type, coverage_before, coverage_after,
    test_count, quality_score, pattern_ids
  ) VALUES (
    @id, @ts, @session_id, @task, @input, @output, @critique,
    @reward, @success, @latency_ms, @tokens_used, @tags, @metadata, @created_at,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
  )
`);

// Migrate in batches for better performance
const batchSize = 100;
let migrated = 0;

newDb.prepare('BEGIN TRANSACTION').run();

try {
  for (const episode of episodes) {
    insertStmt.run(episode);
    migrated++;

    if (migrated % batchSize === 0) {
      newDb.prepare('COMMIT').run();
      newDb.prepare('BEGIN TRANSACTION').run();
      console.log(`Migrated ${migrated}/${episodes.length} episodes...`);
    }
  }

  newDb.prepare('COMMIT').run();
  console.log(`✅ Successfully migrated ${migrated} episodes`);

} catch (error) {
  newDb.prepare('ROLLBACK').run();
  console.error('❌ Migration failed:', error);
  throw error;
}

oldDb.close();
newDb.close();
```

Run migration:
```bash
node migrate-episodes.js
```

### Step 4: Migrate Patterns from patterns.db

```javascript
// migrate-patterns.js
const Database = require('better-sqlite3');

const oldDb = new Database('./.agentic-qe/patterns.db', { readonly: true });
const newDb = new Database('./agentdb-v2.db');

console.log('Migrating patterns...');

const patterns = oldDb.prepare('SELECT * FROM test_patterns').all();

console.log(`Found ${patterns.length} patterns to migrate`);

if (patterns.length === 0) {
  console.log('⚠️  No patterns to migrate (patterns.db is empty)');
  oldDb.close();
  newDb.close();
  process.exit(0);
}

const insertStmt = newDb.prepare(`
  INSERT INTO test_patterns (
    id, pattern_name, pattern_type, framework, language, category,
    code_signature_hash, code_signature, test_template, pattern_content,
    description, success_rate, usage_count, coverage_delta,
    execution_time_ms, quality_score, last_success_rate, trend,
    embedding, tags, metadata, version, parent_pattern_id,
    created_at, last_used, updated_at
  ) VALUES (
    @id, @id AS pattern_name, @pattern_type, @framework, @language, NULL,
    @code_signature_hash, @code_signature, @test_template,
    json_extract(@test_template, '$.code') AS pattern_content,
    json_extract(@metadata, '$.description'),
    0.0, 0, NULL, NULL, 0.0, NULL, 'unknown',
    NULL, NULL, @metadata, @version, NULL,
    @created_at, NULL, @updated_at
  )
`);

newDb.prepare('BEGIN TRANSACTION').run();

try {
  for (const pattern of patterns) {
    insertStmt.run(pattern);
  }

  newDb.prepare('COMMIT').run();
  console.log(`✅ Successfully migrated ${patterns.length} patterns`);

} catch (error) {
  newDb.prepare('ROLLBACK').run();
  console.error('❌ Migration failed:', error);
  throw error;
}

oldDb.close();
newDb.close();
```

Run migration:
```bash
node migrate-patterns.js
```

### Step 5: Migrate Learning Data from memory.db

```javascript
// migrate-learning-data.js
const Database = require('better-sqlite3');

const oldDb = new Database('./.agentic-qe/memory.db', { readonly: true });
const newDb = new Database('./agentdb-v2.db');

console.log('Migrating learning data...');

// Migrate learning_metrics
console.log('Migrating learning_metrics...');
const metrics = oldDb.prepare('SELECT * FROM learning_metrics').all();
console.log(`Found ${metrics.length} metrics`);

const metricsStmt = newDb.prepare(`
  INSERT INTO learning_metrics (
    agent_id, agent_type, session_id, metric_type, metric_value,
    baseline_value, improvement_percentage, test_framework, test_type,
    coverage_percent, test_pass_rate, execution_time_ms, patterns_used,
    new_patterns_created, iteration, epoch, context, metadata, timestamp
  ) VALUES (
    @agent_id, 'unknown', NULL, @metric_type, @metric_value,
    @baseline_value, @improvement_percentage, NULL, NULL,
    NULL, NULL, NULL, @pattern_count, NULL, NULL, NULL,
    @context, NULL, strftime('%s', @timestamp)
  )
`);

newDb.prepare('BEGIN TRANSACTION').run();

for (const metric of metrics) {
  metricsStmt.run(metric);
}

newDb.prepare('COMMIT').run();
console.log(`✅ Migrated ${metrics.length} learning metrics`);

// Migrate q_values
console.log('Migrating q_values...');
const qvalues = oldDb.prepare('SELECT * FROM q_values').all();
console.log(`Found ${qvalues.length} q-values`);

const qvalueStmt = newDb.prepare(`
  INSERT INTO q_values (
    agent_id, agent_type, state_key, action_key, q_value,
    update_count, metadata, created_at, last_updated
  ) VALUES (
    @agent_id, 'unknown', @state_key, @action_key, @q_value,
    @update_count, @metadata,
    strftime('%s', @created_at), strftime('%s', @last_updated)
  )
`);

newDb.prepare('BEGIN TRANSACTION').run();

for (const qvalue of qvalues) {
  qvalueStmt.run(qvalue);
}

newDb.prepare('COMMIT').run();
console.log(`✅ Migrated ${qvalues.length} q-values`);

// Migrate learning_experiences
console.log('Migrating learning_experiences...');
const experiences = oldDb.prepare('SELECT * FROM learning_experiences').all();
console.log(`Found ${experiences.length} experiences`);

const expStmt = newDb.prepare(`
  INSERT INTO learning_experiences (
    agent_id, session_id, state, action, reward, next_state, done,
    metadata, timestamp
  ) VALUES (
    @agent_id, @session_id, @state, @action, @reward, @next_state, @done,
    @metadata, strftime('%s', @timestamp)
  )
`);

newDb.prepare('BEGIN TRANSACTION').run();

for (const exp of experiences) {
  expStmt.run(exp);
}

newDb.prepare('COMMIT').run();
console.log(`✅ Migrated ${experiences.length} learning experiences`);

oldDb.close();
newDb.close();

console.log('✅ All learning data migrated successfully');
```

Run migration:
```bash
node migrate-learning-data.js
```

### Step 6: Verify Migration

```javascript
// verify-migration.js
const Database = require('better-sqlite3');

const db = new Database('./agentdb-v2.db', { readonly: true });

console.log('Verifying migration...\n');

// Check episodes
const episodeCount = db.prepare('SELECT COUNT(*) as count FROM episodes').get();
console.log(`✅ Episodes: ${episodeCount.count} (expected: 1,759)`);

// Check patterns
const patternCount = db.prepare('SELECT COUNT(*) as count FROM test_patterns').get();
console.log(`✅ Patterns: ${patternCount.count} (expected: 0)`);

// Check learning_metrics
const metricsCount = db.prepare('SELECT COUNT(*) as count FROM learning_metrics').get();
console.log(`✅ Learning metrics: ${metricsCount.count}`);

// Check q_values
const qvalueCount = db.prepare('SELECT COUNT(*) as count FROM q_values').get();
console.log(`✅ Q-values: ${qvalueCount.count}`);

// Check learning_experiences
const expCount = db.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();
console.log(`✅ Learning experiences: ${expCount.count}`);

// Check schema version
const version = db.prepare('SELECT * FROM schema_version WHERE version = ?').get('2.0.0');
console.log(`\n✅ Schema version: ${version.version}`);
console.log(`   Applied: ${new Date(version.applied_at * 1000).toISOString()}`);
console.log(`   Description: ${version.description}`);

// Verify indexes
const indexes = db.prepare(`
  SELECT name, tbl_name
  FROM sqlite_master
  WHERE type='index'
  AND sql IS NOT NULL
`).all();
console.log(`\n✅ Indexes created: ${indexes.length}`);

// Verify views
const views = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='view'
`).all();
console.log(`✅ Views created: ${views.length}`);
views.forEach(v => console.log(`   - ${v.name}`));

// Verify triggers
const triggers = db.prepare(`
  SELECT name, tbl_name
  FROM sqlite_master
  WHERE type='trigger'
`).all();
console.log(`\n✅ Triggers created: ${triggers.length}`);
triggers.forEach(t => console.log(`   - ${t.name} (on ${t.tbl_name})`));

// Sample query performance test
console.log('\n📊 Performance test:');
const start = Date.now();
const sampleQuery = db.prepare(`
  SELECT session_id, task, reward, success
  FROM episodes
  WHERE success = 1
  ORDER BY ts DESC
  LIMIT 100
`).all();
const duration = Date.now() - start;
console.log(`   ✅ Query executed in ${duration}ms (returned ${sampleQuery.length} rows)`);

db.close();

console.log('\n✅ Migration verification complete!');
```

Run verification:
```bash
node verify-migration.js
```

### Step 7: Switch to New Database

```bash
# Rename old database
mv agentdb.db agentdb-v1-backup.db

# Activate new database
mv agentdb-v2.db agentdb.db

# Update configuration if needed
echo "✅ Database switched to v2.0"
```

### Step 8: Clean Up Old Databases (Optional)

**⚠️ Only do this after confirming v2.0 works correctly!**

```bash
# Archive old databases
tar -czf agentdb-v1-archive-$(date +%Y%m%d).tar.gz \
  agentdb-v1-backup.db \
  .agentic-qe/patterns.db \
  .agentic-qe/memory.db

# Move archive to safe location
mv agentdb-v1-archive-*.tar.gz ~/.agentic-qe/archives/

# Remove old databases (CAREFUL!)
# rm agentdb-v1-backup.db
# rm .agentic-qe/patterns.db
# rm .agentic-qe/memory.db
```

---

## Post-Migration Tasks

### 1. Update Application Code

Update any code that references the old database structure:

```typescript
// Before (v1.0)
const episodesDb = new Database('./agentdb.db');
const patternsDb = new Database('./.agentic-qe/patterns.db');
const memoryDb = new Database('./.agentic-qe/memory.db');

// After (v2.0)
const db = new Database('./agentdb.db'); // Single unified database
```

### 2. Populate Missing Test Context

Run agents to populate the new test-specific columns:

```sql
-- Episodes missing test context
SELECT COUNT(*)
FROM episodes
WHERE test_framework IS NULL;

-- These will be populated as agents execute new tests
```

### 3. Build Pattern Similarity Index

```javascript
// build-similarity-index.js
const Database = require('better-sqlite3');

const db = new Database('./agentdb.db');

console.log('Building pattern similarity index...');

// This will be populated as embeddings are generated
// and similarity scores are calculated
```

### 4. Rebuild Statistics Cache

```sql
-- Clear and rebuild stats cache
DELETE FROM pattern_stats_cache;

-- Cache will auto-populate on first query
```

### 5. Verify Query Performance

```javascript
// test-performance.js
const Database = require('better-sqlite3');
const db = new Database('./agentdb.db');

const queries = [
  {
    name: 'Find high-coverage episodes',
    sql: `SELECT * FROM episodes WHERE coverage_after >= 80 LIMIT 100`
  },
  {
    name: 'Top patterns by success',
    sql: `SELECT * FROM v_top_patterns LIMIT 20`
  },
  {
    name: 'Agent learning progress',
    sql: `SELECT * FROM v_agent_learning_progress`
  },
  {
    name: 'Pattern search by framework',
    sql: `SELECT * FROM test_patterns WHERE framework = 'jest' ORDER BY success_rate DESC LIMIT 50`
  }
];

console.log('Performance benchmarks:\n');

queries.forEach(({ name, sql }) => {
  const start = Date.now();
  const results = db.prepare(sql).all();
  const duration = Date.now() - start;

  const status = duration < 100 ? '✅' : '⚠️';
  console.log(`${status} ${name}: ${duration}ms (${results.length} rows)`);
});

db.close();
```

---

## Rollback Procedure

If migration fails or issues are discovered:

```bash
# Stop any running processes using the database
pkill -f agentdb

# Restore from backup
cp /workspaces/agentic-qe-cf/.agentic-qe/backup-*/agentdb.db \
   /workspaces/agentic-qe-cf/agentdb.db

cp /workspaces/agentic-qe-cf/.agentic-qe/backup-*/patterns.db \
   /workspaces/agentic-qe-cf/.agentic-qe/patterns.db

cp /workspaces/agentic-qe-cf/.agentic-qe/backup-*/memory.db \
   /workspaces/agentic-qe-cf/.agentic-qe/memory.db

echo "✅ Rollback complete - v1.0 restored"
```

---

## Migration Checklist

- [ ] Backups created
- [ ] New v2.0 database created
- [ ] Episodes migrated (1,759 expected)
- [ ] Patterns migrated (0 expected)
- [ ] Learning metrics migrated
- [ ] Q-values migrated
- [ ] Learning experiences migrated
- [ ] Verification script passed
- [ ] Performance tests passed (< 100ms)
- [ ] Application code updated
- [ ] Old databases archived
- [ ] Documentation updated

---

## Expected Migration Time

| Step | Duration | Bottleneck |
|------|----------|------------|
| Backup | < 1 minute | Disk I/O |
| Create schema | < 5 seconds | SQL parsing |
| Migrate episodes (1,759) | 1-2 minutes | Batch inserts |
| Migrate patterns (0) | < 1 second | No data |
| Migrate learning data | 30-60 seconds | Multiple tables |
| Verify | 10-20 seconds | Query execution |
| **Total** | **3-5 minutes** | |

---

## Troubleshooting

### Error: "database is locked"

```bash
# Check for open connections
lsof | grep agentdb.db

# Kill processes
pkill -f agentdb
```

### Error: "UNIQUE constraint failed"

```sql
-- Check for duplicate episodes
SELECT session_id, task, COUNT(*) as count
FROM episodes
GROUP BY session_id, task
HAVING count > 1;

-- Remove duplicates if found
```

### Error: "disk I/O error"

```bash
# Check disk space
df -h

# Check database integrity
echo "PRAGMA integrity_check;" | sqlite3 agentdb.db
```

### Performance Issues

```sql
-- Rebuild indexes
REINDEX;

-- Analyze statistics
ANALYZE;

-- Vacuum database
VACUUM;
```

---

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify backups are intact
3. Review migration logs
4. Open an issue with logs and error messages

---

## Schema Version History

| Version | Date | Migration | Notes |
|---------|------|-----------|-------|
| 2.0.0 | 2025-11-16 | v1.0 → v2.0 | Unified database, enhanced test support |
| 1.0.0 | 2024-xx-xx | Initial | Fragmented across 3 databases |
