/**
 * Mock for @ruvector/nervous-system-wasm ESM module
 * Prevents "Unexpected token 'export'" errors in Jest
 *
 * This mock provides stub implementations of all WASM classes and functions
 * used by the nervous system integration.
 */

// Mock Hypervector class
export class Hypervector {
  private data: Float32Array;
  private dim: number;

  constructor(dimension: number = 10000) {
    this.dim = dimension;
    this.data = new Float32Array(dimension);
  }

  static random(dimension: number = 10000): Hypervector {
    const hv = new Hypervector(dimension);
    for (let i = 0; i < dimension; i++) {
      hv.data[i] = Math.random() > 0.5 ? 1 : -1;
    }
    return hv;
  }

  static zeros(dimension: number = 10000): Hypervector {
    return new Hypervector(dimension);
  }

  bind(other: Hypervector): Hypervector {
    const result = new Hypervector(this.dim);
    for (let i = 0; i < this.dim; i++) {
      result.data[i] = this.data[i] * other.data[i];
    }
    return result;
  }

  bundle(others: Hypervector[]): Hypervector {
    const result = new Hypervector(this.dim);
    result.data.set(this.data);
    for (const other of others) {
      for (let i = 0; i < this.dim; i++) {
        result.data[i] += other.data[i];
      }
    }
    return result;
  }

  permute(shifts: number = 1): Hypervector {
    const result = new Hypervector(this.dim);
    for (let i = 0; i < this.dim; i++) {
      result.data[(i + shifts) % this.dim] = this.data[i];
    }
    return result;
  }

  similarity(other: Hypervector): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < this.dim; i++) {
      dot += this.data[i] * other.data[i];
      normA += this.data[i] * this.data[i];
      normB += other.data[i] * other.data[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  toArray(): Float32Array {
    return this.data;
  }

  dimension(): number {
    return this.dim;
  }
}

// Mock HdcMemory class
export class HdcMemory {
  private memories: Map<string, Hypervector> = new Map();
  private dimension: number;

  constructor(dimension: number = 10000) {
    this.dimension = dimension;
  }

  store(key: string, value: Hypervector): void {
    this.memories.set(key, value);
  }

  retrieve(key: string): Hypervector | null {
    return this.memories.get(key) || null;
  }

  query(queryVector: Hypervector, topK: number = 5): Array<{ key: string; similarity: number }> {
    const results: Array<{ key: string; similarity: number }> = [];
    for (const [key, stored] of this.memories) {
      results.push({ key, similarity: queryVector.similarity(stored) });
    }
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  size(): number {
    return this.memories.size;
  }

  clear(): void {
    this.memories.clear();
  }
}

// Mock BTSPSynapse class
export class BTSPSynapse {
  private weight: number = 0;
  private eligibilityTrace: number = 0;

  constructor() {}

  update(preActivity: number, postActivity: number, reward: number): void {
    this.eligibilityTrace = preActivity * postActivity;
    this.weight += 0.01 * this.eligibilityTrace * reward;
  }

  getWeight(): number {
    return this.weight;
  }

  setWeight(w: number): void {
    this.weight = w;
  }
}

// Mock BTSPLayer class
export class BTSPLayer {
  private synapses: BTSPSynapse[][] = [];
  private inputSize: number;
  private outputSize: number;

  constructor(inputSize: number, outputSize: number) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    for (let i = 0; i < outputSize; i++) {
      this.synapses[i] = [];
      for (let j = 0; j < inputSize; j++) {
        this.synapses[i][j] = new BTSPSynapse();
      }
    }
  }

  forward(input: Float32Array): Float32Array {
    const output = new Float32Array(this.outputSize);
    for (let i = 0; i < this.outputSize; i++) {
      let sum = 0;
      for (let j = 0; j < this.inputSize; j++) {
        sum += input[j] * this.synapses[i][j].getWeight();
      }
      output[i] = Math.tanh(sum);
    }
    return output;
  }

  learn(input: Float32Array, target: Float32Array, reward: number): void {
    const output = this.forward(input);
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        this.synapses[i][j].update(input[j], target[i], reward);
      }
    }
  }
}

// Mock BTSPAssociativeMemory class
export class BTSPAssociativeMemory {
  private patterns: Map<string, Float32Array> = new Map();
  private layer: BTSPLayer;

  constructor(inputDim: number = 384, outputDim: number = 128) {
    this.layer = new BTSPLayer(inputDim, outputDim);
  }

  store(id: string, pattern: Float32Array): void {
    this.patterns.set(id, pattern);
  }

