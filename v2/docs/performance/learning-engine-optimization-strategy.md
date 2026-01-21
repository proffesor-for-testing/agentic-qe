# LearningEngine Performance Optimization Strategy

## Issue #52: O(n) Pattern Query Performance

**Date**: 2025-11-17
**Agent**: Performance Validator Subagent
**Status**: Implementation Ready

## Problem Analysis

### Critical Performance Bottleneck Identified

**Location**: `src/core/memory/SwarmMemoryManager.ts:1229-1259`

```typescript
async queryPatternsByAgent(agentId: string, minConfidence: number = 0): Promise<Pattern[]> {
  const rows = await this.queryAll<any>(
    `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
     FROM patterns
     WHERE confidence >= ?
       AND (expires_at IS NULL OR expires_at > ?)
       AND (metadata LIKE ? OR metadata LIKE ?)  // ⚠️ FULL TABLE SCAN
     ORDER BY confidence DESC`,
    [
      minConfidence,
      now,
      `%"agent_id":"${agentId}"%`,    // ⚠️ JSON SEARCH IN TEXT
      `%"agentId":"${agentId}"%`      // ⚠️ JSON SEARCH IN TEXT
    ]
  );
}
```

### Performance Issues

1. **Full Table Scan**: `LIKE '%..%'` pattern cannot use indexes
2. **JSON Text Search**: Searching JSON strings in metadata column (O(n×m) complexity)
3. **Multiple Metadata Formats**: Checking both `agent_id` and `agentId` variants
4. **No Agent-Specific Index**: Pattern table has no direct agent_id column
5. **Called Frequently**: Invoked on every pattern update in LearningEngine (lines 535, 599-611)

### Current Performance

- **Complexity**: O(n×m) where n = pattern count, m = average metadata size
- **Impact**: Degrades linearly with pattern database growth
- **Worst Case**: 10,000 patterns × 500 char metadata = 5M character scans per query

## Optimization Strategy

### Phase 1: Database Schema Migration (CRITICAL)

**Add dedicated agent_id column**

```sql
-- Migration: Add agent_id column
ALTER TABLE patterns ADD COLUMN agent_id TEXT;

-- Backfill from existing metadata
UPDATE patterns
SET agent_id = json_extract(metadata, '$.agent_id')
WHERE agent_id IS NULL AND json_valid(metadata);

-- Create composite index for O(log n) lookups
CREATE INDEX idx_patterns_agent_confidence
ON patterns(agent_id, confidence DESC, expires_at);

-- Single-column fallback index
CREATE INDEX idx_patterns_agent
ON patterns(agent_id);
```

**Performance Improvement**: O(n×m) → O(log n)

### Phase 2: Query Optimization

**Before (O(n×m))**:
```sql
WHERE metadata LIKE '%"agent_id":"xyz"%'
```

**After (O(log n))**:
```sql
WHERE agent_id = 'xyz'
  AND confidence >= 0.5
  AND (expires_at IS NULL OR expires_at > ?)
```

**Index Usage**:
- `idx_patterns_agent_confidence` covers entire query
- No table scan required
- Sorted by confidence (no ORDER BY overhead)

### Phase 3: In-Memory Caching

**LRU Cache for Hot Patterns**

```typescript
class PatternCache {
  private cache = new Map<string, {patterns: Pattern[], timestamp: number}>();
  private maxSize = 100;
  private ttl = 60000; // 60 seconds

  get(key: string): Pattern[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.patterns;
  }

  set(key: string, patterns: Pattern[]): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      patterns,
      timestamp: Date.now()
    });
  }
}
```

**Cache Key Format**: `patterns:${agentId}:${minConfidence}`

### Phase 4: Batch Operations

**Optimize updatePatterns() in LearningEngine**

```typescript
// Before: Query on every pattern update
const agentPatterns = await this.memoryStore.queryPatternsByAgent(this.agentId, 0);

// After: Batch queries
private patternUpdateQueue: TaskExperience[] = [];

private async flushPatternUpdates(): Promise<void> {
  if (this.patternUpdateQueue.length === 0) return;

  // Single query for all patterns
  const agentPatterns = await this.memoryStore.queryPatternsByAgent(this.agentId, 0);
  const patternMap = new Map(agentPatterns.map(p => [p.pattern, p]));

  // Batch process all updates
  for (const exp of this.patternUpdateQueue) {
    const key = `${exp.taskType}:${exp.action.strategy}`;
    const existing = patternMap.get(key);
    // ... update logic
  }

  this.patternUpdateQueue = [];
}
```

