import { MinCutResult, MinCutGraphInput, MinCutConfig, DEFAULT_MINCUT_CONFIG } from './types.js';
import { JsMinCut } from './JsMinCut.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

/**
 * MinCut analyzer using the Stoer-Wagner algorithm.
 *
 * This is a pure JavaScript implementation optimized for code intelligence
 * and fleet topology analysis. The algorithm runs in O(V³) time complexity
 * and O(V²) space complexity.
 *
 * @example
 * ```typescript
 * const analyzer = new MinCutAnalyzer();
 * const result = await analyzer.computeMinCut({
 *   nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
 *   edges: [{ source: 'A', target: 'B', weight: 1.0 }],
 *   directed: false,
 * });
 * console.log('Min cut value:', result.cutValue);
 * console.log('Partitions:', result.partition1, result.partition2);
 * ```
 *
 * @see JsMinCut for the underlying Stoer-Wagner implementation
 */
export class MinCutAnalyzer {
  private config: MinCutConfig;
  private jsMinCut: JsMinCut;

  /**
   * Create a new MinCutAnalyzer
   *
   * @param config - Partial configuration (merged with defaults)
   */
  constructor(config: Partial<MinCutConfig> = {}) {
    this.config = { ...DEFAULT_MINCUT_CONFIG, ...config };
    this.jsMinCut = new JsMinCut();

    logger.info('MinCutAnalyzer initialized (Stoer-Wagner algorithm)', {
      maxNodes: this.config.maxNodes,
      timeout: this.config.timeout,
      normalizeWeights: this.config.normalizeWeights,
    });
  }

  /**
   * Compute the minimum cut of a graph using the Stoer-Wagner algorithm
   *
   * @param graph - Input graph with nodes and edges
   * @returns Promise resolving to MinCutResult
   * @throws Error if graph exceeds maxNodes limit or computation times out
   */
  public async computeMinCut(graph: MinCutGraphInput): Promise<MinCutResult> {
    // Validate graph size
    this.validateGraph(graph);

    // Use Stoer-Wagner JS implementation with timeout protection
    return await this.computeWithTimeout(() =>
      this.computeJS(graph)
    );
  }

  /**
   * Find multiple minimum cuts by iteratively removing cut edges
   *
   * This is useful for identifying alternative module boundaries or
   * finding all equally optimal partitions.
   *
   * @param graph - Input graph
   * @param maxCuts - Maximum number of cuts to find (default: 3)
   * @returns Promise resolving to array of MinCutResults, sorted by cut value
   */
  public async findAllMinCuts(
    graph: MinCutGraphInput,
    maxCuts = 3
  ): Promise<MinCutResult[]> {
    const results: MinCutResult[] = [];
    let workingGraph = this.cloneGraph(graph);

    for (let i = 0; i < maxCuts; i++) {
      try {
        const result = await this.computeMinCut(workingGraph);
        results.push(result);

        // If no cut was found or cut value is infinite, stop
        if (result.cutValue === 0 || result.cutValue === Infinity) {
          break;
        }

        // Remove cut edges for next iteration
        workingGraph = this.removeCutEdges(workingGraph, result.cutEdges);

        // If graph becomes disconnected or empty, stop
        if (workingGraph.edges.length === 0) {
          break;
        }
      } catch (error) {
        logger.warn('Failed to find additional min cut', { iteration: i, error });
        break;
      }
    }

    // Sort by cut value (ascending)
    return results.sort((a, b) => a.cutValue - b.cutValue);
  }

  /**
   * Validate graph constraints
   */
  private validateGraph(graph: MinCutGraphInput): void {
    if (graph.nodes.length > this.config.maxNodes) {
      throw new Error(
        `Graph has ${graph.nodes.length} nodes, exceeding limit of ${this.config.maxNodes}`
      );
    }

    if (graph.nodes.length === 0) {
      throw new Error('Graph must have at least one node');
    }

    // Check for invalid edges
    const nodeIds = new Set(graph.nodes.map(n => n.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) {
        throw new Error(`Edge source '${edge.source}' not found in nodes`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new Error(`Edge target '${edge.target}' not found in nodes`);
      }
      if (edge.weight < 0) {
        throw new Error(`Edge weight must be non-negative, got ${edge.weight}`);
      }
    }
  }

  /**
   * Compute min cut using Stoer-Wagner JS implementation
   */
  private async computeJS(graph: MinCutGraphInput): Promise<MinCutResult> {
    // Run in next tick to allow for async timeout handling
    return new Promise((resolve) => {
      setImmediate(() => {
        const result = this.jsMinCut.computeMinCut(
          graph,
          this.config.normalizeWeights
        );
        resolve(result);
      });
    });
  }

  /**
   * Wrap computation with timeout
   */
  private async computeWithTimeout<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`MinCut computation exceeded timeout of ${this.config.timeout}ms`));
      }, this.config.timeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Clone graph for iterative cut finding
   */
  private cloneGraph(graph: MinCutGraphInput): MinCutGraphInput {
    return {
      nodes: graph.nodes.map(n => ({ ...n })),
      edges: graph.edges.map(e => ({ ...e })),
      directed: graph.directed,
    };
  }

  /**
   * Remove cut edges from graph
   */
  private removeCutEdges(
    graph: MinCutGraphInput,
    cutEdges: Array<{ source: string; target: string }>
  ): MinCutGraphInput {
    const cutSet = new Set(
      cutEdges.map(e => `${e.source}->${e.target}`)
    );

    // Also add reverse direction for undirected graphs
    cutEdges.forEach(e => {
      cutSet.add(`${e.target}->${e.source}`);
    });

    return {
      ...graph,
      edges: graph.edges.filter(e =>
        !cutSet.has(`${e.source}->${e.target}`)
      ),
    };
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<MinCutConfig> {
    return { ...this.config };
  }

  /**
   * Check if native bindings are available.
   *
   * Currently always returns false as the implementation uses
   * pure JavaScript Stoer-Wagner algorithm which is performant
   * for graphs up to ~500 nodes.
   */
  public isNativeAvailable(): boolean {
    return false;
  }

  /**
   * Get algorithm information
   */
  public getAlgorithmInfo(): { name: string; complexity: string; implementation: string } {
    return {
      name: 'Stoer-Wagner',
      complexity: 'O(V³) time, O(V²) space',
      implementation: 'pure-javascript',
    };
  }
}
