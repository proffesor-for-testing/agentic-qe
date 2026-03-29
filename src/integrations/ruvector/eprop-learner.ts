/**
 * Agentic QE v3 - E-prop Online Learning (ADR-087 Milestone 4, R11)
 *
 * Eligibility propagation for online learning with 12 bytes/synapse,
 * no backprop required. Uses eligibility traces and feedback alignment
 * (Lillicrap et al. 2016) to avoid the weight transport problem.
 *
 * Algorithm: dw = eta * eligibility * reward
 * Memory budget: 4B weight + 4B trace + 4B feedback = 12 bytes/synapse
 */

import { secureRandom } from '../../shared/utils/crypto-random.js';

// ============================================================================
// Configuration
// ============================================================================

export interface EpropConfig {
  /** Number of input neurons */
  inputSize: number;
  /** Number of hidden neurons */
  hiddenSize: number;
  /** Number of output neurons */
  outputSize: number;
  /** Learning rate (eta) */
  learningRate: number;
  /** Eligibility trace decay factor (tau_e) */
  eligibilityDecay: number;
  /** Use random feedback weights instead of weight transport */
  feedbackAlignment: boolean;
}

const DEFAULT_EPROP_CONFIG: EpropConfig = {
  inputSize: 2,
  hiddenSize: 16,
  outputSize: 1,
  learningRate: 0.01,
  eligibilityDecay: 0.95,
  feedbackAlignment: true,
};

// ============================================================================
// Statistics
// ============================================================================

export interface EpropStats {
  totalSteps: number;
  totalReward: number;
  avgReward: number;
  synapsCount: number;
  memoryBytes: number;
}

// ============================================================================
// E-prop Network
// ============================================================================

/**
 * E-prop neural network with online eligibility-trace learning.
 *
 * Architecture: input -> hidden (tanh) -> output (softmax or linear)
 *
 * Each synapse stores exactly 12 bytes:
 *   - weight:    Float32 (4 bytes)
 *   - trace:     Float32 (4 bytes)  — eligibility trace
 *   - feedback:  Float32 (4 bytes)  — random feedback weight (fixed)
 */
export class EpropNetwork {
  private readonly config: EpropConfig;

  // Weights (Float32 = 4 bytes each)
  private inputHiddenWeights: Float32Array;   // inputSize * hiddenSize
  private hiddenOutputWeights: Float32Array;   // hiddenSize * outputSize

  // Eligibility traces (Float32 = 4 bytes each)
  private inputHiddenTraces: Float32Array;
  private hiddenOutputTraces: Float32Array;

  // Feedback alignment weights — fixed random, never updated (Float32 = 4 bytes each)
  private feedbackWeights: Float32Array;       // outputSize * hiddenSize

  // Activations (transient, not counted in memory budget)
  private lastInput: Float32Array;
  private lastHidden: Float32Array;
  private lastHiddenRaw: Float32Array;         // pre-activation for derivative
  private lastOutput: Float32Array;

  // Stats
  private totalSteps = 0;
  private totalReward = 0;
  private rewardHistory: number[] = [];

  constructor(config?: Partial<EpropConfig>) {
    this.config = { ...DEFAULT_EPROP_CONFIG, ...config };
    this.validateConfig(this.config);

    const { inputSize, hiddenSize, outputSize } = this.config;

    // Allocate weights with Xavier/Glorot initialization
    this.inputHiddenWeights = this.xavierInit(inputSize, hiddenSize);
    this.hiddenOutputWeights = this.xavierInit(hiddenSize, outputSize);

    // Allocate traces (start at zero)
    this.inputHiddenTraces = new Float32Array(inputSize * hiddenSize);
    this.hiddenOutputTraces = new Float32Array(hiddenSize * outputSize);

    // Allocate fixed random feedback weights
    this.feedbackWeights = this.randomInit(outputSize, hiddenSize);

    // Transient activations
    this.lastInput = new Float32Array(inputSize);
    this.lastHidden = new Float32Array(hiddenSize);
    this.lastHiddenRaw = new Float32Array(hiddenSize);
    this.lastOutput = new Float32Array(outputSize);
  }

  // ==========================================================================
  // Forward Pass
  // ==========================================================================