## Implementation Plan

### Step 1: Schema Migration Script

**File**: `scripts/migrations/add-pattern-agent-id.ts`

```typescript
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

export async function migratePatternSchema() {
  const manager = new SwarmMemoryManager({ dbPath: '.agentic-qe/agentdb.db' });
  await manager.initialize();

  console.log('Adding agent_id column...');
  await manager.run(`ALTER TABLE patterns ADD COLUMN agent_id TEXT`);

  console.log('Backfilling agent_id from metadata...');
  await manager.run(`
    UPDATE patterns
    SET agent_id = json_extract(metadata, '$.agent_id')
    WHERE agent_id IS NULL AND json_valid(metadata)
  `);

  console.log('Creating composite index...');
  await manager.run(`
    CREATE INDEX IF NOT EXISTS idx_patterns_agent_confidence
    ON patterns(agent_id, confidence DESC, expires_at)
  `);

  console.log('Creating agent index...');
  await manager.run(`
    CREATE INDEX IF NOT EXISTS idx_patterns_agent
    ON patterns(agent_id)
  `);

  console.log('Migration complete!');
  await manager.close();
}
```

### Step 2: Update storePattern Method

**File**: `src/core/memory/SwarmMemoryManager.ts`

```typescript
async storePattern(pattern: Pattern): Promise<string> {
  // Extract agent_id from metadata
  const agentId = pattern.metadata?.agent_id || pattern.metadata?.agentId || null;

  await this.run(
    `INSERT OR REPLACE INTO patterns
     (id, pattern, confidence, usage_count, metadata, ttl, expires_at, created_at, agent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      pattern.pattern,
      pattern.confidence,
      pattern.usageCount || 0,
      metadata,
      pattern.ttl || this.TTL_POLICY.patterns,
      expiresAt,
      now,
      agentId  // Add agent_id column
    ]
  );
}
```

### Step 3: Optimize queryPatternsByAgent

**File**: `src/core/memory/SwarmMemoryManager.ts`

```typescript
async queryPatternsByAgent(agentId: string, minConfidence: number = 0): Promise<Pattern[]> {
  if (!this.db) {
    throw new Error('Memory manager not initialized');
  }

  const now = Date.now();

  // O(log n) query using agent_id index
  const rows = await this.queryAll<any>(
    `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at, agent_id
     FROM patterns
     WHERE agent_id = ?
       AND confidence >= ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY confidence DESC`,
    [agentId, minConfidence, now]
  );

  return rows.map((row: any) => ({
    id: row.id,
    pattern: row.pattern,
    confidence: row.confidence,
    usageCount: row.usage_count,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    ttl: row.ttl,
    createdAt: row.created_at
  }));
}
```

### Step 4: Add Pattern Cache

**File**: `src/core/memory/PatternCache.ts` (new)

```typescript
export class PatternCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number;

  constructor(options: { maxSize?: number; ttl?: number } = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 60000; // 1 minute
  }

  get(key: string): Pattern[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.patterns;
  }

  set(key: string, patterns: Pattern[]): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      patterns,
      timestamp: Date.now()
    });
  }

  invalidate(agentId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`patterns:${agentId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // TODO: track hits/misses
      ttl: this.ttl
    };
  }
}

interface CacheEntry {
  patterns: Pattern[];
  timestamp: number;
}

interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  ttl: number;
}
```

### Step 5: Integrate Cache in SwarmMemoryManager

```typescript
export class SwarmMemoryManager {
  private patternCache: PatternCache;

  constructor(config: MemoryConfig = {}) {
    // ...
    this.patternCache = new PatternCache({
      maxSize: config.cacheSize || 100,
      ttl: config.cacheTTL || 60000
    });
  }

  async queryPatternsByAgent(agentId: string, minConfidence: number = 0): Promise<Pattern[]> {
    // Check cache first
    const cacheKey = `patterns:${agentId}:${minConfidence}`;
    const cached = this.patternCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const patterns = await this.queryPatternsByAgentUncached(agentId, minConfidence);

    // Cache result
    this.patternCache.set(cacheKey, patterns);

    return patterns;
  }

  async storePattern(pattern: Pattern): Promise<string> {
    const id = await this.storePatternUncached(pattern);

    // Invalidate cache for this agent
    const agentId = pattern.metadata?.agent_id || pattern.metadata?.agentId;
    if (agentId) {
      this.patternCache.invalidate(agentId);
    }

    return id;
  }
}
```

## Performance Benchmarks

### Test Script

**File**: `tests/performance/pattern-query-benchmark.ts`

```typescript
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

async function benchmark() {
  const manager = new SwarmMemoryManager();
  await manager.initialize();

  // Seed database with patterns
  const agentIds = ['agent-1', 'agent-2', 'agent-3'];
  const patternCounts = [100, 1000, 10000, 50000];

  for (const count of patternCounts) {
    console.log(`\n=== Testing with ${count} patterns ===`);

    // Seed
    await seedPatterns(manager, agentIds, count);

    // Benchmark queries
    for (const agentId of agentIds) {
      const start = performance.now();
      const patterns = await manager.queryPatternsByAgent(agentId);
      const duration = performance.now() - start;

      console.log(`Query ${agentId}: ${duration.toFixed(2)}ms (${patterns.length} patterns)`);
    }

    // Clear cache and test again
    console.log('\n--- Without cache ---');
    manager.clearCache();

    for (const agentId of agentIds) {
      const start = performance.now();
      const patterns = await manager.queryPatternsByAgent(agentId);
      const duration = performance.now() - start;

      console.log(`Query ${agentId}: ${duration.toFixed(2)}ms (${patterns.length} patterns)`);
    }
  }
}
```

### Expected Results

| Pattern Count | Before (ms) | After (ms) | Improvement |
|--------------|-------------|------------|-------------|
| 100          | 15          | 0.5        | 30×         |
| 1,000        | 85          | 1.2        | 70×         |
| 10,000       | 650         | 3.5        | 185×        |
| 50,000       | 3,200       | 8.0        | 400×        |

**With Cache (2nd query)**:
- 100 patterns: 0.05ms
- 10,000 patterns: 0.05ms
- 50,000 patterns: 0.05ms

## Rollout Plan

### Phase 1: Migration (Zero Downtime)
1. Run migration script on existing database
2. Verify indexes created successfully
3. Backfill agent_id column

### Phase 2: Code Update (Backward Compatible)
1. Update `storePattern` to include agent_id
2. Update `queryPatternsByAgent` to use new column
3. Keep old LIKE fallback for unmigrated data

### Phase 3: Cache Integration
1. Add PatternCache class
2. Integrate into SwarmMemoryManager
3. Add cache invalidation on pattern updates

### Phase 4: Monitoring
1. Add performance metrics logging
2. Track cache hit rates
3. Monitor query latencies

## Verification Checklist

- [x] Full table scan identified (metadata LIKE query)
- [x] Schema migration designed (agent_id column)
- [x] Composite index planned (agent_id, confidence, expires_at)
- [x] Cache strategy defined (LRU with 60s TTL)
- [x] Benchmark tests designed
- [ ] Migration script implemented
- [ ] Optimized queries implemented
- [ ] Cache integrated
- [ ] Benchmarks run
- [ ] Performance verified (>100× improvement)

## Risk Mitigation

### Backward Compatibility
- Migration preserves existing metadata
- Old queries still work (LIKE fallback)
- agent_id column nullable (doesn't break existing code)

### Data Integrity
- Backfill from metadata ensures consistency
- UNIQUE constraint on pattern prevents duplicates
- TTL/expiration logic unchanged

### Performance Regression
- Indexes improve all pattern queries
- Cache is optional (can be disabled)
- LRU eviction prevents memory bloat

## Success Metrics

1. **Query Performance**: <5ms for 10,000 patterns (vs 650ms)
2. **Cache Hit Rate**: >80% for repeated queries
3. **Memory Usage**: <10MB for 100 cached entries
4. **Zero Regressions**: All existing tests pass

## References

- Issue: #52
- Files Modified:
  - `src/core/memory/SwarmMemoryManager.ts`
  - `src/core/memory/PatternCache.ts` (new)
  - `src/learning/LearningEngine.ts` (cache integration)
- Migration: `scripts/migrations/add-pattern-agent-id.ts`
- Benchmarks: `tests/performance/pattern-query-benchmark.ts`
