# Learning & Pattern Persistence Investigation Report

**Date**: 2025-11-12
**Investigation Goal**: Analyze how QE agents and Claude Flow agents persist memories and patterns, identify differences, and recommend fixes for learning/pattern persistence issues.

---

## Executive Summary

### Key Findings

1. **Critical Missing Table**: `test_patterns` table does not exist in QE agents database, causing `LearningStorePatternHandler` to fail on first use
2. **Schema Alignment**: QE agents' existing `patterns`, `learning_experiences`, and `q_values` tables have correct schemas but remain empty (0 rows)
3. **Successful Reference**: Claude Flow's `.swarm/memory.db` has 13 patterns stored successfully using identical `patterns` table schema
4. **Handler Mismatch**: `LearningStorePatternHandler` creates and uses `test_patterns` table, but should use existing `patterns` table
5. **No Code Path Issues**: Direct database access in handlers is correct; the issue is table name mismatch

---

## Database Schema Analysis

### 1. QE Agents Database (`.agentic-qe/memory.db`)

**Total Tables**: 26 tables

#### Learning-Related Tables (Present but Empty)

##### `learning_experiences` Table
```sql
CREATE TABLE IF NOT EXISTS learning_experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  task_type TEXT NOT NULL,
  state TEXT NOT NULL,
  action TEXT NOT NULL,
  reward REAL NOT NULL,
  next_state TEXT NOT NULL,
  episode_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
- **Status**: ✅ Table exists with correct schema
- **Row Count**: 0 (empty)
- **Purpose**: Store Q-learning experiences for agent training
- **Handler**: `LearningStoreExperienceHandler` ✅ Uses this table correctly

##### `q_values` Table
```sql
CREATE TABLE IF NOT EXISTS q_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  q_value REAL NOT NULL DEFAULT 0,
  update_count INTEGER NOT NULL DEFAULT 1,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, state_key, action_key)
)
```
- **Status**: ✅ Table exists with correct schema
- **Row Count**: 0 (empty)
- **Purpose**: Store Q-values for state-action pairs
- **Handler**: `LearningStoreQValueHandler` ✅ Uses this table correctly

##### `patterns` Table
```sql
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  confidence REAL NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  ttl INTEGER NOT NULL DEFAULT 604800,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
)
```
- **Status**: ✅ Table exists with correct schema
- **Row Count**: 0 (empty)
- **Purpose**: Store successful patterns for reuse
- **Handler**: ❌ `LearningStorePatternHandler` does NOT use this table

##### `test_patterns` Table
```sql
-- DOES NOT EXIST
```
- **Status**: ❌ **MISSING** - Table does not exist
- **Expected Schema** (from `LearningStorePatternHandler` lines 76-89):
```sql
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
```
- **Handler**: `LearningStorePatternHandler` ❌ Creates and uses this table dynamically

##### `learning_history` Table
```sql
CREATE TABLE IF NOT EXISTS learning_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  pattern_id TEXT,
  state_representation TEXT NOT NULL,
  action TEXT NOT NULL,
  reward REAL NOT NULL,
  next_state_representation TEXT,
  q_value REAL,
  episode INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
- **Status**: ✅ Table exists with correct schema
- **Row Count**: 0 (empty)
- **Purpose**: Store learning history snapshots

