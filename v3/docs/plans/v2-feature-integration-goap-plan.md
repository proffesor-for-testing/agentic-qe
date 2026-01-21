# V2 Feature Integration GOAP Plan for Agentic QE v3

## Executive Summary

This document provides a Goal-Oriented Action Planning (GOAP) analysis and implementation plan for integrating three critical missing V2 features into V3:

1. **Q-Values Persistence** - SQLite-backed Q-learning state persistence
2. **GOAP System** - Goal-Oriented Action Planning with A* search
3. **Dream Cycles** - Pattern discovery through simulated dreaming

## Current State Analysis

### V3 Architecture Overview

V3 uses a **pattern-centric architecture** with:
- `PatternStore` (pattern-store.ts) - HNSW-indexed pattern storage
- `QEPattern` types (qe-patterns.ts) - Unified pattern representation
- `HybridBackend` (hybrid-backend.ts) - Memory/SQLite hybrid storage
- `RL-Suite` (integrations/rl-suite/) - 9 RL algorithms, in-memory only
- `V2ToV3Migrator` (v2-to-v3-migration.ts) - Data migration utilities

### V2 Features Worth Integrating

| Feature | V2 Implementation | V3 Gap | Value |
|---------|-------------------|--------|-------|
| Q-Values Persistence | `q_values` table, LearningMetrics class | In-memory ReplayBuffer only | HIGH - Enables cross-session learning |
| GOAP System | GOAPPlanner, 4 tables, A* search | Nothing | CRITICAL - Core planning capability |
| Dream Cycles | DreamEngine, ConceptGraph, 5 tables | Nothing | MEDIUM - Novel pattern discovery |
| Learning History | 3 tables (learning_*) | Flattened to qe_patterns | LOW - Mostly covered |

---

## GOAP Plan Structure

### World State (Current V3)

```typescript
interface V3WorldState {
  // Existing capabilities
  patternStore: { initialized: boolean; patternCount: number; hnswAvailable: boolean };
  rlSuite: { algorithmsAvailable: RLAlgorithmType[]; persistenceEnabled: false };
  kernel: { hybridBackendReady: boolean; sqliteAvailable: boolean };
  migration: { v2MigratorReady: boolean };

  // Missing capabilities (gaps)
  qValuesPersistence: { implemented: false; tables: 0 };
  goapSystem: { implemented: false; plannerReady: false; actionsLoaded: 0 };
  dreamCycles: { implemented: false; conceptGraphReady: false };
}
```

### Goal State (Target V3)

```typescript
interface V3GoalState {
  patternStore: { initialized: true; patternCount: number; hnswAvailable: true };
  rlSuite: { algorithmsAvailable: ['q-learning', ...8more]; persistenceEnabled: true };
  kernel: { hybridBackendReady: true; sqliteAvailable: true };
  migration: { v2MigratorReady: true; goapMigrationReady: true; dreamMigrationReady: true };

  // Integrated capabilities
  qValuesPersistence: { implemented: true; tables: 1 };
  goapSystem: { implemented: true; plannerReady: true; actionsLoaded: number };
  dreamCycles: { implemented: true; conceptGraphReady: true };
}
```

---

## Goal 1: Q-Values Persistence Integration

### Goal Definition
Enable persistent Q-learning state across sessions, supporting the 9 RL algorithms in V3's rl-suite.

### Current Gap Analysis

**V2 Has:**
- `q_values` table: `(id, agent_id, state, action, value, visits, updated_at)`
- `LearningMetrics` class for recording
- `LearningHistory` for trajectory tracking
- Integration with GOAPPlanner

**V3 Lacks:**
- No persistence in `BaseRLAlgorithm.replayBuffer`
- Q-table is in-memory Map only
- No cross-session state recovery

### Actions

#### Action 1.1: Create Q-Values Persistence Schema
```yaml
id: qv-schema-create
name: Create Q-Values Persistence Schema
agentType: database-specialist
preconditions:
  - kernel.sqliteAvailable == true
effects:
  - qValuesPersistence.tables = 1
cost: 1.0
category: schema
```

