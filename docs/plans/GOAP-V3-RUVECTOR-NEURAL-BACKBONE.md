# GOAP Implementation Plan: RuVector as Neural Backbone

**Date:** 2026-01-20
**Status:** Draft
**Owner:** GOAP Specialist
**Input:** Six Thinking Hats Analysis (SIX-HATS-AQE-V3-RUVECTOR-ANALYSIS.md)

---

## Executive Summary

This GOAP (Goal-Oriented Action Planning) plan transforms AQE v3's ruvector integration from an "optional enhancement" to the **primary neural backbone**. The plan addresses three critical gaps identified in the Six Hats analysis:

1. **Fallback Overuse**: ML capabilities underutilized due to defensive fallback patterns
2. **No Persistent Learning**: Q-Learning state lost between sessions
3. **Code Intelligence Gap**: Hypergraph capabilities not leveraged for semantic code understanding

---

## 1. World State Analysis (Current State)

### 1.1 RuVector Integration Status

| Component | Current State | Issue |
|-----------|---------------|-------|
| `RuVectorQLearningRouter` | Integrated with fallback | Falls back silently, no metrics |
| `QESONA` | Integrated, in-memory only | Patterns lost on restart |
| `QEGNNEmbeddingIndex` | Used for code similarity | Not connected to hypergraph |
| `QValueStore` | SQLite persistence exists | Not wired to Q-Learning router |
| `@ruvector/graph-node` | Not installed | Cypher queries unavailable |

### 1.2 Fallback Pattern Analysis

```
Current Flow:
┌──────────────────┐
│  Task Request    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ RuVector Router  │────▶│ Fallback Router  │
│ (throws error?)  │     │ (always works)   │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Result (no flag) │
                         └──────────────────┘

Problem: Users never know if ML is being used
```

### 1.3 Persistence Gap

| Data Type | Current Storage | Persistence | Cross-Session |
|-----------|-----------------|-------------|---------------|
| Q-Values | In-memory Map | NO | NO |
| SONA Patterns | QESONAPatternRegistry | NO | NO |
| Code Embeddings | QEGNNEmbeddingIndex | NO | NO |
| Routing History | None | NO | NO |

### 1.4 Code Intelligence Architecture

```
Current (Isolated):
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Knowledge   │  │ Semantic    │  │ Impact      │
│   Graph     │  │  Analyzer   │  │  Analyzer   │
│ (in-memory) │  │ (in-memory) │  │ (in-memory) │
└─────────────┘  └─────────────┘  └─────────────┘
      ↓               ↓               ↓
   No shared query language, no cross-linking
```

---

## 2. Goal State Definition (Target State)

### 2.1 ML-First Architecture

```
Target Flow:
┌──────────────────┐
│  Task Request    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ RuVector Router  │─────┐
│   (PRIMARY)      │     │
└────────┬─────────┘     │
         │               │ on ERROR ONLY
         ▼               ▼
┌──────────────────┐  ┌──────────────────┐
│ ML Result + Flag │  │ Fallback + ALERT │
│ usedML: true     │  │ usedML: false    │
└──────────────────┘  │ alertSent: true  │
                      └──────────────────┘
```

### 2.2 Unified Persistence Layer

