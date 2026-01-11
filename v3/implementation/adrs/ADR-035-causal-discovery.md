# ADR-035: Causal Discovery for Root Cause Analysis

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** RuVector MinCut Analysis (causal.rs)

---

## Context

Current v3 AQE root cause analysis is correlation-based:
- Log pattern matching
- Temporal coincidence detection
- Manual investigation required
- No automated causal inference

This approach has limitations:
1. **Correlation ≠ Causation**: High correlation doesn't imply causal relationship
2. **Manual effort**: Requires human expertise to identify root causes
3. **Reactive analysis**: Only happens after failures occur
4. **No intervention guidance**: Can't suggest optimal points to fix issues

RuVector's Causal Discovery SNN demonstrates a powerful pattern:
> Spike-timing cross-correlation with asymmetric temporal windows naturally encodes Granger-like causality. After learning, W_AB reflects causal strength A→B.

This creates **automated causal inference** - the system learns what causes what.

### The Causal Discovery Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    CAUSAL DISCOVERY                          │
│                                                              │
│   Event A:  ──●────────●────────●────────                   │
│   Event B:  ────────●────────●────────●──                   │
│              │←─Δt─→│                                        │
│                                                              │
│   If Δt consistently positive → A causes B                  │
│   STDP learning rule naturally encodes this!                │
│                                                              │
│   After learning, weight W_AB reflects causal strength A→B  │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision

**Implement causal discovery using spike-timing correlation to automatically learn causal relationships between test events for root cause analysis.**

### Core Components

#### 1. Causal Discovery Configuration

```typescript
export interface CausalDiscoveryConfig {
  /** Number of event types to track */
  numEventTypes: number;

  /** Threshold for significant causal relationship */
  causalThreshold: number;

  /** Time window for causality detection (ms) */
  timeWindow: number;

  /** Learning rate for causal weight updates */
  learningRate: number;

  /** Decay rate for causal weights */
  decayRate: number;
}

export const DEFAULT_CAUSAL_CONFIG: CausalDiscoveryConfig = {
  numEventTypes: 100,
  causalThreshold: 0.1,
  timeWindow: 50,
  learningRate: 0.01,
  decayRate: 0.001,
};
```

#### 2. Event Types

```typescript
export type TestEventType =
  | 'test_started'
  | 'test_passed'
  | 'test_failed'
  | 'test_flaky'
  | 'assertion_failed'
  | 'timeout'
  | 'exception'
  | 'resource_exhausted'
  | 'dependency_failed'
  | 'coverage_changed'
  | 'build_failed'
  | 'deploy_started'
  | 'deploy_failed'
  | 'deploy_succeeded'
  | 'rollback_triggered'
  | 'alert_fired';

export interface TestEvent {
  /** Type of event */
  type: TestEventType;

  /** Timestamp in milliseconds */
  timestamp: number;

  /** Associated test ID (if applicable) */
  testId?: string;

  /** Associated file path (if applicable) */
  file?: string;

  /** Event metadata */
  data?: Record<string, unknown>;
}
```

#### 3. Causal Relationship Types

```typescript
export type CausalRelation = 'causes' | 'prevents' | 'none';

export interface CausalEdge {
  source: TestEventType;
  target: TestEventType;
  strength: number;
  relation: CausalRelation;
}

export interface CausalGraph {
  nodes: TestEventType[];
  edges: CausalEdge[];

  /** Get all edges from a source event */
  edgesFrom(source: TestEventType): CausalEdge[];

  /** Get all edges to a target event */
  edgesTo(target: TestEventType): CausalEdge[];

  /** Find reachable nodes from a source */
  reachableFrom(source: TestEventType): Set<TestEventType>;

  /** Compute transitive closure */
  transitiveClosure(): CausalGraph;
}
```

#### 4. Causal Weight Matrix

