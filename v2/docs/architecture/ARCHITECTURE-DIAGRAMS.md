# Learning System Architecture - Visual Diagrams

**Version**: 1.4.0
**Date**: 2025-10-31

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AGENTIC QE FLEET                                │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         18 QE Agents                                │ │
│  │                                                                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │Test Gen  │  │Coverage  │  │Flaky Test│  │Security  │  ... (14) │ │
│  │  │Agent     │  │Analyzer  │  │Hunter    │  │Scanner   │          │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │ │
│  │       │             │             │             │                  │ │
│  │       └─────────────┴─────────────┴─────────────┘                  │ │
│  │                            │                                        │ │
│  │                    ┌───────▼────────┐                              │ │
│  │                    │   BaseAgent    │                              │ │
│  │                    │   (Lifecycle)  │                              │ │
│  │                    └───────┬────────┘                              │ │
│  └────────────────────────────┼─────────────────────────────────────┘ │
│                                │                                        │
│  ┌─────────────────────────────┼────────────────────────────────────┐ │
│  │         LEARNING SYSTEM LAYER                                     │ │
│  │                              │                                     │ │
│  │         ┌────────────────────┴────────────────────┐              │ │
│  │         │                                          │              │ │
│  │  ┌──────▼──────────┐                  ┌───────────▼──────────┐  │ │
│  │  │ LearningEngine  │                  │ QEReasoningBank     │  │ │
│  │  │ ───────────────│                  │ ─────────────────── │  │ │
│  │  │ • Q-Learning    │                  │ • Pattern Storage   │  │ │
│  │  │ • Experience    │                  │ • Vector Search     │  │ │
│  │  │   Replay        │                  │ • Quality Scoring   │  │ │
│  │  │ • Strategy      │                  │ • Usage Tracking    │  │ │
│  │  │   Selection     │                  │ • Version History   │  │ │
│  │  └──────┬──────────┘                  └───────────┬─────────┘  │ │
│  │         │                                          │             │ │
│  └─────────┼──────────────────────────────────────────┼────────────┘ │
│            │                                          │               │
│  ┌─────────┼──────────────────────────────────────────┼────────────┐ │
│  │    PERSISTENCE LAYER                                            │ │
│  │         │                                          │             │ │
│  │         └──────────────┬───────────────────────────┘             │ │
│  │                        │                                         │ │
│  │              ┌─────────▼─────────┐                              │ │
│  │              │   Database.ts     │                              │ │
│  │              │   (SQLite)        │                              │ │
│  │              └─────────┬─────────┘                              │ │
│  │                        │                                         │ │
│  │         ┌──────────────┴──────────────┐                         │ │
│  │         │                              │                         │ │
│  │  ┌──────▼──────┐              ┌───────▼────────┐               │ │
│  │  │ Patterns    │              │ Learning       │               │ │
│  │  │ Database    │              │ Database       │               │ │
│  │  │             │              │                │               │ │
│  │  │ • patterns  │              │ • learning_    │               │ │
│  │  │ • pattern_  │              │   history      │               │ │
│  │  │   usage     │              │ • q_values     │               │ │
│  │  │ • pattern_  │              │ • learned_     │               │ │
│  │  │   versions  │              │   patterns     │               │ │
│  │  │ • patterns_ │              │ • failure_     │               │ │
│  │  │   fts       │              │   patterns     │               │ │
│  │  └─────────────┘              └────────────────┘               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                     CLI LAYER                                 │ │
│  │                                                                │ │
│  │  aqe patterns list    │  aqe learn status                    │ │
│  │  aqe patterns search  │  aqe learn history                   │ │
│  │  aqe patterns show    │  aqe learn analytics                 │ │
│  │  aqe patterns extract │  aqe improve start                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Pattern Creation Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PATTERN CREATION FLOW                              │
│                    (~60-80ms end-to-end)                             │
└──────────────────────────────────────────────────────────────────────┘

1. Agent Execution
   │
   ├─► TestGeneratorAgent.performTask()
   │   └─► Generates test suite
   │
2. Pattern Extraction (BaseAgent Hook)
   │
   ├─► BaseAgent.onPostTask()
   │   ├─► Check: result.success && result.quality > 0.8
   │   └─► Call: agent.extractPattern()
   │
3. Quality Scoring (~10ms)
   │
   ├─► PatternQualityScorer.calculateQuality()
   │   ├─► Completeness check
   │   ├─► Code quality analysis
   │   └─► Return: quality score (0-1)
   │
4. In-Memory Storage (~5ms)
   │
   ├─► QEReasoningBank.storePattern()
   │   ├─► Validate pattern
   │   ├─► Version existing pattern
   │   ├─► Store in patterns Map
   │   ├─► Update indexes (framework, category, keywords)
   │   └─► Generate vector embedding
   │
