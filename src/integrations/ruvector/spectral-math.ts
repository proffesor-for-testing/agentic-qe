/**
 * Spectral Graph Theory Utilities
 *
 * Mathematical primitives for spectral analysis of graph structures.
 * Provides Laplacian construction, power-iteration eigenvalue approximation,
 * effective resistance estimation, and coherence scoring.
 *
 * These utilities are used by the HNSW Health Monitor to assess the
 * structural health of HNSW index graphs without requiring native
 * ruvector-coherence.
 *
 * @module integrations/ruvector/spectral-math
 */

// ============================================================================
// Laplacian Construction
// ============================================================================

/**
 * Build the graph Laplacian from an adjacency list.
 * L = D - A where D is the degree matrix and A is the adjacency matrix.
 *
 * Returns the Laplacian as a dense matrix (suitable for small graphs).
 * For large graphs, we use the adjacency list directly with power iteration.
 */
export function buildLaplacian(
  adjacency: number[][],
  n: number
): Float64Array[] {
  const L: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));

  for (let i = 0; i < n; i++) {
    const degree = adjacency[i].length;
    L[i][i] = degree; // Diagonal = degree
    for (const j of adjacency[i]) {
      L[i][j] = -1; // Off-diagonal = -1 for each edge
    }
  }

  return L;
}

// ============================================================================
// Linear Algebra Helpers
// ============================================================================

/**
 * Multiply Laplacian (in adjacency list form) by a vector.
 * L * v = D*v - A*v
 * This avoids materializing the full Laplacian matrix.
 */
export function laplacianMultiply(
  adjacency: number[][],
  v: Float64Array
): Float64Array {
  const n = v.length;
  const result = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const degree = adjacency[i].length;
    result[i] = degree * v[i]; // D * v
    for (const j of adjacency[i]) {
      result[i] -= v[j]; // -A * v
    }
  }

  return result;
}

/**
 * Compute the L2 norm of a vector.
 */
export function vectorNorm(v: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

/**
 * Normalize a vector in-place.
 */
export function normalizeInPlace(v: Float64Array): void {
  const norm = vectorNorm(v);
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i] /= norm;
  }
}

/**
 * Remove the component of v along the direction of u (projection).
 * v = v - (v . u) * u
 * Assumes u is normalized.
 */
export function deflateVector(v: Float64Array, u: Float64Array): void {
  let dot = 0;
  for (let i = 0; i < v.length; i++) dot += v[i] * u[i];
  for (let i = 0; i < v.length; i++) v[i] -= dot * u[i];
}

// ============================================================================
// Eigenvalue Approximation
// ============================================================================

/**
 * Approximate the Fiedler value (second smallest eigenvalue of L)
 * using power iteration on L with deflation of the trivial eigenvector.
 *
 * The trivial eigenvector of L is the all-ones vector (eigenvalue = 0).
 * We deflate it out and use power iteration to find the smallest
 * non-trivial eigenvalue.
 *
 * Since power iteration finds the LARGEST eigenvalue, we use the shift-
 * invert approach: we run power iteration on (lambda_max * I - L) to
 * find the second smallest eigenvalue of L.
 *
 * @param adjacency - Adjacency list
 * @param n - Number of nodes
 * @param maxIter - Maximum iterations
 * @param tol - Convergence tolerance
 * @returns Approximate Fiedler value
 */
export function approximateFiedlerValue(
  adjacency: number[][],
  n: number,
  maxIter: number = 100,
  tol: number = 1e-6
): number {
  if (n <= 1) return 0;
  if (n === 2) {
    // For 2 nodes: Fiedler = number of edges between them
    return adjacency[0].includes(1) ? 2 : 0;
  }

  // The trivial eigenvector of L: normalized all-ones
  const trivial = new Float64Array(n).fill(1 / Math.sqrt(n));

  // First, estimate lambda_max using a few power iterations on L
  let maxVec = new Float64Array(n);
  for (let i = 0; i < n; i++) maxVec[i] = Math.random() - 0.5;
  deflateVector(maxVec, trivial);
  normalizeInPlace(maxVec);

  let lambdaMax = 0;
  for (let iter = 0; iter < 30; iter++) {
    const Lv = laplacianMultiply(adjacency, maxVec);
    deflateVector(Lv, trivial);
    lambdaMax = vectorNorm(Lv);
    if (lambdaMax > 0) {
      for (let i = 0; i < n; i++) maxVec[i] = Lv[i] / lambdaMax;
    }
  }

  if (lambdaMax < tol) return 0; // Disconnected or trivial graph

  // Now use power iteration on (lambdaMax * I - L) to find the
  // eigenvector corresponding to the LARGEST eigenvalue of (lambdaMax*I - L),
  // which corresponds to the SMALLEST non-trivial eigenvalue of L.
  let v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.random() - 0.5;
  deflateVector(v, trivial);
  normalizeInPlace(v);

  let eigenvalue = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    // Compute (lambdaMax * I - L) * v = lambdaMax * v - L * v
    const Lv = laplacianMultiply(adjacency, v);
    const shifted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      shifted[i] = lambdaMax * v[i] - Lv[i];
    }

    // Deflate the trivial eigenvector
    deflateVector(shifted, trivial);

    const norm = vectorNorm(shifted);
    if (norm < tol) break;

    const newEigenvalue = norm;
    for (let i = 0; i < n; i++) v[i] = shifted[i] / norm;

    if (Math.abs(newEigenvalue - eigenvalue) < tol) break;
    eigenvalue = newEigenvalue;
  }

  // The Fiedler value is lambdaMax - eigenvalue of (lambdaMax*I - L)
  const fiedler = lambdaMax - eigenvalue;
  return Math.max(0, fiedler);
}