  /**
   * Compute output from input. Stores activations for eligibility updates.
   *
   * input -> (inputHidden weights) -> tanh -> (hiddenOutput weights) -> output
   *
   * Output activation depends on outputSize:
   *   - outputSize === 1: sigmoid (for binary tasks)
   *   - outputSize > 1:  softmax (for classification)
   */
  forward(input: Float32Array): Float32Array {
    const { inputSize, hiddenSize, outputSize } = this.config;

    if (input.length !== inputSize) {
      throw new Error(
        `Input size mismatch: expected ${inputSize}, got ${input.length}`
      );
    }

    // Store input for trace update
    this.lastInput.set(input);

    // Hidden layer: h = tanh(W_ih^T * x)
    for (let j = 0; j < hiddenSize; j++) {
      let sum = 0;
      for (let i = 0; i < inputSize; i++) {
        sum += input[i] * this.inputHiddenWeights[i * hiddenSize + j];
      }
      this.lastHiddenRaw[j] = sum;
      this.lastHidden[j] = Math.tanh(sum);
    }

    // Output layer: o = W_ho^T * h (raw logits)
    const rawOutput = new Float32Array(outputSize);
    for (let k = 0; k < outputSize; k++) {
      let sum = 0;
      for (let j = 0; j < hiddenSize; j++) {
        sum += this.lastHidden[j] * this.hiddenOutputWeights[j * outputSize + k];
      }
      rawOutput[k] = sum;
    }

    // Apply output activation
    if (outputSize === 1) {
      this.lastOutput[0] = this.sigmoid(rawOutput[0]);
    } else {
      const softmaxResult = this.softmax(rawOutput);
      this.lastOutput.set(softmaxResult);
    }

    // Update eligibility traces after forward pass
    this.updateTraces();

    this.totalSteps++;

    return new Float32Array(this.lastOutput);
  }

  // ==========================================================================
  // Online Learning
  // ==========================================================================

  /**
   * Update weights using eligibility traces and reward/error signal.
   *
   * Hidden->output layer:
   *   dw[j][k] = learningRate * e_ho[j][k] * reward
   *
   * Input->hidden layer (feedback alignment):
   *   The learning signal for hidden neuron j is computed by projecting
   *   the scalar reward through feedback weights (or transposed output
   *   weights if feedbackAlignment is false).
   *   dw[i][j] = learningRate * e_ih[i][j] * L[j]
   *   where L[j] = sum_k(B[k][j] * reward)  [feedback alignment]
   *         L[j] = sum_k(W_ho[j][k] * reward) [weight transport]
   */
  updateOnline(reward: number): void {
    const { inputSize, hiddenSize, outputSize, learningRate, feedbackAlignment } = this.config;

    // Update hidden->output weights: dw = eta * trace * reward
    for (let j = 0; j < hiddenSize; j++) {
      for (let k = 0; k < outputSize; k++) {
        const idx = j * outputSize + k;
        this.hiddenOutputWeights[idx] +=
          learningRate * this.hiddenOutputTraces[idx] * reward;
      }
    }

    // Compute per-hidden-neuron learning signal via feedback alignment
    const learningSignal = new Float32Array(hiddenSize);
    if (feedbackAlignment) {
      for (let j = 0; j < hiddenSize; j++) {
        let signal = 0;
        for (let k = 0; k < outputSize; k++) {
          signal += this.feedbackWeights[k * hiddenSize + j];
        }
        learningSignal[j] = signal * reward;
      }
    } else {
      // Weight transport: use transposed output weights
      for (let j = 0; j < hiddenSize; j++) {
        let signal = 0;
        for (let k = 0; k < outputSize; k++) {
          signal += this.hiddenOutputWeights[j * outputSize + k];
        }
        learningSignal[j] = signal * reward;
      }
    }

    // Update input->hidden weights: dw = eta * trace * learningSignal
    for (let i = 0; i < inputSize; i++) {
      for (let j = 0; j < hiddenSize; j++) {
        const idx = i * hiddenSize + j;
        this.inputHiddenWeights[idx] +=
          learningRate * this.inputHiddenTraces[idx] * learningSignal[j];
      }
    }

    // Track reward
    this.totalReward += reward;
    this.rewardHistory.push(reward);
    if (this.rewardHistory.length > 1000) {
      this.rewardHistory.shift();
    }
  }

  // ==========================================================================
  // Trace Management
  // ==========================================================================

  /**
   * Update eligibility traces after a forward pass.
   *
   * Traces capture purely local information (Hebbian-like):
   *   Hidden->output: e[j][k] = decay * e[j][k] + h[j]
   *   Input->hidden:  e[i][j] = decay * e[i][j] + x[i] * dtanh(raw[j])
   *
   * The feedback/learning signal is applied separately in updateOnline().
   */
  private updateTraces(): void {
    const { inputSize, hiddenSize, outputSize, eligibilityDecay } = this.config;

    // Hidden->output traces: e[j][k] = decay * e[j][k] + h[j]
    for (let j = 0; j < hiddenSize; j++) {
      for (let k = 0; k < outputSize; k++) {
        const idx = j * outputSize + k;
        this.hiddenOutputTraces[idx] =
          eligibilityDecay * this.hiddenOutputTraces[idx] + this.lastHidden[j];
      }
    }

    // Input->hidden traces: e[i][j] = decay * e[i][j] + x[i] * dtanh(raw[j])
    for (let i = 0; i < inputSize; i++) {
      for (let j = 0; j < hiddenSize; j++) {
        const idx = i * hiddenSize + j;
        const tanhDerivative = 1 - this.lastHidden[j] * this.lastHidden[j];
        this.inputHiddenTraces[idx] =
          eligibilityDecay * this.inputHiddenTraces[idx] +
          this.lastInput[i] * tanhDerivative;
      }
    }
  }