5. Database Persistence (~10ms)
   │
   ├─► QEReasoningBank.persistPattern()
   │   ├─► INSERT OR REPLACE INTO patterns (...)
   │   └─► Transaction commit
   │
6. Pattern Ready for Reuse
   │
   └─► Indexed and cached for fast retrieval

Total Time: ~60-80ms
├─ Pattern extraction: ~30-40ms
├─ Quality scoring: ~10ms
├─ In-memory storage: ~5ms
├─ Database write: ~10ms
└─ Index update: ~5ms
```

### Pattern Retrieval Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                   PATTERN RETRIEVAL FLOW                              │
│                   (<50ms p95 latency)                                │
└──────────────────────────────────────────────────────────────────────┘

1. Task Assignment
   │
   ├─► BaseAgent.onPreTask()
   │   └─► Extract context: {framework, language, keywords}
   │
2. Cache Lookup (~1ms)
   │
   ├─► Check: similarityCache.get(cacheKey)
   │   ├─► Cache HIT: Return cached results (~1ms) ✅
   │   └─► Cache MISS: Proceed to search
   │
3. Indexed Lookup (~5ms)
   │
   ├─► Query: frameworkIndex.get(context.framework)
   ├─► Query: keywordIndex.get(keywords)
   └─► Result: candidateIds Set
   │
4. Vector Similarity (~20ms)
   │
   ├─► Generate query embedding
   ├─► Retrieve cached pattern vectors
   ├─► Calculate cosine similarity
   └─► Hybrid scoring: 60% vector + 40% rule-based
   │
5. Quality Filtering (~5ms)
   │
   ├─► Filter: pattern.quality >= minQuality
   ├─► Calculate: applicability = confidence × successRate × quality
   └─► Sort: by applicability DESC
   │
6. Return Top Matches (~1ms)
   │
   ├─► Slice: matches.slice(0, limit)
   ├─► Cache: similarityCache.set(cacheKey, results)
   └─► Store: memoryStore.store('task/{id}/patterns', matches)

Performance Breakdown:
├─ Cache HIT: ~1ms (80% of requests) ✅
├─ Cache MISS + indexed: ~30ms (15% of requests) ✅
├─ Cache MISS + full scan: ~45ms (5% of requests) ✅
└─ Target: <50ms p95 ✅
```

### Learning Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Q-LEARNING FLOW                                  │
│                      (~10-15ms per task)                             │
└──────────────────────────────────────────────────────────────────────┘

1. Task Completion
   │
   ├─► BaseAgent.onPostTask()
   │   └─► Trigger: LearningEngine.learnFromExecution()
   │
2. Experience Extraction (~5ms)
   │
   ├─► State: {complexity, capabilities, resources, timeConstraint}
   ├─► Action: {strategy, tools, parallelization, retryPolicy}
   ├─► Reward: calculated from result
   └─► NextState: updated state after execution
   │
3. Reward Calculation (~1ms)
   │
   ├─► Success/failure: ±1.0
   ├─► Execution time: 0-0.5 (faster = better)
   ├─► Quality bonus: 0-0.5 (for test generation)
   └─► Total: clamped to [-2, 2]
   │
4. Q-Table Update (~2ms)
   │
   ├─► Formula: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
   │   ├─ α (learning rate): 0.1
   │   └─ γ (discount factor): 0.95
   └─► Update: qTable Map
   │
5. Experience Storage (~1ms)
   │
   └─► experiences.push(experience)
   │
6. Periodic Persistence (~20ms, async)
   │
   ├─► Every 10 experiences:
   │   ├─► INSERT INTO learning_history (...)
   │   └─► INSERT OR REPLACE INTO q_values (...)
   └─► Non-blocking (background task)
   │
7. Pattern Discovery (~5ms)
   │
   ├─► Update learned_patterns Map
   └─► Calculate confidence and success_rate
   │
8. Batch Update (~50ms, periodic)
   │
   └─► Every 10 tasks: Re-train on recent batch

Total Per-Task Time: ~10-15ms
├─ Experience extraction: ~5ms
├─ Reward calculation: ~1ms
├─ Q-table update: ~2ms
├─ Experience storage: ~1ms
└─ Pattern discovery: ~5ms

