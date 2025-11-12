# Complete Database Architecture Analysis

**Date**: 2025-11-12
**Status**: ⚠️ CRITICAL ISSUES IDENTIFIED
**Impact**: Learning and pattern persistence BROKEN

---

## Executive Summary

### 🔥 Critical Findings

We have **TWO separate databases** with overlapping but incompatible schemas:

1. **`.agentic-qe/memory.db`** - Main database (26 tables)
   - Used by: SwarmMemoryManager, learning handlers
   - Contains: `patterns`, `q_values`, `learning_experiences`, `pattern_usage`

2. **`.agentic-qe/patterns.db`** - Separate pattern database (12 tables)
   - Used by: Pattern storage system
   - Contains: `test_patterns`, `pattern_usage`, `pattern_similarity_index`

### 🐛 Root Causes of Failures

#### Issue 1: Pattern Storage Uses Wrong Table

**Handler**: `LearningStorePatternHandler` (learning-store-pattern.ts:76-89)

**Problem**: Creates/uses `test_patterns` table instead of existing `patterns` table

```typescript
// Lines 76-89: Creates test_patterns dynamically
db.prepare(`
  CREATE TABLE test_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT,
    pattern TEXT NOT NULL,
    confidence REAL NOT NULL,
    domain TEXT,
    usage_count INTEGER DEFAULT 1,
    success_rate REAL DEFAULT 1.0,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`).run();
```

**Impact**:
- ❌ `test_patterns` table does NOT exist in memory.db
- ❌ Handler creates it dynamically but uses wrong schema
- ❌ Zero integration with existing `patterns` table (0 rows)
- ❌ Patterns stored but not retrievable by other systems

#### Issue 2: Column Name Mismatches

**Handlers**: All three learning handlers have schema mismatches

| Handler | Expected Column | Actual Schema | Status |
|---------|----------------|---------------|--------|
| LearningStoreExperienceHandler | `metadata` (line 64) | ❌ Column doesn't exist | BROKEN |
| LearningStoreExperienceHandler | `created_at` (line 65) | ❌ Uses INTEGER, schema expects DATETIME | MISMATCH |
| LearningStoreQValueHandler | `metadata` (line 78) | ❌ Column doesn't exist | BROKEN |
| LearningStoreQValueHandler | `updated_at` (line 79) | ❌ Uses INTEGER, schema expects DATETIME | MISMATCH |

---

## Database Architecture

### Database 1: `.agentic-qe/memory.db` (Main Database)

**Total Tables**: 26
**Row Counts**:
- `memory_entries`: 1,374 rows ✅ WORKING
- `hints`: 77 rows ✅ WORKING
- `patterns`: 0 rows ⚠️ EMPTY (should have QE patterns)
- `q_values`: 0 rows ⚠️ EMPTY (handlers failing)
- `learning_experiences`: 0 rows ⚠️ EMPTY (handlers failing)

#### Learning-Related Tables in memory.db

##### 1. `patterns` Table (Exists, but handlers don't use it)
```sql
CREATE TABLE patterns (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL,
  usage_count INTEGER NOT NULL,
  metadata TEXT,
  ttl INTEGER NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
```
**Status**: ✅ Exists, ❌ Not used by QE agents (0 rows)

##### 2. `q_values` Table (Handlers use it, but with wrong columns)
```sql
CREATE TABLE q_values (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  q_value REAL NOT NULL,
  update_count INTEGER,
  last_updated DATETIME,  -- ⚠️ Handler uses INTEGER timestamp
  created_at DATETIME     -- ⚠️ Handler uses INTEGER timestamp
);
```
**Status**: ⚠️ Schema mismatch (DATETIME vs INTEGER)

##### 3. `learning_experiences` Table (Handlers use it, but missing columns)
```sql
CREATE TABLE learning_experiences (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  task_type TEXT NOT NULL,
  state TEXT NOT NULL,
  action TEXT NOT NULL,
  reward REAL NOT NULL,
  next_state TEXT NOT NULL,
  episode_id TEXT,
  timestamp DATETIME
  -- ❌ Missing: metadata column (handler tries to insert it)
  -- ❌ Missing: created_at column (handler tries to insert it)
);
```
**Status**: ❌ Missing columns that handlers require

##### 4. `pattern_usage` Table
```sql
CREATE TABLE pattern_usage (
  id INTEGER PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  project_id TEXT,
  agent_id TEXT,
  context TEXT,
  success BOOLEAN,
  execution_time_ms INTEGER,
  error_message TEXT,
  used_at DATETIME
);
```
**Status**: ✅ Correct schema, 0 rows