```
Target Storage:
┌─────────────────────────────────────────────────────┐
│              .agentic-qe/memory.db                  │
├─────────────────────────────────────────────────────┤
│ rl_q_values (existing) ───────────────────────────┐ │
│ sona_patterns (new) ──────────────────────────────┤ │
│ code_embeddings (new) ────────────────────────────┤ │
│ routing_history (new) ────────────────────────────┤ │
│ hypergraph_nodes (new) ───────────────────────────┤ │
│ hypergraph_edges (new) ───────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 2.3 Hypergraph Code Intelligence

```
Target Architecture:
┌─────────────────────────────────────────────────────┐
│            Unified Code Hypergraph                   │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Function │───▶│  Module  │───▶│   Test   │      │
│  │  Node    │    │   Node   │    │   Node   │      │
│  └──────────┘    └──────────┘    └──────────┘      │
│       │               │               │             │
│       ▼               ▼               ▼             │
│  ┌──────────────────────────────────────────────┐  │
│  │           Cypher Query Interface              │  │
│  │  MATCH (f:Function)-[:TESTED_BY]->(t:Test)   │  │
│  │  WHERE NOT EXISTS((f)<-[:COVERS]-())          │  │
│  │  RETURN f.name, f.complexity                  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.4 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| ML Usage Rate | Unknown | >80% | `usedML: true` count / total |
| Pattern Retention | 0% | 100% | Patterns available after restart |
| Q-Value Persistence | 0% | 100% | Q-values restored from DB |
| Cross-Agent Learning | None | Real-time | Shared vector store queries/sec |
| Fallback Alert Rate | 0% | 100% of fallbacks | Alerts sent when fallback used |

---

## 3. Action Sequence (GOAP Actions)

### 3.1 Action Definitions

Each action has:
- **Preconditions**: What must be true before execution
- **Effects**: What becomes true after execution
- **Cost**: Estimated effort (1-10)
- **Priority**: P0 (critical) to P3 (nice-to-have)

---

### Action 1: Implement ML Observability Layer

**Priority:** P0 (Critical)
**Cost:** 2
**Estimated Time:** 4 hours

**Preconditions:**
- [x] RuVector wrappers exist (`v3/src/integrations/ruvector/`)
- [x] Fallback implementations exist (`fallback.ts`)

**Effects:**
- [ ] All ruvector calls emit metrics
- [ ] `usedML` flag on every routing result
- [ ] Alert system for fallback usage

**Implementation:**

```typescript
// File: v3/src/integrations/ruvector/observability.ts
export interface MLObservabilityMetrics {
  mlUsed: number;
  fallbackUsed: number;
  mlLatencyMs: number[];
  fallbackReasons: Map<string, number>;
}

export class RuVectorObservability {
  private metrics: MLObservabilityMetrics;
  private alertThreshold = 0.2; // Alert if ML usage drops below 20%

  recordMLUsage(component: string, used: boolean, latencyMs?: number): void;
  recordFallback(component: string, reason: string): void;
  checkAndAlert(): void; // Emit alert if fallback rate too high
  getReport(): MLObservabilityReport;
}
```

**Agent Assignment:** qe-learning-coordinator

---

### Action 2: Wire Q-Learning to Persistence

**Priority:** P0 (Critical)
**Cost:** 4
**Estimated Time:** 8 hours

**Preconditions:**
- [x] QValueStore exists with SQLite backend
- [x] UnifiedPersistenceManager available
- [x] Q-Learning router exists

**Effects:**
- [ ] Q-values persist to `memory.db`
- [ ] Q-values restored on router initialization
- [ ] EWC++ prevents catastrophic forgetting

**Implementation:**

```typescript
// File: v3/src/integrations/ruvector/persistent-q-router.ts
export class PersistentQLearningRouter implements QLearningRouter {
  private store: QValueStore;
  private ewcConfig: EWCConfig;

  constructor(config: PersistentQLearningConfig) {
    this.store = createQValueStore();
    this.ewcConfig = {
      lambda: 1000.0,      // EWC regularization strength
      consolidationInterval: 3600000, // 1 hour
      fisherSampleSize: 100,
    };
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    await this.loadQValues(); // Restore from DB
  }

  async routeTask(task: TestTask): Promise<AgentRoutingResult> {
    // Use ML routing
    const result = await this.mlRoute(task);
    // Persist Q-value update
    await this.store.setQValue(agentId, stateKey, actionKey, qValue);
    return result;
  }

  private async consolidateWithEWC(): Promise<void> {
    // Apply EWC++ to prevent forgetting old patterns
  }
}
```

**Agent Assignment:** qe-pattern-learner