Async Persistence: ~20-30ms (background)
```

---

## Database Schema Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                      DATABASE SCHEMA                                  │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     PATTERN STORAGE SCHEMA                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│     patterns        │ (Primary storage)
├─────────────────────┤
│ id (PK)             │ TEXT
│ name                │ TEXT
│ description         │ TEXT
│ category            │ TEXT CHECK(unit|integration|e2e|...)
│ framework           │ TEXT CHECK(jest|mocha|vitest|...)
│ language            │ TEXT CHECK(typescript|javascript|python)
│ template            │ TEXT (test template)
│ examples            │ TEXT JSON (array of examples)
│ confidence          │ REAL (0-1)
│ quality             │ REAL (0-1)
│ success_rate        │ REAL (0-1)
│ usage_count         │ INTEGER
│ embedding           │ TEXT JSON (vector)
│ metadata            │ TEXT JSON {createdAt, updatedAt, tags}
│ created_at          │ DATETIME
│ updated_at          │ DATETIME
└─────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐
│  pattern_usage      │ (Usage tracking)
├─────────────────────┤
│ id (PK)             │ INTEGER AUTO
│ pattern_id (FK)     │ TEXT → patterns.id
│ agent_id            │ TEXT
│ task_id             │ TEXT
│ project_id          │ TEXT
│ context             │ TEXT JSON
│ success             │ BOOLEAN
│ execution_time      │ INTEGER (ms)
│ coverage_achieved   │ REAL (0-1)
│ used_at             │ DATETIME
└─────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐
│ pattern_versions    │ (Version history)
├─────────────────────┤
│ version_id (PK)     │ INTEGER AUTO
│ pattern_id (FK)     │ TEXT → patterns.id
│ pattern_snapshot    │ TEXT JSON (full snapshot)
│ version_number      │ INTEGER
│ change_description  │ TEXT
│ created_by          │ TEXT
│ created_at          │ DATETIME
└─────────────────────┘

┌─────────────────────┐
│   patterns_fts      │ (Full-text search)
├─────────────────────┤
│ id                  │ TEXT
│ name                │ TEXT
│ description         │ TEXT
│ tags                │ TEXT
└─────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     LEARNING SYSTEM SCHEMA                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│ learning_history    │ (Experience replay)
├─────────────────────┤
│ id (PK)             │ INTEGER AUTO
│ experience_id       │ TEXT UNIQUE
│ agent_id            │ TEXT
│ task_id             │ TEXT
│ task_type           │ TEXT
│ state               │ TEXT JSON (TaskState)
│ action              │ TEXT JSON (AgentAction)
│ reward              │ REAL
│ next_state          │ TEXT JSON (TaskState)
│ context             │ TEXT JSON
│ timestamp           │ DATETIME
└─────────────────────┘
         │
         │ Related
         ▼
┌─────────────────────┐
│     q_values        │ (Q-table persistence)
├─────────────────────┤
│ id (PK)             │ INTEGER AUTO
│ agent_id            │ TEXT
│ state_key           │ TEXT (encoded state)
│ action_key          │ TEXT (encoded action)
│ q_value             │ REAL
│ update_count        │ INTEGER
│ confidence          │ REAL (0-1)
│ last_updated        │ DATETIME
│ UNIQUE(agent_id, state_key, action_key)
└─────────────────────┘

┌─────────────────────┐
│ learned_patterns    │ (Pattern discovery)
├─────────────────────┤
│ id (PK)             │ TEXT
│ pattern             │ TEXT (pattern key)
│ agent_id            │ TEXT
│ confidence          │ REAL (0-1)
│ success_rate        │ REAL (0-1)
│ usage_count         │ INTEGER
│ contexts            │ TEXT JSON (array)
│ created_at          │ DATETIME
│ last_used_at        │ DATETIME
└─────────────────────┘

┌─────────────────────┐
│ failure_patterns    │ (Failure analysis)
├─────────────────────┤
│ id (PK)             │ TEXT
│ pattern             │ TEXT (failure pattern)
│ agent_id            │ TEXT
│ frequency           │ INTEGER
│ confidence          │ REAL (0-1)
│ contexts            │ TEXT JSON (array)
│ suggested_actions   │ TEXT JSON (array)
│ identified_at       │ DATETIME
│ last_occurred_at    │ DATETIME
└─────────────────────┘
```

---

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│               COMPONENT INTERACTION DIAGRAM                           │
│               (Sequence of operations)                                │
└──────────────────────────────────────────────────────────────────────┘