---

### Database 2: `.agentic-qe/patterns.db` (Separate Pattern DB)

**Total Tables**: 12
**Purpose**: Advanced pattern storage with similarity indexing, FTS search

#### Main Tables in patterns.db

##### 1. `test_patterns` Table (What handlers try to create)
```sql
CREATE TABLE test_patterns (
  id TEXT NOT NULL PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  framework TEXT NOT NULL,
  language TEXT NOT NULL,
  code_signature_hash TEXT NOT NULL,
  code_signature JSON NOT NULL,
  test_template JSON NOT NULL,
  metadata JSON NOT NULL,
  version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```
**Status**: ✅ Exists in patterns.db, ❌ Handlers try to create in memory.db (0 rows)

##### 2. `pattern_usage` Table (Duplicate of memory.db)
```sql
CREATE TABLE pattern_usage (
  id INTEGER PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  usage_count INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  avg_execution_time REAL NOT NULL,
  avg_coverage_gain REAL NOT NULL,
  flaky_count INTEGER NOT NULL,
  quality_score REAL NOT NULL,
  first_used TIMESTAMP NOT NULL,
  last_used TIMESTAMP NOT NULL
);
```
**Status**: ⚠️ Different schema than memory.db's pattern_usage (0 rows)

##### 3. `cross_project_mappings` Table
```sql
CREATE TABLE cross_project_mappings (
  id INTEGER PRIMARY KEY,
  pattern_id TEXT NOT NULL,
  source_framework TEXT NOT NULL,
  target_framework TEXT NOT NULL,
  transformation_rules JSON NOT NULL,
  compatibility_score REAL NOT NULL,
  project_count INTEGER NOT NULL,
  success_rate REAL NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```
**Status**: ✅ Advanced feature, 0 rows

##### 4. `pattern_similarity_index` Table
```sql
CREATE TABLE pattern_similarity_index (
  pattern_a TEXT NOT NULL PRIMARY KEY,
  pattern_b TEXT NOT NULL PRIMARY KEY,
  similarity_score REAL NOT NULL,
  structure_similarity REAL NOT NULL,
  identifier_similarity REAL NOT NULL,
  metadata_similarity REAL NOT NULL,
  algorithm TEXT NOT NULL,
  last_computed TIMESTAMP NOT NULL
);
```
**Status**: ✅ Advanced feature, 0 rows

##### 5. Full-Text Search Tables
- `pattern_fts` - FTS5 virtual table
- `pattern_fts_data`, `pattern_fts_idx`, `pattern_fts_docsize`, `pattern_fts_config`

**Status**: ✅ FTS infrastructure ready, 0 rows

---

## Problem Analysis

### Problem 1: Two Separate Databases with Overlapping Schemas

**Why This Is Bad**:
1. **Data Fragmentation**: Patterns could be in memory.db OR patterns.db
2. **No Synchronization**: Changes in one DB don't reflect in the other
3. **Query Complexity**: Systems don't know which DB to query
4. **Duplicate Tables**: `pattern_usage` exists in BOTH databases with DIFFERENT schemas

### Problem 2: Handler Creates Tables Dynamically (Anti-Pattern)

**File**: `learning-store-pattern.ts:69-92`

```typescript
// Check if test_patterns table exists, create if not
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns'
`).get();

