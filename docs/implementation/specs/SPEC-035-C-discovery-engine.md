# SPEC-035-C: Causal Discovery Engine

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-035-C |
| **Parent ADR** | [ADR-035](../adrs/ADR-035-causal-discovery.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Causal Discovery Engine that orchestrates event observation, weight learning, and root cause analysis. It provides the main API for integrating causal discovery with defect intelligence.

---

## CausalDiscoveryEngine Implementation

```typescript
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
```

---

## Defect Intelligence Integration

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

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-035-C-001 | Events must have valid timestamps | Error |
| SPEC-035-C-002 | Event type must be valid TestEventType | Error |
| SPEC-035-C-003 | Batch events should be sorted by timestamp | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-035-A | Causal Weight Matrix | Core learning component |
| SPEC-035-B | Causal Graph | Graph representation |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-035-causal-discovery.md)
- [Causal Discovery in Machine Learning](https://arxiv.org/abs/2206.15475)
