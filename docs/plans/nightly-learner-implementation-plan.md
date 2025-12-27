# Nightly-Learner Implementation Plan v1.0

> **Status**: APPROVED FOR IMPLEMENTATION
> **Timeline**: 6 weeks (12-15 person-weeks)
> **Start Date**: TBD
> **Last Updated**: 2024-12-10

---

## Executive Summary

This plan implements an autonomous agent learning system that enables the 19 QE agents to learn from executions during idle periods, share knowledge across the fleet, and continuously improve performance.

### Key Decisions from GOAP Analysis

| Decision | Rationale |
|----------|-----------|
| **Skip RuVector rebuild** | Already implemented with 170x performance (1.5µs search) |
| **Simplify dream engine** | Graph-based spreading activation, defer neural substrate to v2 |
| **Lower transfer target** | 70% success (realistic), not 90% (research-grade) |
| **Add Phase 0** | Establish baselines before committing resources |
| **Incremental delivery** | Value in 2 weeks, not 5 |

### Effort Reduction

| Metric | Original Plan | Revised Plan | Savings |
|--------|---------------|--------------|---------|
| Timeline | 5 weeks | 6 weeks | +1 week buffer |
| Effort | 17-20 person-weeks | 12-15 person-weeks | 25% reduction |
| Redundant work | 40% | 0% | Eliminated |

---

## Phase 0: Pre-Work & Baselines (Week 0)

**Duration**: 1 week
**Effort**: 2 person-weeks
**Goal**: Validate approach before full commitment

### 0.1 Establish Learning Baselines

**Objective**: Measure current agent performance to define "improvement"

```typescript
// File: src/learning/baselines/BaselineCollector.ts
interface LearningBaseline {
  agentId: string;
  taskType: string;
  metrics: {
    avgCompletionTime: number;      // ms
    successRate: number;            // 0-1
    patternRecallAccuracy: number;  // 0-1
    coverageAchieved: number;       // percentage
  };
  sampleSize: number;
  collectedAt: Date;
}
```

**Tasks**:
- [ ] Run each agent type on 10 standard tasks
- [ ] Collect completion time, success rate, pattern usage
- [ ] Store baselines in db with `namespace: 'baselines'`
- [ ] Define quantitative targets based on baseline + 10-20%

**Deliverables**:
- `src/learning/baselines/BaselineCollector.ts`
- `src/learning/baselines/StandardTaskSuite.ts`
- Baseline data stored in db

### 0.2 Prototype Sleep Scheduler

**Objective**: Validate idle detection works in DevPod/Codespaces

```typescript
// File: src/learning/scheduler/IdleDetector.ts
interface IdleDetectorConfig {
  cpuThreshold: number;       // Default: 20%
  memoryThreshold: number;    // Default: 50%
  taskQueueEmpty: boolean;    // Required: true
  minIdleDuration: number;    // Default: 60000ms (1 min)
  checkInterval: number;      // Default: 10000ms (10 sec)
}

interface IdleState {
  isIdle: boolean;
  idleSince: Date | null;
  cpuUsage: number;
  memoryUsage: number;
  activeTaskCount: number;
}
```

**Tasks**:
- [ ] Implement CPU monitoring via `os.cpus()` or `/proc/stat`
- [ ] Test in DevPod container environment
- [ ] Measure detection accuracy (target: >95%)
- [ ] Document container-specific limitations

**Deliverables**:
- `src/learning/scheduler/IdleDetector.ts`
- `tests/integration/idle-detector.test.ts`
- Container compatibility report

### 0.3 Prototype Cross-Agent Transfer

**Objective**: Validate pattern transfer between 2 agents

```typescript
// File: src/learning/transfer/TransferPrototype.ts
interface TransferTest {
  sourceAgent: string;        // e.g., 'test-generator'
  targetAgent: string;        // e.g., 'coverage-analyzer'
  patternId: string;
  transferSuccess: boolean;
  applicabilityScore: number; // 0-1
  performanceImpact: number;  // % change vs baseline
}
```

**Tasks**:
- [ ] Select 2 agents with overlapping domains
- [ ] Transfer 10 patterns between them
- [ ] Measure transfer success rate
- [ ] Identify incompatibility patterns

**Deliverables**:
- `src/learning/transfer/TransferPrototype.ts`
- Transfer feasibility report with success rate

### Phase 0 Success Gate

| Metric | Target | Go/No-Go |
|--------|--------|----------|
| Idle detection accuracy | >90% | Must pass |
| Transfer prototype success | >50% | Must pass |
| Baselines collected | All 19 agents | Must complete |
| Container compatibility | Works in DevPod | Must pass |

**Decision Point**: End of Week 0
- **GO**: Proceed to Phase 1
- **PIVOT**: If idle detection fails → Time-based triggers only
- **RESEARCH**: If transfer fails → 2-week spike before Phase 2

---

## Phase 1: Automated Learning Pipeline (Weeks 1-2)

**Duration**: 2 weeks
**Effort**: 4 person-weeks
**Goal**: Agents learn from executions automatically

### 1.1 Sleep Scheduler Service

**Objective**: Trigger learning during idle periods

```
src/learning/scheduler/
├── SleepScheduler.ts          # Main scheduler service
├── IdleDetector.ts            # CPU/memory monitoring (from Phase 0)
├── SleepCycle.ts              # Sleep cycle state machine
├── TimeBasedTrigger.ts        # Fallback: cron-based triggers
└── index.ts
```

#### SleepScheduler.ts

