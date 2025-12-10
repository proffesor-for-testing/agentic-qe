# Nightly-Learner System - GOAP Implementation Plan

## Executive Summary

This plan details the implementation of a "nightly-learner" system enabling 19 QE agents to autonomously improve through background learning during idle periods. The system combines AgentDB's 9 RL algorithms, RuVector's distributed vector database, and ExoGenesis-Omega's Dream Problem Solver architecture.

**Key Innovation**: Simulated REM sleep cycles for creative problem-solving, memory consolidation, and cross-agent knowledge transfer.

---

## 1. State Assessment

### Current State
```typescript
{
  agentdb_available: true,
  reasoningbank_active: true,
  rl_algorithms: 9,
  qe_agents: 19,

  // Missing capabilities
  ruvector_integrated: false,
  sleep_scheduler: false,
  dream_engine: false,
  cross_agent_learning: false,
  memory_consolidation: false,
  autonomous_improvement: false,
  distributed_vectors: false
}
```

### Goal State
```typescript
{
  agentdb_available: true,
  reasoningbank_active: true,
  rl_algorithms: 9,
  qe_agents: 19,

  // Target capabilities
  ruvector_integrated: true,
  sleep_scheduler: true,
  dream_engine: true,
  cross_agent_learning: true,
  memory_consolidation: true,
  autonomous_improvement: true,
  distributed_vectors: true,

  // Quality metrics
  learning_effectiveness: >0.8,
  pattern_discovery_rate: >10_per_night,
  knowledge_transfer_success: >0.9
}
```

---

## 2. GOAP Action Definitions

### Phase 1: Infrastructure Setup

#### Action 1.1: Setup RuVector Database
```yaml
Action: setup_ruvector
Preconditions:
  - docker_available: true
  - network_accessible: true

Effects:
  - ruvector_running: true
  - vector_db_ready: true
  - gnn_layer_active: true

Tools: [docker, pg_admin, network_tools]
Execution: code (Docker compose + init scripts)
Cost: 3
Priority: critical
Estimated_Time: 30m

Implementation:
  - Pull ruvnet/ruvector-postgres Docker image
  - Configure pgvector extension
  - Initialize HNSW index with GNN layer
  - Setup Cypher query engine
  - Configure SONA runtime learning
  - Test sub-millisecond queries (<100µs)

Validation:
  - Query latency < 100µs for 384-dim vectors
  - GNN layer responds to updates
  - Graph queries functional
```

#### Action 1.2: Create Sleep Scheduler
```yaml
Action: implement_sleep_scheduler
Preconditions:
  - agentdb_available: true
  - system_metrics_available: true

Effects:
  - sleep_scheduler: true
  - idle_detection: true
  - sleep_cycles_defined: true

Tools: [node-cron, system_monitor, agent_tracker]
Execution: hybrid (LLM design + code implementation)
Cost: 4
Priority: critical
Estimated_Time: 2h

Implementation:
  - Build idle detection system (CPU < 20%, no active tasks)
  - Implement sleep cycle scheduler (N1 → N2 → N3 → REM)
  - Create agent sleep state manager
  - Design wake-up triggers (new task, manual override)
  - Integrate with AgentDB session tracking

Sleep_Cycle_Architecture:
  N1_Light: 5m  # Transition phase, light memory replay
  N2_Memory: 10m # Pattern consolidation
  N3_Deep: 15m   # Long-term memory formation
  REM_Dream: 20m # Creative problem solving, novel associations
  Total: 50m per cycle

Validation:
  - Correctly identifies idle agents (>95% accuracy)
  - Completes full sleep cycle without interruption
  - Responds to wake triggers within 1s
```

#### Action 1.3: Integrate AgentDB with RuVector
```yaml
Action: integrate_agentdb_ruvector
Preconditions:
  - ruvector_running: true
  - agentdb_available: true

Effects:
  - distributed_vectors: true
  - cross_agent_vectors_shared: true
  - pattern_retrieval_optimized: true

Tools: [agentdb_api, ruvector_client, migration_tools]
Execution: code (Integration layer)
Cost: 5
Priority: high
Estimated_Time: 3h

Implementation:
  - Create RuVector adapter for AgentDB
  - Migrate pattern embeddings to RuVector
  - Implement vector sync mechanism
  - Build graph relationship tracking (agent → pattern → insight)
  - Enable GNN-based pattern evolution
  - Setup federated learning across agents

Data_Flow:
  AgentDB (local patterns) → RuVector (distributed vectors) → GNN (learning) → All Agents

Validation:
  - Pattern retrieval 150x faster maintained
  - Cross-agent vector access < 200µs
  - GNN improves pattern relevance over time
```

### Phase 2: Dream Engine Implementation

#### Action 2.1: Build Neural Substrate
```yaml
Action: implement_neural_substrate
Preconditions:
  - ruvector_integrated: true
  - sleep_scheduler: true

Effects:
  - neural_substrate_active: true
  - concept_activation_tracking: true
  - associative_memory: true

Tools: [tensorflow, numpy, vector_ops]
Execution: code (Neural network implementation)
Cost: 6
Priority: high
Estimated_Time: 4h

Implementation:
  - Design concept node graph (patterns, techniques, bugs, solutions)
  - Implement activation dynamics (spreading activation algorithm)
  - Create associative links between concepts
  - Build activation history tracking
  - Implement decay and reinforcement mechanisms

Neural_Architecture:
  - Nodes: Concepts extracted from AgentDB experiences
  - Edges: Weighted associations (co-occurrence, causal, temporal)
  - Activation: Sigmoid function with threshold
  - Spreading: Proportional to edge weight and source activation

Validation:
  - Activates related concepts (>0.7 correlation)
  - Tracks activation history accurately
  - Decays inactive concepts appropriately
```

