/**
 * Agentic QE v3 - PageRank Pattern Importance Solver (ADR-087, Milestone 3)
 *
 * Provides graph-based importance scoring for QE patterns using PageRank.
 *
 * Two execution paths:
 * - **Native** (@ruvector/solver-node): O(log n) sublinear via Neumann series.
 *   Requires the optional NAPI dependency to be installed.
 * - **TypeScript fallback**: Standard power iteration, O(n * m * iterations).
 *   Always available, correct results, linear-time.
 *
 * Usage:
 * ```typescript
 * import { createPageRankSolver } from './solver-adapter';
 *
 * const solver = createPageRankSolver({ dampingFactor: 0.85 });
 * const scores = solver.computeImportance(graph);
 * const ranked = solver.rankPatterns(graph);
 * ```
 *
 * @module integrations/ruvector/solver-adapter
 */

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A directed graph of pattern relationships for importance scoring.
 *
 * Nodes represent pattern IDs; edges encode directed relationships
 * (e.g., "pattern A depends on pattern B") with numeric weights.
 */
export interface PatternGraph {
  /** Node IDs (pattern IDs) */
  nodes: string[];
  /** Directed edges: [fromIndex, toIndex, weight] */
  edges: Array<[number, number, number]>;
}

/** Result of importance scoring for a single pattern */
export interface ImportanceScore {
  patternId: string;
  score: number;
  rank: number;
}

/** Configuration for the solver */
export interface SolverConfig {
  /** Damping factor for PageRank (default: 0.85) */
  dampingFactor: number;
  /** Convergence tolerance (default: 1e-6) */
  tolerance: number;
  /** Maximum iterations for power iteration fallback (default: 100) */
  maxIterations: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  dampingFactor: 0.85,
  tolerance: 1e-6,
  maxIterations: 100,
};

// ============================================================================
// Native Module Detection
// ============================================================================

/**
 * Cached reference to the @ruvector/solver-node native module.
 * `null` means we haven't attempted to load yet; `false` means load failed.
 */
let _nativeModule: any | null | false = null;

/**
 * Attempt to load the optional @ruvector/solver-node native bindings.
 * The result is cached so the cost is paid at most once per process.
 */
function tryLoadNativeSync(): boolean {
  if (_nativeModule === false) return false;
  if (_nativeModule != null) return true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _nativeModule = require('@ruvector/solver-node');
    return true;
  } catch {
    _nativeModule = false;
    return false;
  }
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate a PatternGraph, throwing on invalid structure.
 * Returns the number of nodes (N) for convenience.
 */
function validateGraph(graph: PatternGraph): number {
  const n = graph.nodes.length;

  for (const [from, to, weight] of graph.edges) {
    if (from < 0 || from >= n) {
      throw new RangeError(
        `Edge source index ${from} is out of bounds [0, ${n})`,
      );
    }
    if (to < 0 || to >= n) {
      throw new RangeError(
        `Edge target index ${to} is out of bounds [0, ${n})`,
      );
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(
        `Edge weight must be a non-negative finite number, got ${weight}`,
      );
    }
  }

  return n;
}

// ============================================================================
// TypeScript Power-Iteration PageRank
// ============================================================================

/**
 * Compute PageRank scores using the standard power-iteration method.
 *
 * Algorithm (per Wikipedia / original Brin-Page paper):
 *   1. scores[i] = 1 / N  for all i
 *   2. For each iteration:
 *        new[i] = (1 - d) / N
 *                 + d * SUM_{j -> i} ( scores[j] * edgeWeight(j,i) / weightedOutDegree[j] )
 *   3. Converge when max |new[i] - old[i]| < tolerance
 *
 * Self-loops are included in outDegree computation but their contribution
 * flows back to the same node (standard PageRank semantics).
 *
 * Dangling nodes (zero out-degree) distribute their score uniformly to all
 * nodes, matching the standard random-surfer model.
 */
function powerIterationPageRank(
  graph: PatternGraph,
  config: SolverConfig,
): Float64Array {
  const n = graph.nodes.length;
  const { dampingFactor: d, tolerance, maxIterations } = config;

  // Pre-compute weighted out-degree for each node
  const weightedOutDegree = new Float64Array(n);
  for (const [from, , weight] of graph.edges) {
    weightedOutDegree[from] += weight;
  }

  // Build adjacency list for incoming edges: inEdges[toIndex] = [[fromIndex, weight], ...]
  const inEdges: Array<Array<[number, number]>> = new Array(n);
  for (let i = 0; i < n; i++) {
    inEdges[i] = [];
  }
  for (const [from, to, weight] of graph.edges) {
    inEdges[to].push([from, weight]);
  }

  // Identify dangling nodes (no outgoing edges)
  const danglingNodes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (weightedOutDegree[i] === 0) {
      danglingNodes.push(i);
    }
  }

  // Initialize scores uniformly
  let scores = new Float64Array(n);
  const uniformShare = 1 / n;
  scores.fill(uniformShare);

  const base = (1 - d) / n;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Dangling node contribution: their total score is redistributed uniformly
    let danglingSum = 0;
    for (const di of danglingNodes) {
      danglingSum += scores[di];
    }
    const danglingContrib = d * danglingSum / n;

    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let incoming = 0;
      for (const [from, weight] of inEdges[i]) {
        incoming += (scores[from] * weight) / weightedOutDegree[from];
      }
      next[i] = base + d * incoming + danglingContrib;
    }

    // Check convergence (L-infinity norm)
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const delta = Math.abs(next[i] - scores[i]);
      if (delta > maxDelta) maxDelta = delta;
    }

    scores = next;

    if (maxDelta < tolerance) {
      break;
    }
  }

  return scores;
}