##### `learning_metrics` Table
```sql
CREATE TABLE IF NOT EXISTS learning_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value REAL NOT NULL,
  baseline_value REAL,
  improvement_percentage REAL,
  pattern_count INTEGER,
  context TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
- **Status**: ✅ Table exists with correct schema
- **Row Count**: 0 (empty)
- **Purpose**: Store aggregated learning performance metrics

---

### 2. Claude Flow Database (`.swarm/memory.db`)

**Total Tables**: 22 tables

#### `patterns` Table (Successfully Used)
```sql
CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  ttl INTEGER NOT NULL DEFAULT 604800,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
)
```
- **Status**: ✅ Table exists with correct schema
- **Row Count**: **13 patterns stored successfully**
- **Sample Data**:
  - ID: `pattern-1760702230857-3c39w0mj8`, Pattern: "jest-environment-fix...", Confidence: 0.95
  - ID: `pattern-1760702230862-jrn9zhsr6`, Pattern: "swarm-memory-integration...", Confidence: 0.98

**Key Observation**: Claude Flow uses the `patterns` table directly via `SwarmMemoryManager`, and it works perfectly. QE agents have the same `patterns` table but it's empty because handlers don't use it.

---

## Schema Comparison Table

| Feature | QE `patterns` | QE `test_patterns` | QE `learning_experiences` | QE `q_values` | Claude Flow `patterns` |
|---------|---------------|-------------------|---------------------------|---------------|------------------------|
| **Table Exists** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Schema Correct** | ✅ Yes | N/A | ✅ Yes | ✅ Yes | ✅ Yes |
| **Handler Uses It** | ❌ No | ✅ (creates dynamically) | ✅ Yes | ✅ Yes | ✅ Yes |
| **Row Count** | 0 (empty) | 0 (doesn't exist) | 0 (empty) | 0 (empty) | 13 (success!) |
| **ID Type** | TEXT PRIMARY KEY | INTEGER AUTOINCREMENT | INTEGER AUTOINCREMENT | INTEGER AUTOINCREMENT | TEXT PRIMARY KEY |
| **agent_id** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **domain** | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **success_rate** | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **updated_at** | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |

---

## Code Path Analysis

### Pattern Storage Flow

#### Current (Broken) Flow for QE Agents
```typescript
// User calls MCP tool via Claude Code Task
mcp__agentic_qe__learning_store_pattern({
  pattern: "Test generation pattern...",
  confidence: 0.9,
  domain: "test-generation"
})

↓

// Handler receives request
LearningStorePatternHandler.handle(args)

↓

// Handler checks for test_patterns table
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns'
`).get();

↓

// Table does NOT exist
if (!tableExists) {
  // Handler creates test_patterns table dynamically (lines 75-89)
  db.prepare(`CREATE TABLE test_patterns (...)`).run();
}

↓

// Handler inserts into test_patterns
db.prepare(`INSERT INTO test_patterns (...)`).run();

✅ SUCCESS: Pattern stored in test_patterns table
❌ PROBLEM: But test_patterns is separate from patterns table used by SwarmMemoryManager
```

#### Working Flow for Claude Flow Agents
```typescript
// Claude Flow agent uses SwarmMemoryManager directly
swarmMemory.storePattern({
  pattern: "Jest environment fix...",
  confidence: 0.95,
  usageCount: 1
})

↓

// SwarmMemoryManager.storePattern() implementation (lines 800-836)
async storePattern(pattern: Pattern): Promise<string> {
  const id = pattern.id || `pattern-${Date.now()}-${this.generateId()}`;

  const sql = `
    INSERT OR REPLACE INTO patterns
    (id, pattern, confidence, usage_count, metadata, ttl, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await this.run(sql, [
    id,
    pattern.pattern,
    pattern.confidence,
    pattern.usageCount || 0,
    pattern.metadata ? JSON.stringify(pattern.metadata) : null,
    pattern.ttl || this.TTL_POLICY.patterns,
    // ... other params
  ]);

  return id;
}

✅ SUCCESS: Pattern stored in patterns table (shared with QE agents)
```

---

## Root Cause Analysis

### Why Claude Flow Works But QE Agents Don't

1. **Claude Flow**: Uses `SwarmMemoryManager.storePattern()` which inserts into the existing `patterns` table
2. **QE Agents**: Use `LearningStorePatternHandler` which creates and uses a separate `test_patterns` table
3. **Mismatch**: The `test_patterns` table has additional columns (`agent_id`, `domain`, `success_rate`, `updated_at`) not present in the standard `patterns` table
4. **Design Intent**: `LearningStorePatternHandler` was designed to store QE-specific learning patterns with additional metadata, but this creates fragmentation

### Why Learning MCP Tools Fail

1. **Table Mismatch**: Handlers expect specific tables (`test_patterns`) that don't exist in the shared QE database
2. **Dynamic Creation**: `LearningStorePatternHandler` creates `test_patterns` on first use, but this doesn't integrate with `SwarmMemoryManager`'s `patterns` table
3. **No Integration**: Patterns stored in `test_patterns` are not accessible via `SwarmMemoryManager.queryPatternsByConfidence()` or other pattern retrieval methods
4. **Data Fragmentation**: Learning data split across multiple tables with different schemas

---

## Unified Schema Recommendations

### Option A: Extend Existing `patterns` Table (Recommended)

**Rationale**: Minimal changes, backward compatible, unified pattern storage

**Migration**:
```sql
-- Add QE-specific columns to existing patterns table
ALTER TABLE patterns ADD COLUMN agent_id TEXT;
ALTER TABLE patterns ADD COLUMN domain TEXT;
ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0;
ALTER TABLE patterns ADD COLUMN updated_at INTEGER;