```typescript
// File: src/learning/scheduler/SleepScheduler.ts
import { EventEmitter } from 'events';
import { IdleDetector, IdleState } from './IdleDetector';
import { SleepCycle, SleepPhase } from './SleepCycle';

export interface SleepSchedulerConfig {
  mode: 'idle' | 'time' | 'hybrid';
  idleConfig?: IdleDetectorConfig;
  schedule?: {
    startHour: number;    // 0-23, default: 2 (2 AM)
    durationMinutes: number; // default: 60
  };
  learningBudget: {
    maxPatternsPerCycle: number;  // default: 50
    maxAgentsPerCycle: number;    // default: 5
    maxDurationMs: number;        // default: 3600000 (1 hour)
  };
}

export interface SleepSchedulerEvents {
  'sleep:start': (cycle: SleepCycle) => void;
  'sleep:phase': (phase: SleepPhase) => void;
  'sleep:end': (summary: CycleSummary) => void;
  'learning:trigger': (agent: string) => void;
  'error': (error: Error) => void;
}

export class SleepScheduler extends EventEmitter {
  private config: SleepSchedulerConfig;
  private idleDetector: IdleDetector;
  private currentCycle: SleepCycle | null = null;
  private isRunning: boolean = false;

  constructor(config: SleepSchedulerConfig) {
    super();
    this.config = config;
    this.idleDetector = new IdleDetector(config.idleConfig);
  }

  async start(): Promise<void> {
    this.isRunning = true;

    if (this.config.mode === 'idle' || this.config.mode === 'hybrid') {
      this.idleDetector.on('idle:detected', () => this.triggerSleepCycle());
    }

    if (this.config.mode === 'time' || this.config.mode === 'hybrid') {
      this.scheduleTimeBased();
    }

    await this.idleDetector.start();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.idleDetector.stop();
    if (this.currentCycle) {
      await this.currentCycle.abort();
    }
  }

  private async triggerSleepCycle(): Promise<void> {
    if (this.currentCycle?.isActive) {
      return; // Already in a cycle
    }

    this.currentCycle = new SleepCycle({
      budget: this.config.learningBudget,
    });

    this.emit('sleep:start', this.currentCycle);

    try {
      const summary = await this.currentCycle.execute();
      this.emit('sleep:end', summary);
    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  private scheduleTimeBased(): void {
    // Implementation uses node-cron or similar
    // Triggers at config.schedule.startHour daily
  }
}
```

#### SleepCycle.ts

```typescript
// File: src/learning/scheduler/SleepCycle.ts
export type SleepPhase =
  | 'N1_CAPTURE'      // Capture recent experiences (5 min)
  | 'N2_PROCESS'      // Process and cluster patterns (10 min)
  | 'N3_CONSOLIDATE'  // Consolidate into long-term memory (15 min)
  | 'REM_DREAM'       // Dream engine activation (20 min)
  | 'COMPLETE';

export interface CycleSummary {
  startTime: Date;
  endTime: Date;
  phasesCompleted: SleepPhase[];
  patternsDiscovered: number;
  patternsConsolidated: number;
  agentsProcessed: string[];
  errors: Error[];
}

export class SleepCycle {
  private phases: Map<SleepPhase, number> = new Map([
    ['N1_CAPTURE', 5 * 60 * 1000],      // 5 minutes
    ['N2_PROCESS', 10 * 60 * 1000],     // 10 minutes
    ['N3_CONSOLIDATE', 15 * 60 * 1000], // 15 minutes
    ['REM_DREAM', 20 * 60 * 1000],      // 20 minutes
  ]);

  private currentPhase: SleepPhase = 'N1_CAPTURE';
  public isActive: boolean = false;

  async execute(): Promise<CycleSummary> {
    this.isActive = true;
    const summary: CycleSummary = {
      startTime: new Date(),
      endTime: new Date(),
      phasesCompleted: [],
      patternsDiscovered: 0,
      patternsConsolidated: 0,
      agentsProcessed: [],
      errors: [],
    };

    for (const [phase, duration] of this.phases) {
      this.currentPhase = phase;
      try {
        const result = await this.executePhase(phase, duration);
        summary.phasesCompleted.push(phase);
        summary.patternsDiscovered += result.patterns;
      } catch (error) {
        summary.errors.push(error as Error);
      }
    }

    this.isActive = false;
    summary.endTime = new Date();
    return summary;
  }

  async abort(): Promise<void> {
    this.isActive = false;
    // Graceful shutdown logic
  }

  private async executePhase(phase: SleepPhase, duration: number): Promise<{ patterns: number }> {
    // Phase-specific logic delegated to handlers
    switch (phase) {
      case 'N1_CAPTURE':
        return this.captureExperiences(duration);
      case 'N2_PROCESS':
        return this.processPatterns(duration);
      case 'N3_CONSOLIDATE':
        return this.consolidateMemory(duration);
      case 'REM_DREAM':
        return this.activateDreamEngine(duration);
      default:
        return { patterns: 0 };
    }
  }

  // Phase implementations...
}
```

### 1.2 Experience Capture Pipeline

**Objective**: Automatically capture agent executions for learning

```
src/learning/capture/
├── ExperienceCapture.ts       # Main capture service
├── ExecutionRecorder.ts       # Hook into agent execution
├── ExperienceExtractor.ts     # Extract learnable content
├── ExperienceStore.ts         # Store in RuVector
└── index.ts
```

#### ExperienceCapture.ts

