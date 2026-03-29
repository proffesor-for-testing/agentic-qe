/**
 * R6: Cold-Tier GNN Training
 *
 * LRU-cached mini-batch GNN trainer for graphs exceeding a configurable
 * memory budget (hotsetSize). Uses an LRU eviction cache to limit the
 * number of node features held in memory simultaneously.
 *
 * When the graph fits within hotsetSize, trains fully in-memory (fast path).
 * When the graph exceeds hotsetSize, streams nodes through the LRU cache
 * with eviction, producing embeddings only for the hot-set nodes.
 *
 * TypeScript implementation. Future: NAPI upgrade via @ruvector/gnn cold_tier
 * for true block-aligned disk I/O with mmap-backed node storage.
 *
 * @module integrations/ruvector/cold-tier-trainer
 */

import { getRuVectorFeatureFlags } from './feature-flags.js';
import { Xorshift128 } from '../../shared/utils/xorshift128.js';

// ============================================================================
// Types
// ============================================================================
export interface ColdTierConfig {
  /** Maximum nodes kept in memory (hot set). Default: 10000 */
  hotsetSize: number;
  /** Number of training epochs. Default: 10 */
  epochs: number;
  /** Learning rate. Default: 0.01 */
  learningRate: number;
  /** Hidden dimension for GNN layers. Default: 64 */
  hiddenDim: number;
}

export interface ColdTierGraph {
  nodeCount: number;
  featureDim: number;
  getNode(id: number): Float32Array | null;
  getNeighbors(id: number): number[];
  nodeIds(): Iterable<number>;
}

export interface TrainingResult {
  loss: number;
  lossHistory: number[];
  embeddings: Map<number, Float32Array>;
  peakMemoryNodes: number;
  usedInMemoryMode: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
}

// ============================================================================
// Constants
// ============================================================================
const DEFAULT_CONFIG: ColdTierConfig = {
  hotsetSize: 10000,
  epochs: 10,
  learningRate: 0.01,
  hiddenDim: 64,
};

// ============================================================================
// Internal: LRU Cache
// ============================================================================
class LruNodeCache {
  private readonly entries = new Map<number, { features: Float32Array; lastAccess: number }>();
  private accessCounter = 0;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _peakSize = 0;

  constructor(private readonly capacity: number) {}

  get(id: number): Float32Array | null {
    const entry = this.entries.get(id);
    if (entry) {
      this._hits++;
      entry.lastAccess = ++this.accessCounter;
      return entry.features;
    }
    this._misses++;
    return null;
  }

  put(id: number, features: Float32Array): void {
    const existing = this.entries.get(id);
    if (existing) {
      existing.features = features;
      existing.lastAccess = ++this.accessCounter;
      return;
    }
    if (this.entries.size >= this.capacity) this.evictLru();
    this.entries.set(id, { features, lastAccess: ++this.accessCounter });
    if (this.entries.size > this._peakSize) this._peakSize = this.entries.size;
  }

  get peakSize(): number { return this._peakSize; }

  get stats(): CacheStats {
    return { hits: this._hits, misses: this._misses, evictions: this._evictions, currentSize: this.entries.size };
  }

  cachedIds(): number[] {
    return Array.from(this.entries.keys());
  }

  clear(): void {
    this.entries.clear();
    this.accessCounter = 0;
    this._hits = this._misses = this._evictions = this._peakSize = 0;
  }

  private evictLru(): void {
    let oldestAccess = Infinity;
    let oldestId = -1;
    for (const [id, entry] of this.entries) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestId = id;
      }
    }
    if (oldestId >= 0) {
      this.entries.delete(oldestId);
      this._evictions++;
    }
  }
}

// ============================================================================
// InMemoryGraph
// ============================================================================
/** Simple in-memory graph for testing and small graphs. */
export class InMemoryGraph implements ColdTierGraph {
  constructor(
    private features: Map<number, Float32Array>,
    private adjacency: Map<number, number[]>
  ) {}

  get nodeCount(): number { return this.features.size; }

  get featureDim(): number {
    const first = this.features.values().next();
    return first.done ? 0 : first.value.length;
  }

  getNode(id: number): Float32Array | null { return this.features.get(id) ?? null; }
  getNeighbors(id: number): number[] { return this.adjacency.get(id) ?? []; }
  *nodeIds(): Iterable<number> { yield* this.features.keys(); }
}

// ============================================================================
// FileBackedGraph
// ============================================================================
/**
 * File-backed graph for larger-than-RAM training.
 * Writes node features to a temp file in block-aligned format,
 * reads them back lazily via getNode().
 */
