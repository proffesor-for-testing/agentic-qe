/**
 * R4: GraphMAE Self-Supervised Graph Learning
 *
 * Masked graph autoencoders for zero-label graph embeddings.
 * TypeScript implementation (fallback). NAPI upgrade via @ruvector/gnn when graphmae is exposed.
 * @module integrations/ruvector/graphmae-encoder
 */

import { getRuVectorFeatureFlags } from './feature-flags.js';
import { Xorshift128 } from '../../shared/utils/xorshift128.js';

// Types

/** Configuration for the GraphMAE encoder */
export interface GraphMAEConfig {
  /** Embedding output dimension. Default: 128 */
  embeddingDim: number;
  /** Fraction of nodes to mask during training. Default: 0.5 */
  maskRatio: number;
  /** Learning rate for reconstruction. Default: 0.001 */
  learningRate: number;
  /** Number of attention heads in GAT encoder. Default: 4 */
  numHeads: number;
  /** SCE loss exponent (gamma). Default: 2 */
  gamma: number;
}

/** A graph with node features and adjacency lists */
export interface QEGraph {
  /** Node feature vectors (node_id -> feature vector) */
  nodes: Map<string, Float32Array>;
  /** Adjacency list (node_id -> list of neighbor node_ids) */
  edges: Map<string, string[]>;
}

/** Result of a GraphMAE training run */
export interface GraphMAEResult {
  /** Node embeddings (node_id -> embedding vector) */
  embeddings: Map<string, Float32Array>;
  /** Reconstruction loss (should decrease over epochs) */
  loss: number;
  /** Per-epoch loss values for convergence analysis */
  lossHistory: number[];
  /** Number of training epochs completed */
  epochs: number;
}

// Constants & Helpers

const DEFAULT_EMBEDDING_DIM = 128;
const DEFAULT_MASK_RATIO = 0.5;
const DEFAULT_LEARNING_RATE = 0.001;
const DEFAULT_NUM_HEADS = 4;
const DEFAULT_GAMMA = 2;

/** Dot product of two Float32Arrays */
function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/** L2 norm of a Float32Array */
function norm(v: Float32Array): number {
  return Math.sqrt(dot(v, v));
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/** Xavier/Glorot initialization for a weight matrix stored as flat Float32Array */
function xavierInit(rows: number, cols: number, rng: Xorshift128): Float32Array {
  const limit = Math.sqrt(6 / (rows + cols));
  const w = new Float32Array(rows * cols);
  for (let i = 0; i < w.length; i++) {
    w[i] = (rng.nextFloat() * 2 - 1) * limit;
  }
  return w;
}

/** Matrix-vector multiply: result[i] = sum_j(W[i*cols + j] * x[j]) */
function matVecMul(W: Float32Array, x: Float32Array, rows: number, cols: number): Float32Array {
  const result = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    const offset = i * cols;
    for (let j = 0; j < cols; j++) {
      sum += W[offset + j] * x[j];
    }
    result[i] = sum;
  }
  return result;
}

/** Softmax over an array of numbers, returns normalized probabilities */
function softmax(values: number[]): number[] {
  const maxVal = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum === 0 ? exps.map(() => 1 / values.length) : exps.map((e) => e / sum);
}

function assertGraphMAEEnabled(method: string): void {
  const flags = getRuVectorFeatureFlags();
  if (!flags.useGraphMAEEmbeddings) {
    throw new Error(`GraphMAE is disabled (useGraphMAEEmbeddings=false). Enable the feature flag to use ${method}.`);
  }
}

// GraphMAEEncoder

/**
 * GraphMAE (Graph Masked Autoencoder) encoder for self-supervised graph embedding.
 * Masks random nodes during training, learns to reconstruct via GAT-style encoder.
 */
export class GraphMAEEncoder {
  private readonly config: GraphMAEConfig;
  private readonly rng: Xorshift128;

  /** Per-head attention projection weights: W_query, W_key per head */
  private headWeights: Array<{ Wq: Float32Array; Wk: Float32Array }> = [];
  /** Output projection: embeddingDim x (inputDim * numHeads) — set on first encode */
  private Wout: Float32Array | null = null;
  /** Decoder projection: inputDim x embeddingDim — projects embeddings back to feature space */
  private Wdec: Float32Array | null = null;
  /** Learnable mask token vector (inputDim) — set on first mask */
  private maskToken: Float32Array | null = null;
  /** Cached input dimension from the first graph encountered */
  private inputDim = 0;