  recall(query: Float32Array, topK: number = 5): Array<{ id: string; similarity: number }> {
    const results: Array<{ id: string; similarity: number }> = [];
    for (const [id, pattern] of this.patterns) {
      let similarity = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < pattern.length; i++) {
        similarity += pattern[i] * query[i];
        normA += pattern[i] * pattern[i];
        normB += query[i] * query[i];
      }
      similarity = similarity / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
      results.push({ id, similarity });
    }
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  learn(pattern: Float32Array, reward: number): void {
    const target = this.layer.forward(pattern);
    this.layer.learn(pattern, target, reward);
  }

  size(): number {
    return this.patterns.size;
  }
}

// Mock WTALayer (Winner-Take-All)
export class WTALayer {
  private size: number;

  constructor(size: number) {
    this.size = size;
  }

  compute(input: Float32Array): Float32Array {
    const output = new Float32Array(this.size);
    let maxIdx = 0;
    let maxVal = input[0];
    for (let i = 1; i < input.length; i++) {
      if (input[i] > maxVal) {
        maxVal = input[i];
        maxIdx = i;
      }
    }
    output[maxIdx] = 1;
    return output;
  }
}

// Mock KWTALayer (K-Winners-Take-All)
export class KWTALayer {
  private size: number;
  private k: number;

  constructor(size: number, k: number) {
    this.size = size;
    this.k = k;
  }

  compute(input: Float32Array): Float32Array {
    const output = new Float32Array(this.size);
    const indexed = Array.from(input).map((val, idx) => ({ val, idx }));
    indexed.sort((a, b) => b.val - a.val);
    for (let i = 0; i < this.k && i < indexed.length; i++) {
      output[indexed[i].idx] = 1;
    }
    return output;
  }
}

// Mock WorkspaceItem
export class WorkspaceItem {
  public id: string;
  public content: any;
  public activation: number;
  public timestamp: number;

  constructor(id: string, content: any, activation: number = 1.0) {
    this.id = id;
    this.content = content;
    this.activation = activation;
    this.timestamp = Date.now();
  }
}

// Mock GlobalWorkspace (Global Workspace Theory)
export class GlobalWorkspace {
  private items: Map<string, WorkspaceItem> = new Map();
  private capacity: number;
  private threshold: number;

  constructor(capacity: number = 7, threshold: number = 0.5) {
    this.capacity = capacity;
    this.threshold = threshold;
  }

  broadcast(item: WorkspaceItem): void {
    this.items.set(item.id, item);
    this.enforceCapacity();
  }

  getActive(): WorkspaceItem[] {
    return Array.from(this.items.values())
      .filter(item => item.activation >= this.threshold)
      .sort((a, b) => b.activation - a.activation);
  }

  compete(): WorkspaceItem | null {
    const active = this.getActive();
    return active.length > 0 ? active[0] : null;
  }

  decay(rate: number = 0.1): void {
    for (const item of this.items.values()) {
      item.activation *= (1 - rate);
    }
    // Remove items below threshold
    for (const [id, item] of this.items) {
      if (item.activation < 0.01) {
        this.items.delete(id);
      }
    }
  }

  private enforceCapacity(): void {
    if (this.items.size > this.capacity) {
      const sorted = Array.from(this.items.entries())
        .sort((a, b) => b[1].activation - a[1].activation);
      const toRemove = sorted.slice(this.capacity);
      for (const [id] of toRemove) {
        this.items.delete(id);
      }
    }
  }

  size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}

// Mock utility functions
export function version(): string {
  return '0.1.0-mock';
}

export function available_mechanisms(): Array<[string, string]> {
  return [
    ['btsp', 'Behavioral Time-Scale Plasticity'],
    ['hdc', 'Hyperdimensional Computing'],
    ['gwt', 'Global Workspace Theory'],
    ['wta', 'Winner-Take-All'],
    ['kwta', 'K-Winners-Take-All']
  ];
}

export function performance_targets(): Array<[string, string]> {
  return [
    ['vector_ops', '1M ops/sec'],
    ['memory_recall', '<1ms'],
    ['pattern_match', '<5ms']
  ];
}

export function biological_references(): Array<[string, string]> {
  return [
    ['btsp', 'Bittner et al. 2017 - Behavioral time scale synaptic plasticity'],
    ['hdc', 'Kanerva 2009 - Hyperdimensional computing'],
    ['gwt', 'Baars 1988 - Global Workspace Theory']
  ];
}

// Mock init function (default export)
export default async function init(wasmBytes?: Uint8Array | ArrayBuffer): Promise<void> {
  // Mock initialization - does nothing but resolves
  return Promise.resolve();
}

// Named export for init as well
export { init };