**Implementation:**
```sql
-- v3/src/integrations/rl-suite/schema/q-values.sql
CREATE TABLE IF NOT EXISTS rl_q_values (
  id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL,           -- 'q-learning', 'sarsa', 'dqn', etc.
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL,           -- Encoded state representation
  action_key TEXT NOT NULL,          -- Encoded action representation
  q_value REAL NOT NULL DEFAULT 0.0,
  visits INTEGER NOT NULL DEFAULT 0,
  last_reward REAL,
  domain TEXT,                       -- QE domain for filtering
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(algorithm, agent_id, state_key, action_key)
);

CREATE INDEX IF NOT EXISTS idx_qv_algorithm ON rl_q_values(algorithm);
CREATE INDEX IF NOT EXISTS idx_qv_agent ON rl_q_values(agent_id);
CREATE INDEX IF NOT EXISTS idx_qv_domain ON rl_q_values(domain);
CREATE INDEX IF NOT EXISTS idx_qv_updated ON rl_q_values(updated_at);
```

**Files to modify:** `v3/src/integrations/rl-suite/persistence/q-value-store.ts` (new)

#### Action 1.2: Implement QValueStore Class
```yaml
id: qv-store-impl
name: Implement QValueStore Class
agentType: coder
preconditions:
  - qValuesPersistence.tables == 1
effects:
  - qValuesPersistence.storeReady = true
cost: 2.0
category: implementation
dependencies: [qv-schema-create]
```

**Implementation approach:**
```typescript
// v3/src/integrations/rl-suite/persistence/q-value-store.ts
export class QValueStore {
  constructor(private readonly db: Database, private readonly algorithmType: RLAlgorithmType) {}

  async getQValue(agentId: string, stateKey: string, actionKey: string): Promise<number>
  async setQValue(agentId: string, stateKey: string, actionKey: string, value: number): Promise<void>
  async incrementVisits(agentId: string, stateKey: string, actionKey: string): Promise<void>
  async getTopActions(agentId: string, stateKey: string, limit: number): Promise<QValueEntry[]>
  async exportForAgent(agentId: string): Promise<Map<string, Map<string, number>>>
  async importFromMap(agentId: string, qTable: Map<string, Map<string, QValue>>): Promise<void>
}
```

**Files to create:** `v3/src/integrations/rl-suite/persistence/q-value-store.ts`

#### Action 1.3: Integrate with BaseRLAlgorithm
```yaml
id: qv-base-integrate
name: Integrate Q-Value Store with Base Algorithm
agentType: coder
preconditions:
  - qValuesPersistence.storeReady == true
effects:
  - rlSuite.persistenceEnabled = true
cost: 2.5
category: integration
dependencies: [qv-store-impl]
```

**Modification to:** `v3/src/integrations/rl-suite/base-algorithm.ts`

Add persistence hooks:
```typescript
abstract class BaseRLAlgorithm {
  protected qValueStore?: QValueStore;

  async enablePersistence(store: QValueStore): Promise<void> {
    this.qValueStore = store;
    await this.loadPersistedState();
  }

  protected async persistQValue(state: string, action: string, value: number): Promise<void> {
    if (this.qValueStore) {
      await this.qValueStore.setQValue(this.agentId, state, action, value);
    }
  }

  protected async loadPersistedState(): Promise<void> {
    if (this.qValueStore) {
      const qTable = await this.qValueStore.exportForAgent(this.agentId);
      // Merge with in-memory table
    }
  }
}
```

#### Action 1.4: Add V2 Q-Values Migration
```yaml
id: qv-migration
name: Add V2 Q-Values to Migration
agentType: coder
preconditions:
  - qValuesPersistence.implemented == true
effects:
  - migration.qValuesMigrationReady = true
cost: 1.5
category: migration
dependencies: [qv-base-integrate]
```

**Modification to:** `v3/src/learning/v2-to-v3-migration.ts`

Add method:
```typescript
private async migrateQValues(qValues: V2QValue[]): Promise<number> {
  // Map V2 q_values table to new rl_q_values
  // Preserve agent_id, state, action, value, visits
}
```

### Success Criteria for Goal 1
- [ ] `rl_q_values` table created and indexed
- [ ] `QValueStore` class passes unit tests
- [ ] Q-Learning algorithm persists Q-values across restarts
- [ ] V2 q_values data migrates successfully
- [ ] Performance: <10ms for Q-value lookup