---

### Action 3: SONA Pattern Persistence

**Priority:** P0 (Critical)
**Cost:** 4
**Estimated Time:** 6 hours

**Preconditions:**
- [x] QESONA wrapper exists
- [x] UnifiedPersistenceManager available
- [ ] Action 2 complete (shared persistence model)

**Effects:**
- [ ] SONA patterns persist to `memory.db`
- [ ] Patterns restored on SONA initialization
- [ ] Cross-agent pattern sharing via DB

**Implementation:**

```typescript
// File: v3/src/integrations/ruvector/sona-persistence.ts
export class PersistentSONAEngine extends QESONA {
  private persistence: UnifiedPersistenceManager;

  async initialize(): Promise<void> {
    await super.initialize();
    await this.restorePatterns();
  }

  async storePattern(pattern: QESONAPattern): Promise<void> {
    super.storePattern(pattern);
    await this.persistPattern(pattern); // Also save to DB
  }

  private async persistPattern(pattern: QESONAPattern): Promise<void> {
    const db = this.persistence.getDatabase();
    db.prepare(`
      INSERT INTO sona_patterns (id, type, domain, embedding, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(pattern.id, pattern.type, pattern.domain,
           JSON.stringify(pattern.stateEmbedding), pattern.confidence);
  }

  private async restorePatterns(): Promise<void> {
    const patterns = this.persistence.getDatabase().prepare(`
      SELECT * FROM sona_patterns ORDER BY confidence DESC LIMIT 10000
    `).all();
    for (const p of patterns) {
      super.importPatterns([this.deserializePattern(p)]);
    }
  }
}
```

**Agent Assignment:** qe-pattern-learner

---

### Action 4: Remove Silent Fallbacks

**Priority:** P1 (High)
**Cost:** 6
**Estimated Time:** 12 hours

**Preconditions:**
- [ ] Action 1 complete (observability layer)
- [x] All fallback classes exist in `fallback.ts`

**Effects:**
- [ ] Fallbacks only used on explicit error
- [ ] All fallback usage logged and alerted
- [ ] No more silent degradation

**Implementation:**

```typescript
// File: v3/src/integrations/ruvector/provider.ts (modified)
export function createQLearningRouter(config?: QLearningConfig): QLearningRouter {
  const observability = getRuVectorObservability();

  // TRY ML FIRST - no preemptive fallback
  try {
    const router = new RuVectorQLearningRouter(config);
    await router.initialize(); // Will throw if ruvector unavailable
    observability.recordMLUsage('q-learning', true);
    return router;
  } catch (error) {
    // ONLY fall back on actual error
    observability.recordFallback('q-learning', error.message);
    observability.alert({
      component: 'q-learning',
      reason: error.message,
      recommendation: 'Install/fix ruvector to enable ML routing',
    });
    return new FallbackQLearningRouter(); // Still works, but user knows
  }
}
```

**Files to Modify:**
- `v3/src/integrations/ruvector/provider.ts`
- All domain coordinators that create ruvector components

**Agent Assignment:** qe-test-architect, qe-coverage-specialist

---

### Action 5: Add Hypergraph Schema

**Priority:** P1 (High)
**Cost:** 3
**Estimated Time:** 4 hours

**Preconditions:**
- [x] UnifiedPersistenceManager available
- [x] SQLite schema management in place

**Effects:**
- [ ] Hypergraph tables created in `memory.db`
- [ ] Support for nodes, edges, properties

**Implementation:**

```sql
-- Migration: 20260120_add_hypergraph_tables.sql