```typescript
export class CausalWeightMatrix {
  private weights: Map<string, number> = new Map();
  private lastSpikeTime: Map<TestEventType, number> = new Map();

  constructor(private config: CausalDiscoveryConfig) {}

  /** Get causal weight from source to target */
  getWeight(source: TestEventType, target: TestEventType): number {
    return this.weights.get(`${source}->${target}`) || 0;
  }

  /** Set causal weight */
  setWeight(source: TestEventType, target: TestEventType, weight: number): void {
    this.weights.set(`${source}->${target}`, weight);
  }

  /** Update weights using asymmetric STDP rule */
  updateWeights(event: TestEvent): void {
    const currentTime = event.timestamp;
    const currentType = event.type;

    // Update weights based on timing relative to all other event types
    for (const [otherType, lastTime] of this.lastSpikeTime.entries()) {
      const dt = currentTime - lastTime;

      if (dt > 0 && dt < this.config.timeWindow) {
        // Other event preceded this one → otherType may cause currentType
        const weightChange = this.stdpPositive(dt);
        const currentWeight = this.getWeight(otherType, currentType);
        this.setWeight(otherType, currentType, currentWeight + weightChange);
      } else if (dt < 0 && Math.abs(dt) < this.config.timeWindow) {
        // This event preceded other → currentType may cause otherType
        const weightChange = this.stdpNegative(Math.abs(dt));
        const currentWeight = this.getWeight(currentType, otherType);
        this.setWeight(currentType, otherType, currentWeight + weightChange);
      }
    }

    // Record this event's time
    this.lastSpikeTime.set(currentType, currentTime);
  }

  /** STDP: positive timing (pre before post) → strengthen */
  private stdpPositive(dt: number): number {
    const tau = this.config.timeWindow / 3;
    return this.config.learningRate * Math.exp(-dt / tau);
  }

  /** STDP: negative timing (post before pre) → weaken */
  private stdpNegative(dt: number): number {
    const tau = this.config.timeWindow / 3;
    return -0.5 * this.config.learningRate * Math.exp(-dt / tau);
  }

  /** Apply decay to all weights */
  decay(): void {
    for (const [key, weight] of this.weights.entries()) {
      const decayedWeight = weight * (1 - this.config.decayRate);
      if (Math.abs(decayedWeight) < 0.001) {
        this.weights.delete(key);
      } else {
        this.weights.set(key, decayedWeight);
      }
    }
  }

  /** Extract causal graph from learned weights */
  extractCausalGraph(): CausalGraph {
    const nodes = new Set<TestEventType>();
    const edges: CausalEdge[] = [];

    for (const [key, weight] of this.weights.entries()) {
      const [source, target] = key.split('->') as [TestEventType, TestEventType];

      if (Math.abs(weight) > this.config.causalThreshold) {
        nodes.add(source);
        nodes.add(target);

        edges.push({
          source,
          target,
          strength: Math.abs(weight),
          relation: weight > 0 ? 'causes' : 'prevents',
        });
      }
    }

    return new CausalGraphImpl(Array.from(nodes), edges);
  }
}
```

#### 5. Causal Graph Implementation

```typescript
class CausalGraphImpl implements CausalGraph {
  constructor(
    public nodes: TestEventType[],
    public edges: CausalEdge[]
  ) {}

  edgesFrom(source: TestEventType): CausalEdge[] {
    return this.edges.filter(e => e.source === source);
  }

  edgesTo(target: TestEventType): CausalEdge[] {
    return this.edges.filter(e => e.target === target);
  }

  reachableFrom(source: TestEventType): Set<TestEventType> {
    const visited = new Set<TestEventType>();
    const queue: TestEventType[] = [source];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.edgesFrom(current)) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    return visited;
  }

  transitiveClosure(): CausalGraph {
    // Floyd-Warshall for transitive closure
    const n = this.nodes.length;
    const nodeIndex = new Map(this.nodes.map((n, i) => [n, i]));
    const strength: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

    // Initialize with direct edges
    for (const edge of this.edges) {
      const i = nodeIndex.get(edge.source)!;
      const j = nodeIndex.get(edge.target)!;
      strength[i][j] = edge.strength;
    }

    // Compute transitive closure
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && i !== k && j !== k) {
            const indirect = strength[i][k] * strength[k][j];
            if (indirect > strength[i][j]) {
              strength[i][j] = indirect;
            }
          }
        }
      }
    }

    // Build new graph
    const newEdges: CausalEdge[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (strength[i][j] > 0) {
          newEdges.push({
            source: this.nodes[i],
            target: this.nodes[j],
            strength: strength[i][j],
            relation: 'causes',
          });
        }
      }
    }

    return new CausalGraphImpl(this.nodes, newEdges);
  }
}
```

