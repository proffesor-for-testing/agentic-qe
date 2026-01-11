# ADR-034: Neural Topology Optimizer

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** RuVector MinCut Analysis (optimizer.rs)

---

## Context

Current v3 AQE swarm topologies are statically configured:
- Fixed mesh, hierarchical, or ring topologies
- No adaptation to workload patterns
- No learning from past executions
- Manual tuning required for optimization

This approach has limitations:
1. **Static configuration**: Topology doesn't adapt to changing requirements
2. **No optimization feedback**: No learning from successful executions
3. **Suboptimal routing**: Agent-to-agent paths not optimized for latency
4. **Manual tuning burden**: Requires human intervention for optimization

RuVector's Neural Graph Optimizer demonstrates a powerful pattern:
> Policy SNN outputs graph modification actions via spike rates. Value Network estimates mincut improvement. Experience replay for stable learning.

This creates **self-optimizing topology** - the swarm learns the optimal communication structure.

### The Neural Optimizer Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    NEURAL TOPOLOGY OPTIMIZER                 │
│                                                              │
│   State Features ──► Policy SNN ──► Actions ──► Graph Mods  │
│        │                                              │      │
│        │               ▲                              │      │
│        ▼               │                              ▼      │
│   Value Network ◄──── Reward (mincut improvement) ◄──┘      │
│                                                              │
│   "The swarm learns which connections maximize quality"     │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision

**Implement neural topology optimization using reinforcement learning to dynamically optimize swarm communication structure.**

### Core Components

#### 1. Optimizer Configuration

```typescript
export interface TopologyOptimizerConfig {
  /** Number of input features for state representation */
  inputSize: number;

  /** Hidden layer size for value network */
  hiddenSize: number;

  /** Number of possible topology actions */
  numActions: number;

  /** Learning rate for value updates */
  learningRate: number;

  /** Discount factor (gamma) for future rewards */
  gamma: number;

  /** Weight for communication efficiency in reward */
  efficiencyWeight: number;

  /** Experience replay buffer size */
  replayBufferSize: number;

  /** Batch size for training */
  batchSize: number;

  /** Time step for simulation */
  dt: number;
}

export const DEFAULT_OPTIMIZER_CONFIG: TopologyOptimizerConfig = {
  inputSize: 10,
  hiddenSize: 32,
  numActions: 5,
  learningRate: 0.01,
  gamma: 0.99,
  efficiencyWeight: 0.1,
  replayBufferSize: 10000,
  batchSize: 32,
  dt: 1.0,
};
```

#### 2. Topology Actions

```typescript
export type TopologyAction =
  | { type: 'add_connection'; from: string; to: string; weight?: number }
  | { type: 'remove_connection'; from: string; to: string }
  | { type: 'strengthen_connection'; from: string; to: string; delta: number }
  | { type: 'weaken_connection'; from: string; to: string; delta: number }
  | { type: 'no_op' };

export function actionToIndex(action: TopologyAction): number {
  switch (action.type) {
    case 'add_connection': return 0;
    case 'remove_connection': return 1;
    case 'strengthen_connection': return 2;
    case 'weaken_connection': return 3;
    case 'no_op': return 4;
  }
}
```

#### 3. Value Network