  constructor(config?: Partial<GraphMAEConfig>) {
    this.config = {
      embeddingDim: config?.embeddingDim ?? DEFAULT_EMBEDDING_DIM,
      maskRatio: config?.maskRatio ?? DEFAULT_MASK_RATIO,
      learningRate: config?.learningRate ?? DEFAULT_LEARNING_RATE,
      numHeads: config?.numHeads ?? DEFAULT_NUM_HEADS,
      gamma: config?.gamma ?? DEFAULT_GAMMA,
    };

    if (this.config.embeddingDim <= 0) {
      throw new Error(`embeddingDim must be positive, got ${this.config.embeddingDim}`);
    }
    if (this.config.maskRatio < 0 || this.config.maskRatio > 1) {
      throw new Error(`maskRatio must be in [0, 1], got ${this.config.maskRatio}`);
    }

    this.rng = new Xorshift128(0xdeadbeef);
  }


  /** Mask a fraction of nodes by replacing features with a learnable mask token. */
  maskNodes(graph: QEGraph): {
    masked: QEGraph;
    maskedIds: Set<string>;
    maskToken: Float32Array;
  } {
    assertGraphMAEEnabled('maskNodes');

    const nodeIds = Array.from(graph.nodes.keys());
    if (nodeIds.length === 0) {
      return {
        masked: { nodes: new Map(), edges: new Map(graph.edges) },
        maskedIds: new Set(),
        maskToken: new Float32Array(0),
      };
    }

    this.ensureInitialized(graph);

    const numToMask = Math.max(1, Math.round(nodeIds.length * this.config.maskRatio));
    const maskedIds = new Set<string>();

    // Fisher-Yates partial shuffle to select maskedIds
    const shuffled = [...nodeIds];
    for (let i = shuffled.length - 1; i > 0 && maskedIds.size < numToMask; i--) {
      const j = Math.floor(this.rng.nextFloat() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      maskedIds.add(shuffled[i]);
    }
    // If we haven't selected enough yet, add from the front
    for (let i = 0; maskedIds.size < numToMask && i < shuffled.length; i++) {
      maskedIds.add(shuffled[i]);
    }

    const maskedNodes = new Map<string, Float32Array>();
    for (const [id, features] of graph.nodes) {
      maskedNodes.set(id, maskedIds.has(id) ? new Float32Array(this.maskToken!) : features);
    }

    return {
      masked: { nodes: maskedNodes, edges: new Map(graph.edges) },
      maskedIds,
      maskToken: new Float32Array(this.maskToken!),
    };
  }

  /** Single-layer GAT-style message-passing to produce embeddingDim vectors. */
  encode(graph: QEGraph): Map<string, Float32Array> {
    assertGraphMAEEnabled('encode');

    if (graph.nodes.size === 0) {
      return new Map();
    }

    this.ensureInitialized(graph);

    const { numHeads, embeddingDim } = this.config;
    const headDim = Math.max(1, Math.floor(this.inputDim / numHeads));
    const embeddings = new Map<string, Float32Array>();

    for (const [nodeId, features] of graph.nodes) {
      const neighbors = graph.edges.get(nodeId) ?? [];
      const validNeighbors = neighbors.filter((n) => graph.nodes.has(n));

      if (validNeighbors.length === 0) {
        // Isolated node: replicate features across heads and project
        const selfConcat = new Float32Array(this.inputDim * numHeads);
        for (let h = 0; h < numHeads; h++) {
          selfConcat.set(features, h * this.inputDim);
        }
        embeddings.set(
          nodeId,
          matVecMul(this.Wout!, selfConcat, embeddingDim, this.inputDim * numHeads)
        );
        continue;
      }

      // Multi-head attention aggregation
      const headOutputs: Float32Array[] = [];

      for (let h = 0; h < numHeads; h++) {
        const { Wq, Wk } = this.headWeights[h];
        const query = matVecMul(Wq, features, headDim, this.inputDim);

        // Compute attention scores for neighbors
        const scores: number[] = [];
        const neighborFeats: Float32Array[] = [];

        for (const nId of validNeighbors) {
          const nFeat = graph.nodes.get(nId)!;
          const key = matVecMul(Wk, nFeat, headDim, this.inputDim);
          scores.push(dot(query, key) / Math.sqrt(headDim));
          neighborFeats.push(nFeat);
        }

        const attnWeights = softmax(scores);

        // Weighted sum of neighbor features
        const aggregated = new Float32Array(this.inputDim);
        for (let n = 0; n < validNeighbors.length; n++) {
          const w = attnWeights[n];
          const nFeat = neighborFeats[n];
          for (let d = 0; d < this.inputDim; d++) {
            aggregated[d] += w * nFeat[d];
          }
        }

        // Combine with self features (residual)
        for (let d = 0; d < this.inputDim; d++) {
          aggregated[d] = (aggregated[d] + features[d]) * 0.5;
        }

        headOutputs.push(aggregated);
      }

      // Concatenate head outputs and project
      const concat = new Float32Array(this.inputDim * numHeads);
      for (let h = 0; h < numHeads; h++) {
        concat.set(headOutputs[h], h * this.inputDim);
      }

      embeddings.set(nodeId, matVecMul(this.Wout!, concat, embeddingDim, this.inputDim * numHeads));
    }

    return embeddings;
  }

  /** SCE loss: (1 - cos_sim^gamma) / gamma, averaged over masked nodes. */
  reconstructionLoss(
    original: Map<string, Float32Array>,
    reconstructed: Map<string, Float32Array>,
    maskedIds: Set<string>
  ): number {
    assertGraphMAEEnabled('reconstructionLoss');

    if (maskedIds.size === 0) return 0;

    const gamma = this.config.gamma;
    let totalLoss = 0;
    let count = 0;

    for (const id of maskedIds) {
      const orig = original.get(id);
      const recon = reconstructed.get(id);
      if (!orig || !recon) continue;

      const sim = cosineSimilarity(orig, recon);
      totalLoss += (1 - Math.pow(sim, gamma)) / gamma;
      count++;
    }

    return count === 0 ? 0 : totalLoss / count;
  }

  /** Decode embeddings back to input feature space: decoded = Wdec * embedding. */
  decode(embeddings: Map<string, Float32Array>): Map<string, Float32Array> {
    assertGraphMAEEnabled('decode');

    if (!this.Wdec || this.inputDim === 0) return new Map();

    const decoded = new Map<string, Float32Array>();
    for (const [nodeId, emb] of embeddings) {
      decoded.set(nodeId, matVecMul(this.Wdec, emb, this.inputDim, this.config.embeddingDim));
    }
    return decoded;
  }

  /** Full training loop: mask -> encode -> decode -> loss -> SPSA optimization. */
  train(graph: QEGraph, epochs: number): GraphMAEResult {
    assertGraphMAEEnabled('train');

    if (graph.nodes.size === 0) {
      return { embeddings: new Map(), loss: 0, lossHistory: [], epochs: 0 };
    }

    this.ensureInitialized(graph);

    const originalFeatures = graph.nodes;
    const lossHistory: number[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Generate mask ONCE per epoch (fixed within SPSA steps)
      const { maskedIds } = this.maskNodes(graph);

      // SPSA step with decaying step size and perturbation
      const stepSize = this.config.learningRate / (1 + epoch * 0.1);
      const perturbSize = this.config.learningRate * 0.5 / Math.pow(1 + epoch, 0.101);

      const epochLoss = this.spsaStep(graph, originalFeatures, maskedIds, stepSize, perturbSize);
      lossHistory.push(epochLoss);
    }

    const finalEmbeddings = this.encode(graph);
    return {
      embeddings: finalEmbeddings,
      loss: lossHistory[lossHistory.length - 1],
      lossHistory,
      epochs,
    };
  }

  /** Inference-only: encode the full graph without masking. Returns embeddings. */
  embed(graph: QEGraph): Map<string, Float32Array> {
    assertGraphMAEEnabled('embed');

    if (graph.nodes.size === 0) {
      return new Map();
    }

    return this.encode(graph);
  }

  /** Initialize weight matrices on first use, based on the graph's feature dimension. */
  private ensureInitialized(graph: QEGraph): void {
    const firstNode = graph.nodes.values().next().value;
    if (!firstNode) return;

    const dim = firstNode.length;
    if (this.inputDim === dim && this.headWeights.length > 0) return;

    this.inputDim = dim;
    const { numHeads, embeddingDim } = this.config;
    const headDim = Math.max(1, Math.floor(dim / numHeads));

    this.headWeights = [];
    for (let h = 0; h < numHeads; h++) {
      this.headWeights.push({
        Wq: xavierInit(headDim, dim, this.rng),
        Wk: xavierInit(headDim, dim, this.rng),
      });
    }
    this.Wout = xavierInit(embeddingDim, dim * numHeads, this.rng);
    this.Wdec = xavierInit(dim, embeddingDim, this.rng);
    this.maskToken = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      this.maskToken[i] = (this.rng.nextFloat() * 2 - 1) * 0.1;
    }
  }