#### 6. Causal Discovery Engine

```typescript
export interface RootCauseAnalysis {
  /** Target event being analyzed */
  targetEvent: TestEventType;

  /** Direct causes (one hop) */
  directCauses: Array<{ event: TestEventType; strength: number }>;

  /** Indirect causes (transitive) */
  indirectCauses: Array<{ event: TestEventType; strength: number; path: TestEventType[] }>;

  /** Optimal intervention points */
  interventionPoints: TestEventType[];

  /** Confidence in analysis (0-1) */
  confidence: number;
}

export class CausalDiscoveryEngine {
  private weightMatrix: CausalWeightMatrix;
  private eventHistory: TestEvent[] = [];
  private config: CausalDiscoveryConfig;

  constructor(config: CausalDiscoveryConfig = DEFAULT_CAUSAL_CONFIG) {
    this.config = config;
    this.weightMatrix = new CausalWeightMatrix(config);
  }

  /** Observe a test event */
  observe(event: TestEvent): void {
    this.weightMatrix.updateWeights(event);
    this.eventHistory.push(event);

    // Prune old events
    const cutoff = event.timestamp - this.config.timeWindow * 100;
    this.eventHistory = this.eventHistory.filter(e => e.timestamp > cutoff);
  }

  /** Observe multiple events */
  observeBatch(events: TestEvent[]): void {
    for (const event of events) {
      this.observe(event);
    }
  }

  /** Perform root cause analysis for a target event */
  analyzeRootCause(targetEvent: TestEventType): RootCauseAnalysis {
    const graph = this.weightMatrix.extractCausalGraph();

    // Find direct causes
    const directCauses = graph.edgesTo(targetEvent)
      .map(e => ({ event: e.source, strength: e.strength }))
      .sort((a, b) => b.strength - a.strength);

    // Find indirect causes via transitive closure
    const closedGraph = graph.transitiveClosure();
    const indirectCauses: Array<{ event: TestEventType; strength: number; path: TestEventType[] }> = [];

    for (const edge of closedGraph.edgesTo(targetEvent)) {
      // Skip if it's a direct cause
      if (directCauses.some(dc => dc.event === edge.source)) continue;

      indirectCauses.push({
        event: edge.source,
        strength: edge.strength,
        path: this.findPath(graph, edge.source, targetEvent),
      });
    }

    indirectCauses.sort((a, b) => b.strength - a.strength);

    // Find optimal intervention points
    const interventionPoints = this.findInterventionPoints(graph, targetEvent);

    // Calculate confidence based on evidence strength
    const totalEvidence = [...directCauses, ...indirectCauses]
      .reduce((sum, c) => sum + c.strength, 0);
    const confidence = Math.min(totalEvidence / 5, 1);

    return {
      targetEvent,
      directCauses,
      indirectCauses,
      interventionPoints,
      confidence,
    };
  }

  /** Find path from source to target */
  private findPath(graph: CausalGraph, source: TestEventType, target: TestEventType): TestEventType[] {
    const visited = new Set<TestEventType>();
    const parent = new Map<TestEventType, TestEventType>();
    const queue: TestEventType[] = [source];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === target) break;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of graph.edgesFrom(current)) {
        if (!visited.has(edge.target)) {
          parent.set(edge.target, current);
          queue.push(edge.target);
        }
      }
    }

    // Reconstruct path
    const path: TestEventType[] = [];
    let current: TestEventType | undefined = target;
    while (current && current !== source) {
      path.unshift(current);
      current = parent.get(current);
    }
    if (current === source) {
      path.unshift(source);
    }

    return path;
  }

  /** Find optimal intervention points (mincut on causal graph) */
  private findInterventionPoints(graph: CausalGraph, target: TestEventType): TestEventType[] {
    // Heuristic: nodes with high out-degree that can reach target
    const reachability = new Map<TestEventType, number>();

    for (const node of graph.nodes) {
      const reachable = graph.reachableFrom(node);
      if (reachable.has(target)) {
        const outDegree = graph.edgesFrom(node).length;
        reachability.set(node, outDegree);
      }
    }

    // Sort by out-degree and return top 5
    return Array.from(reachability.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([node]) => node);
  }

  /** Get all learned causal relationships */
  getCausalGraph(): CausalGraph {
    return this.weightMatrix.extractCausalGraph();
  }

  /** Get summary statistics */
  getSummary(): CausalSummary {
    const graph = this.weightMatrix.extractCausalGraph();

    let causesCount = 0;
    let preventsCount = 0;
    let totalStrength = 0;

    for (const edge of graph.edges) {
      totalStrength += edge.strength;
      if (edge.relation === 'causes') causesCount++;
      if (edge.relation === 'prevents') preventsCount++;
    }

    return {
      numRelationships: graph.edges.length,
      causesCount,
      preventsCount,
      avgStrength: graph.edges.length > 0 ? totalStrength / graph.edges.length : 0,
      eventsObserved: this.eventHistory.length,
    };
  }

  /** Apply decay to learned weights */
  decay(): void {
    this.weightMatrix.decay();
  }

  /** Reset all learned relationships */
  reset(): void {
    this.weightMatrix = new CausalWeightMatrix(this.config);
    this.eventHistory = [];
  }
}

export interface CausalSummary {
  numRelationships: number;
  causesCount: number;
  preventsCount: number;
  avgStrength: number;
  eventsObserved: number;
}
```

