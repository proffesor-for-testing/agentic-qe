# ADR-031: Strange Loop Self-Awareness

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** RuVector MinCut Analysis (examples/mincut/strange_loop)

---

## Context

Current v3 AQE agents operate without self-awareness:
- Agents don't observe their own swarm connectivity
- No detection of single points of failure (bottlenecks)
- No self-healing when agents become isolated
- External monitoring required for swarm health

RuVector's Strange Loop example demonstrates a powerful pattern:
> "You look in a mirror. You see yourself looking. You adjust your hair *because* you saw it was messy. The act of observing changed what you observed."

This creates **genuine autonomy** - the system doesn't need external monitoring because it *is* its own monitor.

### The Strange Loop Pattern

```
┌──────────────────────────────────────────┐
│              STRANGE LOOP                │
│                                          │
│   Observe ──► Model ──► Decide ──► Act   │
│      ▲                              │    │
│      └──────────────────────────────┘    │
│                                          │
│   "I see I'm weak here, so I strengthen" │
└──────────────────────────────────────────┘
```

---

## Decision

**Implement strange loop self-awareness enabling agents to observe, model, and heal their own swarm connectivity.**

### Core Components

#### 1. Self-Observation Protocol

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
    /** Minimum cut value (λ) */
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

#### 2. Self-Modeling

```typescript
export class SwarmSelfModel {
  private observationHistory: SwarmHealthObservation[] = [];
  private currentModel: SwarmModel;

  /** Update model based on new observation */
  updateModel(observation: SwarmHealthObservation): SwarmModelDelta {
    this.observationHistory.push(observation);

    // Detect changes from previous state
    const delta = this.computeDelta(observation);

    // Update internal model
    this.currentModel = this.mergeWithHistory(observation);

    return delta;
  }

  /** Find bottleneck agents using min-cut analysis */
  findBottlenecks(): BottleneckAnalysis {
    const topology = this.currentModel.topology;

    // Compute vertex connectivity
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

#### 3. Self-Healing Actions

```typescript
export interface SelfHealingAction {
  type: SelfHealingActionType;
  targetAgentId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedImpact: number;
  reversible: boolean;
}

export type SelfHealingActionType =
  | 'spawn_redundant_agent'
  | 'add_connection'
  | 'redistribute_load'
  | 'restart_agent'
  | 'isolate_agent'
  | 'promote_to_coordinator'
  | 'demote_coordinator'
  | 'trigger_failover';

export class SelfHealingController {
  private model: SwarmSelfModel;
  private actionHistory: ExecutedAction[] = [];

  /** Decide what healing action to take */
  async decide(observation: SwarmHealthObservation): Promise<SelfHealingAction[]> {
    const delta = this.model.updateModel(observation);
    const actions: SelfHealingAction[] = [];

    // Check for bottlenecks
    const bottleneckAnalysis = this.model.findBottlenecks();

    for (const bottleneck of bottleneckAnalysis.bottlenecks) {
      if (bottleneck.criticality > 0.8) {
        actions.push({
          type: 'spawn_redundant_agent',
          targetAgentId: bottleneck.agentId,
          priority: 'critical',
          estimatedImpact: 0.9,
          reversible: true,
        });
      } else if (bottleneck.criticality > 0.5) {
        actions.push({
          type: 'add_connection',
          targetAgentId: bottleneck.agentId,
          priority: 'high',
          estimatedImpact: 0.6,
          reversible: true,
        });
      }
    }

    // Check for predicted vulnerabilities
    const predictions = this.model.predictVulnerabilities();

    for (const prediction of predictions) {
      if (prediction.probability > 0.7) {
        actions.push(this.mapPredictionToAction(prediction));
      }
    }

    // Check for overloaded agents
    for (const [agentId, health] of observation.agentHealth) {
      if (health.memoryUtilization > 0.9) {
        actions.push({
          type: 'redistribute_load',
          targetAgentId: agentId,
          priority: 'high',
          estimatedImpact: 0.5,
          reversible: true,
        });
      }
    }

    return this.prioritizeActions(actions);
  }

  /** Execute healing action */
  async act(action: SelfHealingAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      switch (action.type) {
        case 'spawn_redundant_agent':
          return await this.spawnRedundantAgent(action.targetAgentId!);

        case 'add_connection':
          return await this.addConnection(action.targetAgentId!);

        case 'redistribute_load':
          return await this.redistributeLoad(action.targetAgentId!);

        case 'restart_agent':
          return await this.restartAgent(action.targetAgentId!);

        case 'isolate_agent':
          return await this.isolateAgent(action.targetAgentId!);

        case 'trigger_failover':
          return await this.triggerFailover(action.targetAgentId!);

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } finally {
      this.actionHistory.push({
        action,
        timestamp: startTime,
        duration: Date.now() - startTime,
      });
    }
  }

