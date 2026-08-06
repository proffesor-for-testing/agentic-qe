/**
 * Agentic QE v3 - PageRank Pattern Importance Solver (ADR-087, Milestone 3)
 *
 * Provides graph-based importance scoring for QE patterns using PageRank.
 *
 * Two execution paths:
 * - **Async**: optional @ruvector/solver NAPI backend, then worker-thread
 *   TypeScript fallback for large graphs.
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

import {
  computeTypeScriptPageRank,
  loadNativeSolverModule,
  runNativePageRank,
  runPageRankWorker,
  type AsyncPageRankRunner,
  type NativeSolverModule,
  type PatternGraph,
  type SolverConfig,
} from './page-rank-backends.js';

export type { PatternGraph, SolverConfig } from './page-rank-backends.js';

/**
 * A directed graph of pattern relationships for importance scoring.
 *
 * Nodes represent pattern IDs; edges encode directed relationships
 * (e.g., "pattern A depends on pattern B") with numeric weights.
 */
/** Result of importance scoring for a single pattern */
export interface ImportanceScore {
  patternId: string;
  score: number;
  rank: number;
}

export interface PageRankRuntimeOptions {
  /** Minimum nodes + edges before using a worker (default: 50,000). */
  workerThreshold: number;
  /** Worker timeout before synchronous fallback (default: 30 seconds). */
  workerTimeoutMs: number;
  /** Dependency-injection seam for tests and alternative worker runners. */
  workerRunner: AsyncPageRankRunner;
  /** Override native discovery; null explicitly disables the native backend. */
  nativeModule?: NativeSolverModule | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  dampingFactor: 0.85,
  tolerance: 1e-6,
  maxIterations: 100,
};

const DEFAULT_RUNTIME_OPTIONS: Omit<PageRankRuntimeOptions, 'nativeModule'> = {
  workerThreshold: 50_000,
  workerTimeoutMs: 30_000,
  workerRunner: runPageRankWorker,
};

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
// PageRankSolver Class
// ============================================================================

/**
 * Computes importance scores for pattern graphs using PageRank.
 *
 * The synchronous API uses the deterministic TypeScript implementation.
 * The async API prefers @ruvector/solver and offloads large fallback graphs.
 */
export class PageRankSolver {
  private readonly config: SolverConfig;
  private readonly runtime: PageRankRuntimeOptions;
  private readonly nativeModule: NativeSolverModule | null;

  constructor(
    config?: Partial<SolverConfig>,
    runtime?: Partial<PageRankRuntimeOptions>,
  ) {
    this.config = { ...DEFAULT_SOLVER_CONFIG, ...config };
    this.runtime = { ...DEFAULT_RUNTIME_OPTIONS, ...runtime };
    this.nativeModule = runtime && 'nativeModule' in runtime
      ? runtime.nativeModule ?? null
      : loadNativeSolverModule();

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

    if (this.runtime.workerThreshold < 0) {
      throw new RangeError('workerThreshold must be >= 0');
    }
    if (this.runtime.workerTimeoutMs < 1) {
      throw new RangeError('workerTimeoutMs must be >= 1');
    }
  }

  /**
   * Check whether the native @ruvector/solver module is available.
   */
  isNativeAvailable(): boolean {
    return this.nativeModule !== null;
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

    const scores = computeTypeScriptPageRank(graph, this.config);
    this.copyScoresToResult(graph, scores, result);

    return result;
  }

  /**
   * Compute PageRank without blocking the event loop for large graphs.
   * Native and worker failures fall back to the verified synchronous backend.
   */
  async computeImportanceAsync(graph: PatternGraph): Promise<Map<string, number>> {
    const n = validateGraph(graph);
    if (n < 2) return this.computeImportance(graph);

    let scores: Float64Array;
    try {
      if (this.nativeModule) {
        scores = await runNativePageRank(this.nativeModule, graph, this.config);
      } else if (graph.nodes.length + graph.edges.length >= this.runtime.workerThreshold) {
        scores = await this.runtime.workerRunner(
          graph,
          this.config,
          this.runtime.workerTimeoutMs,
        );
      } else {
        scores = computeTypeScriptPageRank(graph, this.config);
      }
    } catch {
      scores = computeTypeScriptPageRank(graph, this.config);
    }

    const result = new Map<string, number>();
    this.copyScoresToResult(graph, scores, result);
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

  private copyScoresToResult(
    graph: PatternGraph,
    scores: Float64Array,
    result: Map<string, number>,
  ): void {
    for (let i = 0; i < graph.nodes.length; i++) {
      result.set(graph.nodes[i], scores[i]);
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
  runtime?: Partial<PageRankRuntimeOptions>,
): PageRankSolver {
  return new PageRankSolver(config, runtime);
}