---

## Goal 2: GOAP System Integration

### Goal Definition
Implement Goal-Oriented Action Planning with A* search for QE workflow optimization.

### Current Gap Analysis

**V2 Has:**
- `GOAPPlanner` class with A* search
- `goap_goals`, `goap_actions`, `goap_plans`, `goap_execution_steps` tables
- `PlanSimilarity` for plan reuse
- `WorldState` and `StateConditions` types
- 50+ predefined QE actions

**V3 Lacks:**
- No planning system
- No action library
- No world state modeling

### Actions

#### Action 2.1: Define V3 GOAP Types
```yaml
id: goap-types
name: Define V3 GOAP Types
agentType: architect
preconditions:
  - kernel.hybridBackendReady == true
effects:
  - goapSystem.typesReady = true
cost: 1.5
category: design
```

**Create:** `v3/src/planning/types.ts`

```typescript
// Adapted from V2 with QE domain integration
export interface V3WorldState {
  // QE-specific state
  coverage: { line: number; branch: number; function: number; target: number; measured: boolean };
  quality: { testsPassing: number; securityScore: number; performanceScore: number };
  fleet: { activeAgents: number; availableAgents: AgentType[] };
  resources: { timeRemaining: number; memoryAvailable: number; parallelSlots: number };
  context: { environment: 'development' | 'staging' | 'production'; riskLevel: 'low' | 'medium' | 'high' };

  // V3-specific additions
  patterns: { available: number; reusable: number };
  rlState: { algorithmsActive: RLAlgorithmType[] };
}

export interface GOAPAction {
  id: string;
  name: string;
  agentType: AgentType;  // Links to V3 agent types
  preconditions: StateConditions;
  effects: ActionEffects;
  cost: number;
  category: 'test' | 'security' | 'performance' | 'analysis' | 'coverage' | 'fleet';
  qeDomain?: QEDomain;  // Links to V3 QE domains
}
```

#### Action 2.2: Create GOAP Database Schema
```yaml
id: goap-schema
name: Create GOAP Database Schema
agentType: database-specialist
preconditions:
  - goapSystem.typesReady == true
effects:
  - goapSystem.tables = 4
cost: 1.0
category: schema
dependencies: [goap-types]
```

**Create:** `v3/src/planning/schema/goap-tables.sql`

```sql
-- GOAP Goals
CREATE TABLE IF NOT EXISTS goap_goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  conditions TEXT NOT NULL,  -- JSON StateConditions
  priority INTEGER DEFAULT 3,
  qe_domain TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- GOAP Actions (QE Action Library)
CREATE TABLE IF NOT EXISTS goap_actions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  agent_type TEXT NOT NULL,
  preconditions TEXT NOT NULL,  -- JSON StateConditions
  effects TEXT NOT NULL,        -- JSON ActionEffects
  cost REAL DEFAULT 1.0,
  success_rate REAL DEFAULT 1.0,
  execution_count INTEGER DEFAULT 0,
  category TEXT NOT NULL,
  qe_domain TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- GOAP Plans (Cached/Historical)
CREATE TABLE IF NOT EXISTS goap_plans (
  id TEXT PRIMARY KEY,
  goal_id TEXT,
  initial_state TEXT NOT NULL,  -- JSON WorldState
  goal_state TEXT NOT NULL,     -- JSON StateConditions
  action_sequence TEXT NOT NULL, -- JSON array of action IDs
  total_cost REAL,
  status TEXT DEFAULT 'pending',
  reused_from TEXT,             -- Original plan if reused
  similarity_score REAL,
  created_at TEXT DEFAULT (datetime('now')),
  executed_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (goal_id) REFERENCES goap_goals(id)
);

-- Execution Steps (for replay/learning)
CREATE TABLE IF NOT EXISTS goap_execution_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  world_state_before TEXT,
  world_state_after TEXT,
  status TEXT DEFAULT 'pending',
  duration_ms INTEGER,
  agent_id TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES goap_plans(id),
  FOREIGN KEY (action_id) REFERENCES goap_actions(id)
);

CREATE INDEX IF NOT EXISTS idx_goap_actions_category ON goap_actions(category);
CREATE INDEX IF NOT EXISTS idx_goap_actions_agent ON goap_actions(agent_type);
CREATE INDEX IF NOT EXISTS idx_goap_plans_status ON goap_plans(status);
```