```typescript
// File: src/learning/capture/ExperienceCapture.ts
import { RuVectorPatternStore } from '../../core/memory/RuVectorPatternStore';
import { QEEventBus } from '../../core/events/QEEventBus';

export interface CapturedExperience {
  id: string;
  agentId: string;
  agentType: string;
  taskType: string;
  execution: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration: number;
    success: boolean;
  };
  context: {
    patterns_used: string[];
    decisions_made: string[];
    errors_encountered: string[];
  };
  outcome: {
    quality_score: number;
    coverage_delta: number;
    user_feedback?: 'positive' | 'negative' | 'neutral';
  };
  timestamp: Date;
  embedding?: number[];
}

export class ExperienceCapture {
  private store: RuVectorPatternStore;
  private eventBus: QEEventBus;
  private buffer: CapturedExperience[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(store: RuVectorPatternStore, eventBus: QEEventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  async start(): Promise<void> {
    // Subscribe to agent execution events
    this.eventBus.on('agent:execution:complete', this.captureExecution.bind(this));

    // Periodic flush to storage
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }

  private async captureExecution(event: AgentExecutionEvent): Promise<void> {
    const experience = await this.extractExperience(event);
    this.buffer.push(experience);

    // Immediate flush if buffer is large
    if (this.buffer.length >= 100) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const experiences = [...this.buffer];
    this.buffer = [];

    // Store as patterns in RuVector
    const patterns = experiences.map(exp => this.toPattern(exp));
    await this.store.storeBatch(patterns);
  }

  private async extractExperience(event: AgentExecutionEvent): Promise<CapturedExperience> {
    // Extract learnable content from execution
    // Generate embedding using existing EmbeddingGenerator
  }

  private toPattern(experience: CapturedExperience): TestPattern {
    // Convert experience to RuVector TestPattern format
  }
}
```

### 1.3 Pattern Synthesis Engine

**Objective**: Identify patterns from captured experiences

```typescript
// File: src/learning/synthesis/PatternSynthesis.ts
import { RuVectorPatternStore } from '../../core/memory/RuVectorPatternStore';

export interface SynthesizedPattern {
  id: string;
  type: 'success_strategy' | 'failure_avoidance' | 'efficiency_optimization';
  description: string;
  conditions: string[];           // When to apply
  actions: string[];              // What to do
  confidence: number;             // 0-1
  supportingExperiences: string[]; // Experience IDs
  effectiveness: number;          // Measured improvement
}

export class PatternSynthesis {
  private store: RuVectorPatternStore;

  constructor(store: RuVectorPatternStore) {
    this.store = store;
  }

  /**
   * Synthesize patterns from recent experiences
   * Uses clustering to identify common success/failure patterns
   */
  async synthesize(options: {
    experienceIds?: string[];
    minSupport?: number;      // Minimum experiences to form pattern
    minConfidence?: number;   // Minimum confidence threshold
  }): Promise<SynthesizedPattern[]> {
    const { minSupport = 3, minConfidence = 0.7 } = options;

    // 1. Retrieve recent experiences
    const experiences = await this.getRecentExperiences(options.experienceIds);

    // 2. Cluster by similarity (using RuVector MMR for diversity)
    const clusters = await this.clusterExperiences(experiences);

    // 3. Extract patterns from clusters
    const patterns: SynthesizedPattern[] = [];

    for (const cluster of clusters) {
      if (cluster.size < minSupport) continue;

      const pattern = this.extractPatternFromCluster(cluster);
      if (pattern.confidence >= minConfidence) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private async clusterExperiences(experiences: CapturedExperience[]): Promise<Cluster[]> {
    // Use RuVector's searchWithMMR for diversity-aware clustering
    // Group similar experiences together
  }

  private extractPatternFromCluster(cluster: Cluster): SynthesizedPattern {
    // Extract common elements:
    // - What conditions led to success/failure?
    // - What actions were taken?
    // - What was the outcome?
  }
}
```

### Phase 1 Deliverables

| Deliverable | File | Status |
|-------------|------|--------|
| Sleep Scheduler | `src/learning/scheduler/SleepScheduler.ts` | |
| Idle Detector | `src/learning/scheduler/IdleDetector.ts` | |
| Sleep Cycle | `src/learning/scheduler/SleepCycle.ts` | |
| Experience Capture | `src/learning/capture/ExperienceCapture.ts` | |
| Pattern Synthesis | `src/learning/synthesis/PatternSynthesis.ts` | |
| Integration Tests | `tests/integration/learning-pipeline.test.ts` | |
| CLI Commands | `aqe learn start`, `aqe learn status`, `aqe learn trigger` | |

### Phase 1 Success Gate

| Metric | Target | Measurement |
|--------|--------|-------------|
| Idle detection accuracy | >95% | Test suite |
| Experiences captured/day | >100 | Metrics dashboard |
| Patterns discovered/night | >10 | Synthesis output |
| Pipeline uptime | >99% | Health checks |
| Performance overhead | <5% | Benchmark |

---

## Phase 2: Dream Engine & Cross-Agent Transfer (Weeks 3-4)

**Duration**: 2 weeks
**Effort**: 4 person-weeks
**Goal**: Pattern discovery through association and knowledge sharing

### 2.1 Dream Engine (Simplified)

**Objective**: Discover novel patterns through spreading activation

> **Note**: This is the **simplified v1** using graph-based spreading activation.
> Neural substrate and REM dynamics are deferred to v2.

```
src/learning/dream/
├── DreamEngine.ts             # Main dream engine
├── ConceptGraph.ts            # Graph-based concept storage
├── SpreadingActivation.ts     # Activation propagation
├── InsightGenerator.ts        # Generate actionable insights
└── index.ts
```

#### ConceptGraph.ts

