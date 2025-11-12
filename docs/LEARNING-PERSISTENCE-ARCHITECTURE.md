# Learning Persistence Architecture Diagrams

## Current (Broken) Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code Task Tool                        │
│  Task("Store pattern", "...", "qe-test-generator")                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP Tool: learning_store_pattern                  │
│  mcp__agentic_qe__learning_store_pattern({                          │
│    pattern: "...", confidence: 0.9, domain: "test-gen"              │
│  })                                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              LearningStorePatternHandler.handle()                    │
│                                                                       │
│  1. Check: Does test_patterns table exist?                           │
│     ❌ NO → Create test_patterns table dynamically                   │
│                                                                       │
│  2. INSERT INTO test_patterns (...)                                  │
│     VALUES (agent_id, pattern, confidence, domain, ...)              │
│                                                                       │
│  3. ✅ Return success                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  .agentic-qe/memory.db                               │
│                                                                       │
│  ┌────────────────────┐          ┌────────────────────┐             │
│  │   patterns         │          │  test_patterns     │             │
│  │  (empty, 0 rows)   │          │  (dynamically      │             │
│  │                    │          │   created)         │             │
│  │  - id              │          │  - id              │             │
│  │  - pattern         │          │  - agent_id  ✅    │             │
│  │  - confidence      │          │  - pattern         │             │
│  │  - usage_count     │          │  - confidence      │             │
│  │  - metadata        │          │  - domain    ✅    │             │
│  │  - ttl             │          │  - usage_count     │             │
│  │  - created_at      │          │  - success_rate ✅ │             │
│  │                    │          │  - metadata        │             │
│  │  ❌ NOT USED       │          │  - created_at      │             │
│  │     BY QE AGENTS   │          │  - updated_at ✅   │             │
│  └────────────────────┘          └────────────────────┘             │
│         ▲                                 ▲                          │
│         │                                 │                          │
│         │                                 │                          │
│    Used by                           Used by                         │
│  Claude Flow                      QE Learning                        │
│    Agents                            Handlers                        │
│  (13 patterns)                    (creates table)                    │
│   ✅ WORKS                          ⚠️ FRAGMENTED                    │
└─────────────────────────────────────────────────────────────────────┘

PROBLEMS:
❌ Two separate pattern tables with different schemas
❌ No integration between patterns and test_patterns
❌ Claude Flow uses patterns, QE agents use test_patterns
❌ SwarmMemoryManager.queryPatterns() doesn't see QE patterns
❌ Data fragmentation prevents pattern reuse across agents
```

---

## Proposed (Fixed) Architecture - Option A

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code Task Tool                        │
│  Task("Store pattern", "...", "qe-test-generator")                  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP Tool: learning_store_pattern                  │
│  mcp__agentic_qe__learning_store_pattern({                          │
│    pattern: "...", confidence: 0.9, domain: "test-gen",             │
│    agentId: "qe-test-generator", successRate: 0.95                  │
│  })                                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│         LearningStorePatternHandler.handle() [UPDATED]               │
│                                                                       │
│  1. Check: Does pattern exist for this agent?                        │
│     SELECT * FROM patterns                                           │
│     WHERE agent_id = ? AND pattern = ?                               │
│                                                                       │
│  2. If EXISTS:                                                       │
│     UPDATE patterns SET                                              │
│       confidence = weighted_avg(...),                                │
│       success_rate = weighted_avg(...),                              │
│       usage_count = usage_count + ?                                  │
│                                                                       │
│  3. Else:                                                            │
│     INSERT INTO patterns (                                           │
│       id, pattern, confidence, usage_count,                          │
│       agent_id, domain, success_rate, updated_at, ...                │
│     ) VALUES (...)                                                   │
│                                                                       │
│  4. ✅ Return success with pattern ID                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  .agentic-qe/memory.db                               │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              patterns (UNIFIED TABLE)                         │   │
│  │                                                               │   │
│  │  Core Columns (used by Claude Flow):                         │   │
│  │  - id TEXT PRIMARY KEY                                        │   │
│  │  - pattern TEXT NOT NULL                                      │   │
│  │  - confidence REAL NOT NULL                                   │   │
│  │  - usage_count INTEGER DEFAULT 0                             │   │
│  │  - metadata TEXT                                              │   │
│  │  - ttl INTEGER DEFAULT 604800                                │   │
│  │  - expires_at INTEGER                                         │   │
│  │  - created_at INTEGER NOT NULL                               │   │
│  │                                                               │   │
│  │  QE Extensions (nullable, backward compatible):              │   │
│  │  - agent_id TEXT               ✅ NEW                         │   │
│  │  - domain TEXT                 ✅ NEW                         │   │
│  │  - success_rate REAL           ✅ NEW                         │   │
│  │  - updated_at INTEGER          ✅ NEW                         │   │
│  │                                                               │   │
│  │  Indexes:                                                     │   │
│  │  - idx_patterns_confidence                                    │   │
│  │  - idx_patterns_agent (NEW)                                   │   │
│  │  - idx_patterns_domain (NEW)                                  │   │
│  │                                                               │   │
│  │  Sample Data:                                                 │   │
│  │  ┌────────────┬─────────────┬──────────┬───────────────┐     │   │
│  │  │ id         │ pattern     │ conf.    │ agent_id      │     │   │
│  │  ├────────────┼─────────────┼──────────┼───────────────┤     │   │
│  │  │ pattern-1  │ Jest fix... │ 0.95     │ NULL          │     │   │
│  │  │ pattern-2  │ Swarm mem.. │ 0.98     │ NULL          │     │   │
│  │  │ pattern-3  │ TDD approach│ 0.90     │ qe-test-gen   │     │   │
│  │  │ pattern-4  │ Edge cases..│ 0.92     │ qe-coverage   │     │   │
│  │  └────────────┴─────────────┴──────────┴───────────────┘     │   │
│  │                                                               │   │
│  │  ✅ Used by Claude Flow (legacy patterns, agent_id = NULL)   │   │
│  │  ✅ Used by QE Learning (new patterns with QE metadata)      │   │
│  │  ✅ Unified queries via SwarmMemoryManager                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ▲                                        │
│                              │                                        │
│                     ┌────────┴─────────┐                             │
│                     │                  │                             │
│            Claude Flow Agents    QE Learning Agents                  │
│            (13 existing)         (new patterns)                      │
│            ✅ Still works        ✅ Now works!                        │
└─────────────────────────────────────────────────────────────────────┘

BENEFITS:
✅ Single source of truth for all patterns
✅ Backward compatible with Claude Flow
✅ QE-specific metadata (agent_id, domain, success_rate)
✅ Unified pattern queries across all agents
✅ Pattern reuse between Claude Flow and QE agents
✅ Weighted averaging for pattern confidence
✅ Success rate tracking for quality metrics
```

