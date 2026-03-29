/**
 * Spectral Graph Sparsification (ADR-087, Milestone 3, R9)
 *
 * Spectral graph sparsifier using degree-based leverage score sampling.
 *
 * Compresses weighted undirected graphs while approximately preserving
 * Laplacian spectral properties within a (1 +/- epsilon) factor.
 *
 * Algorithm overview:
 *   1. Approximate leverage scores via degree-based heuristic:
 *      leverage(u,v) ≈ w(u,v) * (1/deg_w(u) + 1/deg_w(v)).
 *      This is a practical O(m) approximation — NOT true effective
 *      resistance (which requires the Laplacian pseudoinverse, O(n^3)).
 *   2. Sample each edge with probability proportional to its leverage
 *      score, scaled to a target edge budget.
 *   3. Rescale surviving edge weights by 1/p_e to keep expectations unbiased.
 *   4. Validate by comparing top-k Laplacian eigenvalues of both graphs.
 *
 * Limitations: The degree-based heuristic can misjudge edges between
 * high-degree nodes (retained when redundant) and low-degree bridges
 * (dropped when structurally important). For production use on critical
 * graphs, upgrade to JL-projected effective resistance or spanning-tree
 * sampling when @ruvector/sparsifier-wasm becomes available.
 *
 * The implementation is fully synchronous --- matrix operations are fast
 * enough in TypeScript for graphs up to ~10K nodes.
 *
 * @module integrations/ruvector/spectral-sparsifier
 */

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A weighted undirected graph for sparsification.
 * Edges are undirected: (a, b, w) and (b, a, w) are the same edge.
 */
export interface SparsifierGraph {
  /** Number of nodes (nodes are labelled 0 .. nodeCount-1) */
  nodeCount: number;
  /** Edges as [nodeA, nodeB, weight] triples (undirected) */
  edges: Array<[number, number, number]>;
}

/**
 * Result of spectral validation comparing original and sparsified graphs.
 */
export interface SpectralValidation {
  /** Whether the sparsified graph is within epsilon bounds */
  isValid: boolean;
  /**
   * Ratio of eigenvalues (sparsified / original) for each of the top-k
   * non-trivial eigenvalues. Valid when all ratios lie in [1-eps, 1+eps].
   */
  eigenvalueRatios: number[];
  /** Number of edges in the original graph */
  originalEdgeCount: number;
  /** Number of edges in the sparsified graph */
  sparsifiedEdgeCount: number;
  /** Compression ratio: sparsifiedEdgeCount / originalEdgeCount */
  compressionRatio: number;
}

/**
 * Configuration for the spectral sparsifier.
 */
export interface SparsifierConfig {
  /**
   * Approximation quality parameter. Lower values preserve spectral
   * properties more faithfully but retain more edges.
   * @default 0.3
   */
  epsilon: number;
  /**
   * Optional seed for the internal PRNG. When provided, sparsification
   * results are fully reproducible.
   */
  seed?: number;
}

// ============================================================================
// Seeded PRNG (Mulberry32)
// ============================================================================

/**
 * Simple 32-bit seeded PRNG (Mulberry32).
 * Returns a function that produces floats in [0, 1).
 */
function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// SpectralSparsifier
// ============================================================================

/**
 * Oversampling constant for the edge budget.
 *
 * Controls the base edge budget as a multiple of (n-1). A value of 2
 * targets roughly 2*(n-1) edges for epsilon near 1 (weak approximation),
 * scaling up as epsilon decreases (stronger approximation keeps more).
 */
const BUDGET_BASE_MULTIPLIER = 2.0;

/** Default number of eigenvalues to compare during validation */
const DEFAULT_VALIDATION_K = 10;

/** Maximum power-iteration steps for eigenvalue computation */
const MAX_POWER_ITER = 200;

/** Convergence tolerance for power iteration */
const POWER_TOL = 1e-8;

/**
 * Spectral graph sparsifier using degree-based leverage score sampling.
 *
 * Compresses a weighted undirected graph while approximately preserving the
 * spectrum of its Laplacian. Uses a degree-based heuristic for leverage
 * scores (not true effective resistance). The approximation quality is
 * controlled by `epsilon`: eigenvalues of the sparsified Laplacian should
 * lie within a (1 +/- epsilon) factor of the original.
 */
export class SpectralSparsifier {
  private readonly epsilon: number;
  private readonly seed: number | undefined;