#### Action 2.3: Implement GOAPPlanner Class
```yaml
id: goap-planner
name: Implement GOAPPlanner Class
agentType: coder
preconditions:
  - goapSystem.tables == 4
  - goapSystem.typesReady == true
effects:
  - goapSystem.plannerReady = true
cost: 4.0
category: implementation
dependencies: [goap-schema]
```

**Create:** `v3/src/planning/goap-planner.ts`

Port from V2 with adaptations:
- Use V3 database patterns (better-sqlite3 via HybridBackend)
- Integrate with PatternStore for plan signature caching
- Add QEDomain filtering to action selection
- Support V3 agent types

Key methods:
```typescript
export class GOAPPlanner {
  constructor(private db: Database, private patternStore?: PatternStore) {}

  async findPlan(current: V3WorldState, goal: StateConditions, constraints?: PlanConstraints): Promise<GOAPPlan | null>

  // A* search implementation (port from V2)
  private async aStarSearch(start: PlanNode, goal: StateConditions): Promise<PlanNode | null>

  // Plan reuse via PatternStore (V3 enhancement)
  private async tryReuseSimilarPlan(current: V3WorldState, goal: StateConditions): Promise<GOAPPlan | null>

  // Integration with RL for action cost learning
  async updateActionCostFromRL(actionId: string, executionResult: ExecutedAction): Promise<void>
}
```

#### Action 2.4: Seed QE Action Library
```yaml
id: goap-actions-seed
name: Seed QE Action Library
agentType: coder
preconditions:
  - goapSystem.plannerReady == true
effects:
  - goapSystem.actionsLoaded >= 30
cost: 2.0
category: data
dependencies: [goap-planner]
```

**Create:** `v3/src/planning/actions/qe-action-library.ts`

Categorized actions:
- **Coverage Actions**: measure-coverage, analyze-gaps, generate-tests-for-coverage
- **Test Actions**: run-unit-tests, run-integration-tests, run-e2e-tests
- **Security Actions**: security-scan, vulnerability-check, owasp-audit
- **Performance Actions**: benchmark, load-test, profile
- **Fleet Actions**: spawn-agent, scale-fleet, optimize-topology
- **Analysis Actions**: analyze-complexity, detect-code-smells, measure-quality

#### Action 2.5: Create Plan Executor
```yaml
id: goap-executor
name: Create Plan Executor
agentType: coder
preconditions:
  - goapSystem.plannerReady == true
  - goapSystem.actionsLoaded >= 30
effects:
  - goapSystem.executorReady = true
cost: 3.0
category: implementation
dependencies: [goap-actions-seed]
```

**Create:** `v3/src/planning/plan-executor.ts`

```typescript
export class PlanExecutor {
  constructor(
    private planner: GOAPPlanner,
    private agentSpawner: AgentSpawner,
    private rlIntegration?: RLSuiteIntegration
  ) {}

  async execute(plan: GOAPPlan): Promise<ExecutionResult>
  async executeStepped(plan: GOAPPlan, onStep: (step: ExecutionStep) => void): Promise<ExecutionResult>
  async replanOnFailure(failedStep: ExecutedAction, originalPlan: GOAPPlan): Promise<GOAPPlan | null>
}
```

#### Action 2.6: Integrate GOAP with V3 MCP
```yaml
id: goap-mcp
name: Integrate GOAP with MCP Handlers
agentType: coder
preconditions:
  - goapSystem.executorReady == true
effects:
  - goapSystem.mcpToolsReady = true
cost: 2.0
category: integration
dependencies: [goap-executor]
```

**Modify:** `v3/src/mcp/tools/registry.ts` and create `v3/src/mcp/tools/planning/`

Add MCP tools:
- `goap_plan` - Find optimal plan for goal
- `goap_execute` - Execute a plan
- `goap_suggest` - Get action suggestions
- `goap_status` - Get current world state

### Success Criteria for Goal 2
- [ ] 4 GOAP tables created and indexed
- [ ] GOAPPlanner finds optimal plans using A*
- [ ] 30+ QE actions seeded
- [ ] Plan executor integrates with agent spawning
- [ ] MCP tools available for planning
- [ ] Performance: Plan finding <500ms for typical goals