```typescript
export class ValueNetwork {
  private wHidden: number[][];
  private bHidden: number[];
  private wOutput: number[];
  private bOutput: number;
  private lastEstimate: number = 0;

  constructor(inputSize: number, hiddenSize: number) {
    // Xavier initialization
    const scale = Math.sqrt(2 / (inputSize + hiddenSize));

    this.wHidden = Array(hiddenSize).fill(null).map(() =>
      Array(inputSize).fill(null).map(() => (Math.random() - 0.5) * scale)
    );
    this.bHidden = Array(hiddenSize).fill(0);

    const outputScale = Math.sqrt(1 / hiddenSize);
    this.wOutput = Array(hiddenSize).fill(null).map(() => (Math.random() - 0.5) * outputScale);
    this.bOutput = 0;
  }

  /** Estimate value of a topology state */
  estimate(state: number[]): number {
    // Hidden layer with ReLU activation
    const hidden = this.wHidden.map((weights, j) => {
      let sum = this.bHidden[j];
      for (let i = 0; i < weights.length && i < state.length; i++) {
        sum += weights[i] * state[i];
      }
      return Math.max(0, sum); // ReLU
    });

    // Output layer
    let output = this.bOutput;
    for (let j = 0; j < this.wOutput.length; j++) {
      output += this.wOutput[j] * hidden[j];
    }

    this.lastEstimate = output;
    return output;
  }

  /** Update weights using TD error via backpropagation */
  update(state: number[], tdError: number, lr: number): void {
    // Forward pass to compute activations
    const hiddenPre = this.wHidden.map((weights, j) => {
      let sum = this.bHidden[j];
      for (let i = 0; i < weights.length && i < state.length; i++) {
        sum += weights[i] * state[i];
      }
      return sum;
    });

    const hiddenPost = hiddenPre.map(x => Math.max(0, x));

    // Backward pass: update output weights
    for (let j = 0; j < this.wOutput.length; j++) {
      this.wOutput[j] += lr * tdError * hiddenPost[j];
    }
    this.bOutput += lr * tdError;

    // Backward pass: update hidden weights
    for (let j = 0; j < this.wHidden.length; j++) {
      const reluGrad = hiddenPre[j] > 0 ? 1 : 0;
      const delta = tdError * this.wOutput[j] * reluGrad;

      for (let i = 0; i < this.wHidden[j].length && i < state.length; i++) {
        this.wHidden[j][i] += lr * delta * state[i];
      }
      this.bHidden[j] += lr * delta;
    }
  }
}
```

#### 4. Experience Replay Buffer

```typescript
export interface Experience {
  state: number[];
  actionIdx: number;
  reward: number;
  nextState: number[];
  done: boolean;
  tdError: number;
}

export class PrioritizedReplayBuffer {
  private buffer: Experience[] = [];
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(exp: Experience): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(exp);
  }

  /** Sample prioritized by TD error */
  sample(batchSize: number): Experience[] {
    // Sort by absolute TD error (higher error = more learning potential)
    const sorted = [...this.buffer].sort((a, b) =>
      Math.abs(b.tdError) - Math.abs(a.tdError)
    );
    return sorted.slice(0, batchSize);
  }

  get length(): number {
    return this.buffer.length;
  }
}
```

#### 5. Neural Topology Optimizer

```typescript
export interface OptimizationResult {
  action: TopologyAction;
  reward: number;
  newMinCut: number;
  communicationLatency: number;
}

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
      // Random action
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

    // Approximate: minimum degree
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

    // Higher connectivity = better efficiency
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
    // Simple simulation: modify density feature based on action
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
    // Return agents with low connectivity
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

## Integration with Swarm Coordination

```typescript
// In hierarchical-coordinator.ts
import { NeuralTopologyOptimizer } from '../neural-optimizer';

export class HierarchicalCoordinator {
  private topologyOptimizer: NeuralTopologyOptimizer;
  private optimizationInterval: number = 10000; // 10 seconds

  async initialize(): Promise<void> {
    this.topologyOptimizer = new NeuralTopologyOptimizer(this.topology);

    // Run optimization in background
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

  /** Called when task completes - provide reward signal */
  onTaskComplete(taskId: string, success: boolean, latency: number): void {
    // Use task outcome as reward signal for topology optimization
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

## Success Metrics

- [ ] Topology adaptation to workload patterns
- [ ] Measurable improvement in communication efficiency
- [ ] TD error convergence over training
- [ ] Experience replay operational
- [ ] Integration with hierarchical-coordinator
- [ ] 50+ unit tests

---

## References

- [ruvector-mincut/src/snn/optimizer.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut/src/snn/optimizer.rs)
- [Proximal Policy Optimization (PPO)](https://arxiv.org/abs/1707.06347)
- [Deep Q-Networks (DQN)](https://arxiv.org/abs/1312.5602)
- [Graph Neural Networks for Topology Optimization](https://arxiv.org/abs/2006.12861)
