/**
 * K-Means Clustering and Embedding Utilities (Task 4.6)
 *
 * Provides K-Means clustering with K-Means++ initialization and
 * deterministic pseudo-embedding generation for patterns without
 * pre-computed vectors.
 *
 * @module integrations/browser/qe-dashboard/clustering
 */

import { cosineSimilarity } from './wasm-vector-store.js';

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Dimension for auto-generated embeddings.
 * Kept small (32) for efficiency in browser contexts.
 */
export const EMBEDDING_DIM = 32;

/** Minimal pattern shape needed for embedding generation */
export interface EmbeddablePattern {
  domain: string;
  description: string;
  tags?: string[];
}

/**
 * Generate a deterministic pseudo-embedding from a pattern's text content.
 *
 * Uses a simple hash-based approach to produce a stable vector from the
 * pattern's description and domain. This is a fallback when no real
 * embedding model is available.
 *
 * @param pattern - The pattern to embed
 * @returns Float32Array embedding of length EMBEDDING_DIM
 */
export function generateEmbedding(pattern: EmbeddablePattern): Float32Array {
  const text = `${pattern.domain} ${pattern.description} ${(pattern.tags || []).join(' ')}`;
  const embedding = new Float32Array(EMBEDDING_DIM);

  // Simple deterministic hash-based embedding
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const idx = i % EMBEDDING_DIM;
    // Mix character codes using a simple multiplicative hash
    embedding[idx] += Math.sin(charCode * (i + 1) * 0.1) * 0.5;
  }

  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < embedding.length; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

/**
 * Generate a query embedding from a text string
 */
export function generateQueryEmbedding(query: string): Float32Array {
  return generateEmbedding({
    domain: '',
    description: query,
  });
}

// ============================================================================
// K-Means Clustering
// ============================================================================

/**
 * K-Means clustering for Float32Array vectors.
 *
 * Uses K-Means++ initialization for better centroid placement,
 * then iterates until convergence or maxIter is reached.
 *
 * @param vectors - Array of vectors to cluster
 * @param k - Number of clusters
 * @param maxIter - Maximum iterations (default: 50)
 * @returns Array of cluster assignments (index per vector)
 */
export function kMeansClustering(
  vectors: Float32Array[],
  k: number,
  maxIter: number = 50,
): number[] {
  if (vectors.length === 0 || k <= 0) {
    return [];
  }

  const n = vectors.length;
  const clampedK = Math.min(k, n);
  const dim = vectors[0].length;

  // K-Means++ initialization
  const centroids = initializeCentroids(vectors, clampedK);
  const assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // Assignment step: assign each vector to the nearest centroid
    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestSim = -Infinity;

      for (let c = 0; c < clampedK; c++) {
        const sim = cosineSimilarity(vectors[i], centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          bestCluster = c;
        }
      }

      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    // Convergence check
    if (!changed) {
      break;
    }

    // Update step: recompute centroids
    for (let c = 0; c < clampedK; c++) {
      const newCentroid = new Float32Array(dim);
      let count = 0;

      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          for (let d = 0; d < dim; d++) {
            newCentroid[d] += vectors[i][d];
          }
          count++;
        }
      }

      if (count > 0) {
        for (let d = 0; d < dim; d++) {
          newCentroid[d] /= count;
        }
        // Normalize centroid
        let norm = 0;
        for (let d = 0; d < dim; d++) {
          norm += newCentroid[d] * newCentroid[d];
        }
        norm = Math.sqrt(norm);
        if (norm > 0) {
          for (let d = 0; d < dim; d++) {
            newCentroid[d] /= norm;
          }
        }
        centroids[c] = newCentroid;
      }
    }
  }

  return assignments;
}

/**
 * K-Means++ initialization: select initial centroids with probability
 * proportional to squared distance from nearest existing centroid.
 */
function initializeCentroids(
  vectors: Float32Array[],
  k: number,
): Float32Array[] {
  const n = vectors.length;
  const centroids: Float32Array[] = [];

  // Pick first centroid (deterministic: use first vector)
  centroids.push(new Float32Array(vectors[0]));

  for (let c = 1; c < k; c++) {
    // Compute distances to nearest centroid
    const distances = new Float64Array(n);
    let totalDist = 0;

    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const sim = cosineSimilarity(vectors[i], centroid);
        const dist = 1 - sim;
        if (dist < minDist) {
          minDist = dist;
        }
      }
      distances[i] = minDist * minDist; // Squared distance
      totalDist += distances[i];
    }

    if (totalDist === 0) {
      // All points identical to existing centroids; pick sequentially
      centroids.push(new Float32Array(vectors[c % n]));
      continue;
    }

    // Deterministic selection: pick the point with maximum distance
    let maxIdx = 0;
    let maxDist = -1;
    for (let i = 0; i < n; i++) {
      if (distances[i] > maxDist) {
        maxDist = distances[i];
        maxIdx = i;
      }
    }
    centroids.push(new Float32Array(vectors[maxIdx]));
  }

  return centroids;
}
