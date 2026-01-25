# SPEC-031-A: Self-Observation Protocol

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-031-A |
| **Parent ADR** | [ADR-031](../adrs/ADR-031-strange-loop-self-awareness.md) |
| **Version** | 1.0 |
| **Status** | Accepted |
| **Last Updated** | 2026-01-10 |
| **Author** | Architecture Team |

---

## Overview

Defines the data structures and protocols for self-observation in the Strange Loop pattern, including swarm health observations, topology analysis, and agent health metrics.

---

## Specification Details

### Section 1: Strange Loop Pattern

```
+------------------------------------------+
|              STRANGE LOOP                |
|                                          |
|   Observe --> Model --> Decide --> Act   |
|      ^                              |    |
|      +------------------------------+    |
|                                          |
|   "I see I'm weak here, so I strengthen" |
+------------------------------------------+
```

### Section 2: Core Interfaces

```typescript
export interface SwarmHealthObservation {
  /** Timestamp of observation */
  timestamp: number;

  /** Observer agent ID */
  observerId: string;

  /** Observed swarm topology */
  topology: SwarmTopology;

  /** Connectivity metrics */
  connectivity: {
    /** Minimum cut value (lambda) */
    minCut: number;

    /** Number of connected components */
    components: number;

    /** Bottleneck agents (single points of failure) */
    bottlenecks: string[];

    /** Average path length between agents */
    avgPathLength: number;

    /** Clustering coefficient */
    clusteringCoefficient: number;
  };

  /** Agent-specific health */
  agentHealth: Map<string, AgentHealthMetrics>;

  /** Detected vulnerabilities */
  vulnerabilities: SwarmVulnerability[];
}

export interface SwarmTopology {
  /** Agent nodes */
  agents: AgentNode[];

  /** Communication edges */
  edges: CommunicationEdge[];

  /** Current topology type */
  type: 'mesh' | 'hierarchical' | 'ring' | 'star' | 'hybrid';
}

export interface AgentHealthMetrics {
  /** Agent responsiveness (0-1) */
  responsiveness: number;

  /** Task completion rate (0-1) */
  taskCompletionRate: number;

  /** Memory utilization (0-1) */
  memoryUtilization: number;

  /** Active connections count */
  activeConnections: number;

  /** Is this agent a bottleneck? */
  isBottleneck: boolean;

  /** Degree (number of connections) */
  degree: number;
}
```

### Section 3: Self-Model

```typescript
export class SwarmSelfModel {
  private observationHistory: SwarmHealthObservation[] = [];
  private currentModel: SwarmModel;

  /** Update model based on new observation */
  updateModel(observation: SwarmHealthObservation): SwarmModelDelta {
    this.observationHistory.push(observation);
    const delta = this.computeDelta(observation);
    this.currentModel = this.mergeWithHistory(observation);
    return delta;
  }

  /** Find bottleneck agents using min-cut analysis */
  findBottlenecks(): BottleneckAnalysis {
    const topology = this.currentModel.topology;
    const bottlenecks: BottleneckInfo[] = [];

    for (const agent of topology.agents) {
      // Check if removing this agent disconnects the graph
      const hypotheticalTopology = this.removeAgent(topology, agent.id);
      const components = this.countComponents(hypotheticalTopology);

      if (components > 1) {
        bottlenecks.push({
          agentId: agent.id,
          criticality: this.computeCriticality(agent, topology),
          affectedAgents: this.findAffectedAgents(agent, topology),
          recommendation: this.suggestMitigation(agent, topology),
        });
      }
    }

    return {
      bottlenecks,
      overallHealth: this.computeOverallHealth(bottlenecks),
      minCut: this.computeMinCut(topology),
    };
  }

  /** Predict future vulnerabilities based on trends */
  predictVulnerabilities(): PredictedVulnerability[] {
    if (this.observationHistory.length < 3) {
      return [];
    }

    const predictions: PredictedVulnerability[] = [];

    // Analyze connectivity trend
    const minCutTrend = this.analyzeTrend(
      this.observationHistory.map(o => o.connectivity.minCut)
    );

    if (minCutTrend.direction === 'decreasing' && minCutTrend.rate > 0.1) {
      predictions.push({
        type: 'connectivity_degradation',
        probability: Math.min(minCutTrend.rate * 2, 0.95),
        timeToOccurrence: this.estimateTimeToThreshold(minCutTrend, 1),
        suggestedAction: 'add_redundant_connections',
      });
    }

    // Analyze agent health trends
    for (const [agentId, healthHistory] of this.aggregateAgentHealth()) {
      const responsivenessTrend = this.analyzeTrend(
        healthHistory.map(h => h.responsiveness)
      );

      if (responsivenessTrend.direction === 'decreasing' && responsivenessTrend.rate > 0.2) {
        predictions.push({
          type: 'agent_degradation',
          agentId,
          probability: Math.min(responsivenessTrend.rate * 2.5, 0.9),
          timeToOccurrence: this.estimateTimeToThreshold(responsivenessTrend, 0.5),
          suggestedAction: 'spawn_backup_agent',
        });
      }
    }

    return predictions;
  }
}
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-031-A-001 | minCut value must be non-negative | Error |
| SPEC-031-A-002 | responsiveness must be in range [0, 1] | Error |
| SPEC-031-A-003 | observationHistory must retain at least 3 entries for prediction | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-031-B | Self-Healing Controller | Consumes observations |
| SPEC-031-C | Implementation Plan | Implementation roadmap |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-10 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-031-strange-loop-self-awareness.md)
- [ruvector-mincut examples/mincut/strange_loop](https://github.com/ruvnet/ruvector/tree/main/examples/mincut/strange_loop)
- [Hofstadter, "Godel, Escher, Bach"](https://en.wikipedia.org/wiki/Strange_loop)