// ============================================================================
// PageRankSolver Class
// ============================================================================

/**
 * Computes importance scores for pattern graphs using PageRank.
 *
 * Prefers the native @ruvector/solver-node NAPI bindings when available
 * (O(log n) via Neumann series). Falls back to a TypeScript power-iteration
 * implementation (O(n * m * iterations)) when the native module is absent.
 */
export class PageRankSolver {
  private readonly config: SolverConfig;

  constructor(config?: Partial<SolverConfig>) {
    this.config = { ...DEFAULT_SOLVER_CONFIG, ...config };

    // Validate config ranges
    if (this.config.dampingFactor <= 0 || this.config.dampingFactor >= 1) {
      throw new RangeError('dampingFactor must be in (0, 1)');
    }
    if (this.config.tolerance <= 0) {
      throw new RangeError('tolerance must be positive');
    }
    if (this.config.maxIterations < 1) {
      throw new RangeError('maxIterations must be >= 1');
    }

    // Eagerly attempt native load so isNativeAvailable() is stable
    tryLoadNativeSync();
  }

  /**
   * Check whether the native @ruvector/solver-node module is available.
   */
  isNativeAvailable(): boolean {
    return tryLoadNativeSync();
  }

  /**
   * Compute importance scores for all nodes in a pattern graph.
   *
   * @param graph - The pattern graph to analyze
   * @returns Map from node ID to its importance score (scores sum to ~1.0)
   */
  computeImportance(graph: PatternGraph): Map<string, number> {
    const n = validateGraph(graph);
    const result = new Map<string, number>();

    // Empty graph: nothing to score
    if (n === 0) {
      return result;
    }

    // Single node: trivially 1.0
    if (n === 1) {
      result.set(graph.nodes[0], 1.0);
      return result;
    }

    let scores: Float64Array;

    if (this.isNativeAvailable() && _nativeModule?.pagerank) {
      // Delegate to native solver
      scores = this.computeNative(graph);
    } else {
      // TypeScript power iteration fallback
      scores = powerIterationPageRank(graph, this.config);
    }

    for (let i = 0; i < n; i++) {
      result.set(graph.nodes[i], scores[i]);
    }

    return result;
  }

  /**
   * Rank all patterns in the graph by importance, highest first.
   *
   * @param graph - The pattern graph to analyze
   * @returns Array of ImportanceScore sorted by score descending
   */
  rankPatterns(graph: PatternGraph): ImportanceScore[] {
    const scores = this.computeImportance(graph);

    const ranked: ImportanceScore[] = [];
    for (const [patternId, score] of scores) {
      ranked.push({ patternId, score, rank: 0 });
    }

    // Sort descending by score, stable by patternId for ties
    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.patternId.localeCompare(b.patternId);
    });

    // Assign ranks (1-based)
    for (let i = 0; i < ranked.length; i++) {
      ranked[i].rank = i + 1;
    }

    return ranked;
  }

  // --------------------------------------------------------------------------
  // Private: native solver delegation
  // --------------------------------------------------------------------------

  /**
   * Delegate PageRank computation to the native @ruvector/solver-node module.
   *
   * The native API is expected to accept the graph in a compatible format
   * and return a Float64Array of scores indexed by node position.
   */
  private computeNative(graph: PatternGraph): Float64Array {
    const n = graph.nodes.length;

    // Build edge arrays in the format expected by native solver
    const fromIndices = new Int32Array(graph.edges.length);
    const toIndices = new Int32Array(graph.edges.length);
    const weights = new Float64Array(graph.edges.length);

    for (let i = 0; i < graph.edges.length; i++) {
      fromIndices[i] = graph.edges[i][0];
      toIndices[i] = graph.edges[i][1];
      weights[i] = graph.edges[i][2];
    }

    try {
      const result = _nativeModule.pagerank({
        nodeCount: n,
        fromIndices,
        toIndices,
        weights,
        dampingFactor: this.config.dampingFactor,
        tolerance: this.config.tolerance,
        maxIterations: this.config.maxIterations,
      });

      // Expect Float64Array or plain number[]
      if (result instanceof Float64Array) {
        return result;
      }
      return Float64Array.from(result as number[]);
    } catch {
      // If native call fails, fall back gracefully to TS implementation
      return powerIterationPageRank(graph, this.config);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a PageRankSolver instance with the given configuration.
 *
 * @param config - Partial solver configuration (defaults applied)
 * @returns A configured PageRankSolver
 */
export function createPageRankSolver(
  config?: Partial<SolverConfig>,
): PageRankSolver {
  return new PageRankSolver(config);
}