-- Migrate data from test_patterns if it exists
INSERT INTO patterns (id, pattern, confidence, usage_count, metadata, created_at, agent_id, domain, success_rate, updated_at)
SELECT
  'pattern-' || id,
  pattern,
  confidence,
  usage_count,
  metadata,
  created_at,
  agent_id,
  domain,
  success_rate,
  updated_at
FROM test_patterns
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='test_patterns');

-- Drop test_patterns table
DROP TABLE IF EXISTS test_patterns;
```

**Code Changes**:
```typescript
// LearningStorePatternHandler (minimal changes)
- Use patterns table instead of test_patterns
- Update INSERT statement to include new columns
- Keep weighted averaging logic for updates

// SwarmMemoryManager
- No changes needed (backward compatible)
- Optional: Add helper methods for QE-specific fields
```

**Pros**:
- ✅ Unified pattern storage across all agents
- ✅ Backward compatible with Claude Flow
- ✅ Minimal code changes
- ✅ Maintains all QE-specific metadata
- ✅ Works with existing SwarmMemoryManager methods

**Cons**:
- ⚠️ Adds nullable columns to patterns table
- ⚠️ Requires database migration script

---

### Option B: Use Separate `learning_patterns` Table

**Rationale**: Keep QE learning patterns separate, clear separation of concerns

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS learning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL,
  domain TEXT NOT NULL DEFAULT 'general',
  usage_count INTEGER DEFAULT 1,
  success_rate REAL DEFAULT 1.0,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Foreign key to patterns table for shared patterns
  pattern_ref TEXT REFERENCES patterns(id),

  -- Indexes
  INDEX idx_learning_patterns_agent (agent_id),
  INDEX idx_learning_patterns_domain (domain),
  INDEX idx_learning_patterns_confidence (confidence)
)
```

**Code Changes**:
```typescript
// LearningStorePatternHandler
- Rename test_patterns to learning_patterns
- Add initialization to SwarmMemoryManager
- Implement cross-table queries

// SwarmMemoryManager
- Add createLearningPatternsTable() in initialize()
- Add queryLearningPatterns() method
- Add linkPatternToLearningPattern() method
```

**Pros**:
- ✅ Clear separation of QE learning patterns vs general patterns
- ✅ Richer metadata for learning-specific use cases
- ✅ No impact on existing patterns table
- ✅ Can link to shared patterns via pattern_ref

**Cons**:
- ❌ More complex data model
- ❌ Duplicate pattern storage possible
- ❌ Requires careful query coordination

---

### Option C: Hybrid Approach (Best of Both Worlds)

**Rationale**: Use `patterns` for storage, add `pattern_metadata` table for QE-specific data

**Schema**:
```sql
-- Use existing patterns table (no changes)

-- Add metadata extension table
CREATE TABLE IF NOT EXISTS pattern_metadata (
  pattern_id TEXT PRIMARY KEY REFERENCES patterns(id),
  agent_id TEXT,
  domain TEXT,
  success_rate REAL DEFAULT 1.0,
  learning_context TEXT,
  updated_at INTEGER NOT NULL,

  INDEX idx_pattern_metadata_agent (agent_id),
  INDEX idx_pattern_metadata_domain (domain)
)
```