```typescript
// File: src/learning/dream/ConceptGraph.ts

export interface ConceptNode {
  id: string;
  type: 'pattern' | 'technique' | 'domain' | 'outcome';
  content: string;
  embedding: number[];
  activationLevel: number;     // 0-1, decays over time
  lastActivated: Date;
  metadata: Record<string, unknown>;
}

export interface ConceptEdge {
  source: string;
  target: string;
  weight: number;              // 0-1, strength of association
  type: 'similarity' | 'causation' | 'co_occurrence' | 'sequence';
  evidence: number;            // Number of observations supporting this edge
}

export class ConceptGraph {
  private nodes: Map<string, ConceptNode> = new Map();
  private edges: Map<string, ConceptEdge[]> = new Map();
  private store: RuVectorPatternStore;

  constructor(store: RuVectorPatternStore) {
    this.store = store;
  }

  /**
   * Add a concept node to the graph
   */
  async addConcept(concept: Omit<ConceptNode, 'activationLevel' | 'lastActivated'>): Promise<void> {
    const node: ConceptNode = {
      ...concept,
      activationLevel: 0,
      lastActivated: new Date(),
    };

    this.nodes.set(concept.id, node);

    // Auto-discover edges based on embedding similarity
    await this.discoverEdges(concept.id);
  }

  /**
   * Discover edges by finding similar concepts via RuVector
   */
  private async discoverEdges(conceptId: string): Promise<void> {
    const concept = this.nodes.get(conceptId);
    if (!concept) return;

    // Use RuVector to find similar concepts
    const similar = await this.store.searchSimilar(concept.embedding, {
      k: 10,
      threshold: 0.5,
    });

    for (const result of similar) {
      if (result.pattern.id === conceptId) continue;

      this.addEdge({
        source: conceptId,
        target: result.pattern.id,
        weight: result.score,
        type: 'similarity',
        evidence: 1,
      });
    }
  }

  /**
   * Add or strengthen an edge
   */
  addEdge(edge: ConceptEdge): void {
    const existing = this.getEdge(edge.source, edge.target);

    if (existing) {
      // Strengthen existing edge
      existing.weight = Math.min(1, existing.weight + 0.1);
      existing.evidence++;
    } else {
      // Create new edge
      const sourceEdges = this.edges.get(edge.source) || [];
      sourceEdges.push(edge);
      this.edges.set(edge.source, sourceEdges);
    }
  }

  /**
   * Get all edges from a node
   */
  getEdges(nodeId: string): ConceptEdge[] {
    return this.edges.get(nodeId) || [];
  }

  /**
   * Get specific edge between two nodes
   */
  getEdge(source: string, target: string): ConceptEdge | undefined {
    return this.getEdges(source).find(e => e.target === target);
  }

  /**
   * Get nodes above activation threshold
   */
  getActiveNodes(threshold: number = 0.3): ConceptNode[] {
    return Array.from(this.nodes.values())
      .filter(n => n.activationLevel >= threshold);
  }

  /**
   * Decay activation levels over time
   */
  decayActivations(factor: number = 0.9): void {
    for (const node of this.nodes.values()) {
      node.activationLevel *= factor;
    }
  }
}
```

#### SpreadingActivation.ts

```typescript
// File: src/learning/dream/SpreadingActivation.ts

export interface ActivationConfig {
  decayRate: number;           // How fast activation decays (0-1)
  spreadFactor: number;        // How much activation spreads (0-1)
  threshold: number;           // Minimum activation to spread
  maxIterations: number;       // Prevent infinite loops
  noise: number;               // Random activation during dreaming (0-1)
}

export interface ActivationResult {
  iterations: number;
  nodesActivated: number;
  associations: Association[];
}

export interface Association {
  nodes: string[];             // Co-activated node IDs
  strength: number;            // Combined activation
  novelty: number;             // How unexpected (0-1)
}

export class SpreadingActivation {
  private graph: ConceptGraph;
  private config: ActivationConfig;

  constructor(graph: ConceptGraph, config?: Partial<ActivationConfig>) {
    this.graph = graph;
    this.config = {
      decayRate: 0.9,
      spreadFactor: 0.5,
      threshold: 0.2,
      maxIterations: 10,
      noise: 0.1,              // 10% random activation in dream mode
      ...config,
    };
  }

  /**
   * Activate a concept and spread to associated concepts
   */
  async activate(conceptId: string, initialActivation: number = 1.0): Promise<ActivationResult> {
    // Set initial activation
    const node = this.graph.getActiveNodes().find(n => n.id === conceptId);
    if (!node) {
      return { iterations: 0, nodesActivated: 0, associations: [] };
    }

    node.activationLevel = initialActivation;
    node.lastActivated = new Date();

    // Spread activation
    let iteration = 0;
    const associations: Association[] = [];

    while (iteration < this.config.maxIterations) {
      const activeNodes = this.graph.getActiveNodes(this.config.threshold);

      if (activeNodes.length === 0) break;

      for (const activeNode of activeNodes) {
        const edges = this.graph.getEdges(activeNode.id);

        for (const edge of edges) {
          const targetNode = this.graph.getActiveNodes().find(n => n.id === edge.target);
          if (!targetNode) continue;

          // Spread activation weighted by edge strength
          const spreadAmount = activeNode.activationLevel * edge.weight * this.config.spreadFactor;
          targetNode.activationLevel = Math.min(1, targetNode.activationLevel + spreadAmount);
          targetNode.lastActivated = new Date();
        }
      }

      // Decay all activations
      this.graph.decayActivations(this.config.decayRate);

      // Detect co-activations (potential insights)
      const coActivated = this.graph.getActiveNodes(0.5);
      if (coActivated.length >= 2) {
        associations.push(this.detectAssociation(coActivated));
      }

      iteration++;
    }

    return {
      iterations: iteration,
      nodesActivated: this.graph.getActiveNodes(0.1).length,
      associations,
    };
  }

  /**
   * Dream mode: Random activation with increased noise
   * This simulates the "reduced logical filtering" of REM sleep
   */
  async dream(duration: number): Promise<Association[]> {
    const associations: Association[] = [];
    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      // Randomly activate concepts with noise
      const allNodes = this.graph.getActiveNodes(0);
      const randomIndex = Math.floor(Math.random() * allNodes.length);
      const randomNode = allNodes[randomIndex];

      if (randomNode) {
        // Activate with noise
        const noiseActivation = this.config.noise * Math.random();
        randomNode.activationLevel += noiseActivation;

        // Let it spread
        const result = await this.activate(randomNode.id, randomNode.activationLevel);
        associations.push(...result.associations);
      }

      // Small delay to prevent CPU spike
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Filter to novel associations only
    return this.filterNovelAssociations(associations);
  }

  private detectAssociation(nodes: ConceptNode[]): Association {
    return {
      nodes: nodes.map(n => n.id),
      strength: nodes.reduce((sum, n) => sum + n.activationLevel, 0) / nodes.length,
      novelty: this.calculateNovelty(nodes),
    };
  }

  private calculateNovelty(nodes: ConceptNode[]): number {
    // Novelty is higher when:
    // 1. Nodes have different types
    // 2. Nodes have low edge weights between them
    // 3. Nodes haven't been co-activated before

    let novelty = 0;

    // Type diversity
    const types = new Set(nodes.map(n => n.type));
    novelty += types.size / 4; // 4 possible types

    // Edge weakness (novel if weak or no edges)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const edge = this.graph.getEdge(nodes[i].id, nodes[j].id);
        if (!edge) {
          novelty += 0.5;
        } else {
          novelty += (1 - edge.weight) * 0.5;
        }
      }
    }

    return Math.min(1, novelty / nodes.length);
  }

  private filterNovelAssociations(associations: Association[]): Association[] {
    // Keep only associations with novelty > 0.5
    return associations
      .filter(a => a.novelty > 0.5)
      .sort((a, b) => b.novelty - a.novelty)
      .slice(0, 10); // Top 10 novel associations
  }
}
```