---

## Query Flow Comparison

### Before (Broken)

```
Agent: "Find patterns for test generation"
         ↓
SwarmMemoryManager.queryPatternsByDomain("test-generation")
         ↓
SELECT * FROM patterns WHERE domain = 'test-generation'
         ↓
Result: [] (empty, no patterns found)
         ❌ FAILS: QE patterns in separate test_patterns table

Agent: "Find patterns by agent qe-test-generator"
         ↓
SwarmMemoryManager.queryPatternsByAgent("qe-test-generator")
         ↓
ERROR: No such method (patterns table has no agent_id column)
         ❌ FAILS: Method doesn't exist
```

### After (Fixed)

```
Agent: "Find patterns for test generation"
         ↓
SwarmMemoryManager.queryPatternsByDomain("test-generation")
         ↓
SELECT * FROM patterns WHERE domain = 'test-generation'
         ↓
Result: [
  { id: "pattern-3", pattern: "TDD approach", confidence: 0.90,
    agent_id: "qe-test-gen", domain: "test-generation", success_rate: 0.95 },
  { id: "pattern-5", pattern: "Property-based testing", confidence: 0.88,
    agent_id: "qe-coverage", domain: "test-generation", success_rate: 0.92 }
]
         ✅ SUCCESS: Finds QE patterns with metadata

Agent: "Find patterns by agent qe-test-generator"
         ↓
SwarmMemoryManager.queryPatternsByAgent("qe-test-generator")
         ↓
SELECT * FROM patterns WHERE agent_id = 'qe-test-generator'
  ORDER BY success_rate DESC, confidence DESC
         ↓
Result: [
  { id: "pattern-3", pattern: "TDD approach", confidence: 0.90,
    success_rate: 0.95, usage_count: 12 },
  { id: "pattern-7", pattern: "Mock external APIs", confidence: 0.85,
    success_rate: 0.88, usage_count: 8 }
]
         ✅ SUCCESS: Agent-specific patterns with quality metrics
```

---

## Learning Workflow Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│              QE Agent Learning Lifecycle                             │
└─────────────────────────────────────────────────────────────────────┘

1. TASK EXECUTION
   ┌────────────────────────────────────────┐
   │  Agent executes task                   │
   │  - Test generation                     │
   │  - Coverage analysis                   │
   │  - Performance testing                 │
   └────────────────┬───────────────────────┘
                    │
                    ▼