---

## Goal 3: Dream Cycles Integration

### Goal Definition
Enable pattern discovery through simulated "dreaming" using concept graphs and spreading activation.

### Current Gap Analysis

**V2 Has:**
- `DreamEngine` class orchestrating dream cycles
- `ConceptGraph` with nodes and edges
- `SpreadingActivation` for association discovery
- `InsightGenerator` for novel pattern synthesis
- 5 tables: `dream_cycles`, `dream_insights`, `concept_nodes`, `concept_edges`, `synthesized_patterns`

**V3 Lacks:**
- No concept graph
- No spreading activation
- No dream/insight system

### Actions

#### Action 3.1: Design V3 Dream System Architecture
```yaml
id: dream-architecture
name: Design V3 Dream System Architecture
agentType: architect
preconditions:
  - patternStore.initialized == true
effects:
  - dreamCycles.architectureReady = true
cost: 1.5
category: design
```

**Create:** `v3/src/learning/dream/README.md`

Key design decisions:
1. **Integration Point**: Dream system feeds into PatternStore
2. **Trigger**: Background worker (hooks worker) or scheduled
3. **Concept Source**: QE patterns, execution logs, code intelligence
4. **Output**: New patterns for PatternStore with `synthesized: true` flag

#### Action 3.2: Create Dream Schema
```yaml
id: dream-schema
name: Create Dream Database Schema
agentType: database-specialist
preconditions:
  - dreamCycles.architectureReady == true
effects:
  - dreamCycles.tables = 4
cost: 1.0
category: schema
dependencies: [dream-architecture]
```

**Create:** `v3/src/learning/dream/schema/dream-tables.sql`

```sql
-- Concept Graph Nodes (integrated with qe_patterns)
CREATE TABLE IF NOT EXISTS concept_nodes (
  id TEXT PRIMARY KEY,
  concept_type TEXT NOT NULL,  -- 'pattern', 'technique', 'domain', 'outcome', 'error'
  content TEXT NOT NULL,
  embedding BLOB,
  activation_level REAL DEFAULT 0.0,
  last_activated TEXT,
  pattern_id TEXT,             -- Links to qe_patterns if derived from pattern
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id)
);

-- Concept Edges (associations)
CREATE TABLE IF NOT EXISTS concept_edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  weight REAL NOT NULL,
  edge_type TEXT NOT NULL,  -- 'similarity', 'causation', 'co_occurrence', 'sequence'
  evidence INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source) REFERENCES concept_nodes(id),
  FOREIGN KEY (target) REFERENCES concept_nodes(id)
);

-- Dream Cycles (history)
CREATE TABLE IF NOT EXISTS dream_cycles (
  id TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_ms INTEGER,
  concepts_processed INTEGER,
  associations_found INTEGER,
  insights_generated INTEGER,
  status TEXT DEFAULT 'running',
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Dream Insights (generated patterns)
CREATE TABLE IF NOT EXISTS dream_insights (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,  -- 'pattern_merge', 'novel_association', 'optimization'
  source_concepts TEXT NOT NULL,  -- JSON array of concept IDs
  description TEXT NOT NULL,
  novelty_score REAL,
  actionable BOOLEAN DEFAULT 0,
  applied BOOLEAN DEFAULT 0,
  pattern_id TEXT,             -- Created pattern ID if applied
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cycle_id) REFERENCES dream_cycles(id),
  FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id)
);

CREATE INDEX IF NOT EXISTS idx_concept_type ON concept_nodes(concept_type);
CREATE INDEX IF NOT EXISTS idx_concept_activation ON concept_nodes(activation_level);
CREATE INDEX IF NOT EXISTS idx_edge_source ON concept_edges(source);
CREATE INDEX IF NOT EXISTS idx_edge_target ON concept_edges(target);
CREATE INDEX IF NOT EXISTS idx_insight_cycle ON dream_insights(cycle_id);
```

#### Action 3.3: Implement ConceptGraph Class
```yaml
id: dream-concept-graph
name: Implement ConceptGraph Class
agentType: coder
preconditions:
  - dreamCycles.tables == 4
effects:
  - dreamCycles.conceptGraphReady = true
cost: 3.0
category: implementation
dependencies: [dream-schema]
```

