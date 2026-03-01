# SPEC-035-A: Causal Weight Matrix

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-035-A |
| **Parent ADR** | [ADR-035](../adrs/ADR-035-causal-discovery.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Causal Weight Matrix that learns causal relationships between test events using asymmetric STDP (Spike-Timing Dependent Plasticity) rules. The matrix tracks timing relationships to infer which events cause others.

---

## Configuration

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

---

## Event Types

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

---

## Causal Relationship Types

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

---

## CausalWeightMatrix Implementation

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
        // Other event preceded this one -> otherType may cause currentType
        const weightChange = this.stdpPositive(dt);
        const currentWeight = this.getWeight(otherType, currentType);
        this.setWeight(otherType, currentType, currentWeight + weightChange);
      } else if (dt < 0 && Math.abs(dt) < this.config.timeWindow) {
        // This event preceded other -> currentType may cause otherType
        const weightChange = this.stdpNegative(Math.abs(dt));
        const currentWeight = this.getWeight(currentType, otherType);
        this.setWeight(currentType, otherType, currentWeight + weightChange);
      }
    }

    // Record this event's time
    this.lastSpikeTime.set(currentType, currentTime);
  }

  /** STDP: positive timing (pre before post) strengthens connection */
  private stdpPositive(dt: number): number {
    const tau = this.config.timeWindow / 3;
    return this.config.learningRate * Math.exp(-dt / tau);
  }

  /** STDP: negative timing (post before pre) weakens connection */
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

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-035-A-001 | timeWindow must be > 0 | Error |
| SPEC-035-A-002 | learningRate must be 0-1 | Warning |
| SPEC-035-A-003 | decayRate must be 0-1 | Warning |
| SPEC-035-A-004 | causalThreshold must be >= 0 | Error |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-035-B | Causal Graph | Uses weight matrix |
| SPEC-035-C | Discovery Engine | Orchestrates learning |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-035-causal-discovery.md)
- [Spike-Timing Dependent Plasticity (STDP)](https://en.wikipedia.org/wiki/Spike-timing-dependent_plasticity)