  constructor(config?: Partial<SparsifierConfig>) {
    this.epsilon = config?.epsilon ?? 0.3;
    this.seed = config?.seed;

    if (this.epsilon <= 0 || this.epsilon >= 1) {
      throw new Error('SparsifierConfig.epsilon must be in (0, 1)');
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Sparsify a graph while preserving spectral properties.
   *
   * @param graph - The input weighted undirected graph
   * @returns A new graph with fewer edges whose Laplacian spectrum
   *          approximates the original within (1 +/- epsilon).
   */
  sparsify(graph: SparsifierGraph): SparsifierGraph {
    if (graph.nodeCount <= 0 || graph.edges.length === 0) {
      return { nodeCount: graph.nodeCount, edges: [] };
    }

    const rng = this.seed !== undefined ? createSeededRng(this.seed) : Math.random;

    // Step 1: compute approximate effective resistances (leverage scores)
    const resistances = this.approximateEffectiveResistances(graph);

    // Step 2: compute raw leverage scores and target edge budget
    const n = graph.nodeCount;
    const m = graph.edges.length;
    const logN = Math.max(1, Math.log(n));
    const eps2 = this.epsilon * this.epsilon;

    // Target = B * (n-1) * (1-eps), clamped to [n-1, m].
    // Higher epsilon => fewer edges; at eps=0.5, target = spanning tree size.
    // For sparse graphs near tree threshold, floor of (n-1) preserves connectivity.
    const targetEdges = Math.min(
      m,
      Math.max(n - 1, BUDGET_BASE_MULTIPLIER * (n - 1) * (1 - this.epsilon))
    );

    // Raw leverage scores: w_e * R_eff(u,v)
    const rawScores = new Float64Array(m);
    let totalScore = 0;
    for (let i = 0; i < m; i++) {
      const w = graph.edges[i][2];
      rawScores[i] = w * resistances[i];
      totalScore += rawScores[i];
    }

    // If total leverage score is zero (degenerate), return empty
    if (totalScore <= 0) {
      return { nodeCount: graph.nodeCount, edges: [] };
    }

    // Step 3: sample edges proportional to leverage scores, scaled to targetEdges
    const sampledEdges: Array<[number, number, number]> = [];

    for (let i = 0; i < m; i++) {
      const [u, v, w] = graph.edges[i];

      const p = Math.min(1, (rawScores[i] / totalScore) * targetEdges);

      if (rng() < p) {
        // Rescale weight to maintain unbiased expectation
        const rescaledWeight = w / p;
        sampledEdges.push([u, v, rescaledWeight]);
      }
    }

    return { nodeCount: graph.nodeCount, edges: sampledEdges };
  }

  /**
   * Validate that a sparsified graph preserves the spectral properties of
   * the original. Compares the top-k non-trivial Laplacian eigenvalues.
   *
   * @param original - The original graph
   * @param sparsified - The sparsified graph
   * @returns Validation result including eigenvalue ratios and compression info
   */
  validateSpectral(
    original: SparsifierGraph,
    sparsified: SparsifierGraph
  ): SpectralValidation {
    const k = Math.min(DEFAULT_VALIDATION_K, Math.max(1, original.nodeCount - 1));

    const origLaplacian = this.computeLaplacian(original);
    const sparsLaplacian = this.computeLaplacian(sparsified);

    const origEigenvalues = this.computeTopEigenvalues(origLaplacian, k);
    const sparsEigenvalues = this.computeTopEigenvalues(sparsLaplacian, k);

    // Compute ratios, skipping near-zero original eigenvalues
    const ratios: number[] = [];
    let allValid = true;
    const eps = this.epsilon;

    for (let i = 0; i < origEigenvalues.length; i++) {
      if (origEigenvalues[i] < 1e-10) {
        // Skip trivial / near-zero eigenvalues
        continue;
      }
      const ratio = sparsEigenvalues[i] / origEigenvalues[i];
      ratios.push(ratio);
      if (ratio < 1 - eps || ratio > 1 + eps) {
        allValid = false;
      }
    }

    return {
      isValid: allValid,
      eigenvalueRatios: ratios,
      originalEdgeCount: original.edges.length,
      sparsifiedEdgeCount: sparsified.edges.length,
      compressionRatio:
        original.edges.length > 0
          ? sparsified.edges.length / original.edges.length
          : 0,
    };
  }

  /**
   * Compute the dense graph Laplacian matrix L = D - W.
   *
   * For weighted undirected graphs, L[i][i] = sum of weights of edges
   * incident to i, and L[i][j] = -w(i,j).
   *
   * @param graph - Input graph
   * @returns n x n Laplacian matrix as number[][]
   */
  computeLaplacian(graph: SparsifierGraph): number[][] {
    const n = graph.nodeCount;
    const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

    for (const [u, v, w] of graph.edges) {
      if (u < 0 || u >= n || v < 0 || v >= n) continue;
      L[u][u] += w;
      L[v][v] += w;
      L[u][v] -= w;
      L[v][u] -= w;
    }

    return L;
  }

  /**
   * Compute the top-k eigenvalues of a symmetric matrix using power
   * iteration with deflation.
   *
   * Eigenvalues are returned in descending order.
   *
   * @param matrix - Symmetric n x n matrix
   * @param k - Number of eigenvalues to compute
   * @returns Array of up to k eigenvalues in descending order
   */
  computeTopEigenvalues(matrix: number[][], k: number): number[] {
    const n = matrix.length;
    if (n === 0) return [];

    const eigenvalues: number[] = [];
    const eigenvectors: number[][] = [];

    // Work on a copy so deflation doesn't mutate the input
    const M = matrix.map(row => [...row]);

    for (let iter = 0; iter < Math.min(k, n); iter++) {
      const result = this.powerIteration(M, n, eigenvectors);
      if (result === null) break;

      eigenvalues.push(result.eigenvalue);
      eigenvectors.push(result.eigenvector);

      // Deflate: M = M - lambda * v * v^T
      deflateMatrix(M, result.eigenvalue, result.eigenvector);
    }

    return eigenvalues;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Approximate effective resistance for every edge using a leverage-score
   * heuristic based on node degrees.
   *
   * For edge (u, v) with weight w:
   *   R_eff(u, v) ~= 1/deg_w(u) + 1/deg_w(v)
   *
   * where deg_w(u) is the weighted degree of u.
   * This is a rough but computationally cheap O(m) approximation that
   * captures the intuition that edges between low-degree nodes have higher
   * effective resistance.
   */
  private approximateEffectiveResistances(graph: SparsifierGraph): number[] {
    const n = graph.nodeCount;
    const weightedDegree = new Float64Array(n);

    // Compute weighted degrees
    for (const [u, v, w] of graph.edges) {
      if (u >= 0 && u < n) weightedDegree[u] += w;
      if (v >= 0 && v < n) weightedDegree[v] += w;
    }

    // Approximate effective resistance per edge
    const resistances: number[] = new Array(graph.edges.length);
    for (let i = 0; i < graph.edges.length; i++) {
      const [u, v] = graph.edges[i];
      const degU = weightedDegree[u] || 1;
      const degV = weightedDegree[v] || 1;
      resistances[i] = 1 / degU + 1 / degV;
    }

    return resistances;
  }

  /**
   * Single round of power iteration to find the dominant eigenvalue/vector,
   * deflating away previously found eigenvectors.
   *
   * Uses a deterministic but well-spread initial vector and handles
   * near-zero eigenvalues by checking the matrix's remaining Frobenius norm.
   */
  private powerIteration(
    M: number[][],
    n: number,
    previousEigenvectors: number[][]
  ): { eigenvalue: number; eigenvector: number[] } | null {
    // Check if the matrix still has significant entries (Frobenius norm)
    let frobSq = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        frobSq += M[i][j] * M[i][j];
      }
    }
    if (frobSq < POWER_TOL * POWER_TOL) return null;

    // Deterministic but well-spread initial vector
    // Use a different pattern for each deflation round to avoid
    // starting in the null-space of the deflated matrix
    const round = previousEigenvectors.length;
    let v = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      v[i] = Math.sin((i + 1) * (round + 1) * 1.618033988749895) + 0.1 * (i - n / 2);
    }

    // Deflate against previously found eigenvectors
    for (const prev of previousEigenvectors) {
      deflateVector(v, prev);
    }
    const initNorm = normalizeVector(v);
    if (initNorm < POWER_TOL) return null;

    let eigenvalue = 0;

    for (let iter = 0; iter < MAX_POWER_ITER; iter++) {
      // w = M * v
      const w = matVecMul(M, v);

      // Deflate against previous eigenvectors
      for (const prev of previousEigenvectors) {
        deflateVector(w, prev);
      }

      const newEigen = dotProduct(w, v);
      const norm = vectorNorm(w);

      if (norm < POWER_TOL) {
        // The vector collapsed: eigenvalue is effectively 0
        return { eigenvalue: 0, eigenvector: v };
      }

      // Normalize
      for (let i = 0; i < n; i++) v[i] = w[i] / norm;

      if (Math.abs(newEigen - eigenvalue) < POWER_TOL) {
        eigenvalue = newEigen;
        break;
      }
      eigenvalue = newEigen;
    }

    return { eigenvalue: Math.abs(eigenvalue), eigenvector: v };
  }
}