**Code Changes**:
```typescript
// LearningStorePatternHandler
async handle(args: LearningPattern): Promise<HandlerResponse> {
  // 1. Store pattern in patterns table (using SwarmMemoryManager)
  const patternId = await this.memoryManager.storePattern({
    pattern: args.pattern,
    confidence: args.confidence,
    usageCount: args.usageCount || 1
  });

  // 2. Store QE-specific metadata in pattern_metadata table
  if (args.agentId || args.domain || args.successRate) {
    await this.storePatternMetadata({
      pattern_id: patternId,
      agent_id: args.agentId,
      domain: args.domain,
      success_rate: args.successRate,
      updated_at: Date.now()
    });
  }

  return { patternId, message: "Pattern stored successfully" };
}
```

**Pros**:
- ✅ Unified pattern storage (single source of truth)
- ✅ Backward compatible with Claude Flow
- ✅ Extensible metadata without altering core schema
- ✅ Clean separation of core vs QE-specific data
- ✅ Works with existing SwarmMemoryManager

**Cons**:
- ⚠️ Requires JOIN queries for full pattern data
- ⚠️ One additional table to manage

---

## Recommended Solution: Option A (Extend Existing `patterns` Table)

### Why Option A?

1. **Simplicity**: Minimal code changes, single table to query
2. **Compatibility**: Works with both Claude Flow and QE agents
3. **Performance**: No JOINs needed for pattern retrieval
4. **Pragmatic**: Adding nullable columns is common and well-supported
5. **Proven**: Similar approach used in `memory_entries` table with access control fields

### Implementation Priority

1. **High Priority** (Must Fix Immediately):
   - Create database migration script to add columns to `patterns` table
   - Update `LearningStorePatternHandler` to use `patterns` instead of `test_patterns`
   - Add integration tests for pattern storage and retrieval

2. **Medium Priority** (Fix in Next Sprint):
   - Update `SwarmMemoryManager` to expose QE-specific pattern queries
   - Add pattern search by `agent_id` and `domain`
   - Implement pattern quality metrics using `success_rate`

3. **Low Priority** (Nice to Have):
   - Add pattern recommendation engine based on `success_rate`
   - Implement pattern decay based on TTL and `updated_at`
   - Cross-agent pattern sharing and ranking

---

## Migration Strategy

### Phase 1: Database Schema Update

```typescript
// src/core/memory/migrations/001_add_pattern_metadata.ts
export async function migratePatternMetadata(db: Database): Promise<void> {
  console.log('Migrating patterns table to support QE metadata...');

  // Add new columns (SQLite doesn't support multiple ALTER in one statement)
  db.prepare('ALTER TABLE patterns ADD COLUMN agent_id TEXT').run();
  db.prepare('ALTER TABLE patterns ADD COLUMN domain TEXT').run();
  db.prepare('ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0').run();
  db.prepare('ALTER TABLE patterns ADD COLUMN updated_at INTEGER').run();

  // Create indexes for new columns
  db.prepare('CREATE INDEX IF NOT EXISTS idx_patterns_agent ON patterns(agent_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain)').run();

  // Migrate data from test_patterns if it exists
  const testPatternsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns'"
  ).get();

  if (testPatternsExists) {
    console.log('Migrating data from test_patterns to patterns...');

    db.prepare(`
      INSERT OR REPLACE INTO patterns (
        id, pattern, confidence, usage_count, metadata, created_at,
        agent_id, domain, success_rate, updated_at, ttl, expires_at
      )
      SELECT
        'pattern-' || id || '-migrated',
        pattern,
        confidence,
        usage_count,
        metadata,
        created_at,
        agent_id,
        domain,
        success_rate,
        updated_at,
        604800,  -- Default TTL: 7 days
        created_at + 604800000  -- Expires in 7 days from creation
      FROM test_patterns
    `).run();

    // Drop old table
    db.prepare('DROP TABLE test_patterns').run();
    console.log('✓ Migration complete: test_patterns dropped');
  }

  console.log('✓ Pattern metadata columns added successfully');
}
```

### Phase 2: Handler Updates

