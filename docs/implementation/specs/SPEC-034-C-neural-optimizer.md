# SPEC-034-C: Neural Topology Optimizer

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-034-C |
| **Parent ADR** | [ADR-034](../adrs/ADR-034-neural-topology-optimizer.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the NeuralTopologyOptimizer class that orchestrates reinforcement learning-based topology optimization. It combines the value network, experience replay, and action execution to continuously improve swarm communication structure.

---

## Optimization Result Types

```typescript
export interface OptimizationResult {
  action: TopologyAction;
  reward: number;
  newMinCut: number;
  communicationLatency: number;
}
```

---

## NeuralTopologyOptimizer Implementation

```typescript
export class NeuralTopologyOptimizer {
  private valueNetwork: ValueNetwork;
  private replayBuffer: PrioritizedReplayBuffer;
  private config: TopologyOptimizerConfig;
  private prevState: number[];
  private prevMinCut: number;
  private time: number = 0;

  constructor(
    private topology: SwarmTopology,
    config: TopologyOptimizerConfig = DEFAULT_OPTIMIZER_CONFIG
  ) {
    this.config = config;
    this.valueNetwork = new ValueNetwork(config.inputSize, config.hiddenSize);
    this.replayBuffer = new PrioritizedReplayBuffer(config.replayBufferSize);
    this.prevState = this.extractFeatures();
    this.prevMinCut = this.estimateMinCut();
  }

  /** Run one optimization step */
  optimizeStep(): OptimizationResult {
    // 1. Encode current state
    const state = this.extractFeatures();

    // 2. Select action using epsilon-greedy policy
    const action = this.selectAction(state);

    // 3. Execute action on topology
    const oldMinCut = this.estimateMinCut();
    this.applyAction(action);
    const newMinCut = this.estimateMinCut();

    // 4. Compute reward: mincut improvement + efficiency
    const minCutReward = oldMinCut > 0
      ? (newMinCut - oldMinCut) / oldMinCut
      : 0;
    const efficiencyReward = this.measureCommunicationEfficiency();
    const reward = minCutReward + this.config.efficiencyWeight * efficiencyReward;

    // 5. TD learning update
    const newState = this.extractFeatures();
    const currentValue = this.valueNetwork.estimate(state);
    const nextValue = this.valueNetwork.estimate(newState);
    const tdError = reward + this.config.gamma * nextValue - currentValue;

    // 6. Update value network
    this.valueNetwork.update(state, tdError, this.config.learningRate);

    // 7. Store experience
    this.replayBuffer.push({
      state: this.prevState,
      actionIdx: actionToIndex(action),
      reward,
      nextState: newState,
      done: false,
      tdError,
    });

    // Update state
    this.prevState = newState;
    this.prevMinCut = newMinCut;
    this.time += this.config.dt;

    return {
      action,
      reward,
      newMinCut,
      communicationLatency: efficiencyReward,
    };
  }

  /** Extract features from topology for state representation */
  private extractFeatures(): number[] {
    const n = this.topology.agents.length;
    const m = this.topology.connections.length;

    const features: number[] = new Array(this.config.inputSize).fill(0);

    if (this.config.inputSize > 0) features[0] = n / 100;          // Normalized agent count
    if (this.config.inputSize > 1) features[1] = m / 500;          // Normalized connection count
    if (this.config.inputSize > 2) features[2] = n > 1 ? m / (n * (n - 1) / 2) : 0; // Density
    if (this.config.inputSize > 3) features[3] = this.averageDegree() / 10;
    if (this.config.inputSize > 4) features[4] = this.estimateMinCut() / m || 0;

    return features;
  }

  /** Select action using epsilon-greedy policy */
  private selectAction(state: number[]): TopologyAction {
    const epsilon = 0.1; // Exploration rate

    if (Math.random() < epsilon) {
      return this.randomAction();
    }

    // Greedy: estimate value for each action and pick best
    let bestAction: TopologyAction = { type: 'no_op' };
    let bestValue = -Infinity;

    for (let i = 0; i < this.config.numActions; i++) {
      const action = this.indexToAction(i);
      const hypotheticalState = this.simulateAction(state, action);
      const value = this.valueNetwork.estimate(hypotheticalState);

      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /** Convert index to action */
  private indexToAction(idx: number): TopologyAction {
    const agents = this.topology.agents;
    if (agents.length < 2) return { type: 'no_op' };

    const from = agents[idx % agents.length].id;
    const to = agents[(idx + 1) % agents.length].id;

    switch (idx % 5) {
      case 0:
        if (!this.hasConnection(from, to)) {
          return { type: 'add_connection', from, to, weight: 1.0 };
        }
        return { type: 'no_op' };
      case 1:
        if (this.hasConnection(from, to)) {
          return { type: 'remove_connection', from, to };
        }
        return { type: 'no_op' };
      case 2:
        return { type: 'strengthen_connection', from, to, delta: 0.1 };
      case 3:
        return { type: 'weaken_connection', from, to, delta: 0.1 };
      default:
        return { type: 'no_op' };
    }
  }

  /** Apply action to topology */
  private applyAction(action: TopologyAction): void {
    switch (action.type) {
      case 'add_connection':
        this.topology.addConnection(action.from, action.to, action.weight || 1.0);
        break;
      case 'remove_connection':
        this.topology.removeConnection(action.from, action.to);
        break;
      case 'strengthen_connection':
        this.topology.updateConnectionWeight(action.from, action.to, action.delta);
        break;
      case 'weaken_connection':
        this.topology.updateConnectionWeight(action.from, action.to, -action.delta);
        break;
      case 'no_op':
        break;
    }
  }

  /** Estimate minimum cut (connectivity measure) */
  private estimateMinCut(): number {
    if (this.topology.agents.length === 0) return 0;

    let minDegree = Infinity;
    for (const agent of this.topology.agents) {
      const degree = this.topology.connections.filter(
        c => c.from === agent.id || c.to === agent.id
      ).length;
      minDegree = Math.min(minDegree, degree);
    }

    return minDegree === Infinity ? 0 : minDegree;
  }

  /** Measure communication efficiency */
  private measureCommunicationEfficiency(): number {
    const n = this.topology.agents.length;
    const m = this.topology.connections.length;

    if (n < 2) return 0;

    const maxConnections = n * (n - 1) / 2;
    return m / maxConnections;
  }

  private averageDegree(): number {
    const n = this.topology.agents.length;
    if (n === 0) return 0;

    const totalDegree = this.topology.agents.reduce((sum, agent) => {
      return sum + this.topology.connections.filter(
        c => c.from === agent.id || c.to === agent.id
      ).length;
    }, 0);

    return totalDegree / n;
  }

  private hasConnection(from: string, to: string): boolean {
    return this.topology.connections.some(
      c => (c.from === from && c.to === to) || (c.from === to && c.to === from)
    );
  }

  private randomAction(): TopologyAction {
    return this.indexToAction(Math.floor(Math.random() * this.config.numActions));
  }

  private simulateAction(state: number[], action: TopologyAction): number[] {
    const newState = [...state];

    switch (action.type) {
      case 'add_connection':
        if (this.config.inputSize > 2) newState[2] += 0.01;
        break;
      case 'remove_connection':
        if (this.config.inputSize > 2) newState[2] -= 0.01;
        break;
    }

    return newState;
  }

  /** Run multiple optimization steps */
  optimize(steps: number): OptimizationResult[] {
    return Array(steps).fill(null).map(() => this.optimizeStep());
  }

  /** Get skip regions (low activity areas to avoid searching) */
  getSkipRegions(): string[] {
    return this.topology.agents
      .filter(agent => {
        const degree = this.topology.connections.filter(
          c => c.from === agent.id || c.to === agent.id
        ).length;
        return degree < 2;
      })
      .map(agent => agent.id);
  }

  /** Reset optimizer state */
  reset(): void {
    this.prevMinCut = this.estimateMinCut();
    this.prevState = this.extractFeatures();
    this.time = 0;
  }
}
```

---

## Swarm Integration

```typescript
// In hierarchical-coordinator.ts
import { NeuralTopologyOptimizer } from '../neural-optimizer';

export class HierarchicalCoordinator {
  private topologyOptimizer: NeuralTopologyOptimizer;
  private optimizationInterval: number = 10000; // 10 seconds

  async initialize(): Promise<void> {
    this.topologyOptimizer = new NeuralTopologyOptimizer(this.topology);
    this.startOptimizationLoop();
  }

  private async startOptimizationLoop(): Promise<void> {
    while (this.running) {
      const result = this.topologyOptimizer.optimizeStep();

      if (result.action.type !== 'no_op') {
        console.log(`[Optimizer] Applied ${result.action.type}: reward=${result.reward.toFixed(3)}`);
      }

      await this.sleep(this.optimizationInterval);
    }
  }

  onTaskComplete(taskId: string, success: boolean, latency: number): void {
    const reward = success ? 1.0 : -1.0;
    // Store for next optimization step
  }
}
```

---

## Implementation Plan

### Phase 1: Core Optimizer (Days 1-2)
```
v3/src/neural-optimizer/
├── index.ts
├── types.ts
├── value-network.ts         # ValueNetwork
├── replay-buffer.ts         # PrioritizedReplayBuffer
└── topology-optimizer.ts    # NeuralTopologyOptimizer
```

### Phase 2: Action Execution (Days 3-4)
```
├── action-executor.ts       # Execute topology modifications
├── feature-extractor.ts     # Extract state features
└── reward-calculator.ts     # Compute optimization rewards
```

### Phase 3: Integration (Day 5)
- Integrate with swarm coordinators
- Add MCP tool for optimization status
- Create metrics dashboard

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-034-C-001 | topology must have agents | Error |
| SPEC-034-C-002 | epsilon must be 0-1 | Warning |
| SPEC-034-C-003 | gamma must be 0-1 | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-034-A | Value Network | Core learning component |
| SPEC-034-B | Experience Replay | Training data storage |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-034-neural-topology-optimizer.md)
- [Proximal Policy Optimization (PPO)](https://arxiv.org/abs/1707.06347)
- [Graph Neural Networks for Topology Optimization](https://arxiv.org/abs/2006.12861)
