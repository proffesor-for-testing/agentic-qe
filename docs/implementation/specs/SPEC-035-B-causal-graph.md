# SPEC-035-B: Causal Graph

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-035-B |
| **Parent ADR** | [ADR-035](../adrs/ADR-035-causal-discovery.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Causal Graph implementation that represents learned causal relationships between test events. It supports graph traversal, reachability analysis, and transitive closure computation.

---

## CausalGraphImpl Implementation

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

---

## Root Cause Analysis Types

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

export interface CausalSummary {
  numRelationships: number;
  causesCount: number;
  preventsCount: number;
  avgStrength: number;
  eventsObserved: number;
}
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-035-B-001 | nodes array must not contain duplicates | Error |
| SPEC-035-B-002 | edge source/target must exist in nodes | Error |
| SPEC-035-B-003 | strength must be >= 0 | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-035-A | Causal Weight Matrix | Generates edges |
| SPEC-035-C | Discovery Engine | Uses graph |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-035-causal-discovery.md)
- [Granger Causality](https://en.wikipedia.org/wiki/Granger_causality)