-- Hypergraph nodes (functions, modules, tests, etc.)
CREATE TABLE IF NOT EXISTS hypergraph_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'function', 'module', 'test', 'file', 'class'
  name TEXT NOT NULL,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  complexity REAL,
  coverage REAL,
  metadata TEXT, -- JSON
  embedding BLOB, -- Vector embedding for similarity
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Hypergraph edges (relationships)
CREATE TABLE IF NOT EXISTS hypergraph_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES hypergraph_nodes(id),
  target_id TEXT NOT NULL REFERENCES hypergraph_nodes(id),
  type TEXT NOT NULL, -- 'calls', 'imports', 'tests', 'depends_on'
  weight REAL DEFAULT 1.0,
  properties TEXT, -- JSON
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, type)
);

-- Indexes for fast traversal
CREATE INDEX IF NOT EXISTS idx_hypergraph_nodes_type ON hypergraph_nodes(type);
CREATE INDEX IF NOT EXISTS idx_hypergraph_nodes_file ON hypergraph_nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_hypergraph_edges_source ON hypergraph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_hypergraph_edges_target ON hypergraph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_hypergraph_edges_type ON hypergraph_edges(type);
```

**Agent Assignment:** qe-kg-builder

---

### Action 6: Implement Hypergraph Query Engine

**Priority:** P2 (Medium)
**Cost:** 8
**Estimated Time:** 16 hours

**Preconditions:**
- [ ] Action 5 complete (schema exists)
- [x] KnowledgeGraphService exists

**Effects:**
- [ ] Cypher-like query interface available
- [ ] Pattern matching for code relationships
- [ ] Integration with existing KnowledgeGraphService

**Recommendation:** This is an **UPGRADE** to existing code intelligence, not a replacement.

The current `KnowledgeGraphService` in `v3/src/domains/code-intelligence/services/knowledge-graph.ts` uses an in-memory graph structure. The hypergraph should:
1. Persist the graph to SQLite
2. Add Cypher-like query capabilities
3. Integrate with GNN embeddings for semantic search

**Implementation:**

```typescript
// File: v3/src/integrations/ruvector/hypergraph-engine.ts
export class HypergraphEngine {
  private persistence: UnifiedPersistenceManager;
  private gnnIndex: QEGNNEmbeddingIndex;

  /**
   * Execute a Cypher-like query
   * Simplified syntax for QE use cases
   */
  async query(cypher: string): Promise<HypergraphResult> {
    // Parse and execute Cypher-like queries
    // Example: MATCH (f:Function)-[:TESTED_BY]->(t:Test) RETURN f, t
  }

  /**
   * Find functions not covered by tests
   */
  async findUntestedFunctions(): Promise<HypergraphNode[]> {
    return this.query(`
      MATCH (f:Function)
      WHERE NOT (f)<-[:COVERS]-(:Test)
      RETURN f ORDER BY f.complexity DESC
    `);
  }

  /**
   * Impact analysis: what tests cover changed functions?
   */
  async findImpactedTests(changedFiles: string[]): Promise<HypergraphNode[]> {
    return this.query(`
      MATCH (f:Function)-[:DEFINED_IN]->(file:File)
      WHERE file.path IN $changedFiles
      MATCH (t:Test)-[:COVERS]->(f)
      RETURN DISTINCT t
    `, { changedFiles });
  }

  /**
   * Build graph from indexed code
   */
  async buildFromIndex(indexResult: IndexResult): Promise<void> {
    // Create nodes for each indexed entity
    // Create edges for relationships
    // Generate embeddings for semantic search
  }
}
```

**Agent Assignment:** qe-kg-builder, qe-coverage-specialist

---

### Action 7: Integrate Hypergraph with Code Intelligence

**Priority:** P2 (Medium)
**Cost:** 5
**Estimated Time:** 10 hours

**Preconditions:**
- [ ] Action 6 complete (query engine)
- [x] CodeIntelligenceCoordinator exists

**Effects:**
- [ ] Impact analysis uses hypergraph queries
- [ ] Coverage gaps identified via graph traversal
- [ ] Test prioritization based on code relationships

**Implementation:**

```typescript
// File: v3/src/domains/code-intelligence/coordinator.ts (modified)
export class CodeIntelligenceCoordinator {
  private hypergraph?: HypergraphEngine;