2. EXPERIENCE STORAGE (learning_experiences table)
   ┌────────────────────────────────────────┐
   │  Store learning experience:            │
   │  - state: "test-generation-unit"       │
   │  - action: "generated 10 tests"        │
   │  - reward: 0.85 (success metric)       │
   │  - next_state: "tests-passing"         │
   └────────────────┬───────────────────────┘
                    │
                    ▼
3. Q-VALUE UPDATE (q_values table)
   ┌────────────────────────────────────────┐
   │  Update Q-value for state-action:      │
   │  - state_key: "test-generation-unit"   │
   │  - action_key: "jest-framework"        │
   │  - q_value: weighted_avg(0.80, 0.85)   │
   │  - update_count: increment             │
   └────────────────┬───────────────────────┘
                    │
                    ▼
4. PATTERN EXTRACTION (patterns table - UNIFIED!)
   ┌────────────────────────────────────────┐
   │  If reward > 0.8:                      │
   │    Store successful pattern:           │
   │    - pattern: "Use Jest for unit tests"│
   │    - confidence: 0.85                  │
   │    - agent_id: "qe-test-generator"     │
   │    - domain: "test-generation"         │
   │    - success_rate: 0.85                │
   └────────────────┬───────────────────────┘
                    │
                    ▼
5. PATTERN REUSE (SwarmMemoryManager queries)
   ┌────────────────────────────────────────┐
   │  Other agents query patterns:          │
   │  - queryPatternsByDomain()             │
   │  - queryPatternsByAgent()              │
   │  - getTopPatterns()                    │
   │                                        │
   │  ✅ All patterns accessible!           │
   │  ✅ Cross-agent learning enabled!      │
   └────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 Claude Flow Pattern Storage                          │
│                  (Existing, Still Works)                             │
└─────────────────────────────────────────────────────────────────────┘

   SwarmMemoryManager.storePattern({
     pattern: "Jest environment fix...",
     confidence: 0.95,
     usageCount: 1
   })
        │
        ▼
   INSERT INTO patterns (id, pattern, confidence, usage_count, ...)
        │
        ▼
   ✅ Stored in same patterns table
   ✅ agent_id = NULL (not QE-specific)
   ✅ Queryable by all agents
   ✅ Backward compatible
```

---

## Migration Process Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Database Migration Steps                          │
└─────────────────────────────────────────────────────────────────────┘

STEP 1: Backup Existing Database
   ┌────────────────────────────────────────┐
   │  cp .agentic-qe/memory.db              │
   │     .agentic-qe/memory.db.backup       │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 2: Add New Columns to patterns Table
   ┌────────────────────────────────────────┐
   │  ALTER TABLE patterns                  │
   │    ADD COLUMN agent_id TEXT;           │
   │  ALTER TABLE patterns                  │
   │    ADD COLUMN domain TEXT;             │
   │  ALTER TABLE patterns                  │
   │    ADD COLUMN success_rate REAL        │
   │      DEFAULT 1.0;                      │
   │  ALTER TABLE patterns                  │
   │    ADD COLUMN updated_at INTEGER;      │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 3: Create Indexes for Performance
   ┌────────────────────────────────────────┐
   │  CREATE INDEX idx_patterns_agent       │
   │    ON patterns(agent_id);              │
   │  CREATE INDEX idx_patterns_domain      │
   │    ON patterns(domain);                │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 4: Migrate Data from test_patterns (if exists)
   ┌────────────────────────────────────────┐
   │  INSERT INTO patterns (                │
   │    id, pattern, confidence, ...,       │
   │    agent_id, domain, success_rate, ... │
   │  )                                     │
   │  SELECT                                │
   │    'pattern-' || id || '-migrated',    │
   │    pattern, confidence, ...,           │
   │    agent_id, domain, success_rate, ... │
   │  FROM test_patterns;                   │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 5: Drop test_patterns Table
   ┌────────────────────────────────────────┐
   │  DROP TABLE IF EXISTS test_patterns;   │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 6: Verify Migration
   ┌────────────────────────────────────────┐
   │  SELECT COUNT(*) FROM patterns         │
   │    WHERE agent_id IS NOT NULL;         │
   │                                        │
   │  SELECT COUNT(*) FROM patterns         │
   │    WHERE agent_id IS NULL;             │
   │                                        │
   │  PRAGMA table_info(patterns);          │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 7: Update Handler Code
   ┌────────────────────────────────────────┐
   │  LearningStorePatternHandler:          │
   │  - Use patterns table                  │
   │  - Include agent_id, domain, etc.      │
   │  - Remove test_patterns references     │
   └────────────────┬───────────────────────┘
                    │
                    ▼
STEP 8: Deploy and Test
   ┌────────────────────────────────────────┐
   │  1. Run integration tests              │
   │  2. Test MCP pattern storage           │
   │  3. Test pattern queries               │
   │  4. Verify Claude Flow patterns work   │
   │  5. Monitor production usage           │
   └────────────────────────────────────────┘

✅ Migration Complete
✅ Zero downtime
✅ Backward compatible
✅ All patterns unified
```