```typescript
// src/mcp/handlers/learning/learning-store-pattern.ts (updated)
export class LearningStorePatternHandler extends BaseHandler {
  async handle(args: LearningPattern): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const {
        agentId,
        pattern,
        confidence,
        domain = 'general',
        usageCount = 1,
        successRate = 1.0,
        metadata = {}
      } = args;

      // Validate inputs
      this.validateRequired(args, ['pattern', 'confidence']);

      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        throw new Error('confidence must be a number between 0 and 1');
      }

      // Get memory manager
      if (!this.memoryManager) {
        throw new Error('SwarmMemoryManager not initialized');
      }

      const db = (this.memoryManager as any).db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Check if pattern exists (by agent_id + pattern text)
      const existing = agentId ? db.prepare(`
        SELECT id, usage_count, success_rate, confidence
        FROM patterns
        WHERE agent_id = ? AND pattern = ?
      `).get(agentId, pattern) : undefined;

      let patternId: string;
      const now = Date.now();

      if (existing) {
        // Update existing pattern with weighted averaging
        const newUsageCount = existing.usage_count + usageCount;
        const weightedConfidence =
          (existing.confidence * existing.usage_count + confidence * usageCount) / newUsageCount;
        const weightedSuccessRate =
          (existing.success_rate * existing.usage_count + successRate * usageCount) / newUsageCount;

        db.prepare(`
          UPDATE patterns
          SET usage_count = ?, confidence = ?, success_rate = ?,
              metadata = ?, updated_at = ?
          WHERE id = ?
        `).run(
          newUsageCount,
          weightedConfidence,
          weightedSuccessRate,
          JSON.stringify(metadata),
          now,
          existing.id
        );

        patternId = existing.id;

        this.log('info', `Pattern updated: ${patternId}`, {
          agentId,
          domain,
          usageCount: newUsageCount,
          confidence: weightedConfidence,
          successRate: weightedSuccessRate
        });

      } else {
        // Insert new pattern into patterns table (NOT test_patterns)
        patternId = `pattern-${now}-${this.generateId()}`;

        db.prepare(`
          INSERT INTO patterns (
            id, pattern, confidence, usage_count, metadata, created_at,
            agent_id, domain, success_rate, updated_at, ttl, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          patternId,
          pattern,
          confidence,
          usageCount,
          JSON.stringify(metadata),
          now,
          agentId || null,
          domain,
          successRate,
          now,
          604800000,  // TTL: 7 days in milliseconds
          now + 604800000  // Expires in 7 days
        );

        this.log('info', `Pattern stored: ${patternId}`, {
          agentId,
          domain,
          confidence,
          usageCount,
          successRate
        });
      }

      return this.createSuccessResponse({
        patternId,
        message: `Pattern ${existing ? 'updated' : 'stored'} successfully${agentId ? ` for ${agentId}` : ''}`,
        pattern: {
          id: patternId,
          domain,
          confidence: existing ?
            (existing.confidence * existing.usage_count + confidence * usageCount) / (existing.usage_count + usageCount) :
            confidence,
          usageCount: existing ? existing.usage_count + usageCount : usageCount,
          successRate: existing ?
            (existing.success_rate * existing.usage_count + successRate * usageCount) / (existing.usage_count + usageCount) :
            successRate
        }
      }, requestId);
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}
```

### Phase 3: SwarmMemoryManager Extensions

```typescript
// src/core/memory/SwarmMemoryManager.ts (add methods)

/**
 * Query patterns by agent ID
 */
async queryPatternsByAgent(agentId: string, options?: {
  minConfidence?: number;
  domain?: string;
  limit?: number;
}): Promise<Pattern[]> {
  let sql = 'SELECT * FROM patterns WHERE agent_id = ?';
  const params: any[] = [agentId];

  if (options?.minConfidence !== undefined) {
    sql += ' AND confidence >= ?';
    params.push(options.minConfidence);
  }

  if (options?.domain) {
    sql += ' AND domain = ?';
    params.push(options.domain);
  }

  sql += ' ORDER BY confidence DESC, usage_count DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = this.queryAll(sql, params);
  return rows.map(this.parsePattern);
}