  async initialize(): Promise<void> {
    // ... existing initialization ...

    // Add hypergraph integration
    if (this.config.enableHypergraph) {
      this.hypergraph = new HypergraphEngine(this.persistence);
      await this.hypergraph.initialize();
    }
  }

  async analyzeImpact(request: ImpactRequest): Promise<ImpactAnalysis> {
    // Use hypergraph for intelligent impact analysis
    if (this.hypergraph) {
      const impactedTests = await this.hypergraph.findImpactedTests(request.changedFiles);
      // Merge with existing impact analysis
    }
  }
}
```

**Agent Assignment:** qe-test-architect

---

### Action 8: Add RuVector Server Integration

**Priority:** P3 (Nice-to-have)
**Cost:** 6
**Estimated Time:** 12 hours

**Preconditions:**
- [ ] Action 2-3 complete (persistence layer)
- [x] RuVector CLI available

**Effects:**
- [ ] Shared vector memory across agents
- [ ] HTTP/gRPC endpoint for vector operations
- [ ] Real-time pattern sharing

**Implementation:**

```typescript
// File: v3/src/integrations/ruvector/server-client.ts
export class RuVectorServerClient {
  private serverUrl: string;
  private grpcPort: number;

  async ensureServerRunning(): Promise<void> {
    // Check if server is running, start if not
    const isRunning = await this.healthCheck();
    if (!isRunning) {
      await this.startServer();
    }
  }

  private async startServer(): Promise<void> {
    // Start ruvector server as background process
    // npx ruvector server --port 8080 --grpc-port 50051 --data-dir .agentic-qe/vector-data
  }

  async storeVector(namespace: string, vector: number[], metadata: object): Promise<string>;
  async searchSimilar(namespace: string, query: number[], topK: number): Promise<SearchResult[]>;
  async sharePattern(pattern: QESONAPattern): Promise<void>;
}
```

**Agent Assignment:** qe-learning-coordinator

---

## 4. Parallel Execution Map

```
                         PHASE 1 (Week 1)
                    ┌────────────────────────┐
     ┌──────────────┤  Can run in parallel   ├──────────────┐
     │              └────────────────────────┘              │
     ▼                         ▼                           ▼
┌─────────┐            ┌─────────────┐             ┌─────────────┐
│ Action 1│            │  Action 2   │             │  Action 5   │
│ Observe │            │ Q-Learning  │             │ Hypergraph  │
│ Layer   │            │ Persistence │             │   Schema    │
└────┬────┘            └──────┬──────┘             └──────┬──────┘
     │                        │                           │
     │              ┌─────────┴─────────┐                 │
     │              ▼                   ▼                 │
     │         PHASE 2 (Week 2)                          │
     │    ┌─────────────┐      ┌─────────────┐           │
     │    │  Action 3   │      │  Action 4   │           │
     │    │    SONA     │      │   Remove    │           │
     │    │ Persistence │      │  Fallbacks  │           │
     │    └──────┬──────┘      └──────┬──────┘           │
     │           │                    │                   │
     │           └────────┬───────────┘                   │
     │                    │                               │
     │                    ▼                               │
     │              PHASE 3 (Week 3)                      │
     │         ┌─────────────────────┐                    │
     │         │      Action 6       │◀───────────────────┘
     │         │  Hypergraph Query   │
     │         │       Engine        │
     │         └─────────┬───────────┘
     │                   │
     │                   ▼
     │              PHASE 4 (Week 4)
     │    ┌─────────────┐      ┌─────────────┐
     │    │  Action 7   │      │  Action 8   │
     │    │ Coordinator │      │  RuVector   │
     │    │ Integration │      │   Server    │
     │    └─────────────┘      └─────────────┘
     │
     └────────────────────────┬─────────────────────────
                              │
                              ▼
                    CONTINUOUS (All Phases)
                    ┌─────────────────────┐
                    │ Metrics Collection  │
                    │ & Alerting         │
                    └─────────────────────┘