---

## Integration with Defect Intelligence

```typescript
// In defect-intelligence domain
import { CausalDiscoveryEngine, RootCauseAnalysis } from '../causal-discovery';

export class DefectIntelligenceService {
  private causalEngine: CausalDiscoveryEngine;

  constructor() {
    this.causalEngine = new CausalDiscoveryEngine();
  }

  /** Called when any test event occurs */
  onTestEvent(event: TestEvent): void {
    this.causalEngine.observe(event);
  }

  /** Analyze root cause of test failures */
  analyzeTestFailure(failedTestId: string): RootCauseAnalysis {
    const analysis = this.causalEngine.analyzeRootCause('test_failed');

    console.log(`[Defect Intelligence] Root cause analysis for ${failedTestId}:`);
    console.log(`  Direct causes: ${analysis.directCauses.map(c => c.event).join(', ')}`);
    console.log(`  Intervention points: ${analysis.interventionPoints.join(', ')}`);

    return analysis;
  }

  /** Predict which events might cause future failures */
  predictFailures(): TestEventType[] {
    const graph = this.causalEngine.getCausalGraph();

    // Find events that strongly cause 'test_failed'
    return graph.edgesTo('test_failed')
      .filter(e => e.strength > 0.5)
      .map(e => e.source);
  }
}
```

---

## Implementation Plan

### Phase 1: Core Causal Discovery (Days 1-2)
```
v3/src/causal-discovery/
├── index.ts
├── types.ts
├── weight-matrix.ts         # CausalWeightMatrix
├── causal-graph.ts          # CausalGraph implementation
└── discovery-engine.ts      # CausalDiscoveryEngine
```

### Phase 2: Root Cause Analysis (Days 3-4)
```
├── root-cause-analyzer.ts   # RootCauseAnalysis logic
├── intervention-finder.ts   # Optimal intervention points
└── path-finder.ts           # Causal path discovery
```

### Phase 3: Integration (Day 5)
- Integrate with defect-intelligence domain
- Add MCP tool for causal analysis
- Create visualization dashboard

---

## Success Metrics

- [ ] Causal relationship learning from event streams
- [ ] Root cause identification accuracy > 70%
- [ ] Intervention point suggestions
- [ ] Transitive closure computation
- [ ] Integration with defect-intelligence domain
- [ ] 50+ unit tests

---

## References

- [ruvector-mincut/src/snn/causal.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut/src/snn/causal.rs)
- [Granger Causality](https://en.wikipedia.org/wiki/Granger_causality)
- [Spike-Timing Dependent Plasticity (STDP)](https://en.wikipedia.org/wiki/Spike-timing-dependent_plasticity)
- [Causal Discovery in Machine Learning](https://arxiv.org/abs/2206.15475)