#### DreamEngine.ts

```typescript
// File: src/learning/dream/DreamEngine.ts

export interface DreamConfig {
  cycleDuration: number;       // ms, default: 20 * 60 * 1000 (20 min)
  targetInsights: number;      // Minimum insights to generate
  noveltyThreshold: number;    // 0-1, default: 0.5
}

export interface DreamInsight {
  id: string;
  type: 'new_pattern' | 'optimization' | 'warning' | 'connection';
  description: string;
  associatedConcepts: string[];
  noveltyScore: number;
  actionable: boolean;
  suggestedAction?: string;
  confidence: number;
}

export class DreamEngine {
  private graph: ConceptGraph;
  private activation: SpreadingActivation;
  private config: DreamConfig;

  constructor(graph: ConceptGraph, config?: Partial<DreamConfig>) {
    this.graph = graph;
    this.activation = new SpreadingActivation(graph, { noise: 0.2 }); // Higher noise for dreams
    this.config = {
      cycleDuration: 20 * 60 * 1000,
      targetInsights: 5,
      noveltyThreshold: 0.5,
      ...config,
    };
  }

  /**
   * Run a dream cycle
   * Returns insights discovered through spreading activation
   */
  async dream(): Promise<DreamInsight[]> {
    console.log('[DreamEngine] Starting dream cycle...');

    // 1. Run spreading activation with noise
    const associations = await this.activation.dream(this.config.cycleDuration);

    console.log(`[DreamEngine] Found ${associations.length} associations`);

    // 2. Convert associations to actionable insights
    const insights: DreamInsight[] = [];

    for (const assoc of associations) {
      if (assoc.novelty < this.config.noveltyThreshold) continue;

      const insight = await this.associationToInsight(assoc);
      if (insight) {
        insights.push(insight);
      }
    }

    // 3. Validate and rank insights
    const validInsights = await this.validateInsights(insights);

    console.log(`[DreamEngine] Generated ${validInsights.length} actionable insights`);

    return validInsights;
  }

  private async associationToInsight(association: Association): Promise<DreamInsight | null> {
    // Convert co-activation to actionable insight
    const concepts = association.nodes.map(id =>
      this.graph.getActiveNodes(0).find(n => n.id === id)
    ).filter(Boolean) as ConceptNode[];

    if (concepts.length < 2) return null;

    // Determine insight type based on concept types
    const types = concepts.map(c => c.type);
    let insightType: DreamInsight['type'] = 'connection';

    if (types.includes('pattern') && types.includes('outcome')) {
      insightType = 'new_pattern';
    } else if (types.includes('technique') && types.includes('outcome')) {
      insightType = 'optimization';
    }

    return {
      id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: insightType,
      description: this.generateDescription(concepts, insightType),
      associatedConcepts: association.nodes,
      noveltyScore: association.novelty,
      actionable: insightType !== 'connection',
      suggestedAction: this.generateAction(concepts, insightType),
      confidence: association.strength,
    };
  }

  private generateDescription(concepts: ConceptNode[], type: DreamInsight['type']): string {
    // Generate human-readable description of the insight
    const conceptNames = concepts.map(c => c.content.substring(0, 50));

    switch (type) {
      case 'new_pattern':
        return `Discovered potential pattern connecting: ${conceptNames.join(' + ')}`;
      case 'optimization':
        return `Optimization opportunity: ${conceptNames.join(' → ')}`;
      case 'warning':
        return `Warning: potential issue with ${conceptNames.join(' and ')}`;
      default:
        return `Connection found between: ${conceptNames.join(', ')}`;
    }
  }

  private generateAction(concepts: ConceptNode[], type: DreamInsight['type']): string | undefined {
    if (type === 'new_pattern') {
      return 'Consider creating a new test pattern combining these concepts';
    } else if (type === 'optimization') {
      return 'Consider applying this technique to improve efficiency';
    }
    return undefined;
  }

  private async validateInsights(insights: DreamInsight[]): Promise<DreamInsight[]> {
    // Validate insights against existing patterns
    // Remove duplicates and low-confidence insights
    return insights
      .filter(i => i.confidence > 0.5)
      .sort((a, b) => b.noveltyScore - a.noveltyScore)
      .slice(0, this.config.targetInsights);
  }
}
```

### 2.2 Cross-Agent Transfer Protocol

**Objective**: Share learned patterns across agents

```
src/learning/transfer/
├── TransferProtocol.ts        # Main transfer logic
├── CompatibilityScorer.ts     # Score pattern compatibility
├── TransferValidator.ts       # Validate transfer success
├── TransferRegistry.ts        # Track transfers
└── index.ts
```

