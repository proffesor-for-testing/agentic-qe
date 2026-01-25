/**
 * Agentic QE v3 - Value Network for Neural Topology Optimizer
 * ADR-034: RL-based swarm topology optimization
 *
 * Implements a neural network for estimating state values using:
 * - Xavier/He initialization for stable gradients
 * - ReLU activation for hidden layer
 * - Backpropagation with TD error
 * - Optional target network for stability
 */

import type { IValueNetwork } from './types';

// ============================================================================
// Value Network Implementation
// ============================================================================

/**
 * Neural network for estimating state values
 *
 * Architecture: Input -> Hidden (ReLU) -> Output
 *
 * Uses TD learning to update weights based on temporal difference errors.
 */
export class ValueNetwork implements IValueNetwork {
  /** Hidden layer weights [hiddenSize][inputSize] */
  private wHidden: number[][];

  /** Hidden layer biases [hiddenSize] */
  private bHidden: number[];

  /** Output layer weights [hiddenSize] */
  private wOutput: number[];

  /** Output layer bias */
  private bOutput: number;

  /** Last computed value (for debugging) */
  private lastEstimate: number = 0;

  /** Input dimension */
  private readonly inputSize: number;

  /** Hidden dimension */
  private readonly hiddenSize: number;

  /** Gradient clipping threshold */
  private readonly gradientClip: number = 1.0;

  constructor(inputSize: number, hiddenSize: number) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;

    // Xavier/He initialization for weights
    // For ReLU activation, use He initialization: sqrt(2/n_in)
    const hiddenScale = Math.sqrt(2 / inputSize);
    const outputScale = Math.sqrt(2 / hiddenSize);

    // Initialize hidden layer weights
    this.wHidden = Array(hiddenSize)
      .fill(null)
      .map(() =>
        Array(inputSize)
          .fill(null)
          .map(() => this.randn() * hiddenScale)
      );

    // Initialize hidden layer biases to small positive values (for ReLU)
    this.bHidden = Array(hiddenSize).fill(0.01);

    // Initialize output layer weights
    this.wOutput = Array(hiddenSize)
      .fill(null)
      .map(() => this.randn() * outputScale);