/**
 * Estimate the spectral gap: difference between the second smallest
 * and smallest eigenvalues of the Laplacian.
 *
 * For a connected graph, the smallest eigenvalue is 0, so the spectral
 * gap equals the Fiedler value.
 */
export function approximateSpectralGap(
  adjacency: number[][],
  n: number,
  maxIter: number = 100,
  tol: number = 1e-6
): number {
  // For the Laplacian, lambda_1 = 0 always (connected or not)
  // So spectral gap = lambda_2 - lambda_1 = Fiedler value
  return approximateFiedlerValue(adjacency, n, maxIter, tol);
}

// ============================================================================
// Effective Resistance
// ============================================================================

/**
 * Estimate the average effective resistance between sampled node pairs.
 *
 * Effective resistance between nodes i and j is:
 *   R_ij = (e_i - e_j)^T * L^+ * (e_i - e_j)
 * where L^+ is the pseudo-inverse of the Laplacian.
 *
 * We approximate this by using the spectral decomposition:
 *   R_ij = sum_{k>=2} (1/lambda_k) * (v_k[i] - v_k[j])^2
 *
 * For a lightweight check, we approximate using only the Fiedler eigenvector
 * and value, which gives the dominant contribution.
 *
 * @param adjacency - Adjacency list
 * @param n - Number of nodes
 * @param sampleSize - Number of pairs to sample
 * @param fiedlerValue - Pre-computed Fiedler value (pass to avoid recomputation)
 * @returns Average effective resistance estimate
 */
export function estimateEffectiveResistance(
  adjacency: number[][],
  n: number,
  sampleSize: number = 50,
  fiedlerValue?: number
): number {
  if (n <= 1) return 0;

  const fiedler = fiedlerValue ?? approximateFiedlerValue(adjacency, n);
  if (fiedler < 1e-10) return Infinity; // Disconnected graph

  // For a well-connected graph with Fiedler value lambda_2,
  // the average effective resistance is approximately n / (n * lambda_2)
  // = 1 / lambda_2 for a regular graph.
  // For a more accurate estimate, we use the trace formula:
  //   sum of all R_ij = n * sum_{k>=2} 1/lambda_k
  // We approximate by assuming eigenvalues are distributed uniformly
  // between lambda_2 and lambda_max ~ 2 * max_degree.

  const maxDeg = Math.max(...adjacency.map(a => a.length), 1);
  const lambdaMax = 2 * maxDeg;

  // Approximate: eigenvalues roughly uniform in [fiedler, lambdaMax]
  // Average 1/lambda over this range:
  // integral from fiedler to lambdaMax of (1/x) dx / (lambdaMax - fiedler)
  // = ln(lambdaMax/fiedler) / (lambdaMax - fiedler)
  const avgInvLambda = Math.log(lambdaMax / fiedler) / (lambdaMax - fiedler);

  // Average resistance over random pairs is approximately:
  // 2 * avgInvLambda (two endpoints contribute)
  const avgResistance = 2 * avgInvLambda;

  return Math.max(0, avgResistance);
}

// ============================================================================
// Coherence Score
// ============================================================================

/**
 * Compute a combined coherence score from spectral metrics.
 *
 * Combines Fiedler value, spectral gap, and effective resistance into
 * a single 0-1 score where 1 = perfectly healthy and 0 = critically unhealthy.
 *
 * @param fiedler - Fiedler value
 * @param spectralGap - Spectral gap
 * @param resistance - Average effective resistance
 * @returns Coherence score in [0, 1]
 */
export function computeCoherenceScore(
  fiedler: number,
  spectralGap: number,
  resistance: number
): number {
  // Fiedler component: sigmoid-like scaling
  // Score approaches 1 when fiedler >> threshold, 0 when fiedler << threshold
  const fiedlerScore = 1 - Math.exp(-fiedler / 0.05);

  // Spectral gap component
  const gapScore = 1 - Math.exp(-spectralGap / 0.5);

  // Resistance component: lower resistance = healthier
  // Use inverse scaling: score = 1 / (1 + resistance/threshold)
  const resistanceScore = resistance === Infinity
    ? 0
    : 1 / (1 + resistance / 5.0);

  // Weighted combination
  const score = 0.4 * fiedlerScore + 0.3 * gapScore + 0.3 * resistanceScore;

  return Math.max(0, Math.min(1, score));
}