**Create:** `v3/src/learning/dream/concept-graph.ts`

Port from V2 with V3 enhancements:
- Use PatternStore embeddings for concept similarity
- Integrate with HNSW for fast neighbor search
- Support QEDomain filtering

#### Action 3.4: Implement SpreadingActivation
```yaml
id: dream-activation
name: Implement SpreadingActivation
agentType: coder
preconditions:
  - dreamCycles.conceptGraphReady == true
effects:
  - dreamCycles.activationReady = true
cost: 2.5
category: implementation
dependencies: [dream-concept-graph]
```

**Create:** `v3/src/learning/dream/spreading-activation.ts`

Port core algorithm from V2:
- Random activation injection (dreaming)
- Weighted propagation along edges
- Decay over iterations
- Association discovery from co-activation

#### Action 3.5: Implement InsightGenerator
```yaml
id: dream-insights
name: Implement InsightGenerator
agentType: coder
preconditions:
  - dreamCycles.activationReady == true
effects:
  - dreamCycles.insightGeneratorReady = true
cost: 2.5
category: implementation
dependencies: [dream-activation]
```

**Create:** `v3/src/learning/dream/insight-generator.ts`

Generate insights from novel associations:
- Pattern merging (combine similar patterns)
- Novel connections (unexpected concept links)
- Optimization suggestions (improve existing patterns)

#### Action 3.6: Implement DreamEngine
```yaml
id: dream-engine
name: Implement DreamEngine
agentType: coder
preconditions:
  - dreamCycles.insightGeneratorReady == true
effects:
  - dreamCycles.engineReady = true
cost: 3.0
category: implementation
dependencies: [dream-insights]
```

**Create:** `v3/src/learning/dream/dream-engine.ts`

Orchestrator class:
```typescript
export class DreamEngine {
  constructor(
    private graph: ConceptGraph,
    private activation: SpreadingActivation,
    private generator: InsightGenerator,
    private patternStore: PatternStore
  ) {}

  async dream(durationMs: number): Promise<DreamCycleResult>
  async loadPatternsAsConcepts(): Promise<void>
  async applyInsight(insightId: string): Promise<QEPattern | null>
  getPendingInsights(limit?: number): Promise<DreamInsight[]>
}
```

#### Action 3.7: Integrate with Hooks Worker
```yaml
id: dream-hooks
name: Integrate Dream with Hooks Worker
agentType: coder
preconditions:
  - dreamCycles.engineReady == true
effects:
  - dreamCycles.workerIntegrated = true
cost: 1.5
category: integration
dependencies: [dream-engine]
```

**Modify:** Add `consolidate` worker trigger for dream cycles

The existing hooks worker system (12 workers) can trigger dreams during low-activity periods.

### Success Criteria for Goal 3
- [ ] 4 dream tables created
- [ ] ConceptGraph loads from PatternStore
- [ ] SpreadingActivation discovers novel associations
- [ ] InsightGenerator creates actionable insights
- [ ] DreamEngine completes cycles in <30 seconds
- [ ] Generated insights become reusable patterns

---

## Implementation Priority and Dependencies

### Dependency Graph

```
Goal 1: Q-Values Persistence
  1.1 Schema ─────────────────┐
                               │
  1.2 QValueStore ◄───────────┤
          │                    │
  1.3 BaseRLAlgorithm ◄───────┤
          │                    │
  1.4 Migration ◄─────────────┘

Goal 2: GOAP System
  2.1 Types ──────────────────┐
                               │
  2.2 Schema ◄────────────────┤
          │                    │
  2.3 GOAPPlanner ◄───────────┤
          │                    │
  2.4 Action Library ◄────────┤
          │                    │
  2.5 Executor ◄──────────────┤
          │                    │
  2.6 MCP Integration ◄───────┘

Goal 3: Dream Cycles
  3.1 Architecture ───────────┐
                               │
  3.2 Schema ◄────────────────┤
          │                    │
  3.3 ConceptGraph ◄──────────┤
          │                    │
  3.4 SpreadingActivation ◄───┤
          │                    │
  3.5 InsightGenerator ◄──────┤
          │                    │
  3.6 DreamEngine ◄───────────┤
          │                    │
  3.7 Worker Integration ◄────┘
```