Agent         BaseAgent      ReasoningBank    LearningEngine    Database
  │               │                │                 │              │
  │ executeTask   │                │                 │              │
  ├──────────────>│                │                 │              │
  │               │ onPreTask      │                 │              │
  │               ├───────────────>│ findMatching    │              │
  │               │                │ Patterns        │              │
  │               │                ├─────────────────┼─────────────>│
  │               │                │ SELECT patterns │              │
  │               │                │                 │              │
  │               │                │<────────────────┼──────────────│
  │               │<───────────────│ PatternMatch[]  │              │
  │               │ patterns       │                 │              │
  │               │                │                 │              │
  │ performTask   │                │                 │              │
  │<──────────────│                │                 │              │
  │ (uses patterns)                │                 │              │
  │ result        │                │                 │              │
  ├──────────────>│ onPostTask     │                 │              │
  │               ├───────────────>│ storePattern    │              │
  │               │                ├─────────────────┼─────────────>│
  │               │                │ INSERT pattern  │              │
  │               │                │                 │              │
  │               │                │<────────────────┼──────────────│
  │               │                │ OK              │              │
  │               │                │                 │              │
  │               ├────────────────┼────────────────>│ learnFrom    │
  │               │                │                 │ Execution    │
  │               │                │                 ├─────────────>│
  │               │                │                 │ INSERT exp   │
  │               │                │                 │              │
  │               │                │                 │<─────────────│
  │               │                │                 │ OK           │
  │               │<───────────────┼─────────────────│              │
  │<──────────────│ complete       │                 │              │
  │               │                │                 │              │
```

---

## Performance Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│              PERFORMANCE ARCHITECTURE                                 │
│              (Multi-Level Caching Strategy)                          │
└──────────────────────────────────────────────────────────────────────┘

Query Request
     │
     ▼
┌─────────────────────────────────────────────┐
│   L1: In-Memory Cache (similarityCache)     │ <5ms (O(1))
│   ────────────────────────────────────────  │
│   • Map<cacheKey, PatternMatch[]>           │ 80% hit rate
│   • TTL: 5 minutes                           │
│   • Size: ~1000 entries                      │
└─────────────────────────────────────────────┘
     │ MISS
     ▼
┌─────────────────────────────────────────────┐
│   L2: Indexed Lookup (Multi-Index)          │ ~10-20ms
│   ────────────────────────────────────────  │
│   • frameworkIndex Map                       │ 15% of requests
│   • keywordIndex Map                         │
│   • categoryIndex Map                        │
│   • Returns: candidateIds Set               │
└─────────────────────────────────────────────┘
     │ MISS or Additional Filtering
     ▼
┌─────────────────────────────────────────────┐
│   L3: Vector Similarity (Cached Vectors)    │ ~20-30ms
│   ────────────────────────────────────────  │
│   • vectorCache Map<id, float[]>            │ 10% of requests
│   • Cosine similarity calculation           │
│   • Hybrid scoring (60% vector + 40% rule)  │
└─────────────────────────────────────────────┘
     │ Need Fresh Data
     ▼
┌─────────────────────────────────────────────┐
│   L4: Database Query (SQLite + Indexes)     │ ~30-50ms
│   ────────────────────────────────────────  │
│   • SELECT with indexed columns             │ 5% of requests
│   • Framework, category, quality indexes    │
│   • Full-text search (FTS5)                 │
└─────────────────────────────────────────────┘

Performance Breakdown:
├─ L1 Cache Hit: <5ms (80% requests) ✅
├─ L2 Indexed: ~15ms (15% requests) ✅
├─ L3 Vector: ~25ms (10% requests) ✅
└─ L4 Database: ~40ms (5% requests) ✅

Overall p95: <50ms ✅
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                   DEPLOYMENT ARCHITECTURE                             │
└──────────────────────────────────────────────────────────────────────┘

Development Environment
├─ SQLite database: ./data/fleet.db
├─ Patterns database: ./data/patterns.db (merged into fleet.db in v1.4.0)
└─ Memory database: ./data/memory.db (merged into fleet.db in v1.4.0)

Production Environment
├─ Single SQLite file: /var/lib/agentic-qe/fleet.db
├─ Automated backups: /backups/fleet-YYYYMMDD.db (daily)
├─ Point-in-time recovery: Last 30 days retained
└─ Monitoring: Performance metrics, error logs

Scaling Strategy
├─ Single SQLite file for simplicity (<1000 patterns)
├─ Future: PostgreSQL for multi-project sharing (>10,000 patterns)
└─ Future: Redis cache for distributed deployments

Backup Strategy
├─ Automated daily backups (cron job)
├─ Incremental backups (WAL mode)
├─ Point-in-time recovery (up to 30 days)
└─ Disaster recovery: S3/cloud storage replication
```

---

## References

- **Full Architecture**: [LEARNING-SYSTEM-ARCHITECTURE.md](./LEARNING-SYSTEM-ARCHITECTURE.md)
- **Architecture Summary**: [ARCHITECTURE-SUMMARY.md](./ARCHITECTURE-SUMMARY.md)
- **Critical Analysis**: [../CRITICAL-LEARNING-SYSTEM-ANALYSIS.md](../CRITICAL-LEARNING-SYSTEM-ANALYSIS.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-31
**Status**: ✅ Ready for Implementation