export class FileBackedGraph implements ColdTierGraph {
  private readonly featureFile: string;
  private readonly nodeOffsets: Map<number, number>;
  private readonly adjacency: Map<number, number[]>;
  private readonly _nodeCount: number;
  private readonly _featureDim: number;
  private readonly bytesPerNode: number;

  constructor(
    features: Map<number, Float32Array>,
    adjacency: Map<number, number[]>,
    storagePath?: string
  ) {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    this._nodeCount = features.size;
    this._featureDim = features.values().next().value?.length ?? 0;
    this.bytesPerNode = this._featureDim * 4; // Float32 = 4 bytes
    this.adjacency = adjacency;
    this.nodeOffsets = new Map();

    // Write features to a temp file with sequential block-aligned layout
    this.featureFile = storagePath ?? path.join(os.tmpdir(), `coldtier-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    const buffer = Buffer.alloc(this._nodeCount * this.bytesPerNode);
    let offset = 0;
    for (const [id, feat] of features) {
      this.nodeOffsets.set(id, offset);
      for (let i = 0; i < feat.length; i++) {
        buffer.writeFloatLE(feat[i], offset + i * 4);
      }
      offset += this.bytesPerNode;
    }
    fs.writeFileSync(this.featureFile, buffer);
  }

  get nodeCount(): number { return this._nodeCount; }
  get featureDim(): number { return this._featureDim; }

  getNode(id: number): Float32Array | null {
    const offset = this.nodeOffsets.get(id);
    if (offset === undefined) return null;

    const fs = require('fs');
    const buf = Buffer.alloc(this.bytesPerNode);
    const fd = fs.openSync(this.featureFile, 'r');
    fs.readSync(fd, buf, 0, this.bytesPerNode, offset);
    fs.closeSync(fd);

    const result = new Float32Array(this._featureDim);
    for (let i = 0; i < this._featureDim; i++) {
      result[i] = buf.readFloatLE(i * 4);
    }
    return result;
  }

  getNeighbors(id: number): number[] { return this.adjacency.get(id) ?? []; }
  *nodeIds(): Iterable<number> { yield* this.nodeOffsets.keys(); }

  /** Clean up temp file */
  dispose(): void {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.featureFile)) fs.unlinkSync(this.featureFile);
    } catch { /* ignore cleanup failures */ }
  }
}

// ============================================================================
// ColdTierTrainer
// ============================================================================
/** LRU-cached GNN trainer with mean-aggregation message passing. */
export class ColdTierTrainer {
  private readonly config: ColdTierConfig;
  private cache: LruNodeCache;
  private weights: Float32Array | null = null;
  private bias: Float32Array | null = null;

  constructor(config?: Partial<ColdTierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.hotsetSize <= 0) {
      throw new Error(`hotsetSize must be positive, got ${this.config.hotsetSize}`);
    }
    this.cache = new LruNodeCache(this.config.hotsetSize);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Train a GNN on the given graph. Throws if useColdTierGNN flag is off. */
  train(graph: ColdTierGraph): TrainingResult {
    if (!getRuVectorFeatureFlags().useColdTierGNN) {
      throw new Error('Cold-Tier GNN training is disabled (useColdTierGNN = false)');
    }
    if (graph.nodeCount === 0) {
      return { loss: 0, lossHistory: [], embeddings: new Map(), peakMemoryNodes: 0, usedInMemoryMode: true };
    }

    this.cache.clear();
    const inMemory = graph.nodeCount <= this.config.hotsetSize;
    const nodeIds = [...graph.nodeIds()];
    const rng = new Xorshift128(42);

    // Xavier/Glorot weight init
    const { featureDim } = graph;
    const { hiddenDim } = this.config;
    const scale = Math.sqrt(2.0 / (featureDim + hiddenDim));
    this.weights = new Float32Array(featureDim * hiddenDim);
    for (let i = 0; i < this.weights.length; i++) this.weights[i] = rng.nextGaussian() * scale;
    this.bias = new Float32Array(hiddenDim);

    // Preload all nodes for in-memory mode
    if (inMemory) {
      for (const id of nodeIds) {
        const f = graph.getNode(id);
        if (f) this.cache.put(id, f);
      }
    }

    const lossHistory: number[] = [];
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      this.shuffle(nodeIds, rng);
      let epochLoss = 0;
      let count = 0;
      for (const id of nodeIds) {
        if (!inMemory) this.ensureCached(id, graph);
        epochLoss += this.trainNode(id, graph);
        count++;
      }
      lossHistory.push(count > 0 ? epochLoss / count : 0);
    }

    // Collect embeddings
    const embIds = inMemory ? nodeIds : this.cache.cachedIds();
    const embeddings = new Map<number, Float32Array>();
    for (const id of embIds) {
      const emb = this.forward(id, graph);
      if (emb) embeddings.set(id, emb);
    }

    return {
      loss: lossHistory.length > 0 ? lossHistory[lossHistory.length - 1] : 0,
      lossHistory,
      embeddings,
      peakMemoryNodes: this.cache.peakSize,
      usedInMemoryMode: inMemory,
    };
  }

  getCacheStats(): CacheStats { return this.cache.stats; }

  reset(): void {
    this.cache.clear();
    this.weights = null;
    this.bias = null;
  }

  // --------------------------------------------------------------------------
  // Internal: Aggregation (shared by training and forward)
  // --------------------------------------------------------------------------

  /** Mean-aggregate self + neighbor features into a pre-allocated buffer. */
  private aggregate(id: number, graph: ColdTierGraph, out: Float32Array): Float32Array | null {
    const self = this.fetchNode(id, graph);
    if (!self) return null;
    const dim = graph.featureDim;
    let count = 1;
    for (let d = 0; d < dim; d++) out[d] = self[d];
    for (const nid of graph.getNeighbors(id)) {
      const nf = this.fetchNode(nid, graph);
      if (nf) { for (let d = 0; d < dim; d++) out[d] += nf[d]; count++; }
    }
    for (let d = 0; d < dim; d++) out[d] /= count;
    return self;
  }

  /** Forward pass: aggregated * W + bias with ReLU. */
  private linearRelu(agg: Float32Array, featureDim: number, hiddenDim: number): Float32Array {
    const h = new Float32Array(hiddenDim);
    for (let j = 0; j < hiddenDim; j++) {
      let s = this.bias![j];
      for (let i = 0; i < featureDim; i++) s += agg[i] * this.weights![i * hiddenDim + j];
      h[j] = Math.max(0, s);
    }
    return h;
  }

  // --------------------------------------------------------------------------
  // Internal: Training step
  // --------------------------------------------------------------------------

  private trainNode(id: number, graph: ColdTierGraph): number {
    if (!this.weights || !this.bias) return 0;
    const { featureDim } = graph;
    const { hiddenDim, learningRate: lr } = this.config;

    const agg = new Float32Array(featureDim);
    const self = this.aggregate(id, graph, agg);
    if (!self) return 0;

    const hidden = this.linearRelu(agg, featureDim, hiddenDim);

    // MSE loss: hidden vs truncated input features
    const cmpDim = Math.min(hiddenDim, featureDim);
    let loss = 0;
    for (let d = 0; d < cmpDim; d++) { const diff = hidden[d] - self[d]; loss += diff * diff; }
    loss /= cmpDim;

    // SGD weight update
    for (let j = 0; j < cmpDim; j++) {
      const grad = (2 * (hidden[j] - self[j]) / cmpDim) * (hidden[j] > 0 ? 1 : 0);
      this.bias[j] -= lr * grad;
      for (let i = 0; i < featureDim; i++) {
        this.weights[i * hiddenDim + j] -= lr * grad * agg[i];
      }
    }
    return loss;
  }

  /** Forward-only pass for embedding extraction. */
  private forward(id: number, graph: ColdTierGraph): Float32Array | null {
    if (!this.weights || !this.bias) return null;
    const agg = new Float32Array(graph.featureDim);
    if (!this.aggregate(id, graph, agg)) return null;
    return this.linearRelu(agg, graph.featureDim, this.config.hiddenDim);
  }

  // --------------------------------------------------------------------------
  // Internal: Cache helpers
  // --------------------------------------------------------------------------

  private fetchNode(id: number, graph: ColdTierGraph): Float32Array | null {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const features = graph.getNode(id);
    if (features) this.cache.put(id, features);
    return features;
  }

  private ensureCached(id: number, graph: ColdTierGraph): void {
    if (this.cache.get(id)) return;
    const f = graph.getNode(id);
    if (f) this.cache.put(id, f);
  }

  private shuffle(arr: number[], rng: Xorshift128): void {
    for (let i = arr.length - 1; i > 0; i--) {
      // Use rejection sampling to avoid modulo bias
      const range = i + 1;
      const limit = 0x100000000 - (0x100000000 % range);
      let r: number;
      do { r = rng.next(); } while (r >= limit);
      const j = r % range;
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================
/** Create a ColdTierTrainer with the given configuration. */
export function createColdTierTrainer(config?: Partial<ColdTierConfig>): ColdTierTrainer {
  return new ColdTierTrainer(config);
}