### Recommended Execution Order

| Phase | Actions | Est. Effort | Agent Assignment |
|-------|---------|-------------|------------------|
| **Phase 1** | 1.1, 1.2 | 1-2 days | database-specialist, coder |
| **Phase 2** | 2.1, 2.2, 2.3 | 2-3 days | architect, database-specialist, coder |
| **Phase 3** | 1.3, 1.4, 2.4 | 2 days | coder |
| **Phase 4** | 2.5, 2.6 | 2 days | coder |
| **Phase 5** | 3.1, 3.2, 3.3 | 2 days | architect, database-specialist, coder |
| **Phase 6** | 3.4, 3.5, 3.6 | 3 days | coder |
| **Phase 7** | 3.7 + integration testing | 1-2 days | coder, tester |

**Total Estimated Effort: 13-16 days**

---

## Agent Assignments for Swarm Execution

### Coordinator
- **Agent**: `hierarchical-coordinator` or `v3-queen-coordinator`
- **Role**: Orchestrate parallel work, manage dependencies, sync results

### Parallel Execution Groups

**Group A (Database & Schema):**
- `database-specialist`: Actions 1.1, 2.2, 3.2
- Can run in parallel after types are defined

**Group B (Core Implementation):**
- `coder` (primary): Actions 1.2, 2.3, 3.3, 3.4, 3.5
- Sequential within goal, parallel across goals after schemas

**Group C (Integration):**
- `coder` (secondary): Actions 1.3, 2.5, 2.6, 3.6, 3.7
- Depends on Group B completion

**Group D (Testing & Validation):**
- `tester`: Validate each action's success criteria
- `reviewer`: Code review before merge

**Group E (Migration):**
- `coder`: Action 1.4, V2 data migration
- Runs after core implementation

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| V2/V3 schema conflicts | Medium | High | Use prefixed tables, migration scripts |
| A* performance at scale | Low | Medium | Add iteration limits, caching |
| Dream cycle timeout | Medium | Low | Configurable duration, interruptible |
| Memory pressure from ConceptGraph | Medium | Medium | Lazy loading, LRU cache |
| Breaking existing V3 tests | Medium | High | Feature flags, incremental rollout |

---

## Success Metrics

### Goal 1: Q-Values Persistence
- Q-values persist across process restarts
- Q-learning test coverage >= 85%
- Migration imports 100% of V2 q_values

### Goal 2: GOAP System
- A* finds plans for 10 standard QE goals
- Plan reuse hits >= 50% after 100 plans
- Execution success rate >= 90%

### Goal 3: Dream Cycles
- Dream cycle completes in <30s
- Generates >= 3 actionable insights per cycle
- Applied insights improve pattern reuse by >= 10%

---

## Appendix: File Manifest

### New Files to Create

```
v3/src/integrations/rl-suite/persistence/
  q-value-store.ts
  q-value-store.test.ts
  schema/q-values.sql

v3/src/planning/
  types.ts
  goap-planner.ts
  plan-executor.ts
  actions/qe-action-library.ts
  schema/goap-tables.sql
  index.ts

v3/src/learning/dream/
  README.md
  concept-graph.ts
  spreading-activation.ts
  insight-generator.ts
  dream-engine.ts
  schema/dream-tables.sql
  index.ts

v3/src/mcp/tools/planning/
  goap-plan.ts
  goap-execute.ts
  goap-status.ts
  index.ts
```

### Files to Modify

```
v3/src/integrations/rl-suite/base-algorithm.ts  (add persistence hooks)
v3/src/integrations/rl-suite/algorithms/q-learning.ts  (use QValueStore)
v3/src/learning/v2-to-v3-migration.ts  (add GOAP/Dream migration)
v3/src/mcp/tools/registry.ts  (register planning tools)
v3/src/mcp/handlers/core-handlers.ts  (add planning handlers)
v3/src/kernel/hybrid-backend.ts  (ensure GOAP/Dream schemas)
```

---

*This GOAP plan was generated for execution by a swarm of claude-flow agents. Each action can be independently executed and verified by the assigned agent type.*