/**
 * Query patterns by domain
 */
async queryPatternsByDomain(domain: string, options?: {
  minConfidence?: number;
  minSuccessRate?: number;
  limit?: number;
}): Promise<Pattern[]> {
  let sql = 'SELECT * FROM patterns WHERE domain = ?';
  const params: any[] = [domain];

  if (options?.minConfidence !== undefined) {
    sql += ' AND confidence >= ?';
    params.push(options.minConfidence);
  }

  if (options?.minSuccessRate !== undefined) {
    sql += ' AND success_rate >= ?';
    params.push(options.minSuccessRate);
  }

  sql += ' ORDER BY success_rate DESC, confidence DESC, usage_count DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = this.queryAll(sql, params);
  return rows.map(this.parsePattern);
}

/**
 * Get top patterns across all agents
 */
async getTopPatterns(options?: {
  limit?: number;
  domain?: string;
  minSuccessRate?: number;
}): Promise<Pattern[]> {
  let sql = 'SELECT * FROM patterns WHERE 1=1';
  const params: any[] = [];

  if (options?.domain) {
    sql += ' AND domain = ?';
    params.push(options.domain);
  }

  if (options?.minSuccessRate !== undefined) {
    sql += ' AND success_rate >= ?';
    params.push(options.minSuccessRate);
  }

  sql += ' ORDER BY success_rate DESC, confidence DESC, usage_count DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit || 10);
  }

  const rows = this.queryAll(sql, params);
  return rows.map(this.parsePattern);
}