```

### Parallel Execution Rules

| Actions | Can Parallelize? | Dependencies |
|---------|------------------|--------------|
| 1, 2, 5 | YES | None between them |
| 3, 4 | YES | Both depend on 1, 2 |
| 6 | NO | Depends on 5 |
| 7, 8 | YES | 7 depends on 6, 8 depends on 2-3 |

---

## 5. Risk Mitigation

### Risk 1: RuVector Binary Compatibility

**Risk:** Native bindings fail on certain platforms
**Mitigation:**
- Keep fallback implementations
- Add platform detection and clear error messages
- Test on CI matrix (Linux, macOS, Windows)

### Risk 2: Migration Data Loss

**Risk:** Existing patterns/Q-values lost during migration
**Mitigation:**
- Export existing state before migration
- Implement rollback mechanism
- Run parallel systems during transition

### Risk 3: Performance Degradation

**Risk:** SQLite persistence adds latency
**Mitigation:**
- Use WAL mode (already enabled)
- Batch writes with transactions
- Cache hot Q-values in memory

### Risk 4: Breaking Changes

**Risk:** Removing fallbacks breaks existing workflows
**Mitigation:**
- Feature flag for new behavior
- Gradual rollout with monitoring
- Keep fallbacks but make them explicit

---

## 6. Success Criteria

### Phase 1 Complete When:
- [ ] All ruvector calls emit observable metrics
- [ ] Q-values persist to `memory.db` and restore on startup
- [ ] Hypergraph schema exists in `memory.db`

### Phase 2 Complete When:
- [ ] SONA patterns persist and restore
- [ ] Fallbacks only trigger on actual errors
- [ ] Alerts fire when fallback usage exceeds threshold

### Phase 3 Complete When:
- [ ] Cypher-like queries work against hypergraph
- [ ] `findUntestedFunctions()` returns accurate results
- [ ] `findImpactedTests()` works for any changed file set

### Phase 4 Complete When:
- [ ] CodeIntelligenceCoordinator uses hypergraph for impact analysis
- [ ] (Optional) RuVector server running for shared memory

### Overall Success Metrics:
- ML Usage Rate: **>80%** (currently unknown)
- Pattern Retention: **100%** (currently 0%)
- Fallback Alert Coverage: **100%** of fallback events
- Cross-Session Learning: **Verified** with restart test

---

## 7. Agent Assignments

### Swarm Configuration

```yaml
topology: hierarchical
maxAgents: 8
strategy: specialized

agents:
  # Phase 1 - Parallel
  - id: obs-agent-1
    type: qe-learning-coordinator
    task: "Action 1 - ML Observability Layer"
    phase: 1

  - id: persist-agent-1
    type: qe-pattern-learner
    task: "Action 2 - Q-Learning Persistence"
    phase: 1

  - id: schema-agent-1
    type: qe-kg-builder
    task: "Action 5 - Hypergraph Schema"
    phase: 1

  # Phase 2 - Parallel (after phase 1)
  - id: persist-agent-2
    type: qe-pattern-learner
    task: "Action 3 - SONA Persistence"
    phase: 2
    depends_on: [persist-agent-1]

  - id: refactor-agent-1
    type: qe-test-architect
    task: "Action 4 - Remove Silent Fallbacks"
    phase: 2
    depends_on: [obs-agent-1]

  # Phase 3 - Sequential
  - id: graph-agent-1
    type: qe-kg-builder
    task: "Action 6 - Hypergraph Query Engine"
    phase: 3
    depends_on: [schema-agent-1]

  # Phase 4 - Parallel
  - id: integration-agent-1
    type: qe-test-architect
    task: "Action 7 - Coordinator Integration"
    phase: 4
    depends_on: [graph-agent-1]

  - id: server-agent-1
    type: qe-learning-coordinator
    task: "Action 8 - RuVector Server"
    phase: 4
    depends_on: [persist-agent-2]