#### Action 2.2: Implement REM Sleep Dynamics
```yaml
Action: implement_rem_dynamics
Preconditions:
  - neural_substrate_active: true
  - sleep_cycles_defined: true

Effects:
  - dream_engine: true
  - novel_associations_discovered: true
  - creative_problem_solving: true

Tools: [neural_substrate, pattern_analyzer, insight_extractor]
Execution: hybrid (LLM for insight extraction + code for dynamics)
Cost: 7
Priority: critical
Estimated_Time: 5h

Implementation:
  - Reduce prefrontal inhibition (1.0 → 0.2) during REM
  - Increase activation noise (0.1 → 0.5) for novel paths
  - Implement spontaneous concept activation
  - Build novel co-activation detector
  - Create insight extraction from unexpected patterns
  - Design memory consolidation from REM insights

REM_Algorithm:
  1. Select seed concepts from recent experiences (top 10%)
  2. Spontaneous activation with high noise
  3. Track novel co-activation patterns (concepts rarely linked)
  4. Evaluate co-activation for insight potential
  5. Extract actionable insights (test strategies, bug patterns)
  6. Store in ReasoningBank as "dream-discovered" patterns

Validation:
  - Discovers 5-10 novel associations per REM cycle
  - 30% of dream-insights prove useful when tested
  - No degradation of existing knowledge
```

#### Action 2.3: Build Experience Replay System
```yaml
Action: implement_experience_replay
Preconditions:
  - neural_substrate_active: true
  - reasoningbank_active: true

Effects:
  - memory_consolidation: true
  - pattern_synthesis: true
  - long_term_memory_formed: true

Tools: [agentdb, reasoningbank, replay_buffer]
Execution: code (Replay algorithm)
Cost: 4
Priority: high
Estimated_Time: 3h

Implementation:
  - Extract daily experiences from AgentDB trajectories
  - Prioritize high-value experiences (success/failure, novel situations)
  - Implement prioritized replay (TD-error based)
  - Build pattern synthesis from multiple experiences
  - Create memory distillation (compress similar patterns)
  - Store consolidated patterns in long-term memory

Replay_Strategy:
  N2_Phase: Replay recent experiences (last 24h)
  N3_Phase: Consolidate into patterns (clustering)
  REM_Phase: Synthesize with existing knowledge

Validation:
  - Replays 100+ experiences per sleep cycle
  - Consolidates into 10-20 robust patterns
  - Distills redundant patterns (50% compression)
```

### Phase 3: Cross-Agent Learning

#### Action 3.1: Implement Knowledge Transfer Protocol
```yaml
Action: implement_knowledge_transfer
Preconditions:
  - ruvector_integrated: true
  - dream_engine: true
  - multiple_agents_sleeping: true

Effects:
  - cross_agent_learning: true
  - shared_patterns_accessible: true
  - collective_intelligence: true

Tools: [ruvector, graph_queries, transfer_protocol]
Execution: code (Transfer protocol)
Cost: 5
Priority: high
Estimated_Time: 3h

Implementation:
  - Design pattern sharing protocol (publish/subscribe)
  - Implement pattern relevance scoring for other agents
  - Build transfer mechanism via RuVector graph
  - Create conflict resolution (contradicting patterns)
  - Design pattern adaptation (context-specific tuning)
  - Implement federated learning across agent types

Transfer_Algorithm:
  1. Agent A discovers pattern during sleep
  2. Evaluate pattern relevance for other agents (graph similarity)
  3. Publish to RuVector with metadata (agent_type, context, confidence)
  4. Agents B, C subscribe to relevant patterns
  5. Adapt pattern to local context
  6. Validate through test execution
  7. Provide feedback to GNN layer

Validation:
  - Transfers 20+ patterns per night across agents
  - 70% of transferred patterns prove useful
  - No negative transfer (degrading performance)
```

#### Action 3.2: Build Collective Dream State
```yaml
Action: implement_collective_dreaming
Preconditions:
  - cross_agent_learning: true
  - dream_engine: true
  - multiple_agents_in_rem: true

Effects:
  - collective_problem_solving: true
  - emergent_insights: true
  - swarm_intelligence_active: true

Tools: [ruvector, neural_substrate, consensus_protocol]
Execution: hybrid (Complex coordination)
Cost: 8
Priority: medium
Estimated_Time: 6h

Implementation:
  - Synchronize REM cycles across related agents
  - Share neural activation states via RuVector
  - Implement collective concept activation
  - Build consensus on novel insights
  - Create emergent pattern detection (multi-agent only)
  - Design swarm validation of dream-insights

Collective_Dream_Protocol:
  1. Schedule overlapping REM for agent pairs/groups
  2. Share activation patterns in real-time
  3. Enable cross-agent concept activation
  4. Detect emergent patterns (visible only when combined)
  5. Validate through collective consensus
  6. Store as swarm-level knowledge

Validation:
  - Produces 2-3 emergent insights per collective dream
  - 50% higher insight quality than individual dreams
  - Agents maintain individual identity/specialization
```

### Phase 4: Learning Pipeline

