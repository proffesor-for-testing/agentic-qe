# Database Schema Comparison: QE Agents vs Claude Flow

**Purpose**: Quick reference for understanding schema differences between QE agents' learning tables and Claude Flow's pattern storage.

---

## Table Existence Comparison

| Table Name | QE Agents DB | Claude Flow DB | Purpose |
|------------|--------------|----------------|---------|
| `patterns` | ✅ **Empty (0 rows)** | ✅ **Working (13 rows)** | Pattern storage (shared schema) |
| `test_patterns` | ❌ **Does not exist** | ❌ N/A | QE-specific patterns (handler creates dynamically) |
| `learning_experiences` | ✅ Empty (0 rows) | ❌ N/A | Q-learning experiences |
| `q_values` | ✅ Empty (0 rows) | ❌ N/A | State-action Q-values |
| `learning_history` | ✅ Empty (0 rows) | ❌ N/A | Learning snapshots |
| `learning_metrics` | ✅ Empty (0 rows) | ❌ N/A | Aggregated performance |

---

## `patterns` Table Schema (Shared - Identical in Both DBs)

| Column | Type | Constraints | QE Agents | Claude Flow | Notes |
|--------|------|-------------|-----------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | ✅ | ✅ | Unique pattern ID |
| `pattern` | TEXT | NOT NULL | ✅ | ✅ | Pattern description |
| `confidence` | REAL | NOT NULL | ✅ | ✅ | Confidence score (0-1) |
| `usage_count` | INTEGER | DEFAULT 0 | ✅ | ✅ | Times pattern used |
| `metadata` | TEXT | | ✅ | ✅ | JSON metadata |
| `ttl` | INTEGER | DEFAULT 604800 | ✅ | ✅ | Time to live (7 days) |
| `expires_at` | INTEGER | | ✅ | ✅ | Expiration timestamp |
| `created_at` | INTEGER | NOT NULL | ✅ | ✅ | Creation timestamp |

**Status**: ✅ **Identical schema** - perfect for unified storage!

**Row Count**:
- QE Agents: **0** (unused - handlers use test_patterns)
- Claude Flow: **13** (working - SwarmMemoryManager uses this)

---

## `test_patterns` Table Schema (Handler Expectation - Does Not Exist)

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique pattern ID |
| `agent_id` | TEXT | | Agent that created pattern |
| `pattern` | TEXT | NOT NULL | Pattern description |
| `confidence` | REAL | NOT NULL | Confidence score (0-1) |
| `domain` | TEXT | | Pattern category |
| `usage_count` | INTEGER | DEFAULT 1 | Times pattern used |
| `success_rate` | REAL | DEFAULT 1.0 | Success metric |
| `metadata` | TEXT | | JSON metadata |
| `created_at` | INTEGER | NOT NULL | Creation timestamp |
| `updated_at` | INTEGER | NOT NULL | Last update timestamp |

**Status**: ❌ **Table does not exist** - `LearningStorePatternHandler` creates it dynamically on first use

**Extra Columns vs `patterns`**:
- ✅ `agent_id` - Track which agent created pattern
- ✅ `domain` - Categorize patterns (test-gen, coverage, etc.)
- ✅ `success_rate` - Quality metric for learning
- ✅ `updated_at` - Track pattern refinement

---

## `learning_experiences` Table Schema (QE Agents Only)

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique experience ID |
| `agent_id` | TEXT | NOT NULL | Agent identifier |
| `task_id` | TEXT | | Task identifier |
| `task_type` | TEXT | NOT NULL | Type of task |
| `state` | TEXT | NOT NULL | State before action |
| `action` | TEXT | NOT NULL | Action taken |
| `reward` | REAL | NOT NULL | Reward received (0-1) |
| `next_state` | TEXT | NOT NULL | State after action |
| `episode_id` | TEXT | | Episode identifier |
| `timestamp` | DATETIME | DEFAULT CURRENT_TIMESTAMP | When experience occurred |

**Status**: ✅ Table exists with correct schema
**Row Count**: 0 (empty - no learning experiences stored yet)

---

