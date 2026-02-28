/**
 * Agentic QE v3 - Neural Network Implementation
 *
 * Simple feedforward neural network with backpropagation.
 * No external ML libraries - pure TypeScript implementation.
 */

import { secureRandom } from '../../../shared/utils/crypto-random.js';

// ============================================================================
// Activation Functions
// ============================================================================

export interface ActivationFunction {
  forward(x: number): number;
  backward(x: number): number;
}

export class ReLU implements ActivationFunction {
  forward(x: number): number {
    return Math.max(0, x);
  }

  backward(x: number): number {
    return x > 0 ? 1 : 0;
  }
}

export class Tanh implements ActivationFunction {
  forward(x: number): number {
    return Math.tanh(x);
  }

  backward(x: number): number {
    const t = Math.tanh(x);
    return 1 - t * t;
  }
}

export class Sigmoid implements ActivationFunction {
  forward(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  backward(x: number): number {
    const s = this.forward(x);
    return s * (1 - s);
  }
}

export class Linear implements ActivationFunction {
  forward(x: number): number {
    return x;
  }

  backward(x: number): number {
    return 1;
  }
}

export class Softmax {
  /**
   * Forward pass - returns probabilities
   */
  static forward(x: Float32Array): Float32Array {
    const max = Math.max(...x);
    const exp = x.map((v) => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return new Float32Array(exp.map((v) => v / sum));
  }

  /**
   * Backward pass - returns gradient
   * For simplicity, returns gradient of cross-entropy loss
   */
  static backward(x: Float32Array, target: Float32Array): Float32Array {
    const output = Softmax.forward(x);
    const grad = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      grad[i] = output[i] - target[i];
    }
    return grad;
  }
}

// ============================================================================
// Loss Functions
// ============================================================================

export interface LossFunction {
  forward(predicted: Float32Array, target: Float32Array | number[]): number;
  backward(predicted: Float32Array, target: Float32Array | number[]): Float32Array;
}

export class MSELoss implements LossFunction {
  forward(predicted: Float32Array, target: Float32Array | number[]): number {
    const targetArray = target instanceof Float32Array ? target : new Float32Array(target);
    let sum = 0;
    for (let i = 0; i < predicted.length; i++) {
      const diff = predicted[i] - targetArray[i];
      sum += diff * diff;
    }
    return sum / predicted.length;
  }

  backward(predicted: Float32Array, target: Float32Array | number[]): Float32Array {
    const targetArray = target instanceof Float32Array ? target : new Float32Array(target);
    const grad = new Float32Array(predicted.length);
    const n = predicted.length;
    for (let i = 0; i < n; i++) {
      grad[i] = 2 * (predicted[i] - targetArray[i]) / n;
    }
    return grad;
  }
}

export class CrossEntropyLoss implements LossFunction {
  forward(predicted: Float32Array, target: Float32Array): number {
    let sum = 0;
    const eps = 1e-10;
    for (let i = 0; i < predicted.length; i++) {
      sum -= target[i] * Math.log(predicted[i] + eps);
    }
    return sum;
  }

  backward(predicted: Float32Array, target: Float32Array): Float32Array {
    const grad = new Float32Array(predicted.length);
    const eps = 1e-10;
    for (let i = 0; i < predicted.length; i++) {
      grad[i] = -target[i] / (predicted[i] + eps);
    }
    return grad;
  }
}

// ============================================================================
// Neural Network Layer
// ============================================================================

export interface LayerConfig {
  inputSize: number;
  outputSize: number;
  activation: ActivationFunction;
}

export class Layer {
  public weights: Float32Array;
  public biases: Float32Array;
  public weightGradients: Float32Array;
  public biasGradients: Float32Array;
  public activation: ActivationFunction;
  public inputSize: number;
  public outputSize: number;
  public lastInput: Float32Array | null = null;
  public lastPreActivation: Float32Array | null = null;
  public lastOutput: Float32Array | null = null;

  constructor(config: LayerConfig) {
    this.inputSize = config.inputSize;
    this.outputSize = config.outputSize;
    this.activation = config.activation;

    // Initialize weights with Xavier initialization
    const scale = Math.sqrt(2 / (this.inputSize + this.outputSize));
    this.weights = new Float32Array(this.inputSize * this.outputSize);
    this.biases = new Float32Array(this.outputSize);
    this.weightGradients = new Float32Array(this.inputSize * this.outputSize);
    this.biasGradients = new Float32Array(this.outputSize);

    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (secureRandom() * 2 - 1) * scale;
    }

    for (let i = 0; i < this.biases.length; i++) {
      this.biases[i] = 0;
    }
  }

  /**
   * Forward pass through the layer
   */
  forward(input: Float32Array): Float32Array {
    this.lastInput = input;

    const output = new Float32Array(this.outputSize);
    const preActivation = new Float32Array(this.outputSize);

    // Matrix multiplication + bias
    for (let i = 0; i < this.outputSize; i++) {
      let sum = this.biases[i];
      for (let j = 0; j < this.inputSize; j++) {
        sum += input[j] * this.weights[i * this.inputSize + j];
      }
      preActivation[i] = sum;
      output[i] = this.activation.forward(sum);
    }

    this.lastPreActivation = preActivation;
    this.lastOutput = output;

    return output;
  }