  /** Compute reconstruction loss with a pre-determined mask (no re-masking). */
  private computeFixedMaskLoss(
    graph: QEGraph,
    originalFeatures: Map<string, Float32Array>,
    maskedIds: Set<string>
  ): number {
    const maskedNodes = new Map<string, Float32Array>();
    for (const [id, features] of graph.nodes) {
      maskedNodes.set(id, maskedIds.has(id) ? new Float32Array(this.maskToken!) : features);
    }
    const maskedGraph: QEGraph = { nodes: maskedNodes, edges: graph.edges };

    const encodedMasked = this.encode(maskedGraph);
    const decodedMasked = this.decode(encodedMasked);
    return this.reconstructionLoss(originalFeatures, decodedMasked, maskedIds);
  }

  /** Collect all trainable weight arrays for SPSA perturbation. */
  private collectWeightArrays(): Float32Array[] {
    const arrays: Float32Array[] = [];
    for (const head of this.headWeights) {
      arrays.push(head.Wq);
      arrays.push(head.Wk);
    }
    if (this.Wout) arrays.push(this.Wout);
    if (this.Wdec) arrays.push(this.Wdec);
    return arrays;
  }

  /**
   * SPSA gradient-free optimization step (Spall 1992).
   * Perturbs ALL weights simultaneously with random +/-1, evaluates loss at both,
   * estimates gradient, updates weights. 2 forward passes per step regardless of param count.
   */
  private spsaStep(
    graph: QEGraph,
    originalFeatures: Map<string, Float32Array>,
    maskedIds: Set<string>,
    stepSize: number,
    perturbSize: number
  ): number {
    const allWeights = this.collectWeightArrays();

    // Generate random perturbation vector: each element is +1 or -1
    const perturbations: Float32Array[] = allWeights.map((w) => {
      const p = new Float32Array(w.length);
      for (let i = 0; i < w.length; i++) {
        p[i] = this.rng.nextFloat() < 0.5 ? 1 : -1;
      }
      return p;
    });

    // Perturb weights +delta
    for (let k = 0; k < allWeights.length; k++) {
      for (let i = 0; i < allWeights[k].length; i++) {
        allWeights[k][i] += perturbSize * perturbations[k][i];
      }
    }
    const lossPlus = this.computeFixedMaskLoss(graph, originalFeatures, maskedIds);

    // Perturb weights -2*delta (to get -delta from original)
    for (let k = 0; k < allWeights.length; k++) {
      for (let i = 0; i < allWeights[k].length; i++) {
        allWeights[k][i] -= 2 * perturbSize * perturbations[k][i];
      }
    }
    const lossMinus = this.computeFixedMaskLoss(graph, originalFeatures, maskedIds);

    // Restore to original and apply gradient estimate
    for (let k = 0; k < allWeights.length; k++) {
      for (let i = 0; i < allWeights[k].length; i++) {
        allWeights[k][i] += perturbSize * perturbations[k][i]; // restore
        const gradEstimate = (lossPlus - lossMinus) / (2 * perturbSize * perturbations[k][i]);
        allWeights[k][i] -= stepSize * gradEstimate; // gradient descent step
      }
    }

    return (lossPlus + lossMinus) / 2;
  }
}

// Factory

/** Create a GraphMAEEncoder with the given configuration. */
export function createGraphMAEEncoder(
  config?: Partial<GraphMAEConfig>
): GraphMAEEncoder {
  return new GraphMAEEncoder(config);
}