if (!tableExists) {
  // Create test_patterns table
  db.prepare(`CREATE TABLE test_patterns (...)`).run();
}
```

**Why This Is Bad**:
1. **Schema Drift**: Each handler can create different schemas
2. **No Migration Management**: No versioning, no rollback
3. **Unpredictable Behavior**: Database schema depends on which handler runs first
4. **Type Safety**: TypeScript interfaces don't match runtime schemas

### Problem 3: Column Name Mismatches

#### `learning_experiences` Table

**Handler Expects** (learning-store-experience.ts:56-66):
```typescript
const experienceData = {
  agent_id: agentId,
  task_id: `task-${Date.now()}`,
  task_type: taskType,
  state: JSON.stringify({ type: taskType, timestamp }),
  action: JSON.stringify(outcome),
  reward,
  next_state: JSON.stringify({ completed: true, timestamp }),
  metadata: JSON.stringify(metadata),  // ❌ Column doesn't exist
  created_at: timestamp                // ❌ Column doesn't exist
};
```

**Actual Schema**:
```sql
CREATE TABLE learning_experiences (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  task_type TEXT NOT NULL,
  state TEXT NOT NULL,
  action TEXT NOT NULL,
  reward REAL NOT NULL,
  next_state TEXT NOT NULL,
  episode_id TEXT,
  timestamp DATETIME  -- ⚠️ Has timestamp, not created_at
  -- ❌ Missing: metadata, created_at
);
```

#### `q_values` Table

**Handler Expects** (learning-store-qvalue.ts:76-85):
```typescript
db.prepare(`
  UPDATE q_values
  SET q_value = ?, update_count = ?, metadata = ?, updated_at = ?
  WHERE id = ?
`).run(
  weightedQValue,
  newUpdateCount,
  JSON.stringify(metadata),  // ❌ Column doesn't exist
  Date.now(),                // ❌ Wrong type (INTEGER vs DATETIME)
  existing.id
);
```

**Actual Schema**:
```sql
CREATE TABLE q_values (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  q_value REAL NOT NULL,
  update_count INTEGER,
  last_updated DATETIME,  -- ⚠️ Handler uses updated_at
  created_at DATETIME
  -- ❌ Missing: metadata column
);
```

---

## Solutions

### Solution 1: Consolidate Pattern Storage (RECOMMENDED)

**Goal**: Use ONE database (memory.db) with ONE patterns table

**Changes Required**:

1. **Update `LearningStorePatternHandler`**:
   - Remove `test_patterns` table creation (lines 69-92)
   - Use existing `patterns` table instead
   - Add missing columns to `patterns` table:
     - `agent_id TEXT`
     - `domain TEXT`
     - `success_rate REAL`

2. **Schema Migration**:
```sql
-- Add missing columns to patterns table
ALTER TABLE patterns ADD COLUMN agent_id TEXT;
ALTER TABLE patterns ADD COLUMN domain TEXT DEFAULT 'general';
ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0;
```

3. **Update INSERT statement**:
```typescript
// Use patterns table instead of test_patterns
db.prepare(`
  INSERT INTO patterns (
    id, pattern, confidence, usage_count, agent_id, domain, success_rate,
    metadata, ttl, created_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  `pattern-${Date.now()}-${Math.random()}`,
  pattern,
  confidence,
  usageCount,
  agentId || null,
  domain,
  successRate,
  JSON.stringify(metadata),
  0, // ttl (0 = no expiry)
  Date.now(),
  null
);
```

**Benefits**:
- ✅ Single source of truth for patterns
- ✅ Works with existing SwarmMemoryManager
- ✅ No database fragmentation
- ✅ Backward compatible (Claude Flow's patterns preserved)

---

### Solution 2: Fix Column Mismatches in learning_experiences

**Changes Required**:

1. **Add missing columns**:
```sql
ALTER TABLE learning_experiences ADD COLUMN metadata TEXT;
ALTER TABLE learning_experiences ADD COLUMN created_at INTEGER;
```

2. **Update handler** (learning-store-experience.ts:74-90):
```typescript
const stmt = db.prepare(`
  INSERT INTO learning_experiences (
    agent_id, task_id, task_type, state, action, reward,
    next_state, episode_id, timestamp, metadata, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const result = stmt.run(
  experienceData.agent_id,
  experienceData.task_id,
  experienceData.task_type,
  experienceData.state,
  experienceData.action,
  experienceData.reward,
  experienceData.next_state,
  null, // episode_id
  experienceData.created_at, // timestamp
  experienceData.metadata, // metadata
  experienceData.created_at // created_at
);
```

---

### Solution 3: Fix Column Mismatches in q_values

**Changes Required**:

1. **Add missing columns and fix datetime handling**:
```sql
ALTER TABLE q_values ADD COLUMN metadata TEXT;
```

2. **Update handler** to use `last_updated` instead of `updated_at`:
```typescript
// Update existing Q-value
db.prepare(`
  UPDATE q_values
  SET q_value = ?, update_count = ?, metadata = ?, last_updated = datetime('now')
  WHERE id = ?
`).run(
  weightedQValue,
  newUpdateCount,
  JSON.stringify(metadata),
  existing.id
);

// Insert new Q-value
db.prepare(`
  INSERT INTO q_values (
    agent_id, state_key, action_key, q_value, update_count,
    metadata, created_at, last_updated
  ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`).run(
  agentId,
  stateKey,
  actionKey,
  qValue,
  updateCount,
  JSON.stringify(metadata)
);
```

---

## Migration Plan

### Phase 1: Database Schema Updates

```sql
-- 1. Update patterns table (memory.db)
ALTER TABLE patterns ADD COLUMN agent_id TEXT;
ALTER TABLE patterns ADD COLUMN domain TEXT DEFAULT 'general';
ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0;

-- 2. Update learning_experiences table (memory.db)
ALTER TABLE learning_experiences ADD COLUMN metadata TEXT;
ALTER TABLE learning_experiences ADD COLUMN created_at INTEGER;

-- 3. Update q_values table (memory.db)
ALTER TABLE q_values ADD COLUMN metadata TEXT;
```

### Phase 2: Handler Updates

1. **learning-store-pattern.ts**:
   - Remove lines 69-92 (table creation)
   - Update INSERT to use `patterns` table
   - Add `id`, `ttl`, `expires_at` columns

2. **learning-store-experience.ts**:
   - Update INSERT statement (line 74-90)
   - Add `episode_id`, `metadata`, `created_at` columns

3. **learning-store-qvalue.ts**:
   - Replace `updated_at` with `last_updated`
   - Add `metadata` column
   - Use SQLite `datetime('now')` for timestamps

### Phase 3: Testing

1. Test pattern storage:
```bash
mcp__agentic_qe__learning_store_pattern({
  pattern: "Test pattern",
  confidence: 0.9,
  agentId: "test-agent",
  domain: "unit-testing"
})
```

2. Test experience storage:
```bash
mcp__agentic_qe__learning_store_experience({
  agentId: "test-agent",
  taskType: "test-generation",
  reward: 0.85,
  outcome: { tests: 10, coverage: 0.95 }
})
```

3. Test Q-value storage:
```bash
mcp__agentic_qe__learning_store_qvalue({
  agentId: "test-agent",
  stateKey: "test-gen-state",
  actionKey: "generate-unit-tests",
  qValue: 0.9
})
```

4. Verify data persisted:
```bash
node -e "
const db = require('better-sqlite3')('.agentic-qe/memory.db');
console.log('Patterns:', db.prepare('SELECT COUNT(*) FROM patterns').get());
console.log('Experiences:', db.prepare('SELECT COUNT(*) FROM learning_experiences').get());
console.log('Q-values:', db.prepare('SELECT COUNT(*) FROM q_values').get());
db.close();
"
```

---

## Expected Results After Fix

### Database State

| Table | Before | After |
|-------|--------|-------|
| `patterns` | 0 rows | Growing with QE agent usage ✅ |
| `learning_experiences` | 0 rows | Growing with task execution ✅ |
| `q_values` | 0 rows | Growing with learning ✅ |
| `test_patterns` | Doesn't exist | ❌ Removed (use `patterns` instead) |

### Handler Behavior

| Handler | Before | After |
|---------|--------|-------|
| LearningStorePatternHandler | Creates `test_patterns` dynamically ❌ | Uses `patterns` table ✅ |
| LearningStoreExperienceHandler | SQL errors (missing columns) ❌ | Successful inserts ✅ |
| LearningStoreQValueHandler | SQL errors (missing columns) ❌ | Successful inserts/updates ✅ |

---

## Recommendations

### Immediate Actions (Priority 1)

1. ✅ **Apply database schema migrations** (add missing columns)
2. ✅ **Update all three handlers** with correct column names
3. ✅ **Test MCP tools end-to-end** with real data
4. ✅ **Remove dynamic table creation** (lines 69-92 in learning-store-pattern.ts)

### Short-Term (Priority 2)

1. **Consolidate databases**: Decide on memory.db OR patterns.db (not both)
2. **Create migration system**: Use proper schema versioning
3. **Add integration tests**: Test all learning tools together
4. **Document database schema**: Add schema documentation to codebase

### Long-Term (Priority 3)

1. **Use ORM/Query Builder**: Replace raw SQL with type-safe queries
2. **Add database constraints**: Foreign keys, indexes, unique constraints
3. **Implement data retention**: TTL cleanup for old learning data
4. **Add monitoring**: Track learning data growth and query performance

---

## Conclusion

The learning/pattern persistence issues are caused by:

1. ✅ **Identified**: Two separate databases (memory.db and patterns.db)
2. ✅ **Identified**: Dynamic table creation in handlers (anti-pattern)
3. ✅ **Identified**: Column name mismatches (`metadata`, `created_at`, `updated_at`)
4. ✅ **Identified**: Type mismatches (INTEGER vs DATETIME)

**All issues are fixable with the solutions outlined above.**

**Estimated Fix Time**: 2-3 hours
- Schema migrations: 30 minutes
- Handler updates: 1 hour
- Testing: 1 hour
- Documentation: 30 minutes

---

**Next Steps**: Apply Phase 1 migrations, update handlers, run tests.