private parsePattern(row: any): Pattern {
  return {
    id: row.id,
    pattern: row.pattern,
    confidence: row.confidence,
    usageCount: row.usage_count,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    ttl: row.ttl,
    createdAt: row.created_at,
    // QE-specific fields (may be null)
    agentId: row.agent_id,
    domain: row.domain,
    successRate: row.success_rate,
    updatedAt: row.updated_at
  };
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/mcp/handlers/learning-store-pattern.test.ts
describe('LearningStorePatternHandler (Fixed)', () => {
  let handler: LearningStorePatternHandler;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager(':memory:');
    await memoryManager.initialize();

    // Run migration
    await migratePatternMetadata((memoryManager as any).db);

    handler = new LearningStorePatternHandler(undefined, undefined, memoryManager);
  });

  it('should store pattern in patterns table (not test_patterns)', async () => {
    const response = await handler.handle({
      agentId: 'test-gen-001',
      pattern: 'Use Jest for unit testing',
      confidence: 0.9,
      domain: 'test-generation',
      successRate: 0.95
    });

    expect(response.success).toBe(true);
    expect(response.data.patternId).toMatch(/^pattern-/);

    // Verify stored in patterns table
    const db = (memoryManager as any).db;
    const pattern = db.prepare('SELECT * FROM patterns WHERE id = ?').get(response.data.patternId);

    expect(pattern).toBeDefined();
    expect(pattern.pattern).toBe('Use Jest for unit testing');
    expect(pattern.agent_id).toBe('test-gen-001');
    expect(pattern.domain).toBe('test-generation');
    expect(pattern.success_rate).toBe(0.95);

    // Verify test_patterns table does NOT exist
    const testPatternsExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='test_patterns'"
    ).get();
    expect(testPatternsExists).toBeUndefined();
  });

  it('should update existing pattern with weighted averaging', async () => {
    // Store initial pattern
    const response1 = await handler.handle({
      agentId: 'test-gen-001',
      pattern: 'Use Jest for unit testing',
      confidence: 0.8,
      usageCount: 5,
      successRate: 0.9
    });

    // Store same pattern again (should update, not insert)
    const response2 = await handler.handle({
      agentId: 'test-gen-001',
      pattern: 'Use Jest for unit testing',
      confidence: 0.95,
      usageCount: 3,
      successRate: 1.0
    });

    expect(response2.success).toBe(true);
    expect(response2.data.pattern.usageCount).toBe(8); // 5 + 3

    // Weighted confidence: (0.8 * 5 + 0.95 * 3) / 8 = 0.856
    expect(response2.data.pattern.confidence).toBeCloseTo(0.856, 2);

    // Weighted success rate: (0.9 * 5 + 1.0 * 3) / 8 = 0.9375
    expect(response2.data.pattern.successRate).toBeCloseTo(0.9375, 2);
  });
});
```

### Integration Tests

```typescript
// tests/integration/learning-persistence.test.ts
describe('Learning Persistence Integration', () => {
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager('.agentic-qe/test-memory.db');
    await memoryManager.initialize();
    await migratePatternMetadata((memoryManager as any).db);
  });

  afterEach(async () => {
    await memoryManager.close();
    fs.unlinkSync('.agentic-qe/test-memory.db');
  });

  it('should store and retrieve patterns across agent restarts', async () => {
    // Agent 1: Store pattern
    const patternHandler = new LearningStorePatternHandler(undefined, undefined, memoryManager);
    const storeResponse = await patternHandler.handle({
      agentId: 'test-gen-001',
      pattern: 'Property-based testing for edge cases',
      confidence: 0.92,
      domain: 'advanced-testing',
      successRate: 0.88
    });

    expect(storeResponse.success).toBe(true);
    const patternId = storeResponse.data.patternId;

    // Simulate agent restart (close and reopen database)
    await memoryManager.close();

    const newMemoryManager = new SwarmMemoryManager('.agentic-qe/test-memory.db');
    await newMemoryManager.initialize();

    // Agent 2: Query patterns
    const patterns = await newMemoryManager.queryPatternsByDomain('advanced-testing');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe(patternId);
    expect(patterns[0].pattern).toBe('Property-based testing for edge cases');
    expect(patterns[0].agentId).toBe('test-gen-001');

    await newMemoryManager.close();
  });

  it('should work with Claude Code Task tool pattern', async () => {
    // Simulate Claude Code Task tool calling MCP handler
    const mcpResponse = await handler.handle({
      pattern: 'Generate tests using TDD approach',
      confidence: 0.85,
      domain: 'tdd',
      agentId: 'qe-test-generator',
      successRate: 0.9
    });

    expect(mcpResponse.success).toBe(true);

    // Verify pattern is queryable
    const patterns = await memoryManager.queryPatternsByAgent('qe-test-generator');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].domain).toBe('tdd');
  });
});
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Review and approve migration script
- [ ] Backup existing `.agentic-qe/memory.db`
- [ ] Test migration on copy of production database
- [ ] Update handler tests to use `patterns` table
- [ ] Update integration tests to verify pattern persistence

### Deployment

- [ ] Run database migration script
- [ ] Deploy updated handler code
- [ ] Verify no `test_patterns` table exists
- [ ] Test pattern storage via MCP tools
- [ ] Test pattern retrieval via SwarmMemoryManager

### Post-Deployment

- [ ] Monitor pattern storage success rate
- [ ] Verify Claude Flow patterns still work
- [ ] Check pattern query performance
- [ ] Document new pattern metadata fields
- [ ] Update API documentation

---

## Conclusion

The investigation reveals a **clear root cause**: `LearningStorePatternHandler` creates and uses a separate `test_patterns` table instead of the existing `patterns` table shared with Claude Flow.

**Recommended Solution**: Extend the existing `patterns` table with QE-specific metadata columns (`agent_id`, `domain`, `success_rate`, `updated_at`) and update handlers to use this unified table.

**Expected Outcome**:
- ✅ Unified pattern storage across QE and Claude Flow agents
- ✅ Learning patterns persist correctly with Claude Code Task tool
- ✅ Backward compatible with existing Claude Flow patterns
- ✅ No data loss or fragmentation
- ✅ Improved pattern discovery and reuse across agents

**Estimated Effort**:
- Migration script: 2 hours
- Handler updates: 3 hours
- Testing: 4 hours
- Total: 1-2 days

---

## Next Steps

1. **Immediate**: Implement Option A (extend `patterns` table)
2. **Short-term**: Add pattern quality metrics and search
3. **Long-term**: Implement pattern recommendation engine based on success rates
