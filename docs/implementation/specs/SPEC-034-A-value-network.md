# SPEC-034-A: Value Network

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-034-A |
| **Parent ADR** | [ADR-034](../adrs/ADR-034-neural-topology-optimizer.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Value Network component that estimates the value of topology states for reinforcement learning-based optimization. It uses a simple neural network with ReLU activations and TD-learning updates.

---

## Configuration

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

---

## Value Network Implementation

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

---

## Topology Actions

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

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-034-A-001 | inputSize must be > 0 | Error |
| SPEC-034-A-002 | hiddenSize must be > 0 | Error |
| SPEC-034-A-003 | learningRate must be 0-1 | Warning |
| SPEC-034-A-004 | State array length must match inputSize | Error |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-034-B | Experience Replay | Stores training data |
| SPEC-034-C | Neural Optimizer | Uses value network |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-034-neural-topology-optimizer.md)
- [Deep Q-Networks (DQN)](https://arxiv.org/abs/1312.5602)