## `q_values` Table Schema (QE Agents Only)

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique Q-value ID |
| `agent_id` | TEXT | NOT NULL | Agent identifier |
| `state_key` | TEXT | NOT NULL | State identifier |
| `action_key` | TEXT | NOT NULL | Action identifier |
| `q_value` | REAL | NOT NULL DEFAULT 0 | Q-value (expected reward) |
| `update_count` | INTEGER | DEFAULT 1 | Number of updates |
| `last_updated` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update time |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation time |
| | | UNIQUE(agent_id, state_key, action_key) | Prevent duplicates |

**Status**: ✅ Table exists with correct schema
**Row Count**: 0 (empty - no Q-values stored yet)

---

## Handler vs Manager Table Usage

### LearningStorePatternHandler (QE Agents)

```typescript
// Expected table: test_patterns
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns'
`).get();

if (!tableExists) {
  // Create test_patterns table dynamically
  db.prepare(`CREATE TABLE test_patterns (...)`).run();
}

db.prepare(`INSERT INTO test_patterns (...)`).run();
```

**Problem**: Creates separate table, no integration with SwarmMemoryManager

### SwarmMemoryManager.storePattern() (Claude Flow)

```typescript
// Uses existing table: patterns
async storePattern(pattern: Pattern): Promise<string> {
  const sql = `
    INSERT OR REPLACE INTO patterns
    (id, pattern, confidence, usage_count, metadata, ttl, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await this.run(sql, [...]);
  return id;
}
```

**Success**: Uses shared patterns table, works correctly

---

## Proposed Unified Schema (Option A)

Extend `patterns` table with QE-specific columns:

| Column | Type | Constraints | Source | Purpose |
|--------|------|-------------|--------|---------|
| `id` | TEXT | PRIMARY KEY | **Existing** | Unique pattern ID |
| `pattern` | TEXT | NOT NULL | **Existing** | Pattern description |
| `confidence` | REAL | NOT NULL | **Existing** | Confidence score |
| `usage_count` | INTEGER | DEFAULT 0 | **Existing** | Times used |
| `metadata` | TEXT | | **Existing** | JSON metadata |
| `ttl` | INTEGER | DEFAULT 604800 | **Existing** | Time to live |
| `expires_at` | INTEGER | | **Existing** | Expiration time |
| `created_at` | INTEGER | NOT NULL | **Existing** | Creation time |
| `agent_id` | TEXT | | **NEW** ✅ | Agent creator |
| `domain` | TEXT | | **NEW** ✅ | Pattern category |
| `success_rate` | REAL | DEFAULT 1.0 | **NEW** ✅ | Quality metric |
| `updated_at` | INTEGER | | **NEW** ✅ | Last update time |

**Changes Required**:
- Add 4 columns (all nullable for backward compatibility)
- Create 2 indexes (agent_id, domain)
- Update handler to use `patterns` instead of `test_patterns`

**Benefits**:
- ✅ Backward compatible (existing 13 patterns unchanged)
- ✅ QE agents can store patterns with metadata
- ✅ Claude Flow patterns visible to QE agents
- ✅ Single source of truth for all patterns

---

## Column Type Comparison

### ID Columns

| Table | ID Type | Auto-Increment | Format Example |
|-------|---------|----------------|----------------|
| `patterns` | TEXT | ❌ No | `pattern-1760702230857-3c39w0mj8` |
| `test_patterns` | INTEGER | ✅ Yes | `1, 2, 3, ...` |
| `learning_experiences` | INTEGER | ✅ Yes | `1, 2, 3, ...` |
| `q_values` | INTEGER | ✅ Yes | `1, 2, 3, ...` |

**Impact**: `patterns` uses TEXT IDs with timestamp + random suffix, `test_patterns` uses INTEGER IDs

**Solution**: Keep TEXT IDs in unified schema (more flexible, globally unique)

### Timestamp Columns

| Table | Created Column | Updated Column | Type |
|-------|----------------|----------------|------|
| `patterns` | `created_at` | ❌ None | INTEGER (Unix ms) |
| `test_patterns` | `created_at` | `updated_at` | INTEGER (Unix ms) |
| `learning_experiences` | `timestamp` | ❌ None | DATETIME |
| `q_values` | `created_at` | `last_updated` | DATETIME |

**Impact**: Mixed timestamp types (INTEGER vs DATETIME)

**Solution**: Use INTEGER (Unix milliseconds) in unified schema for consistency

---

## Index Comparison

### Existing Indexes on `patterns` Table

| Index Name | Column | Purpose |
|------------|--------|---------|
| `idx_patterns_confidence` | `confidence` | Fast confidence-based filtering |
| `idx_patterns_expires` | `expires_at` | TTL cleanup queries |

### Proposed New Indexes (Option A)

| Index Name | Column | Purpose |
|------------|--------|---------|
| `idx_patterns_agent` | `agent_id` | Agent-specific pattern queries |
| `idx_patterns_domain` | `domain` | Domain-specific pattern queries |

**Performance Impact**: Minimal (2 additional indexes on nullable columns)

---

## Migration Complexity

| Operation | Complexity | Time | Risk |
|-----------|-----------|------|------|
| Add columns to `patterns` | Low | 1 min | Very Low |
| Create indexes | Low | 1 min | Very Low |
| Migrate `test_patterns` data | Low | 1 min | Low (if table exists) |
| Update handler code | Low | 10 min | Low |
| Testing | Medium | 20 min | Low |
| **Total** | **Low** | **~30 min** | **Low** |

---

## Data Volume Comparison

| Table | QE Agents Rows | Claude Flow Rows | Expected Growth |
|-------|----------------|------------------|-----------------|
| `patterns` | 0 | 13 | +100/month (QE patterns) |
| `test_patterns` | 0 (doesn't exist) | N/A | N/A (will be dropped) |
| `learning_experiences` | 0 | N/A | +1000/month |
| `q_values` | 0 | N/A | +500/month |
| `learning_history` | 0 | N/A | +200/month |
| `learning_metrics` | 0 | N/A | +50/month |

**Storage Impact**: Negligible (4 additional TEXT/INTEGER columns per pattern)

---

## Query Performance Comparison

### Before Fix (Fragmented)

```sql
-- Query patterns by domain
SELECT * FROM patterns WHERE domain = 'test-generation';
-- Result: 0 rows (column doesn't exist)

-- Query QE patterns
SELECT * FROM test_patterns WHERE domain = 'test-generation';
-- Result: Error (table doesn't exist)
```

**Performance**: N/A (queries fail)

### After Fix (Unified)

```sql
-- Query patterns by domain
SELECT * FROM patterns WHERE domain = 'test-generation';
-- Result: All QE patterns for domain
-- Performance: O(log n) with idx_patterns_domain

-- Query patterns by agent
SELECT * FROM patterns WHERE agent_id = 'qe-test-generator';
-- Result: All patterns created by agent
-- Performance: O(log n) with idx_patterns_agent

-- Query top patterns across all agents
SELECT * FROM patterns
ORDER BY success_rate DESC, confidence DESC, usage_count DESC
LIMIT 10;
-- Result: Top 10 patterns (QE + Claude Flow)
-- Performance: O(n log n) with composite index
```

**Performance**: Excellent with indexes (sub-10ms for 1000+ patterns)

---

## Conclusion

### Current State
- ❌ **Fragmented**: Two pattern storage systems (patterns, test_patterns)
- ❌ **Broken**: QE patterns not retrievable (table doesn't exist)
- ❌ **Isolated**: Claude Flow patterns invisible to QE agents

### Proposed State (Option A)
- ✅ **Unified**: Single `patterns` table for all agents
- ✅ **Working**: QE patterns stored and retrievable
- ✅ **Integrated**: All patterns shared across agents
- ✅ **Backward Compatible**: Existing patterns preserved

### Next Steps
1. Review migration script
2. Approve schema changes
3. Execute migration
4. Deploy updated handlers
5. Verify pattern storage and retrieval

---

**Last Updated**: 2025-11-12
**Status**: Ready for implementation ✅