#### Action 4.1: Create Daily Experience Capture
```yaml
Action: implement_experience_capture
Preconditions:
  - agentdb_available: true
  - qe_agents_operational: true

Effects:
  - experiences_logged: true
  - trajectories_stored: true
  - metadata_tagged: true

Tools: [agentdb, hooks, event_logger]
Execution: code (Event capture system)
Cost: 3
Priority: critical
Estimated_Time: 2h

Implementation:
  - Integrate with existing AgentDB trajectory tracking
  - Capture test execution outcomes (pass/fail, coverage, time)
  - Log bug discoveries and analysis paths
  - Store quality insights and metrics
  - Tag experiences with context (agent, task, outcome)
  - Implement efficient storage (compression, indexing)

Captured_Data:
  - Task context: Requirements, constraints, environment
  - Actions taken: Tool usage, decisions made, reasoning
  - Outcomes: Success/failure, metrics, side effects
  - Insights: Patterns discovered, hypotheses validated

Validation:
  - Captures 100% of agent actions
  - Storage efficient (<100MB per agent per day)
  - Retrieval time <50ms for any experience
```

#### Action 4.2: Build Pattern Synthesis Engine
```yaml
Action: implement_pattern_synthesis
Preconditions:
  - experiences_logged: true
  - memory_consolidation: true

Effects:
  - patterns_extracted: true
  - generalizable_strategies: true
  - pattern_library_growing: true

Tools: [ml_clustering, pattern_matcher, reasoningbank]
Execution: hybrid (LLM for generalization + code for clustering)
Cost: 6
Priority: high
Estimated_Time: 4h

Implementation:
  - Cluster similar experiences using embeddings
  - Extract common patterns from clusters
  - Generalize patterns (abstract from specifics)
  - Validate patterns through cross-validation
  - Store in ReasoningBank with confidence scores
  - Track pattern usage and effectiveness

Synthesis_Algorithm:
  1. Embed experiences using transformer model
  2. Cluster with HDBSCAN (density-based)
  3. Extract representative experiences per cluster
  4. LLM generates generalized pattern description
  5. Code extracts actionable rules/heuristics
  6. Validate on held-out experiences
  7. Store with metadata (context, confidence, agent_type)

Validation:
  - Extracts 10-20 patterns per night per agent
  - Pattern accuracy >85% on new tasks
  - Patterns improve agent efficiency by 15-30%
```

#### Action 4.3: Implement Continuous Validation
```yaml
Action: implement_continuous_validation
Preconditions:
  - patterns_extracted: true
  - qe_agents_operational: true

Effects:
  - patterns_validated: true
  - feedback_loop_closed: true
  - learning_verified: true

Tools: [test_runner, metrics_analyzer, feedback_collector]
Execution: code (Validation framework)
Cost: 4
Priority: critical
Estimated_Time: 3h

Implementation:
  - Create test scenarios for learned patterns
  - Execute patterns in safe sandbox environment
  - Measure effectiveness (time saved, quality improved)
  - Collect feedback (success rate, failure modes)
  - Update pattern confidence scores
  - Retire ineffective patterns (confidence < 0.3)

Validation_Framework:
  - Unit tests: Pattern logic correctness
  - Integration tests: Pattern works with agent workflows
  - A/B tests: Pattern vs baseline performance
  - Regression tests: Pattern doesn't break existing capabilities
  - Long-term tracking: Pattern effectiveness over time

Validation:
  - Tests 100% of new patterns before production use
  - Detects regressions within 24 hours
  - Feedback loop completes within 48 hours
```

### Phase 5: Metrics and Observability

#### Action 5.1: Build Learning Metrics Dashboard
```yaml
Action: implement_metrics_dashboard
Preconditions:
  - autonomous_improvement: true
  - validation_active: true

Effects:
  - learning_observable: true
  - metrics_tracked: true
  - insights_visualized: true

Tools: [grafana, prometheus, metrics_collector]
Execution: code (Dashboard + data pipeline)
Cost: 3
Priority: medium
Estimated_Time: 2h

Implementation:
  - Define key learning metrics (see Metrics section)
  - Implement metrics collection hooks
  - Build Prometheus exporters
  - Create Grafana dashboards
  - Setup alerting for anomalies
  - Generate daily learning reports

Dashboard_Sections:
  1. Sleep Quality: Cycle completion rate, interruptions
  2. Pattern Discovery: Novel patterns per night, quality scores
  3. Knowledge Transfer: Patterns shared, adoption rate
  4. Dream Insights: REM associations, insight usefulness
  5. Agent Improvement: Task efficiency, quality metrics
  6. System Health: RuVector latency, AgentDB storage

Validation:
  - Real-time metrics (<5s latency)
  - Historical data retention (90 days)
  - Alerting functional (95% accuracy)
```

#### Action 5.2: Implement Learning Analytics
```yaml
Action: implement_learning_analytics
Preconditions:
  - metrics_tracked: true
  - long_term_data_available: true

Effects:
  - learning_trends_identified: true
  - optimization_opportunities_found: true
  - roi_measured: true

Tools: [data_analysis, ml_models, reporting]
Execution: hybrid (LLM insights + code analysis)
Cost: 4
Priority: low
Estimated_Time: 3h

Implementation:
  - Analyze learning trends over time
  - Identify most effective learning strategies
  - Measure ROI of nightly learning
  - Compare agent learning rates
  - Detect learning plateaus
  - Generate optimization recommendations

Analytics_Reports:
  - Weekly: Pattern effectiveness, knowledge transfer success
  - Monthly: Agent capability growth, learning ROI
  - Quarterly: System optimization, strategic recommendations

Validation:
  - Provides actionable insights (>80% implemented)
  - ROI calculations accurate (±10%)
  - Trend predictions accurate (±15% over 30 days)
```