#### TransferProtocol.ts

```typescript
// File: src/learning/transfer/TransferProtocol.ts

export interface TransferRequest {
  sourceAgent: string;
  targetAgent: string;
  patternIds: string[];
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface TransferResult {
  requestId: string;
  sourceAgent: string;
  targetAgent: string;
  patternsTransferred: number;
  patternsSkipped: number;
  successRate: number;
  details: TransferDetail[];
}

export interface TransferDetail {
  patternId: string;
  status: 'success' | 'skipped' | 'failed';
  reason?: string;
  compatibilityScore?: number;
}

export class TransferProtocol {
  private store: RuVectorPatternStore;
  private scorer: CompatibilityScorer;
  private validator: TransferValidator;
  private registry: TransferRegistry;

  constructor(
    store: RuVectorPatternStore,
    scorer: CompatibilityScorer,
    validator: TransferValidator,
    registry: TransferRegistry
  ) {
    this.store = store;
    this.scorer = scorer;
    this.validator = validator;
    this.registry = registry;
  }

  /**
   * Transfer patterns between agents
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    const requestId = `transfer-${Date.now()}`;
    const details: TransferDetail[] = [];

    for (const patternId of request.patternIds) {
      // 1. Get pattern from source
      const pattern = await this.store.getPattern(patternId);
      if (!pattern) {
        details.push({
          patternId,
          status: 'skipped',
          reason: 'Pattern not found',
        });
        continue;
      }

      // 2. Score compatibility with target agent
      const compatibility = await this.scorer.score(pattern, request.targetAgent);

      if (compatibility < 0.5) {
        details.push({
          patternId,
          status: 'skipped',
          reason: `Low compatibility: ${(compatibility * 100).toFixed(1)}%`,
          compatibilityScore: compatibility,
        });
        continue;
      }

      // 3. Adapt pattern for target agent
      const adaptedPattern = await this.adaptPattern(pattern, request.targetAgent);

      // 4. Store adapted pattern for target agent
      await this.store.storePattern({
        ...adaptedPattern,
        id: `${request.targetAgent}-${patternId}`,
        metadata: {
          ...adaptedPattern.metadata,
          transferredFrom: request.sourceAgent,
          transferredAt: Date.now(),
          originalPatternId: patternId,
        },
      });

      details.push({
        patternId,
        status: 'success',
        compatibilityScore: compatibility,
      });
    }

    const result: TransferResult = {
      requestId,
      sourceAgent: request.sourceAgent,
      targetAgent: request.targetAgent,
      patternsTransferred: details.filter(d => d.status === 'success').length,
      patternsSkipped: details.filter(d => d.status !== 'success').length,
      successRate: details.filter(d => d.status === 'success').length / details.length,
      details,
    };

    // Register transfer
    await this.registry.record(result);

    return result;
  }

  /**
   * Bulk transfer: Share all high-quality patterns from source to all compatible targets
   */
  async broadcastPatterns(
    sourceAgent: string,
    options: { minQuality?: number; targetAgents?: string[] }
  ): Promise<Map<string, TransferResult>> {
    const results = new Map<string, TransferResult>();
    const { minQuality = 0.8, targetAgents } = options;

    // Get high-quality patterns from source
    const patterns = await this.store.searchSimilar(
      await this.getAgentCentroid(sourceAgent),
      { k: 100, threshold: minQuality }
    );

    // Get target agents (all except source if not specified)
    const targets = targetAgents || await this.getCompatibleAgents(sourceAgent);

    for (const target of targets) {
      if (target === sourceAgent) continue;

      const result = await this.transfer({
        sourceAgent,
        targetAgent: target,
        patternIds: patterns.map(p => p.pattern.id),
        priority: 'medium',
        reason: 'Automated broadcast from high-quality patterns',
      });

      results.set(target, result);
    }

    return results;
  }

  private async adaptPattern(pattern: TestPattern, targetAgent: string): Promise<TestPattern> {
    // Adapt pattern for target agent's domain
    // This might involve:
    // - Adjusting terminology
    // - Changing framework references
    // - Modifying confidence based on domain fit
    return {
      ...pattern,
      metadata: {
        ...pattern.metadata,
        adaptedFor: targetAgent,
      },
    };
  }

  private async getAgentCentroid(agentId: string): Promise<number[]> {
    // Get average embedding of agent's patterns
    // This represents the agent's "knowledge center"
    const patterns = await this.store.searchSimilar(
      new Array(384).fill(0),
      { k: 100, domain: agentId }
    );

    if (patterns.length === 0) {
      return new Array(384).fill(0);
    }

    // Average embeddings
    const centroid = new Array(384).fill(0);
    for (const p of patterns) {
      for (let i = 0; i < 384; i++) {
        centroid[i] += p.pattern.embedding[i] / patterns.length;
      }
    }
    return centroid;
  }

  private async getCompatibleAgents(sourceAgent: string): Promise<string[]> {
    // Return agents that are compatible with source's patterns
    // Based on domain overlap
    const agentTypes = [
      'test-generator',
      'coverage-analyzer',
      'performance-tester',
      'security-scanner',
      'flaky-test-hunter',
      // ... all 19 agents
    ];

    return agentTypes.filter(a => a !== sourceAgent);
  }
}
```

#### CompatibilityScorer.ts

