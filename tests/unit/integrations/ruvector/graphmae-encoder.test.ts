/**
 * R4: GraphMAE Self-Supervised Graph Learning - Unit Tests
 *
 * Tests masking, encoding, reconstruction loss, training convergence,
 * embedding clustering, determinism, edge cases, and feature flag gating.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GraphMAEEncoder,
  createGraphMAEEncoder,
  type QEGraph,
} from '../../../../src/integrations/ruvector/graphmae-encoder';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

// ============================================================================
// Test Fixtures
// ============================================================================

/** Seeded PRNG for deterministic test fixtures */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Build a synthetic two-cluster graph (10 nodes each, 32-dim features) */
function buildTestGraph(): QEGraph {
  const rand = seededRandom(42);
  const nodes = new Map<string, Float32Array>();
  const edges = new Map<string, string[]>();
  const featureDim = 32;

  // Cluster A: nodes n0..n9 with features biased positive
  for (let i = 0; i < 10; i++) {
    const id = `n${i}`;
    const features = new Float32Array(featureDim);
    for (let d = 0; d < featureDim; d++) {
      features[d] = rand() * 0.5 + 0.5; // range [0.5, 1.0]
    }
    nodes.set(id, features);
  }

  // Cluster B: nodes n10..n19 with features biased negative
  for (let i = 10; i < 20; i++) {
    const id = `n${i}`;
    const features = new Float32Array(featureDim);
    for (let d = 0; d < featureDim; d++) {
      features[d] = rand() * 0.5 - 1.0; // range [-1.0, -0.5]
    }
    nodes.set(id, features);
  }

  // Dense intra-cluster edges (each node connected to 5 within-cluster neighbors)
  for (let i = 0; i < 10; i++) {
    const neighbors: string[] = [];
    for (let j = 0; j < 10; j++) {
      if (j !== i && neighbors.length < 5) neighbors.push(`n${j}`);
    }
    edges.set(`n${i}`, neighbors);
  }
  for (let i = 10; i < 20; i++) {
    const neighbors: string[] = [];
    for (let j = 10; j < 20; j++) {
      if (j !== i && neighbors.length < 5) neighbors.push(`n${j}`);
    }
    edges.set(`n${i}`, neighbors);
  }

  // Sparse inter-cluster edges (only n0-n10 and n4-n14)
  edges.get('n0')!.push('n10');
  edges.get('n10')!.push('n0');
  edges.get('n4')!.push('n14');
  edges.get('n14')!.push('n4');

  return { nodes, edges };
}

/** Cosine similarity helper for test assertions */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================================
// Tests
// ============================================================================