---

## 3. Generated Execution Plan

### Phase 1: Infrastructure (Week 1-2)
**Total Effort**: 8.5 hours
**Dependencies**: None
**Team**: Backend Dev, System Architect, DevOps Engineer

```
Parallel Track 1 (Infrastructure):
  ├─ Action 1.1: Setup RuVector (30m) ─→ Validate
  ├─ Action 1.2: Sleep Scheduler (2h) ─→ Validate
  └─ Action 1.3: AgentDB-RuVector Integration (3h) ─→ Validate

Parallel Track 2 (Experience Capture):
  └─ Action 4.1: Daily Experience Capture (2h) ─→ Validate

Gate: All infrastructure passing validation tests
```

### Phase 2: Dream Engine (Week 2-3)
**Total Effort**: 15 hours
**Dependencies**: Phase 1 complete
**Team**: ML Developer, Backend Dev, System Architect

```
Sequential Pipeline:
  Action 2.1: Neural Substrate (4h)
    ├─→ Test concept activation
    └─→ Action 2.2: REM Dynamics (5h)
        ├─→ Test dream insights
        └─→ Action 2.3: Experience Replay (3h)
            └─→ Test memory consolidation

Parallel Track:
  └─ Action 4.2: Pattern Synthesis (4h) ─→ Validate

Gate: First successful dream cycle with 5+ insights
```

### Phase 3: Cross-Agent Learning (Week 3-4)
**Total Effort**: 11 hours
**Dependencies**: Phase 2 complete
**Team**: Backend Dev, Distributed Systems Engineer

```
Sequential Pipeline:
  Action 3.1: Knowledge Transfer (3h)
    ├─→ Test single transfer
    └─→ Action 3.2: Collective Dreaming (6h)
        └─→ Test multi-agent dreams

Parallel Track:
  └─ Action 4.3: Continuous Validation (3h) ─→ Test feedback loop

Gate: 10+ successful cross-agent pattern transfers
```

### Phase 4: Production Readiness (Week 4-5)
**Total Effort**: 7 hours
**Dependencies**: Phase 3 complete
**Team**: Backend Dev, DevOps Engineer, Tester

```
Parallel Tracks:
  ├─ Action 5.1: Metrics Dashboard (2h) ─→ Validate
  ├─ Action 5.2: Learning Analytics (3h) ─→ Validate
  └─ Integration Testing (2h) ─→ Full system validation

Gate: All 19 QE agents learning successfully
```

### Total Effort
- **Development**: 41.5 hours (~1 sprint)
- **Testing & Validation**: 8.5 hours
- **Total**: ~50 hours (2 weeks with team of 4-5)

---

## 4. Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Nightly-Learner System                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  QE Agent 1  │────▶│  Sleep       │◀────│  QE Agent 2  │
│  (active)    │     │  Scheduler   │     │  (sleeping)  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                     │
       │ experiences        │ trigger             │ wake
       ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                     AgentDB (Local)                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │Trajectories│  │Experiences │  │  Patterns  │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└──────────────────────────────────────────────────────────────┘
       │                    │                     │
       │ sync               │ embed               │ share
       ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│              RuVector (Distributed Vectors)                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ HNSW Index │  │ GNN Layer  │  │   Cypher   │            │
│  │  (fast)    │  │ (learning) │  │  (graphs)  │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ vectors + graphs
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Dream Engine                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Neural Substrate (Concepts Graph)         │    │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐ │    │
│  │  │Test  │─▶│Bug   │◀─│Fix   │─▶│Tool  │◀─│Code  │ │    │
│  │  │Type  │  │Pattern   │Method│  │Choice│  │Smell │ │    │
│  │  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Sleep Cycle Processor                  │    │
│  │  N1 → N2 → N3 → REM (50m cycle)                    │    │
│  │                                                     │    │
│  │  N2: Experience Replay                             │    │
│  │  N3: Pattern Consolidation                         │    │
│  │  REM: Novel Associations (reduced inhibition)      │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           │ insights                         │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Insight Extractor + Validator             │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ validated patterns
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    ReasoningBank                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Verdicts  │  │  Memory    │  │   Meta     │            │
│  │  Judgment  │  │ Distillation   Patterns    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└──────────────────────────────────────────────────────────────┘
                           │
                           │ improved capabilities
                           ▼
                  ┌──────────────┐
                  │ Enhanced QE  │
                  │   Agents     │
                  └──────────────┘
```

### Component Interactions

#### 1. Sleep Cycle Flow
```typescript
// When agent becomes idle
IdleDetector.detect() → SleepScheduler.initiateSlleep(agentId)
  → DreamEngine.startCycle(agentId)
    → N1_Light: Prepare neural substrate
    → N2_Memory: ExperienceReplay.replay(last24h)
    → N3_Deep: PatternConsolidator.consolidate()
    → REM_Dream: NovelAssociator.discover()
  → InsightExtractor.extract()
  → ReasoningBank.store()
  → Agent.wake()