  /**
   * Reset all eligibility traces to zero (between episodes).
   */
  resetTraces(): void {
    this.inputHiddenTraces.fill(0);
    this.hiddenOutputTraces.fill(0);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get network statistics including memory budget verification.
   */
  getStats(): EpropStats {
    const { inputSize, hiddenSize, outputSize } = this.config;
    const synapseCount =
      inputSize * hiddenSize +   // input->hidden
      hiddenSize * outputSize;   // hidden->output

    return {
      totalSteps: this.totalSteps,
      totalReward: this.totalReward,
      avgReward:
        this.rewardHistory.length > 0
          ? this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length
          : 0,
      synapsCount: synapseCount,
      memoryBytes: synapseCount * 12, // 4B weight + 4B trace + 4B feedback
    };
  }

  // ==========================================================================
  // Weight Import / Export
  // ==========================================================================

  /**
   * Export current weights (without traces — those are transient).
   */
  exportWeights(): { inputHidden: Float32Array; hiddenOutput: Float32Array } {
    return {
      inputHidden: new Float32Array(this.inputHiddenWeights),
      hiddenOutput: new Float32Array(this.hiddenOutputWeights),
    };
  }

  /**
   * Import weights. Resets traces since the network state has changed.
   */
  importWeights(weights: { inputHidden: Float32Array; hiddenOutput: Float32Array }): void {
    const { inputSize, hiddenSize, outputSize } = this.config;

    if (weights.inputHidden.length !== inputSize * hiddenSize) {
      throw new Error(
        `inputHidden size mismatch: expected ${inputSize * hiddenSize}, got ${weights.inputHidden.length}`
      );
    }
    if (weights.hiddenOutput.length !== hiddenSize * outputSize) {
      throw new Error(
        `hiddenOutput size mismatch: expected ${hiddenSize * outputSize}, got ${weights.hiddenOutput.length}`
      );
    }

    this.inputHiddenWeights.set(weights.inputHidden);
    this.hiddenOutputWeights.set(weights.hiddenOutput);
    this.resetTraces();
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /** Get the current config (read-only). */
  getConfig(): Readonly<EpropConfig> {
    return { ...this.config };
  }

  /** Get the raw eligibility trace values for testing/debugging. */
  getTraces(): { inputHidden: Float32Array; hiddenOutput: Float32Array } {
    return {
      inputHidden: new Float32Array(this.inputHiddenTraces),
      hiddenOutput: new Float32Array(this.hiddenOutputTraces),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private validateConfig(config: EpropConfig): void {
    if (config.inputSize <= 0) {
      throw new Error(`inputSize must be positive, got ${config.inputSize}`);
    }
    if (config.hiddenSize <= 0) {
      throw new Error(`hiddenSize must be positive, got ${config.hiddenSize}`);
    }
    if (config.outputSize <= 0) {
      throw new Error(`outputSize must be positive, got ${config.outputSize}`);
    }
    if (config.learningRate <= 0) {
      throw new Error(`learningRate must be positive, got ${config.learningRate}`);
    }
    if (config.eligibilityDecay < 0 || config.eligibilityDecay > 1) {
      throw new Error(
        `eligibilityDecay must be in [0, 1], got ${config.eligibilityDecay}`
      );
    }
  }

  /** Xavier/Glorot uniform initialization */
  private xavierInit(fanIn: number, fanOut: number): Float32Array {
    const limit = Math.sqrt(6 / (fanIn + fanOut));
    const size = fanIn * fanOut;
    const arr = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = (secureRandom() * 2 - 1) * limit;
    }
    return arr;
  }

  /** Random uniform initialization in [-0.5, 0.5] */
  private randomInit(rows: number, cols: number): Float32Array {
    const size = rows * cols;
    const arr = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = secureRandom() - 0.5;
    }
    return arr;
  }

  /** Sigmoid activation */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /** Softmax activation */
  private softmax(logits: Float32Array): Float32Array {
    const max = Math.max(...Array.from(logits));
    const exps = new Float32Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      exps[i] = Math.exp(logits[i] - max);
      sum += exps[i];
    }
    for (let i = 0; i < exps.length; i++) {
      exps[i] /= sum;
    }
    return exps;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new E-prop network with the given configuration.
 */
export function createEpropNetwork(config?: Partial<EpropConfig>): EpropNetwork {
  return new EpropNetwork(config);
}