describe('GraphMAEEncoder', () => {
  beforeEach(() => {
    setRuVectorFeatureFlags({ useGraphMAEEmbeddings: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  const testGraph = buildTestGraph();

  // --------------------------------------------------------------------------
  // 1. Masking
  // --------------------------------------------------------------------------

  describe('masking', () => {
    it('masks approximately maskRatio fraction of nodes', () => {
      const encoder = createGraphMAEEncoder({ maskRatio: 0.5 });
      const { maskedIds } = encoder.maskNodes(testGraph);

      // 20 nodes * 0.5 = 10, allow +/- 2 tolerance for small graphs
      expect(maskedIds.size).toBeGreaterThanOrEqual(8);
      expect(maskedIds.size).toBeLessThanOrEqual(12);
    });

    it('masked node features differ from originals', () => {
      const encoder = createGraphMAEEncoder({ maskRatio: 0.5 });
      const { masked, maskedIds } = encoder.maskNodes(testGraph);

      for (const id of maskedIds) {
        const original = testGraph.nodes.get(id)!;
        const maskedFeatures = masked.nodes.get(id)!;
        // Masked features should be the mask token, not the original
        expect(maskedFeatures).not.toEqual(original);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Encoding
  // --------------------------------------------------------------------------

  describe('encoding', () => {
    it('produces embeddingDim-dimensional vectors for all nodes', () => {
      const embeddingDim = 64;
      const encoder = createGraphMAEEncoder({ embeddingDim });
      const embeddings = encoder.encode(testGraph);

      expect(embeddings.size).toBe(testGraph.nodes.size);
      for (const [, vec] of embeddings) {
        expect(vec.length).toBe(embeddingDim);
      }
    });

    it('produces finite values in all embeddings', () => {
      const encoder = createGraphMAEEncoder({ embeddingDim: 32 });
      const embeddings = encoder.encode(testGraph);

      for (const [, vec] of embeddings) {
        for (let i = 0; i < vec.length; i++) {
          expect(Number.isFinite(vec[i])).toBe(true);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2b. Decoding
  // --------------------------------------------------------------------------

  describe('decoding', () => {
    it('produces inputDim-dimensional vectors for all nodes', () => {
      const embeddingDim = 64;
      const encoder = createGraphMAEEncoder({ embeddingDim });
      const embeddings = encoder.encode(testGraph);
      const decoded = encoder.decode(embeddings);

      expect(decoded.size).toBe(testGraph.nodes.size);
      // Decoded vectors should have same dimension as original features (32)
      const originalDim = testGraph.nodes.values().next().value!.length;
      for (const [, vec] of decoded) {
        expect(vec.length).toBe(originalDim);
      }
    });

    it('produces finite values in all decoded vectors', () => {
      const encoder = createGraphMAEEncoder({ embeddingDim: 32 });
      const embeddings = encoder.encode(testGraph);
      const decoded = encoder.decode(embeddings);

      for (const [, vec] of decoded) {
        for (let i = 0; i < vec.length; i++) {
          expect(Number.isFinite(vec[i])).toBe(true);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Reconstruction loss
  // --------------------------------------------------------------------------

  describe('reconstruction loss', () => {
    it('loss is a finite non-negative number', () => {
      const encoder = createGraphMAEEncoder();
      const { masked, maskedIds } = encoder.maskNodes(testGraph);
      const encodedMasked = encoder.encode(masked);
      const decoded = encoder.decode(encodedMasked);

      const loss = encoder.reconstructionLoss(testGraph.nodes, decoded, maskedIds);
      expect(Number.isFinite(loss)).toBe(true);
      expect(loss).toBeGreaterThanOrEqual(0);
    });

    it('loss is 0 when maskedIds is empty', () => {
      const encoder = createGraphMAEEncoder();
      const embeddings = encoder.encode(testGraph);
      const loss = encoder.reconstructionLoss(embeddings, embeddings, new Set());
      expect(loss).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Training convergence
  // --------------------------------------------------------------------------

  describe('training', () => {
    it('loss decreases over training epochs (verified via lossHistory)', () => {
      const encoder = createGraphMAEEncoder({
        embeddingDim: 32,
        maskRatio: 0.3,
        learningRate: 0.01,
        numHeads: 2,
      });

      const result = encoder.train(testGraph, 20);

      expect(result.lossHistory).toBeDefined();
      expect(result.lossHistory.length).toBe(20);

      // First half average should be >= second half average
      const mid = Math.floor(result.lossHistory.length / 2);
      const firstHalf = result.lossHistory.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondHalf = result.lossHistory.slice(mid).reduce((a, b) => a + b, 0) / (result.lossHistory.length - mid);
      expect(secondHalf).toBeLessThanOrEqual(firstHalf);
    });

    it('loss is finite and bounded', () => {
      const encoder = createGraphMAEEncoder({
        embeddingDim: 32,
        maskRatio: 0.3,
        learningRate: 0.001,
        numHeads: 2,
      });

      const result = encoder.train(testGraph, 5);

      expect(Number.isFinite(result.loss)).toBe(true);
      expect(result.loss).toBeGreaterThanOrEqual(0);
      // SCE with gamma=2 is bounded: (1 - cos^2) / 2 in [0, 0.5]
      expect(result.loss).toBeLessThanOrEqual(1);
    });

    it('returns empty result for empty graph', () => {
      const encoder = createGraphMAEEncoder();
      const emptyGraph: QEGraph = { nodes: new Map(), edges: new Map() };
      const result = encoder.train(emptyGraph, 10);

      expect(result.embeddings.size).toBe(0);
      expect(result.loss).toBe(0);
      expect(result.lossHistory).toEqual([]);
      expect(result.epochs).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Embedding clustering
  // --------------------------------------------------------------------------

  describe('embedding clustering', () => {
    it('intra-cluster similarity > inter-cluster similarity', () => {
      const encoder = createGraphMAEEncoder({
        embeddingDim: 64,
        numHeads: 4,
      });
      const embeddings = encoder.embed(testGraph);

      // Average cosine similarity within cluster A
      let intraSum = 0;
      let intraCount = 0;
      for (let i = 0; i < 10; i++) {
        for (let j = i + 1; j < 10; j++) {
          const a = embeddings.get(`n${i}`)!;
          const b = embeddings.get(`n${j}`)!;
          intraSum += cosine(a, b);
          intraCount++;
        }
      }
      const intraSim = intraSum / intraCount;

      // Average cosine similarity between cluster A and cluster B
      let interSum = 0;
      let interCount = 0;
      for (let i = 0; i < 10; i++) {
        for (let j = 10; j < 20; j++) {
          const a = embeddings.get(`n${i}`)!;
          const b = embeddings.get(`n${j}`)!;
          interSum += cosine(a, b);
          interCount++;
        }
      }
      const interSim = interSum / interCount;

      // Nodes in the same cluster should be more similar than across clusters
      expect(intraSim).toBeGreaterThan(interSim);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Determinism
  // --------------------------------------------------------------------------

  describe('determinism', () => {
    it('same graph + config produces same embeddings', () => {
      const config = { embeddingDim: 32, numHeads: 2 };
      const encoder1 = createGraphMAEEncoder(config);
      const encoder2 = createGraphMAEEncoder(config);

      const emb1 = encoder1.embed(testGraph);
      const emb2 = encoder2.embed(testGraph);

      expect(emb1.size).toBe(emb2.size);
      for (const [id, vec1] of emb1) {
        const vec2 = emb2.get(id)!;
        expect(vec1).toEqual(vec2);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 7. Empty graph
  // --------------------------------------------------------------------------

  describe('empty graph', () => {
    it('handles graph with 0 nodes gracefully', () => {
      const encoder = createGraphMAEEncoder();
      const emptyGraph: QEGraph = { nodes: new Map(), edges: new Map() };

      const { maskedIds, masked } = encoder.maskNodes(emptyGraph);
      expect(maskedIds.size).toBe(0);
      expect(masked.nodes.size).toBe(0);

      const embeddings = encoder.embed(emptyGraph);
      expect(embeddings.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Single node
  // --------------------------------------------------------------------------

  describe('single node', () => {
    it('handles graph with 1 node (no neighbors)', () => {
      const encoder = createGraphMAEEncoder({ embeddingDim: 16 });
      const singleGraph: QEGraph = {
        nodes: new Map([['sole', new Float32Array([1, 2, 3, 4])]]),
        edges: new Map([['sole', []]]),
      };

      const embeddings = encoder.embed(singleGraph);
      expect(embeddings.size).toBe(1);
      expect(embeddings.get('sole')!.length).toBe(16);

      // All values should be finite
      for (const v of embeddings.get('sole')!) {
        expect(Number.isFinite(v)).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 9. Feature flag gating
  // --------------------------------------------------------------------------

  describe('feature flag', () => {
    it('throws when useGraphMAEEmbeddings is false', () => {
      setRuVectorFeatureFlags({ useGraphMAEEmbeddings: false });
      const encoder = createGraphMAEEncoder();

      expect(() => encoder.maskNodes(testGraph)).toThrow('GraphMAE is disabled');
      expect(() => encoder.encode(testGraph)).toThrow('GraphMAE is disabled');
      expect(() => encoder.embed(testGraph)).toThrow('GraphMAE is disabled');
      expect(() => encoder.train(testGraph, 5)).toThrow('GraphMAE is disabled');
      expect(() =>
        encoder.reconstructionLoss(new Map(), new Map(), new Set(['x']))
      ).toThrow('GraphMAE is disabled');
    });

    it('works when useGraphMAEEmbeddings is re-enabled', () => {
      setRuVectorFeatureFlags({ useGraphMAEEmbeddings: false });
      const encoder = createGraphMAEEncoder();

      expect(() => encoder.embed(testGraph)).toThrow('GraphMAE is disabled');

      setRuVectorFeatureFlags({ useGraphMAEEmbeddings: true });
      const embeddings = encoder.embed(testGraph);
      expect(embeddings.size).toBe(20);
    });
  });

  // --------------------------------------------------------------------------
  // Scale
  // --------------------------------------------------------------------------

  describe('scale', () => {
    it('produces 128-dim embeddings for a 1K-node graph', () => {
      setRuVectorFeatureFlags({ useGraphMAEEmbeddings: true });
      const encoder = createGraphMAEEncoder({ embeddingDim: 128, numHeads: 4 });

      // Build 1K-node graph with 16-dim features
      const nodes = new Map<string, Float32Array>();
      const edges = new Map<string, string[]>();
      const rand = seededRandom(42);

      for (let i = 0; i < 1000; i++) {
        const features = new Float32Array(16);
        for (let d = 0; d < 16; d++) features[d] = rand() * 2 - 1;
        nodes.set(`n${i}`, features);
        // Connect to 3 random neighbors
        const neighbors: string[] = [];
        for (let j = 0; j < 3; j++) {
          neighbors.push(`n${Math.floor(rand() * 1000)}`);
        }
        edges.set(`n${i}`, neighbors);
      }

      const graph: QEGraph = { nodes, edges };
      const embeddings = encoder.embed(graph);

      expect(embeddings.size).toBe(1000);
      for (const [, vec] of embeddings) {
        expect(vec.length).toBe(128);
        for (const v of vec) expect(Number.isFinite(v)).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('constructor rejects non-positive embeddingDim', () => {
      expect(() => createGraphMAEEncoder({ embeddingDim: 0 })).toThrow('positive');
      expect(() => createGraphMAEEncoder({ embeddingDim: -1 })).toThrow('positive');
    });

    it('constructor rejects maskRatio outside [0, 1]', () => {
      expect(() => createGraphMAEEncoder({ maskRatio: -0.1 })).toThrow('[0, 1]');
      expect(() => createGraphMAEEncoder({ maskRatio: 1.5 })).toThrow('[0, 1]');
    });

    it('factory creates encoder with default config', () => {
      const encoder = createGraphMAEEncoder();
      expect(encoder).toBeInstanceOf(GraphMAEEncoder);
    });
  });
});