  /**
   * Backward pass - compute gradients
   */
  backward(outputGradient: Float32Array): Float32Array {
    if (!this.lastInput || !this.lastPreActivation) {
      throw new Error('Must call forward before backward');
    }

    // Compute activation gradient
    const activationGradient = new Float32Array(this.outputSize);
    for (let i = 0; i < this.outputSize; i++) {
      activationGradient[i] = this.activation.backward(this.lastPreActivation[i]) * outputGradient[i];
    }

    // Compute weight gradients
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        this.weightGradients[i * this.inputSize + j] += activationGradient[i] * this.lastInput[j];
      }
      this.biasGradients[i] += activationGradient[i];
    }

    // Compute input gradient (backprop to previous layer)
    const inputGradient = new Float32Array(this.inputSize);
    for (let j = 0; j < this.inputSize; j++) {
      for (let i = 0; i < this.outputSize; i++) {
        inputGradient[j] += activationGradient[i] * this.weights[i * this.inputSize + j];
      }
    }

    return inputGradient;
  }

  /**
   * Update weights using gradients
   */
  update(learningRate: number): void {
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= learningRate * this.weightGradients[i];
      this.weightGradients[i] = 0; // Reset gradient
    }

    for (let i = 0; i < this.biases.length; i++) {
      this.biases[i] -= learningRate * this.biasGradients[i];
      this.biasGradients[i] = 0; // Reset gradient
    }
  }

  /**
   * Get layer parameters as plain object
   */
  getParameters(): { weights: number[]; biases: number[] } {
    return {
      weights: Array.from(this.weights),
      biases: Array.from(this.biases),
    };
  }

  /**
   * Set layer parameters from plain object
   */
  setParameters(params: { weights: number[]; biases: number[] }): void {
    this.weights = new Float32Array(params.weights);
    this.biases = new Float32Array(params.biases);
    this.weightGradients = new Float32Array(this.weights.length);
    this.biasGradients = new Float32Array(this.biases.length);
  }
}

// ============================================================================
// Neural Network
// ============================================================================

export interface NetworkConfig {
  layerSizes: number[];
  activations: ActivationFunction[];
  learningRate?: number;
}

export class NeuralNetwork {
  public layers: Layer[] = [];
  public learningRate: number;

  constructor(config: NetworkConfig) {
    this.learningRate = config.learningRate || 0.001;

    // Create layers
    for (let i = 0; i < config.layerSizes.length - 1; i++) {
      const layer = new Layer({
        inputSize: config.layerSizes[i],
        outputSize: config.layerSizes[i + 1],
        activation: config.activations[i] || new ReLU(),
      });
      this.layers.push(layer);
    }
  }

  /**
   * Forward pass through the network
   */
  forward(input: number[] | Float32Array): Float32Array {
    let current = input instanceof Float32Array ? input : new Float32Array(input);

    for (const layer of this.layers) {
      current = layer.forward(current);
    }

    return current;
  }

  /**
   * Backward pass - compute gradients
   */
  backward(outputGradient: Float32Array): void {
    let gradient = outputGradient;

    // Backpropagate through layers in reverse order
    for (let i = this.layers.length - 1; i >= 0; i--) {
      gradient = this.layers[i].backward(gradient);
    }
  }

  /**
   * Training step - forward, backward, update
   */
  train(input: number[] | Float32Array, target: number[] | Float32Array, lossFn: LossFunction): number {
    // Forward pass
    const predicted = this.forward(input);
    const targetArray = target instanceof Float32Array ? target : new Float32Array(target);

    // Compute loss
    const loss = lossFn.forward(predicted, targetArray);

    // Backward pass
    const lossGradient = lossFn.backward(predicted, targetArray);
    this.backward(lossGradient);

    // Update weights
    for (const layer of this.layers) {
      layer.update(this.learningRate);
    }

    return loss;
  }

  /**
   * Batch training
   */
  trainBatch(inputs: (number[] | Float32Array)[], targets: (number[] | Float32Array)[], lossFn: LossFunction): number {
    let totalLoss = 0;

    // Reset gradients
    for (const layer of this.layers) {
      layer.weightGradients.fill(0);
      layer.biasGradients.fill(0);
    }

    // Accumulate gradients
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i] instanceof Float32Array ? inputs[i] : new Float32Array(inputs[i]);
      const target = targets[i] instanceof Float32Array ? targets[i] : new Float32Array(targets[i]);

      // Forward pass
      const predicted = this.forward(input);

      // Compute loss
      const loss = lossFn.forward(predicted, target);
      totalLoss += loss;