```typescript
// File: src/learning/transfer/CompatibilityScorer.ts

export interface CompatibilityFactors {
  domainOverlap: number;       // 0-1
  frameworkMatch: number;      // 0-1
  complexityMatch: number;     // 0-1
  historicalSuccess: number;   // 0-1
}

export class CompatibilityScorer {
  private store: RuVectorPatternStore;
  private registry: TransferRegistry;

  constructor(store: RuVectorPatternStore, registry: TransferRegistry) {
    this.store = store;
    this.registry = registry;
  }

  /**
   * Score how compatible a pattern is with a target agent
   */
  async score(pattern: TestPattern, targetAgent: string): Promise<number> {
    const factors = await this.getFactors(pattern, targetAgent);

    // Weighted combination of factors
    return (
      factors.domainOverlap * 0.3 +
      factors.frameworkMatch * 0.25 +
      factors.complexityMatch * 0.2 +
      factors.historicalSuccess * 0.25
    );
  }

  async getFactors(pattern: TestPattern, targetAgent: string): Promise<CompatibilityFactors> {
    return {
      domainOverlap: await this.calculateDomainOverlap(pattern, targetAgent),
      frameworkMatch: await this.calculateFrameworkMatch(pattern, targetAgent),
      complexityMatch: await this.calculateComplexityMatch(pattern, targetAgent),
      historicalSuccess: await this.calculateHistoricalSuccess(pattern.id, targetAgent),
    };
  }

  private async calculateDomainOverlap(pattern: TestPattern, targetAgent: string): Promise<number> {
    // Get target agent's patterns and calculate embedding similarity
    const targetPatterns = await this.store.searchSimilar(pattern.embedding, {
      k: 10,
      domain: targetAgent,
    });

    if (targetPatterns.length === 0) return 0.5; // Neutral if no data

    // Average similarity to target's patterns
    return targetPatterns.reduce((sum, p) => sum + p.score, 0) / targetPatterns.length;
  }

  private async calculateFrameworkMatch(pattern: TestPattern, targetAgent: string): Promise<number> {
    // Check if pattern's framework is used by target agent
    const agentFrameworks = this.getAgentFrameworks(targetAgent);
    return agentFrameworks.includes(pattern.framework || '') ? 1 : 0.3;
  }

  private async calculateComplexityMatch(pattern: TestPattern, targetAgent: string): Promise<number> {
    // Ensure pattern complexity matches target agent's typical handling
    // This is a simplified version; could be more sophisticated
    return 0.8; // Default to high match
  }

  private async calculateHistoricalSuccess(patternId: string, targetAgent: string): Promise<number> {
    // Check historical transfer success rate for similar patterns
    const history = await this.registry.getTransferHistory(targetAgent);

    if (history.length === 0) return 0.5; // Neutral if no history

    const successCount = history.filter(t => t.status === 'success').length;
    return successCount / history.length;
  }

  private getAgentFrameworks(agentId: string): string[] {
    // Return frameworks typically used by each agent type
    const frameworkMap: Record<string, string[]> = {
      'test-generator': ['jest', 'mocha', 'vitest', 'pytest'],
      'coverage-analyzer': ['jest', 'istanbul', 'c8'],
      'performance-tester': ['k6', 'artillery', 'autocannon'],
      'security-scanner': ['eslint-security', 'snyk', 'owasp'],
      // ... other agents
    };

    return frameworkMap[agentId] || [];
  }
}
```

### Phase 2 Deliverables

| Deliverable | File | Status |
|-------------|------|--------|
| Concept Graph | `src/learning/dream/ConceptGraph.ts` | |
| Spreading Activation | `src/learning/dream/SpreadingActivation.ts` | |
| Dream Engine | `src/learning/dream/DreamEngine.ts` | |
| Transfer Protocol | `src/learning/transfer/TransferProtocol.ts` | |
| Compatibility Scorer | `src/learning/transfer/CompatibilityScorer.ts` | |
| Transfer Validator | `src/learning/transfer/TransferValidator.ts` | |
| Integration Tests | `tests/integration/dream-engine.test.ts` | |
| CLI Commands | `aqe dream run`, `aqe transfer broadcast` | |

### Phase 2 Success Gate

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dream insights/cycle | >5 | Insight count |
| Insight actionability | >30% | Manual review |
| Transfer success rate | >70% | Transfer logs |
| Transfer latency | <5s | Performance test |
| No negative transfer | Baseline maintained | A/B comparison |

---

## Phase 3: Observability Dashboard (Week 5)

**Duration**: 1 week
**Effort**: 2 person-weeks
**Goal**: Visibility into learning effectiveness

### 3.1 Metrics Collection

```typescript
// File: src/learning/metrics/LearningMetrics.ts

export interface LearningMetrics {
  // Discovery metrics
  patternsDiscoveredTotal: number;
  patternsDiscoveredToday: number;
  discoveryRate: number;           // patterns/hour

  // Quality metrics
  patternAccuracy: number;         // 0-1
  insightActionability: number;    // 0-1
  falsePositiveRate: number;       // 0-1

  // Transfer metrics
  transferSuccessRate: number;     // 0-1
  adoptionRate: number;            // % of transferred patterns used
  negativeTransferCount: number;

  // Impact metrics
  taskTimeReduction: number;       // % improvement
  coverageImprovement: number;     // % improvement
  bugDetectionImprovement: number; // % improvement

  // System health
  sleepCycleCompletionRate: number;
  avgCycleDuration: number;
  errorRate: number;
}

export class LearningMetricsCollector {
  private store: RuVectorPatternStore;
  private registry: TransferRegistry;

  async collect(): Promise<LearningMetrics> {
    // Collect all metrics from various sources
  }

  async getHistoricalMetrics(days: number): Promise<LearningMetrics[]> {
    // Return metrics over time for trend analysis
  }
}
```

### 3.2 Dashboard Components

```
src/learning/dashboard/
├── MetricsDashboard.ts        # Main dashboard service
├── TrendAnalyzer.ts           # Trend detection
├── AlertManager.ts            # Alert on anomalies
└── index.ts
```

### 3.3 CLI Integration

```bash
# Learning status overview
aqe learn status

# Detailed metrics
aqe learn metrics --period 7d

# View recent insights
aqe learn insights --limit 10

# Transfer history
aqe learn transfers --agent test-generator

# Dream cycle logs
aqe learn dreams --date 2024-12-10
```