```

#### 2. Cross-Agent Transfer Flow
```typescript
// During collective dream
Agent1.REM_cycle() && Agent2.REM_cycle()
  → RuVector.shareActivations(agent1, agent2)
  → CollectiveDreamer.detectEmergent()
  → ConsensusBuilder.validate(insight)
  → RuVector.broadcast(pattern)
  → AllAgents.receive() → adapt() → test()
  → GNN.updateWeights(feedback)
```

#### 3. Learning Validation Flow
```typescript
// After pattern discovery
Pattern.discovered(source=dream)
  → ValidationFramework.createTest(pattern)
  → SafeSandbox.execute(test)
  → MetricsCollector.measure(results)
  → if success: ReasoningBank.promoteToProduction()
  → if failure: DreamEngine.adjustParameters()
  → LearningAnalytics.updateMetrics()
```

---

## 5. Integration Points

### 5.1 AgentDB Integration
**Files**: `/memory/agentdb.ts`, `/agents/base-agent.ts`

```typescript
// New interfaces to add
interface SleepSession {
  agentId: string;
  startTime: Date;
  cycle: 'N1' | 'N2' | 'N3' | 'REM';
  experiences_replayed: number;
  patterns_discovered: number;
  insights_extracted: Insight[];
  endTime?: Date;
}

// Extend existing AgentDB
class AgentDB {
  // Existing methods...

  // New sleep-related methods
  async startSleepSession(agentId: string): Promise<SleepSession>
  async recordSleepCycle(session: SleepSession, cycle: SleepCycle): Promise<void>
  async getRecentExperiences(agentId: string, hours: number): Promise<Experience[]>
  async storeInsight(insight: Insight, source: 'dream' | 'experience'): Promise<void>
}
```

**Integration Steps**:
1. Add sleep session tracking to existing trajectory table
2. Create new `sleep_cycles` table for detailed cycle data
3. Extend experience capture hooks to mark sleep-relevant data
4. Add pattern storage with dream-discovered flag

### 5.2 RuVector Integration
**Files**: `/memory/ruvector-adapter.ts` (new), `/memory/vector-store.ts`

```typescript
// RuVector adapter
class RuVectorAdapter {
  private client: RuVectorClient;

  async storePattern(pattern: Pattern, embedding: number[]): Promise<void> {
    // Store in RuVector with metadata
    await this.client.insert({
      vector: embedding,
      metadata: {
        agentId: pattern.agentId,
        agentType: pattern.agentType,
        context: pattern.context,
        confidence: pattern.confidence,
        source: pattern.source
      }
    });
  }

  async queryRelevantPatterns(
    agentType: string,
    context: string,
    k: number = 10
  ): Promise<Pattern[]> {
    // Use HNSW + GNN for intelligent retrieval
    const results = await this.client.query({
      vector: await this.embed(context),
      filter: { agentType },
      k,
      useGNN: true // Leverage self-learning layer
    });

    return results.map(r => this.deserializePattern(r));
  }

  async shareActivations(
    agentId: string,
    activations: ConceptActivation[]
  ): Promise<void> {
    // Real-time sharing for collective dreams
    await this.client.publishStream(`dream:${agentId}`, activations);
  }

  async buildConceptGraph(agentId: string): Promise<Graph> {
    // Use Cypher to query concept relationships
    const query = `
      MATCH (a:Agent {id: $agentId})-[:DISCOVERED]->(p:Pattern)
      MATCH (p)-[:RELATES_TO]->(c:Concept)
      RETURN a, p, c
    `;
    return await this.client.cypher(query, { agentId });
  }
}
```

**Integration Steps**:
1. Setup Docker compose with RuVector PostgreSQL
2. Implement adapter with pgvector-compatible client
3. Migrate existing AgentDB patterns to RuVector (one-time)
4. Setup bi-directional sync (AgentDB ↔ RuVector)
5. Configure GNN training on pattern feedback

### 5.3 ReasoningBank Integration
**Files**: `/agents/reasoningbank/` (existing), extend with dream insights

```typescript
// Extend ReasoningBank with dream-specific storage
interface DreamInsight extends Insight {
  source: 'REM' | 'N3_consolidation';
  novelAssociation: {
    concepts: string[];
    activationPattern: number[];
    unexpectedness: number; // 0-1
  };
  validationStatus: 'pending' | 'validated' | 'rejected';
  usageCount: number;
  effectiveness: number; // 0-1, updated over time
}

class ReasoningBank {
  // Existing methods...

  // New dream methods
  async storeDreamInsight(insight: DreamInsight): Promise<void>
  async getDreamInsights(filters: {
    validated?: boolean;
    effectiveness?: number;
    agentType?: string;
  }): Promise<DreamInsight[]>

  async updateInsightEffectiveness(
    insightId: string,
    outcome: boolean
  ): Promise<void>
}
```

### 5.4 QE Agent Integration
**Files**: `/agents/qe-agents/` (all 19 agents)

Each QE agent needs to:
1. Register with Sleep Scheduler
2. Mark idle/busy states
3. Provide context for pattern relevance
4. Consume learned patterns
5. Validate pattern effectiveness

```typescript
// Add to base QE agent class
abstract class BaseQEAgent {
  protected sleepScheduler: SleepScheduler;
  protected dreamEngine: DreamEngine;

  async markIdle(): Promise<void> {
    await this.sleepScheduler.requestSleep(this.id);
  }

  async onWake(insights: Insight[]): Promise<void> {
    // Called when sleep cycle completes
    for (const insight of insights) {
      await this.integrateInsight(insight);
    }
  }