```

### MCP Tool Mapping

| Action | Primary MCP Tools |
|--------|-------------------|
| Action 1 | `mcp__claude-flow__hooks_post-task`, `mcp__claude-flow__hooks_metrics` |
| Action 2 | `mcp__agentic-qe__memory_store`, `mcp__claude-flow__memory_store` |
| Action 3 | `mcp__agentic-qe__memory_store`, `mcp__claude-flow__hooks_intelligence_pattern-store` |
| Action 4 | `mcp__agentic-qe__test_generate_enhanced`, standard code editing |
| Action 5 | `mcp__supabase__apply_migration` (for schema), standard editing |
| Action 6 | Standard code editing, `mcp__agentic-qe__code_index` |
| Action 7 | `mcp__agentic-qe__coverage_analyze_sublinear`, standard editing |
| Action 8 | `mcp__claude-flow__terminal_execute` |

---

## 8. Hypergraph Decision: UPGRADE vs REPLACEMENT

### Analysis

| Aspect | Current KnowledgeGraphService | Proposed Hypergraph |
|--------|------------------------------|---------------------|
| Storage | In-memory | SQLite (persistent) |
| Query Language | Custom methods | Cypher-like syntax |
| Embedding Integration | Via GNN index | Native in nodes |
| Cross-Session | No | Yes |
| Performance | Fast (memory) | Indexed (disk) |

### Recommendation: **HYBRID UPGRADE**

1. **Keep** existing `KnowledgeGraphService` for in-session operations
2. **Add** hypergraph as persistence and query layer
3. **Sync** between them on:
   - Index completion (memory -> hypergraph)
   - Session start (hypergraph -> memory)
4. **Migrate gradually** by feature-flagging hypergraph queries

This approach:
- Preserves existing functionality
- Adds persistence without breaking changes
- Enables gradual adoption
- Allows performance comparison

---

## Appendix A: File Locations

| New File | Purpose |
|----------|---------|
| `v3/src/integrations/ruvector/observability.ts` | ML usage metrics |
| `v3/src/integrations/ruvector/persistent-q-router.ts` | Q-Learning with persistence |
| `v3/src/integrations/ruvector/sona-persistence.ts` | SONA pattern persistence |
| `v3/src/integrations/ruvector/hypergraph-engine.ts` | Cypher-like query engine |
| `v3/src/integrations/ruvector/server-client.ts` | RuVector server integration |
| `v3/migrations/20260120_add_hypergraph_tables.sql` | Schema migration |

| Modified File | Changes |
|---------------|---------|
| `v3/src/integrations/ruvector/provider.ts` | ML-first with alerts |
| `v3/src/integrations/ruvector/fallback.ts` | Add explicit fallback flags |
| `v3/src/domains/code-intelligence/coordinator.ts` | Hypergraph integration |
| `v3/src/kernel/unified-memory.ts` | Add hypergraph schema |

---

## Appendix B: CLI Commands for Execution

```bash
# Initialize swarm for plan execution
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized

# Phase 1 - Parallel execution
npx @claude-flow/cli@latest task create --type feature --description "Action 1: ML Observability Layer" --priority high
npx @claude-flow/cli@latest task create --type feature --description "Action 2: Q-Learning Persistence" --priority high
npx @claude-flow/cli@latest task create --type feature --description "Action 5: Hypergraph Schema" --priority high

# Monitor progress
npx @claude-flow/cli@latest hooks metrics --period 24h

# Check ML vs fallback ratio
npx @claude-flow/cli@latest hooks intelligence --showStatus

# Verify persistence
npx @claude-flow/cli@latest memory list --namespace rl-qvalues
npx @claude-flow/cli@latest memory list --namespace sona-patterns
```

---

*Generated by GOAP Specialist using A* planning algorithm*
*Input: Six Thinking Hats Analysis dated 2026-01-20*