// ============================================================================
// Linear Algebra Helpers (module-private)
// ============================================================================

/** Matrix-vector multiplication: result = M * v */
function matVecMul(M: number[][], v: number[]): number[] {
  const n = M.length;
  const result = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += M[i][j] * v[j];
    }
    result[i] = sum;
  }
  return result;
}

/** L2 norm of a vector */
function vectorNorm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

/** Normalize a vector in-place. Returns the norm before normalization. */
function normalizeVector(v: number[]): number {
  const norm = vectorNorm(v);
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i] /= norm;
  }
  return norm;
}

/** Dot product of two vectors */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Remove the component of v along the direction of u (projection).
 * v = v - (v . u) * u
 * Assumes u is normalised.
 */
function deflateVector(v: number[], u: number[]): void {
  const dot = dotProduct(v, u);
  for (let i = 0; i < v.length; i++) v[i] -= dot * u[i];
}

/**
 * Deflate a matrix: M = M - lambda * v * v^T
 * Used after extracting an eigenvalue to remove its contribution.
 */
function deflateMatrix(M: number[][], lambda: number, v: number[]): void {
  const n = v.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      M[i][j] -= lambda * v[i] * v[j];
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a spectral sparsifier with the given configuration.
 *
 * @param config - Optional partial configuration
 * @returns A new SpectralSparsifier instance
 */
export function createSpectralSparsifier(
  config?: Partial<SparsifierConfig>
): SpectralSparsifier {
  return new SpectralSparsifier(config);
}