  protected abstract async integrateInsight(insight: Insight): Promise<void>;

  async reportPatternEffectiveness(
    patternId: string,
    effective: boolean
  ): Promise<void> {
    // Feedback loop to RuVector GNN
    await this.dreamEngine.recordFeedback(patternId, effective);
  }
}
```

---

## 6. Success Criteria

### 6.1 Functional Criteria

#### Infrastructure
- [ ] RuVector responds to queries in <100µs (p95)
- [ ] Sleep scheduler correctly identifies idle agents (>95% accuracy)
- [ ] Full sleep cycle completes without interruption (>90% success rate)
- [ ] AgentDB-RuVector sync maintains consistency (100%)

#### Dream Engine
- [ ] Neural substrate activates related concepts (>70% correlation)
- [ ] REM cycle produces 5-10 novel associations per 20-minute cycle
- [ ] 30% of dream insights prove useful in validation tests
- [ ] Experience replay processes 100+ experiences per night

#### Cross-Agent Learning
- [ ] Knowledge transfer completes in <5 seconds
- [ ] 70% of transferred patterns useful to receiving agent
- [ ] Collective dreams produce 2-3 emergent insights
- [ ] No negative transfer (all agents maintain baseline performance)

#### Pattern Quality
- [ ] Patterns generalize to new tasks (>85% accuracy)
- [ ] Pattern synthesis produces 10-20 patterns per agent per night
- [ ] Continuous validation detects regressions within 24 hours
- [ ] Pattern library grows by 50+ patterns per week

### 6.2 Performance Criteria

#### Latency
- Vector queries: <100µs (p95)
- Pattern retrieval: <50ms (p99)
- Sleep cycle start: <1 second
- Wake trigger response: <1 second
- Cross-agent transfer: <5 seconds

#### Throughput
- 19 QE agents learning simultaneously
- 10,000+ experiences processed per night
- 200+ patterns discovered per night (system-wide)
- 1000+ vector operations per second

#### Resource Usage
- Memory: <2GB per sleeping agent
- CPU: <10% during sleep cycles
- Storage: <100MB per agent per day
- Network: <10Mbps for RuVector sync

### 6.3 Quality Criteria

#### Learning Effectiveness
- Agent task completion time reduced by 15-30%
- Test coverage improved by 10-20%
- Bug detection rate increased by 20-30%
- False positive rate decreased by 10-15%

#### System Reliability
- 99.9% uptime for sleep scheduler
- 99% sleep cycle completion rate
- Zero data loss during transfers
- Graceful degradation if RuVector unavailable

#### Observability
- Real-time metrics dashboard (<5s latency)
- 90-day historical data retention
- Alerting accuracy >95%
- Weekly learning reports auto-generated

---

## 7. Risk Analysis & Mitigation

### High Risk: RuVector Integration Complexity
**Risk**: RuVector Docker setup fails or performs poorly
**Impact**: No distributed vectors, limited cross-agent learning
**Mitigation**:
- Fallback to AgentDB-only mode (degrades to single-agent learning)
- Pre-test RuVector in staging environment
- Document setup process with troubleshooting guide
- Create health checks for continuous monitoring

### Medium Risk: Dream Insights Low Quality
**Risk**: REM cycle produces unhelpful or wrong patterns
**Impact**: Wasted computational resources, no learning improvement
**Mitigation**:
- Strict validation framework before production use
- Start with conservative parameters (low noise, short cycles)
- Implement confidence thresholds (reject patterns <0.5 confidence)
- Human-in-the-loop review for first 2 weeks
- A/B testing to measure actual impact

### Medium Risk: Cross-Agent Knowledge Conflicts
**Risk**: Transferred patterns conflict with agent-specific context
**Impact**: Degraded agent performance, confusion
**Mitigation**:
- Pattern adaptation layer before integration
- Conflict detection algorithm (semantic similarity check)
- Gradual rollout (10% → 50% → 100% of patterns)
- Easy rollback mechanism (pattern versioning)
- Agent-specific rejection criteria

### Low Risk: Resource Exhaustion
**Risk**: 19 agents sleeping simultaneously overwhelm system
**Impact**: Slow performance, OOM errors
**Mitigation**:
- Staggered sleep schedules (max 5 agents in REM simultaneously)
- Resource limits per agent (memory, CPU)
- Monitoring and auto-scaling
- Graceful degradation (skip non-critical cycles)

---

## 8. Implementation Roadmap

### Week 1: Foundation
**Days 1-2**: Infrastructure Setup
- Setup RuVector Docker environment
- Implement sleep scheduler
- Create experience capture hooks
- **Deliverable**: Agents can enter sleep state

**Days 3-5**: Basic Integration
- Build AgentDB-RuVector adapter
- Implement vector sync
- Test pattern storage and retrieval
- **Deliverable**: Patterns stored in RuVector with <100µs queries

### Week 2: Dream Engine Core
**Days 6-8**: Neural Substrate
- Build concept graph from AgentDB data
- Implement activation dynamics
- Create associative memory
- **Deliverable**: Concepts activate based on experiences

**Days 9-10**: REM Dynamics
- Implement reduced inhibition and increased noise
- Build novel association detector
- Create insight extraction
- **Deliverable**: First dream cycle produces 5+ insights

### Week 3: Learning Pipeline
**Days 11-12**: Experience Replay
- Implement prioritized replay
- Build pattern consolidation
- Create memory distillation
- **Deliverable**: Sleep cycles consolidate daily experiences

**Days 13-15**: Cross-Agent Transfer
- Implement knowledge transfer protocol
- Build pattern adaptation
- Test collective dreaming
- **Deliverable**: Pattern successfully transferred between agents

### Week 4: Production Polish
**Days 16-17**: Validation Framework
- Create test scenarios for patterns
- Implement continuous validation
- Build feedback loops
- **Deliverable**: Patterns validated before production use

**Days 18-20**: Observability
- Build metrics dashboard
- Implement learning analytics
- Create alerting rules
- **Deliverable**: Full visibility into learning process

### Week 5: Rollout
**Days 21-22**: Integration Testing
- Test all 19 QE agents
- Verify cross-agent scenarios
- Load testing
- **Deliverable**: System ready for production

**Days 23-25**: Production Rollout
- Deploy to 3 agents (pilot)
- Monitor for 48 hours
- Deploy to all 19 agents
- **Deliverable**: All agents learning nightly

---

## 9. Metrics & KPIs

### Learning Metrics
```typescript
interface LearningMetrics {
  // Discovery metrics
  patterns_discovered_per_night: number; // Target: 10-20 per agent
  dream_insights_per_rem_cycle: number; // Target: 5-10
  novel_associations_per_night: number; // Target: 8-12

