# SPEC-031-B: Self-Healing Controller

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-031-B |
| **Parent ADR** | [ADR-031](../adrs/ADR-031-strange-loop-self-awareness.md) |
| **Version** | 1.0 |
| **Status** | Accepted |
| **Last Updated** | 2026-01-10 |
| **Author** | Architecture Team |

---

## Overview

Defines the self-healing controller that makes decisions and executes actions based on swarm observations, including healing action types, decision logic, and the Strange Loop orchestrator.

---

## Specification Details

### Section 1: Healing Action Types

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
```

### Section 2: Self-Healing Controller

```typescript
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

### Section 3: Strange Loop Orchestrator

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
      overallSwarmHealth: observation.connectivity.minCut / 10,
    };
  }
}
```

### Section 4: Queen Coordinator Integration

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

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-031-B-001 | Critical actions must be reversible | Error |
| SPEC-031-B-002 | Loop interval must be >= 1000ms | Warning |
| SPEC-031-B-003 | Action history must be retained for audit | Info |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-031-A | Self-Observation Protocol | Provides observation data |
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