---

## Performance Considerations

### Query Performance

```
Before (Fragmented):
  Query all patterns → Check 2 tables → Merge results
  Time: O(n + m) where n = patterns rows, m = test_patterns rows

After (Unified):
  Query all patterns → Single table scan with indexes
  Time: O(n) where n = patterns rows
  Index: idx_patterns_agent, idx_patterns_domain, idx_patterns_confidence
```

### Storage Efficiency

```
Before:
  patterns: 8 columns × 13 rows = 104 cells (mostly empty)
  test_patterns: 10 columns × 0 rows = 0 cells (created dynamically)
  Total: 104 cells + fragmentation overhead

After:
  patterns: 12 columns × 13 rows = 156 cells
  4 extra columns (agent_id, domain, success_rate, updated_at)
  Most cells NULL for legacy patterns (minimal overhead)
  Total: 156 cells, unified storage, better cache locality
```

### Scalability

```
Current Workload:
  - 13 Claude Flow patterns
  - 0 QE learning patterns (broken)
  - ~1 pattern stored per agent execution

Expected Growth (3 months):
  - 13 legacy patterns (unchanged)
  - ~1000 QE learning patterns (10 agents × 100 patterns)
  - Total: ~1013 patterns in unified table

Performance with Indexes:
  - Agent lookup: O(log n) via idx_patterns_agent
  - Domain lookup: O(log n) via idx_patterns_domain
  - Confidence filter: O(log n) via idx_patterns_confidence
  - Top N patterns: O(log n + N) with combined index

Expected Query Time:
  - Single pattern by ID: <1ms
  - Domain search: <5ms for 100 patterns
  - Top 10 patterns: <10ms with confidence sort
```

---

## Rollback Plan

If migration fails or causes issues:

```
ROLLBACK STEP 1: Stop Application
   systemctl stop agentic-qe-service

ROLLBACK STEP 2: Restore Backup
   cp .agentic-qe/memory.db.backup \
      .agentic-qe/memory.db

ROLLBACK STEP 3: Revert Code Changes
   git checkout HEAD~1 src/mcp/handlers/learning/

ROLLBACK STEP 4: Restart Application
   systemctl start agentic-qe-service

ROLLBACK STEP 5: Verify
   - Check Claude Flow patterns still work
   - Verify QE agents can execute (may fail on pattern storage)
   - Monitor logs for errors

ROLLBACK TIME: <5 minutes
DATA LOSS: None (backup restored)
```

---

## Success Metrics

### Before Migration
- ❌ QE patterns: 0 stored
- ❌ Pattern reuse: Not possible
- ❌ Cross-agent learning: Disabled
- ❌ Handler success rate: 0% (test_patterns doesn't exist)

### After Migration (Expected)
- ✅ QE patterns: Growing with each agent execution
- ✅ Pattern reuse: All agents can query patterns
- ✅ Cross-agent learning: Enabled via unified table
- ✅ Handler success rate: 100% (patterns table always exists)
- ✅ Query performance: <10ms for domain searches
- ✅ Backward compatibility: Claude Flow patterns unaffected

### Monitoring

```sql
-- Daily pattern growth
SELECT COUNT(*) as total_patterns,
       COUNT(CASE WHEN agent_id IS NOT NULL THEN 1 END) as qe_patterns,
       COUNT(CASE WHEN agent_id IS NULL THEN 1 END) as claude_flow_patterns
FROM patterns;

-- Top performing patterns
SELECT agent_id, domain, AVG(success_rate) as avg_success
FROM patterns
WHERE agent_id IS NOT NULL
GROUP BY agent_id, domain
ORDER BY avg_success DESC;

-- Pattern usage over time
SELECT DATE(created_at/1000, 'unixepoch') as date,
       COUNT(*) as patterns_created
FROM patterns
WHERE agent_id IS NOT NULL
GROUP BY date
ORDER BY date DESC
LIMIT 30;
```

---

## Conclusion

The unified `patterns` table architecture provides:

1. **Simplicity**: One table for all patterns
2. **Compatibility**: Works with both Claude Flow and QE agents
3. **Performance**: Indexed queries for fast retrieval
4. **Extensibility**: QE metadata without breaking changes
5. **Scalability**: Handles 1000+ patterns efficiently

**Next Steps**: Execute migration plan and deploy updated handlers.