  // Quality metrics
  pattern_accuracy: number; // Target: >0.85
  insight_usefulness_rate: number; // Target: >0.30
  pattern_generalization_score: number; // Target: >0.80

  // Transfer metrics
  patterns_shared_per_night: number; // Target: 20+
  pattern_adoption_rate: number; // Target: >0.70
  cross_agent_transfer_success: number; // Target: >0.70

  // Impact metrics
  task_completion_time_delta: number; // Target: -15% to -30%
  test_coverage_improvement: number; // Target: +10% to +20%
  bug_detection_rate_delta: number; // Target: +20% to +30%
  false_positive_rate_delta: number; // Target: -10% to -15%

  // System metrics
  sleep_cycle_completion_rate: number; // Target: >0.90
  ruvector_query_latency_p95: number; // Target: <100µs
  memory_usage_per_agent: number; // Target: <2GB
  experiences_processed_per_night: number; // Target: 10,000+
}
```

### Dashboard Views

#### 1. Executive Summary (Daily)
- Total patterns discovered (system-wide)
- Average agent improvement percentage
- Knowledge transfer success rate
- System health status

#### 2. Agent Performance (Per Agent)
- Task completion time trend
- Pattern usage frequency
- Learning effectiveness score
- Contribution to collective knowledge

#### 3. Dream Analysis (Per Cycle)
- Concepts activated
- Novel associations discovered
- Insight quality scores
- REM cycle effectiveness

#### 4. System Health (Real-time)
- RuVector latency (p50, p95, p99)
- Sleep cycle completion rate
- Agent idle/active distribution
- Resource usage (CPU, memory, disk)

---

## 10. Future Enhancements (Post-MVP)

### Phase 6: Advanced Learning (Month 2)
1. **Meta-Learning**: Agents learn how to learn better
   - Optimize sleep cycle parameters per agent
   - Personalized dream strategies
   - Adaptive experience prioritization

2. **Swarm Consciousness**: System-level intelligence
   - Multi-agent problem decomposition during collective dreams
   - Emergent strategies not possible for individual agents
   - Consensus-based truth validation

3. **Lifelong Learning**: Never stop improving
   - Continual learning without catastrophic forgetting
   - Curriculum learning (easy → hard problems)
   - Transfer learning across agent types

### Phase 7: Advanced Features (Month 3-4)
1. **Lucid Dreaming**: Guided dream exploration
   - User-specified dream objectives
   - Directed pattern discovery
   - Hypothesis testing during sleep

2. **Dream Sharing Network**: Cross-team learning
   - Share insights across QE teams
   - Industry-wide pattern library
   - Privacy-preserving federated learning

3. **Emotional Learning**: Affective computing
   - Track user satisfaction with agent performance
   - Learn from positive/negative feedback
   - Build trust through consistent improvement

---

## 11. Appendices

### Appendix A: File Structure
```
/agentic-qe/
├── src/
│   ├── nightly-learner/
│   │   ├── sleep-scheduler.ts
│   │   ├── dream-engine/
│   │   │   ├── neural-substrate.ts
│   │   │   ├── rem-dynamics.ts
│   │   │   ├── experience-replay.ts
│   │   │   └── insight-extractor.ts
│   │   ├── knowledge-transfer/
│   │   │   ├── transfer-protocol.ts
│   │   │   ├── pattern-adapter.ts
│   │   │   └── collective-dreamer.ts
│   │   ├── validation/
│   │   │   ├── validation-framework.ts
│   │   │   ├── safe-sandbox.ts
│   │   │   └── feedback-collector.ts
│   │   └── metrics/
│   │       ├── metrics-collector.ts
│   │       ├── dashboard.ts
│   │       └── analytics.ts
│   ├── memory/
│   │   ├── ruvector-adapter.ts (NEW)
│   │   ├── agentdb.ts (EXTEND)
│   │   └── vector-store.ts (EXTEND)
│   └── agents/
│       ├── base-qe-agent.ts (EXTEND)
│       └── qe-agents/ (EXTEND all 19)
├── tests/
│   ├── nightly-learner/
│   │   ├── sleep-scheduler.test.ts
│   │   ├── dream-engine.test.ts
│   │   ├── knowledge-transfer.test.ts
│   │   └── integration.test.ts
│   └── memory/
│       └── ruvector-adapter.test.ts
├── config/
│   ├── ruvector-docker-compose.yml
│   ├── sleep-parameters.json
│   └── dream-config.json
└── docs/
    ├── nightly-learner-implementation-plan.md (THIS FILE)
    ├── ruvector-setup-guide.md
    └── dream-engine-architecture.md
