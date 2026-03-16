/**
 * Simple Neural Router - Extracted from neural-tiny-dancer-router.ts
 *
 * Lightweight feedforward neural network for routing decisions.
 * Uses Xavier initialization and simple policy gradient updates.
 *
 * Architecture:
 *   Input(4) -> Dense(32, ReLU) -> Dense(3, Softmax) -> [p_haiku, p_sonnet, p_opus]
 *
 * @module routing/simple-neural-router
 */

// ============================================================================
// Constants
// ============================================================================

/** Number of input features for the neural network */
export const INPUT_SIZE = 4;

/** Number of hidden units */
export const HIDDEN_SIZE = 32;

/** Number of output classes (tier1=haiku, tier2=sonnet, tier3=opus) */
export const OUTPUT_SIZE = 3;

/** Default learning rate for weight updates */
export const DEFAULT_LEARNING_RATE = 0.01;

// ============================================================================
// SimpleNeuralRouter
// ============================================================================

/**
 * Lightweight feedforward neural network for routing decisions.
 * Uses Xavier initialization and simple policy gradient updates.
 *
 * Architecture:
 *   Input(4) -> Dense(32, ReLU) -> Dense(3, Softmax) -> [p_haiku, p_sonnet, p_opus]
 */
export class SimpleNeuralRouter {
  private weightsInputHidden: Float32Array;
  private weightsHiddenOutput: Float32Array;
  private biasHidden: Float32Array;
  private biasOutput: Float32Array;
  private learningRate: number;

  constructor(learningRate: number = DEFAULT_LEARNING_RATE) {
    this.learningRate = learningRate;
    this.weightsInputHidden = this.xavierInit(INPUT_SIZE, HIDDEN_SIZE);
    this.weightsHiddenOutput = this.xavierInit(HIDDEN_SIZE, OUTPUT_SIZE);
    this.biasHidden = new Float32Array(HIDDEN_SIZE);
    this.biasOutput = new Float32Array(OUTPUT_SIZE);
  }

  /**
   * Xavier/Glorot initialization for weight matrices
   */
  private xavierInit(fanIn: number, fanOut: number): Float32Array {
    const scale = Math.sqrt(2.0 / (fanIn + fanOut));
    const weights = new Float32Array(fanIn * fanOut);
    for (let i = 0; i < weights.length; i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
      weights[i] = z * scale;
    }
    return weights;
  }

  /**
   * Forward pass through the network
   *
   * @param features - Input feature vector [complexityScore, tokenEstimate, domainIndex, successRate]
   * @returns Probability distribution over tiers [p_haiku, p_sonnet, p_opus]
   */
  forward(features: number[]): number[] {
    if (features.length !== INPUT_SIZE) {
      throw new Error(`Expected ${INPUT_SIZE} features, got ${features.length}`);
    }

    // Input -> Hidden (matmul + bias + ReLU)
    const hidden = new Float32Array(HIDDEN_SIZE);
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      let sum = this.biasHidden[h];
      for (let i = 0; i < INPUT_SIZE; i++) {
        sum += features[i] * this.weightsInputHidden[i * HIDDEN_SIZE + h];
      }
      hidden[h] = Math.max(0, sum); // ReLU
    }

    // Hidden -> Output (matmul + bias)
    const logits = new Float32Array(OUTPUT_SIZE);
    for (let o = 0; o < OUTPUT_SIZE; o++) {
      let sum = this.biasOutput[o];
      for (let h = 0; h < HIDDEN_SIZE; h++) {
        sum += hidden[h] * this.weightsHiddenOutput[h * OUTPUT_SIZE + o];
      }
      logits[o] = sum;
    }