  private async spawnRedundantAgent(targetAgentId: string): Promise<ActionResult> {
    const targetAgent = await this.getAgentInfo(targetAgentId);

    // Clone the agent's configuration
    const newAgentId = `${targetAgentId}-redundant-${Date.now()}`;

    await this.agentSpawner.spawn({
      id: newAgentId,
      type: targetAgent.type,
      config: targetAgent.config,
      connections: [targetAgentId, ...targetAgent.connections],
    });

    return {
      success: true,
      message: `Spawned redundant agent ${newAgentId} to reduce bottleneck at ${targetAgentId}`,
      newState: await this.observe(),
    };
  }
}
```

#### 4. Strange Loop Orchestrator

```typescript
export class StrangeLoopOrchestrator {
  private observer: SwarmObserver;
  private model: SwarmSelfModel;
  private healer: SelfHealingController;
  private loopInterval: number = 5000; // 5 seconds

  /** Start the strange loop */
  async start(): Promise<void> {
    console.log('[StrangeLoop] Starting self-observation cycle');

    while (this.running) {
      try {
        // OBSERVE: Gather swarm state
        const observation = await this.observer.observe();

        // MODEL: Update internal representation
        const delta = this.model.updateModel(observation);

        // DECIDE: Determine if healing is needed
        const actions = await this.healer.decide(observation);

        if (actions.length > 0) {
          console.log(`[StrangeLoop] Detected ${actions.length} healing opportunities`);

          // ACT: Execute healing actions
          for (const action of actions) {
            if (action.priority === 'critical' || action.priority === 'high') {
              const result = await this.healer.act(action);
              console.log(`[StrangeLoop] Executed ${action.type}: ${result.message}`);
            }
          }
        }

        // Store observation for learning
        await this.storeObservation(observation, delta, actions);

      } catch (error) {
        console.error('[StrangeLoop] Error in self-observation cycle:', error);
      }

      await this.sleep(this.loopInterval);
    }
  }

  /** The agent observes itself being the bottleneck */
  async selfDiagnose(): Promise<SelfDiagnosis> {
    const observation = await this.observer.observe();
    const myId = this.getMyAgentId();

    const myHealth = observation.agentHealth.get(myId);
    const amIBottleneck = observation.connectivity.bottlenecks.includes(myId);

    return {
      agentId: myId,
      isHealthy: myHealth ? myHealth.responsiveness > 0.8 : false,
      isBottleneck: amIBottleneck,
      recommendations: amIBottleneck
        ? ['Request backup agent', 'Reduce task queue', 'Offload connections']
        : [],
      overallSwarmHealth: observation.connectivity.minCut / 10, // Normalize to 0-1
    };
  }
}
```

---

## Implementation Plan

### Phase 1: Observer Module (Days 1-2)
```
v3/src/strange-loop/
├── index.ts
├── types.ts
├── swarm-observer.ts        # Collect swarm state
├── topology-analyzer.ts     # Analyze graph structure
└── min-cut-calculator.ts    # Find bottlenecks
```

### Phase 2: Self-Model (Day 3)
```
├── self-model.ts           # SwarmSelfModel
├── trend-analyzer.ts       # Predict vulnerabilities
└── history-store.ts        # Observation persistence
```

### Phase 3: Self-Healing (Days 4-5)
```
├── healing-controller.ts   # SelfHealingController
├── action-executor.ts      # Execute healing actions
└── strange-loop.ts         # StrangeLoopOrchestrator
```

---

## Integration with Swarm Coordinators

```typescript
// In queen-coordinator.ts
import { StrangeLoopOrchestrator } from '../strange-loop';

export class QueenCoordinator {
  private strangeLoop: StrangeLoopOrchestrator;

  async initialize(): Promise<void> {
    // Start self-observation
    this.strangeLoop = new StrangeLoopOrchestrator(this.swarm);
    await this.strangeLoop.start();
  }

  /** Called when strange loop detects bottleneck at this coordinator */
  async onSelfBottleneckDetected(): Promise<void> {
    // The coordinator can observe that IT is the bottleneck
    // and take action to delegate more authority
    console.log('[Queen] I am a bottleneck. Promoting workers to sub-coordinators.');
    await this.promoteWorkersToCoordinators();
  }
}
```

---

## Success Metrics

- [ ] Swarm observation every 5 seconds
- [ ] Bottleneck detection <100ms
- [ ] Self-healing action execution <1s
- [ ] Trend prediction accuracy >70%
- [ ] 0 human intervention for common issues
- [ ] 60+ unit tests

---

## References

- [ruvector-mincut examples/mincut/strange_loop](https://github.com/ruvnet/ruvector/tree/main/examples/mincut/strange_loop)
- [Hofstadter, "Godel, Escher, Bach"](https://en.wikipedia.org/wiki/Strange_loop)
- Self-organizing systems theory