### Phase 3 Deliverables

| Deliverable | File | Status |
|-------------|------|--------|
| Metrics Collector | `src/learning/metrics/LearningMetrics.ts` | |
| Trend Analyzer | `src/learning/dashboard/TrendAnalyzer.ts` | |
| Alert Manager | `src/learning/dashboard/AlertManager.ts` | |
| CLI Commands | `aqe learn metrics`, `aqe learn insights` | |
| Dashboard UI | `frontend/src/pages/LearningDashboard.tsx` | |

---

## Phase 4: Optimization (Week 6)

**Duration**: 1 week
**Effort**: 2 person-weeks
**Goal**: Performance tuning and bug fixes

### 4.1 Performance Optimization

- [ ] Profile sleep scheduler for CPU overhead
- [ ] Optimize experience capture batch size
- [ ] Tune dream engine iteration count
- [ ] Reduce transfer latency
- [ ] Memory optimization for large pattern stores

### 4.2 Bug Fixes

- [ ] Address issues discovered during Phases 1-3
- [ ] Fix edge cases in idle detection
- [ ] Handle container restart scenarios
- [ ] Improve error recovery

### 4.3 Documentation

- [ ] Update `docs/guides/LEARNING-SYSTEM-USER-GUIDE.md`
- [ ] Create `docs/architecture/NIGHTLY-LEARNER-ARCHITECTURE.md`
- [ ] Add inline code documentation
- [ ] Create troubleshooting guide

---

## File Structure Summary

```
src/learning/
├── baselines/
│   ├── BaselineCollector.ts
│   ├── StandardTaskSuite.ts
│   └── index.ts
├── scheduler/
│   ├── SleepScheduler.ts
│   ├── IdleDetector.ts
│   ├── SleepCycle.ts
│   ├── TimeBasedTrigger.ts
│   └── index.ts
├── capture/
│   ├── ExperienceCapture.ts
│   ├── ExecutionRecorder.ts
│   ├── ExperienceExtractor.ts
│   ├── ExperienceStore.ts
│   └── index.ts
├── synthesis/
│   ├── PatternSynthesis.ts
│   ├── ClusteringEngine.ts
│   └── index.ts
├── dream/
│   ├── DreamEngine.ts
│   ├── ConceptGraph.ts
│   ├── SpreadingActivation.ts
│   ├── InsightGenerator.ts
│   └── index.ts
├── transfer/
│   ├── TransferProtocol.ts
│   ├── CompatibilityScorer.ts
│   ├── TransferValidator.ts
│   ├── TransferRegistry.ts
│   └── index.ts
├── metrics/
│   ├── LearningMetrics.ts
│   ├── MetricsStore.ts
│   └── index.ts
├── dashboard/
│   ├── MetricsDashboard.ts
│   ├── TrendAnalyzer.ts
│   ├── AlertManager.ts
│   └── index.ts
└── index.ts

tests/integration/learning/
├── idle-detector.test.ts
├── sleep-scheduler.test.ts
├── experience-capture.test.ts
├── pattern-synthesis.test.ts
├── dream-engine.test.ts
├── transfer-protocol.test.ts
└── learning-metrics.test.ts
```

---

## Success Metrics Summary

| Phase | Key Metric | Target | Measurement Method |
|-------|------------|--------|-------------------|
| 0 | Baselines collected | 19 agents | Completion check |
| 0 | Idle detection accuracy | >90% | Test suite |
| 0 | Transfer prototype success | >50% | Transfer logs |
| 1 | Experiences captured/day | >100 | Metrics |
| 1 | Patterns discovered/night | >10 | Synthesis output |
| 1 | Pipeline uptime | >99% | Health checks |
| 2 | Dream insights/cycle | >5 | Insight count |
| 2 | Transfer success rate | >70% | Transfer logs |
| 2 | No negative transfer | Baseline maintained | A/B comparison |
| 3 | Dashboard load time | <2s | Performance test |
| 3 | Metric accuracy | >95% | Validation |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Sleep scheduler fails in containers | HIGH | HIGH | Hybrid mode with time-based fallback |
| Dream engine scope creep | HIGH | CRITICAL | Strict v1 scope (no neural substrate) |
| Low transfer success | MEDIUM | HIGH | Start with 2 agents, iterate |
| Performance overhead | MEDIUM | MEDIUM | Benchmark continuously, budget <5% |
| Learning ineffective | MEDIUM | HIGH | Baselines + A/B testing |

---

## Deferred to v2

1. **Neural substrate dream engine** - Requires research spike
2. **REM sleep dynamics** - Complex neuroscience modeling
3. **90% transfer success** - Research-grade target
4. **Comprehensive observability** - Expand after core metrics proven
5. **Multi-cluster learning** - Cross-deployment synchronization

---

## Appendix: CLI Commands Reference

```bash
# Phase 0 commands
aqe learn baseline collect              # Collect baselines for all agents
aqe learn baseline show [agent]         # Show baseline for agent

# Phase 1 commands
aqe learn start                         # Start learning scheduler
aqe learn stop                          # Stop learning scheduler
aqe learn trigger                       # Manually trigger learning cycle
aqe learn status                        # Show current status

# Phase 2 commands
aqe dream run                           # Manually run dream cycle
aqe dream insights [--limit N]          # Show recent insights
aqe transfer broadcast [source]         # Broadcast patterns from source
aqe transfer status                     # Show transfer statistics

# Phase 3 commands
aqe learn metrics [--period Nd]         # Show learning metrics
aqe learn trends                        # Show trend analysis
aqe learn alerts                        # Show active alerts
```

---

**Document Version**: 1.0
**Author**: Agentic QE Fleet
**Approved By**: TBD
**Next Review**: End of Phase 0