      // Backward pass (accumulates gradients)
      const lossGradient = lossFn.backward(predicted, target);
      this.backward(lossGradient);
    }

    // Average gradients and update
    for (const layer of this.layers) {
      for (let i = 0; i < layer.weightGradients.length; i++) {
        layer.weightGradients[i] /= inputs.length;
      }
      for (let i = 0; i < layer.biasGradients.length; i++) {
        layer.biasGradients[i] /= inputs.length;
      }
      layer.update(this.learningRate);
    }

    return totalLoss / inputs.length;
  }

  /**
   * Get network parameters as plain object
   */
  getParameters(): { layers: Array<{ weights: number[]; biases: number[] }> } {
    return {
      layers: this.layers.map((layer) => layer.getParameters()),
    };
  }

  /**
   * Set network parameters from plain object
   */
  setParameters(params: { layers: Array<{ weights: number[]; biases: number[] }> }): void {
    for (let i = 0; i < this.layers.length && i < params.layers.length; i++) {
      this.layers[i].setParameters(params.layers[i]);
    }
  }

  /**
   * Clone the network
   */
  clone(): NeuralNetwork {
    const cloned = new NeuralNetwork({
      layerSizes: [this.layers[0].inputSize, ...this.layers.map((l) => l.outputSize)],
      activations: this.layers.map((l) => l.activation),
      learningRate: this.learningRate,
    });
    cloned.setParameters(this.getParameters());
    return cloned;
  }

  /**
   * Soft update from another network (for target networks in DQN/DDPG)
   */
  softUpdate(other: NeuralNetwork, tau: number): void {
    for (let i = 0; i < this.layers.length; i++) {
      const thisLayer = this.layers[i];
      const otherLayer = other.layers[i];

      for (let j = 0; j < thisLayer.weights.length; j++) {
        thisLayer.weights[j] = tau * otherLayer.weights[j] + (1 - tau) * thisLayer.weights[j];
      }

      for (let j = 0; j < thisLayer.biases.length; j++) {
        thisLayer.biases[j] = tau * otherLayer.biases[j] + (1 - tau) * thisLayer.biases[j];
      }
    }
  }
}

// ============================================================================
// Optimizer
// ============================================================================

export class AdamOptimizer {
  private learningRate: number;
  private beta1: number;
  private beta2: number;
  private epsilon: number;
  private t: number = 0;
  private mWeights: Map<Layer, Float32Array> = new Map();
  private vWeights: Map<Layer, Float32Array> = new Map();
  private mBiases: Map<Layer, Float32Array> = new Map();
  private vBiases: Map<Layer, Float32Array> = new Map();

  constructor(learningRate: number = 0.001, beta1: number = 0.9, beta2: number = 0.999, epsilon: number = 1e-8) {
    this.learningRate = learningRate;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.epsilon = epsilon;
  }

  /**
   * Initialize momentums for a layer
   */
  private initMomentums(layer: Layer): void {
    if (!this.mWeights.has(layer)) {
      this.mWeights.set(layer, new Float32Array(layer.weights.length));
      this.vWeights.set(layer, new Float32Array(layer.weights.length));
      this.mBiases.set(layer, new Float32Array(layer.biases.length));
      this.vBiases.set(layer, new Float32Array(layer.biases.length));
    }
  }

  /**
   * Update layer parameters using Adam
   */
  update(layer: Layer): void {
    this.initMomentums(layer);
    this.t++;

    const mW = this.mWeights.get(layer)!;
    const vW = this.vWeights.get(layer)!;
    const mB = this.mBiases.get(layer)!;
    const vB = this.vBiases.get(layer)!;

    // Update weights
    for (let i = 0; i < layer.weights.length; i++) {
      mW[i] = this.beta1 * mW[i] + (1 - this.beta1) * layer.weightGradients[i];
      vW[i] = this.beta2 * vW[i] + (1 - this.beta2) * layer.weightGradients[i] * layer.weightGradients[i];

      const mHat = mW[i] / (1 - Math.pow(this.beta1, this.t));
      const vHat = vW[i] / (1 - Math.pow(this.beta2, this.t));

      layer.weights[i] -= this.learningRate * mHat / (Math.sqrt(vHat) + this.epsilon);
      layer.weightGradients[i] = 0;
    }

    // Update biases
    for (let i = 0; i < layer.biases.length; i++) {
      mB[i] = this.beta1 * mB[i] + (1 - this.beta1) * layer.biasGradients[i];
      vB[i] = this.beta2 * vB[i] + (1 - this.beta2) * layer.biasGradients[i] * layer.biasGradients[i];

      const mHat = mB[i] / (1 - Math.pow(this.beta1, this.t));
      const vHat = vB[i] / (1 - Math.pow(this.beta2, this.t));

      layer.biases[i] -= this.learningRate * mHat / (Math.sqrt(vHat) + this.epsilon);
      layer.biasGradients[i] = 0;
    }
  }

  /**
   * Update network using Adam optimizer
   */
  updateNetwork(network: NeuralNetwork): void {
    for (const layer of network.layers) {
      this.update(layer);
    }
  }
}