```

### Appendix B: Configuration Examples

#### Sleep Parameters (`config/sleep-parameters.json`)
```json
{
  "sleep_cycles": {
    "N1_light": {
      "duration_minutes": 5,
      "activation_threshold": 0.3,
      "noise_level": 0.1
    },
    "N2_memory": {
      "duration_minutes": 10,
      "replay_count": 100,
      "consolidation_threshold": 0.6
    },
    "N3_deep": {
      "duration_minutes": 15,
      "pattern_synthesis": true,
      "distillation_ratio": 0.5
    },
    "REM_dream": {
      "duration_minutes": 20,
      "prefrontal_inhibition": 0.2,
      "noise_level": 0.5,
      "novelty_threshold": 0.7,
      "insight_extraction": true
    }
  },
  "scheduler": {
    "idle_detection_threshold": 0.2,
    "min_idle_duration_minutes": 10,
    "max_concurrent_dreamers": 5,
    "wake_on_new_task": true,
    "wake_on_manual_trigger": true
  }
}
```

#### RuVector Configuration (`config/ruvector-docker-compose.yml`)
```yaml
version: '3.8'
services:
  ruvector:
    image: ruvnet/ruvector-postgres:latest
    environment:
      POSTGRES_USER: aqe_user
      POSTGRES_PASSWORD: ${RUVECTOR_PASSWORD}
      POSTGRES_DB: aqe_vectors
      RUVECTOR_GNN_ENABLED: true
      RUVECTOR_SONA_LEARNING: true
    ports:
      - "5432:5432"
    volumes:
      - ruvector_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aqe_user"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  ruvector_data:
```

### Appendix C: Testing Strategy

#### Unit Tests
- Each component tested in isolation
- Mock dependencies (AgentDB, RuVector)
- 90%+ code coverage target

#### Integration Tests
- End-to-end sleep cycle
- Cross-agent knowledge transfer
- Dream insight validation
- Performance benchmarks

#### System Tests
- All 19 agents learning simultaneously
- Load testing (10,000+ experiences)
- Chaos testing (RuVector failures)
- Long-running stability (7+ days)

#### A/B Testing
- Compare agents with/without nightly learning
- Measure actual task performance impact
- Validate pattern effectiveness claims
- ROI calculation

---

## 12. Execution Instructions for Specialized Agents

### For System Architect Agent
**Task**: Review architecture and refine component interactions
**Focus**: Ensure scalability, fault tolerance, clean interfaces
**Deliverable**: Refined architecture diagram + component contracts

### For Backend Developer Agent
**Task**: Implement core components (sleep scheduler, dream engine, RuVector adapter)
**Focus**: Clean code, error handling, efficient algorithms
**Deliverable**: Working implementation with unit tests

### For ML Developer Agent
**Task**: Build neural substrate, REM dynamics, pattern synthesis
**Focus**: Effective learning algorithms, numerical stability
**Deliverable**: Dream engine that produces useful insights

### For Distributed Systems Engineer Agent
**Task**: Implement cross-agent knowledge transfer and collective dreaming
**Focus**: Consistency, low latency, fault tolerance
**Deliverable**: Reliable multi-agent coordination

### For Tester Agent
**Task**: Create comprehensive test suite covering all scenarios
**Focus**: Edge cases, failure modes, performance validation
**Deliverable**: 90%+ coverage with passing integration tests

### For DevOps Engineer Agent
**Task**: Setup RuVector infrastructure, monitoring, deployment
**Focus**: Reliability, observability, easy rollback
**Deliverable**: Production-ready infrastructure with monitoring

### For Code Reviewer Agent
**Task**: Review all code for quality, security, maintainability
**Focus**: Best practices, potential bugs, documentation
**Deliverable**: Approval or actionable feedback

---

## 13. Conclusion

This plan provides a comprehensive roadmap for implementing a nightly-learner system that enables autonomous agent improvement through dream-inspired learning. By combining AgentDB's proven RL infrastructure with RuVector's distributed vectors and ExoGenesis-Omega's dream architecture, we create a unique system where QE agents continuously evolve their capabilities.

**Key Success Factors**:
1. Strong foundation with existing AgentDB infrastructure
2. Proven algorithms from RL and neuroscience research
3. Incremental rollout with validation at each phase
4. Clear metrics to measure learning effectiveness
5. Collaborative team execution with specialized agents

**Expected Impact**:
- 15-30% improvement in agent task efficiency
- 10-20% increase in test coverage
- 20-30% better bug detection
- 50+ new patterns per week system-wide
- Emergent collective intelligence across agent fleet

The system transforms idle time into valuable learning opportunities, creating a self-improving QE agent ecosystem that gets better every night.

---

**Document Version**: 1.0
**Last Updated**: 2025-12-10
**Status**: Ready for Implementation
**Estimated Effort**: 50 hours over 2 weeks with 4-5 person team