    // Softmax
    return this.softmax(logits);
  }

  /**
   * Numerically stable softmax
   */
  private softmax(logits: Float32Array): number[] {
    const maxLogit = Math.max(...logits);
    const expValues = new Float32Array(logits.length);
    let sumExp = 0;
    for (let i = 0; i < logits.length; i++) {
      expValues[i] = Math.exp(logits[i] - maxLogit);
      sumExp += expValues[i];
    }
    const result: number[] = [];
    for (let i = 0; i < logits.length; i++) {
      result.push(expValues[i] / sumExp);
    }
    return result;
  }

  /**
   * Update weights using simple policy gradient (REINFORCE)
   *
   * @param features - Input features used for the decision
   * @param chosenTierIndex - Index of the tier that was chosen (0=haiku, 1=sonnet, 2=opus)
   * @param reward - Reward signal (-1 to 1, where 1 = perfect, -1 = total failure)
   */
  updateWeights(features: number[], chosenTierIndex: number, reward: number): void {
    // Forward pass to get current probabilities and hidden activations
    const hidden = new Float32Array(HIDDEN_SIZE);
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      let sum = this.biasHidden[h];
      for (let i = 0; i < INPUT_SIZE; i++) {
        sum += features[i] * this.weightsInputHidden[i * HIDDEN_SIZE + h];
      }
      hidden[h] = Math.max(0, sum);
    }

    const logits = new Float32Array(OUTPUT_SIZE);
    for (let o = 0; o < OUTPUT_SIZE; o++) {
      let sum = this.biasOutput[o];
      for (let h = 0; h < HIDDEN_SIZE; h++) {
        sum += hidden[h] * this.weightsHiddenOutput[h * OUTPUT_SIZE + o];
      }
      logits[o] = sum;
    }

    const probs = this.softmax(logits);

    // Policy gradient: d log(pi) / d theta * reward
    // For softmax output, gradient of log(pi_chosen) w.r.t. logits is:
    //   (1{i=chosen} - pi_i) for each output i
    const outputGrad = new Float32Array(OUTPUT_SIZE);
    for (let o = 0; o < OUTPUT_SIZE; o++) {
      outputGrad[o] = (o === chosenTierIndex ? 1 : 0) - probs[o];
      outputGrad[o] *= reward * this.learningRate;
    }

    // Update output weights and biases
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      for (let o = 0; o < OUTPUT_SIZE; o++) {
        this.weightsHiddenOutput[h * OUTPUT_SIZE + o] += hidden[h] * outputGrad[o];
      }
    }
    for (let o = 0; o < OUTPUT_SIZE; o++) {
      this.biasOutput[o] += outputGrad[o];
    }

    // Backpropagate to hidden layer
    const hiddenGrad = new Float32Array(HIDDEN_SIZE);
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      if (hidden[h] <= 0) continue; // ReLU derivative
      let grad = 0;
      for (let o = 0; o < OUTPUT_SIZE; o++) {
        grad += outputGrad[o] * this.weightsHiddenOutput[h * OUTPUT_SIZE + o];
      }
      hiddenGrad[h] = grad;
    }

    // Update input weights and biases
    for (let i = 0; i < INPUT_SIZE; i++) {
      for (let h = 0; h < HIDDEN_SIZE; h++) {
        this.weightsInputHidden[i * HIDDEN_SIZE + h] += features[i] * hiddenGrad[h];
      }
    }
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      this.biasHidden[h] += hiddenGrad[h];
    }
  }

  /**
   * Serialize weights for persistence
   */
  serialize(): {
    weightsInputHidden: number[];
    weightsHiddenOutput: number[];
    biasHidden: number[];
    biasOutput: number[];
  } {
    return {
      weightsInputHidden: Array.from(this.weightsInputHidden),
      weightsHiddenOutput: Array.from(this.weightsHiddenOutput),
      biasHidden: Array.from(this.biasHidden),
      biasOutput: Array.from(this.biasOutput),
    };
  }

  /**
   * Deserialize weights from persistence
   */
  deserialize(data: {
    weightsInputHidden: number[];
    weightsHiddenOutput: number[];
    biasHidden: number[];
    biasOutput: number[];
  }): void {
    if (data.weightsInputHidden.length === INPUT_SIZE * HIDDEN_SIZE) {
      this.weightsInputHidden = new Float32Array(data.weightsInputHidden);
    }
    if (data.weightsHiddenOutput.length === HIDDEN_SIZE * OUTPUT_SIZE) {
      this.weightsHiddenOutput = new Float32Array(data.weightsHiddenOutput);
    }
    if (data.biasHidden.length === HIDDEN_SIZE) {
      this.biasHidden = new Float32Array(data.biasHidden);
    }
    if (data.biasOutput.length === OUTPUT_SIZE) {
      this.biasOutput = new Float32Array(data.biasOutput);
    }
  }
}