    // Initialize output bias to zero
    this.bOutput = 0;
  }

  /**
   * Generate random number from standard normal distribution
   * Using Box-Muller transform
   */
  private randn(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Clip value to prevent gradient explosion
   */
  private clip(value: number, threshold: number = this.gradientClip): number {
    return Math.max(-threshold, Math.min(threshold, value));
  }

  /**
   * ReLU activation function
   */
  private relu(x: number): number {
    return Math.max(0, x);
  }

  /**
   * ReLU derivative
   */
  private reluDerivative(x: number): number {
    return x > 0 ? 1 : 0;
  }

  /**
   * Forward pass to estimate value of a state
   *
   * @param state - State vector (length should match inputSize)
   * @returns Estimated value
   */
  estimate(state: number[]): number {
    // Validate input
    if (state.length !== this.inputSize) {
      // Pad or truncate to match expected size
      const paddedState = new Array(this.inputSize).fill(0);
      for (let i = 0; i < Math.min(state.length, this.inputSize); i++) {
        paddedState[i] = state[i];
      }
      state = paddedState;
    }

    // Hidden layer: h = ReLU(W_h * x + b_h)
    const hidden = new Array(this.hiddenSize);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.bHidden[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += this.wHidden[j][i] * state[i];
      }
      hidden[j] = this.relu(sum);
    }

    // Output layer: v = W_o * h + b_o
    let output = this.bOutput;
    for (let j = 0; j < this.hiddenSize; j++) {
      output += this.wOutput[j] * hidden[j];
    }

    this.lastEstimate = output;
    return output;
  }

  /**
   * Update weights using TD error via backpropagation
   *
   * Uses semi-gradient TD(0) update:
   * w <- w + alpha * tdError * gradient
   *
   * @param state - State that was evaluated
   * @param tdError - Temporal difference error (reward + gamma * V(s') - V(s))
   * @param lr - Learning rate
   */
  update(state: number[], tdError: number, lr: number): void {
    // Validate and pad state
    if (state.length !== this.inputSize) {
      const paddedState = new Array(this.inputSize).fill(0);
      for (let i = 0; i < Math.min(state.length, this.inputSize); i++) {
        paddedState[i] = state[i];
      }
      state = paddedState;
    }

    // Forward pass to compute activations (needed for backprop)
    const hiddenPre = new Array(this.hiddenSize); // Pre-activation values
    const hiddenPost = new Array(this.hiddenSize); // Post-activation values

    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.bHidden[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += this.wHidden[j][i] * state[i];
      }
      hiddenPre[j] = sum;
      hiddenPost[j] = this.relu(sum);
    }

    // Clip TD error to prevent explosion
    const clippedTdError = this.clip(tdError, 10.0);

    // Backward pass: compute gradients and update weights

    // Output layer gradient: d(loss)/d(w_o) = tdError * h
    for (let j = 0; j < this.hiddenSize; j++) {
      const gradient = clippedTdError * hiddenPost[j];
      this.wOutput[j] += lr * this.clip(gradient);
    }
    this.bOutput += lr * this.clip(clippedTdError);

    // Hidden layer gradient: d(loss)/d(w_h) = tdError * w_o * relu'(pre) * x
    for (let j = 0; j < this.hiddenSize; j++) {
      const reluGrad = this.reluDerivative(hiddenPre[j]);
      const delta = clippedTdError * this.wOutput[j] * reluGrad;

      for (let i = 0; i < this.inputSize; i++) {
        const gradient = delta * state[i];
        this.wHidden[j][i] += lr * this.clip(gradient);
      }
      this.bHidden[j] += lr * this.clip(delta);
    }
  }

  /**
   * Copy weights from another network (for target network updates)
   */
  copyFrom(other: IValueNetwork): void {
    const weights = other.export();
    this.import(weights);
  }

  /**
   * Soft update from another network (Polyak averaging)
   *
   * w <- tau * w_other + (1 - tau) * w
   */
  softUpdate(other: IValueNetwork, tau: number = 0.01): void {
    const otherWeights = other.export();

    // Update hidden weights
    for (let j = 0; j < this.hiddenSize; j++) {
      for (let i = 0; i < this.inputSize; i++) {
        this.wHidden[j][i] =
          tau * otherWeights.wHidden[j][i] + (1 - tau) * this.wHidden[j][i];
      }
      this.bHidden[j] =
        tau * otherWeights.bHidden[j] + (1 - tau) * this.bHidden[j];
    }

    // Update output weights
    for (let j = 0; j < this.hiddenSize; j++) {
      this.wOutput[j] =
        tau * otherWeights.wOutput[j] + (1 - tau) * this.wOutput[j];
    }
    this.bOutput = tau * otherWeights.bOutput + (1 - tau) * this.bOutput;
  }

  /**
   * Export weights for serialization
   */
  export(): {
    wHidden: number[][];
    bHidden: number[];
    wOutput: number[];
    bOutput: number;
  } {
    return {
      wHidden: this.wHidden.map((row) => [...row]),
      bHidden: [...this.bHidden],
      wOutput: [...this.wOutput],
      bOutput: this.bOutput,
    };
  }

  /**
   * Import weights from serialized data
   */
  import(weights: {
    wHidden: number[][];
    bHidden: number[];
    wOutput: number[];
    bOutput: number;
  }): void {
    // Validate dimensions
    if (
      weights.wHidden.length !== this.hiddenSize ||
      weights.wHidden[0].length !== this.inputSize
    ) {
      throw new Error(
        `Weight dimension mismatch: expected [${this.hiddenSize}][${this.inputSize}], ` +
          `got [${weights.wHidden.length}][${weights.wHidden[0]?.length}]`
      );
    }

    this.wHidden = weights.wHidden.map((row) => [...row]);
    this.bHidden = [...weights.bHidden];
    this.wOutput = [...weights.wOutput];
    this.bOutput = weights.bOutput;
  }

  /**
   * Get last computed estimate (for debugging)
   */
  getLastEstimate(): number {
    return this.lastEstimate;
  }

  /**
   * Get network dimensions
   */
  getDimensions(): { inputSize: number; hiddenSize: number } {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
    };
  }

  /**
   * Calculate L2 norm of all weights (for regularization/monitoring)
   */
  getWeightNorm(): number {
    let sum = 0;

    for (let j = 0; j < this.hiddenSize; j++) {
      for (let i = 0; i < this.inputSize; i++) {
        sum += this.wHidden[j][i] ** 2;
      }
      sum += this.bHidden[j] ** 2;
    }

    for (let j = 0; j < this.hiddenSize; j++) {
      sum += this.wOutput[j] ** 2;
    }
    sum += this.bOutput ** 2;

    return Math.sqrt(sum);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new value network
 */
export function createValueNetwork(
  inputSize: number,
  hiddenSize: number
): ValueNetwork {
  return new ValueNetwork(inputSize, hiddenSize);
}

/**
 * Create a value network from exported weights
 */
export function createValueNetworkFromWeights(weights: {
  wHidden: number[][];
  bHidden: number[];
  wOutput: number[];
  bOutput: number;
}): ValueNetwork {
  const inputSize = weights.wHidden[0]?.length || 0;
  const hiddenSize = weights.wHidden.length;

  const network = new ValueNetwork(inputSize, hiddenSize);
  network.import(weights);
  return network;
}
