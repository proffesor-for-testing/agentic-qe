/**
 * Agentic QE v3 - Spectral Engine Adapter
 *
 * Wraps the Prime Radiant SpectralEngine for spectral graph analysis.
 * Used for predicting swarm collapse through Fiedler value analysis.
 *
 * Fiedler Value (Spectral Gap):
 * The second-smallest eigenvalue of the Laplacian matrix.
 * Low values indicate:
 * - Weak connectivity
 * - Potential for network fragmentation
 * - False consensus risk
 *
 * @module integrations/coherence/engines/spectral-adapter
 */

import type {
  SwarmState,
  AgentHealth,
  CollapseRisk,
  ISpectralEngine,
  IRawSpectralEngine,
  IWasmLoader,
  CoherenceLogger,
} from '../types';
import { WasmNotLoadedError, DEFAULT_COHERENCE_LOGGER } from '../types';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// WASM Engine Wrapper
// ============================================================================

/**
 * Creates an ISpectralEngine wrapper around the raw WASM engine
 *
 * IMPORTANT: WASM expects numeric node IDs (usize), so we maintain
 * a bidirectional mapping between string IDs and numeric indices.
 */
function createSpectralEngineWrapper(rawEngine: IRawSpectralEngine): ISpectralEngine {
  const nodes = new Set<string>();
  const edges: Array<{ source: string; target: string; weight: number }> = [];

  // Bidirectional mapping: string ID <-> numeric index
  // WASM expects usize (unsigned integer) for node IDs
  const stringToIndex = new Map<string, number>();
  const indexToString = new Map<number, string>();
  let nextIndex = 0;

  // Get or create numeric index for a string ID
  const getOrCreateIndex = (id: string): number => {
    let idx = stringToIndex.get(id);
    if (idx === undefined) {
      idx = nextIndex++;
      stringToIndex.set(id, idx);
      indexToString.set(idx, id);
    }
    return idx;
  };

  // Get string ID from numeric index
  const getStringId = (idx: number): string => {
    return indexToString.get(idx) ?? `unknown-${idx}`;
  };

  // Build graph representation for WASM calls using numeric IDs
  // WASM SpectralEngine expects:
  // - n: number of nodes
  // - edges: array of TUPLES [source, target, weight]
  const buildGraph = (): unknown => ({
    n: nodes.size,  // Number of nodes
    edges: edges.map(e => [
      getOrCreateIndex(e.source),  // source as numeric index
      getOrCreateIndex(e.target),  // target as numeric index
      e.weight,                     // weight
    ]),
  });

  return {
    add_node(id: string): void {
      nodes.add(id);
      getOrCreateIndex(id); // Pre-register the ID
    },

    add_edge(source: string, target: string, weight: number): void {
      edges.push({ source, target, weight });
      // Pre-register edge endpoint IDs
      getOrCreateIndex(source);
      getOrCreateIndex(target);
    },

    remove_node(id: string): void {
      nodes.delete(id);
      // Note: We don't remove from index mappings to maintain consistency
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].source === id || edges[i].target === id) {
          edges.splice(i, 1);
        }
      }
    },

    compute_fiedler_value(): number {
      // Edge case: need at least 2 nodes and 1 edge for meaningful Fiedler value
      if (nodes.size < 2) {
        return 0; // Trivial or empty graph
      }
      if (edges.length === 0) {
        return 0; // Disconnected graph - Fiedler value is 0
      }

      try {
        const graph = buildGraph();
        const fiedler = rawEngine.algebraicConnectivity(graph);
        // Ensure valid return (some WASM versions may return NaN or negative)
        return Number.isFinite(fiedler) && fiedler >= 0 ? fiedler : 0;
      } catch (error) {
        // WASM error - return 0 (disconnected/unstable)
        console.warn('[SpectralAdapter] algebraicConnectivity failed:', error);
        return 0;
      }
    },

    predict_collapse_risk(): number {
      // Edge case: need at least 2 nodes and 1 edge for meaningful analysis
      if (nodes.size < 2) {
        return 0; // Trivial graph - no collapse possible
      }
      if (edges.length === 0) {
        return 1; // Completely disconnected - maximum collapse risk
      }

      try {
        const graph = buildGraph();
        const fiedler = rawEngine.algebraicConnectivity(graph);
        // Lower Fiedler value = higher collapse risk
        const validFiedler = Number.isFinite(fiedler) && fiedler >= 0 ? fiedler : 0;
        return Math.max(0, Math.min(1, 1 - validFiedler));
      } catch (error) {
        // WASM error - assume high risk
        console.warn('[SpectralAdapter] predict_collapse_risk failed:', error);
        return 0.8; // High but not maximum risk
      }
    },

    get_weak_vertices(count: number): string[] {
      // Edge case: empty graph
      if (nodes.size === 0) {
        return [];
      }
      if (edges.length === 0) {
        // No edges - all nodes are equally "weak"
        return Array.from(nodes).slice(0, count);
      }

      try {
        const graph = buildGraph();
        const minCut = rawEngine.predictMinCut(graph) as { vertices?: number[] } | null;
        if (!minCut?.vertices) return Array.from(nodes).slice(0, count);
        // Convert numeric indices back to string IDs
        return minCut.vertices.slice(0, count).map(idx => getStringId(idx));
      } catch (error) {
        // WASM error - return first N nodes
        console.warn('[SpectralAdapter] predictMinCut failed:', error);
        return Array.from(nodes).slice(0, count);
      }
    },

    clear(): void {
      nodes.clear();
      edges.length = 0;
      stringToIndex.clear();
      indexToString.clear();
      nextIndex = 0;
    },
  };
}

// ============================================================================
// Spectral Adapter Interface
// ============================================================================

/**
 * Interface for the spectral adapter
 */
export interface ISpectralAdapter {
  /** Initialize the adapter */
  initialize(): Promise<void>;
  /** Check if initialized */
  isInitialized(): boolean;
  /** Add a node (agent) to the graph */
  addNode(nodeId: string): void;
  /** Add an edge (relationship) between nodes */
  addEdge(source: string, target: string, weight: number): void;
  /** Remove a node */
  removeNode(nodeId: string): void;
  /** Compute the Fiedler value */
  computeFiedlerValue(): number;
  /** Predict collapse risk */
  predictCollapseRisk(): number;
  /** Get weak vertices (at-risk nodes) */
  getWeakVertices(count: number): string[];
  /** Analyze swarm state for collapse risk */
  analyzeSwarmState(state: SwarmState): CollapseRisk;
  /** Clear the graph */
  clear(): void;
  /** Dispose of resources */
  dispose(): void;
}

// ============================================================================
// Spectral Adapter Implementation
// ============================================================================

/**
 * Adapter for the Prime Radiant SpectralEngine
 *
 * Provides spectral graph analysis for predicting swarm collapse
 * and identifying weak points in the agent network.
 *
 * @example
 * ```typescript
 * const adapter = new SpectralAdapter(wasmLoader, logger);
 * await adapter.initialize();
 *
 * adapter.addNode('agent-1');
 * adapter.addNode('agent-2');
 * adapter.addEdge('agent-1', 'agent-2', 1.0);
 *
 * const fiedlerValue = adapter.computeFiedlerValue();
 * const collapseRisk = adapter.predictCollapseRisk();
 * const weakAgents = adapter.getWeakVertices(3);
 * ```
 */
export class SpectralAdapter implements ISpectralAdapter {
  private engine: ISpectralEngine | null = null;
  private initialized = false;
  private readonly nodes = new Set<string>();
  private readonly edges: Array<{ source: string; target: string; weight: number }> = [];

  /**
   * Create a new SpectralAdapter
   *
   * @param wasmLoader - WASM module loader
   * @param logger - Optional logger for diagnostics
   */
  constructor(
    private readonly wasmLoader: IWasmLoader,
    private readonly logger: CoherenceLogger = DEFAULT_COHERENCE_LOGGER
  ) {}

  /**
   * Initialize the adapter by loading the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.debug('Initializing SpectralAdapter');

    const isAvailable = await this.wasmLoader.isAvailable();
    if (!isAvailable) {
      throw new WasmNotLoadedError(
        'WASM module is not available. Cannot initialize SpectralAdapter.'
      );
    }

    const module = await this.wasmLoader.load();
    // Create wrapper around raw WASM engine
    const rawEngine = new module.SpectralEngine();
    this.engine = createSpectralEngineWrapper(rawEngine);
    this.initialized = true;

    this.logger.info('SpectralAdapter initialized successfully');
  }

  /**
   * Check if the adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the adapter is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.engine) {
      throw new WasmNotLoadedError(
        'SpectralAdapter not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Add a node (agent) to the spectral graph
   *
   * @param nodeId - Unique identifier for the node
   */
  addNode(nodeId: string): void {
    this.ensureInitialized();

    if (this.nodes.has(nodeId)) {
      this.logger.debug('Node already exists', { nodeId });
      return;
    }

    this.nodes.add(nodeId);
    this.engine!.add_node(nodeId);

    this.logger.debug('Added node to spectral graph', { nodeId });
  }

  /**
   * Add an edge between two nodes
   *
   * @param source - Source node ID
   * @param target - Target node ID
   * @param weight - Edge weight (relationship strength)
   */
  addEdge(source: string, target: string, weight: number): void {
    this.ensureInitialized();

    // Ensure both nodes exist
    if (!this.nodes.has(source)) {
      this.addNode(source);
    }
    if (!this.nodes.has(target)) {
      this.addNode(target);
    }

    this.edges.push({ source, target, weight });
    this.engine!.add_edge(source, target, weight);

    this.logger.debug('Added edge to spectral graph', { source, target, weight });
  }

  /**
   * Remove a node from the graph
   *
   * @param nodeId - ID of the node to remove
   */
  removeNode(nodeId: string): void {
    this.ensureInitialized();

    this.nodes.delete(nodeId);
    this.engine!.remove_node(nodeId);

    // Remove edges connected to this node
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const edge = this.edges[i];
      if (edge.source === nodeId || edge.target === nodeId) {
        this.edges.splice(i, 1);
      }
    }

    this.logger.debug('Removed node from spectral graph', { nodeId });
  }

  /**
   * Compute the Fiedler value (algebraic connectivity)
   *
   * The Fiedler value is the second-smallest eigenvalue of the Laplacian.
   * - Higher values indicate better connectivity
   * - Low values suggest the network could easily split
   * - Zero indicates disconnected components
   *
   * @returns The Fiedler value (>= 0)
   */
  computeFiedlerValue(): number {
    this.ensureInitialized();

    if (this.nodes.size < 2) {
      return 0; // Need at least 2 nodes for meaningful analysis
    }

    if (this.edges.length === 0) {
      return 0; // Disconnected graph - Fiedler value is 0
    }

    try {
      const fiedlerValue = this.engine!.compute_fiedler_value();
      this.logger.debug('Computed Fiedler value', { fiedlerValue });
      return fiedlerValue;
    } catch (error) {
      this.logger.warn('Failed to compute Fiedler value', {
        error: toErrorMessage(error),
        nodeCount: this.nodes.size,
        edgeCount: this.edges.length,
      });
      return 0;
    }
  }

  /**
   * Predict the risk of swarm collapse
   *
   * Based on spectral analysis of the agent connectivity graph.
   *
   * @returns Collapse risk (0-1, higher = more risk)
   */
  predictCollapseRisk(): number {
    this.ensureInitialized();

    if (this.nodes.size < 2) {
      return 0; // Can't collapse with fewer than 2 nodes
    }

    if (this.edges.length === 0) {
      return 1; // Completely disconnected - maximum collapse risk
    }

    try {
      const risk = this.engine!.predict_collapse_risk();
      this.logger.debug('Predicted collapse risk', { risk });
      return risk;
    } catch (error) {
      this.logger.warn('Failed to predict collapse risk', {
        error: toErrorMessage(error),
        nodeCount: this.nodes.size,
        edgeCount: this.edges.length,
      });
      return 0.8; // High but not maximum risk on error
    }
  }

  /**
   * Get the nodes most at risk of causing collapse
   *
   * These are nodes whose removal would most significantly
   * impact network connectivity.
   *
   * @param count - Number of weak vertices to return
   * @returns Array of node IDs sorted by vulnerability
   */
  getWeakVertices(count: number): string[] {
    this.ensureInitialized();

    if (this.nodes.size === 0) {
      return [];
    }

    if (this.edges.length === 0) {
      // No edges - all nodes are equally "weak"
      return Array.from(this.nodes).slice(0, count);
    }

    const safeCount = Math.min(count, this.nodes.size);

    try {
      const weakVertices = this.engine!.get_weak_vertices(safeCount);

      this.logger.debug('Retrieved weak vertices', {
        requested: count,
        returned: weakVertices.length,
      });

      return weakVertices;
    } catch (error) {
      this.logger.warn('Failed to get weak vertices', {
        error: toErrorMessage(error),
        nodeCount: this.nodes.size,
        edgeCount: this.edges.length,
      });
      // Return first N nodes as fallback
      return Array.from(this.nodes).slice(0, count);
    }
  }

  /**
   * Analyze a swarm state for collapse risk
   *
   * Builds a spectral graph from the swarm state and analyzes it.
   *
   * @param state - Current swarm state
   * @returns Collapse risk analysis
   */
  analyzeSwarmState(state: SwarmState): CollapseRisk {
    const startTime = Date.now();

    // Clear existing graph and build from state
    this.clear();

    // Add agents as nodes
    for (const agent of state.agents) {
      this.addNode(agent.agentId);
    }

    // Add edges based on agent relationships
    // Agents with similar beliefs are connected
    this.buildEdgesFromAgents(state.agents);

    // Analyze the graph
    const risk = this.predictCollapseRisk();
    const fiedlerValue = this.computeFiedlerValue();
    const weakVertices = this.getWeakVertices(5);

    const durationMs = Date.now() - startTime;

    const result: CollapseRisk = {
      risk,
      fiedlerValue,
      collapseImminent: risk > 0.7,
      weakVertices,
      recommendations: this.generateRecommendations(risk, fiedlerValue, weakVertices),
      durationMs,
      usedFallback: false,
    };

    this.logger.info('Analyzed swarm state', {
      agentCount: state.agents.length,
      risk,
      fiedlerValue,
      durationMs,
    });

    return result;
  }

  /**
   * Build edges between agents based on belief similarity
   */
  private buildEdgesFromAgents(agents: AgentHealth[]): void {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const similarity = this.computeAgentSimilarity(agents[i], agents[j]);
        if (similarity > 0.3) {
          this.addEdge(agents[i].agentId, agents[j].agentId, similarity);
        }
      }
    }
  }

  /**
   * Compute similarity between two agents based on their states
   */
  private computeAgentSimilarity(agent1: AgentHealth, agent2: AgentHealth): number {
    // Factor in:
    // 1. Health similarity
    const healthSim = 1 - Math.abs(agent1.health - agent2.health);

    // 2. Success rate similarity
    const successSim = 1 - Math.abs(agent1.successRate - agent2.successRate);

    // 3. Same agent type bonus
    const typeBonus = agent1.agentType === agent2.agentType ? 0.2 : 0;

    // 4. Belief overlap (if both have beliefs)
    // Defensive: handle agents without beliefs array
    let beliefSim = 0;
    const beliefs1 = agent1.beliefs ?? [];
    const beliefs2 = agent2.beliefs ?? [];
    if (beliefs1.length > 0 && beliefs2.length > 0) {
      beliefSim = this.computeBeliefOverlap(beliefs1, beliefs2);
    }

    // Weighted combination
    return (healthSim * 0.3 + successSim * 0.3 + typeBonus + beliefSim * 0.2);
  }

  /**
   * Compute overlap between belief sets using embedding similarity
   */
  private computeBeliefOverlap(
    beliefs1: AgentHealth['beliefs'],
    beliefs2: AgentHealth['beliefs']
  ): number {
    if (beliefs1.length === 0 || beliefs2.length === 0) {
      return 0;
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    for (const b1 of beliefs1) {
      for (const b2 of beliefs2) {
        totalSimilarity += this.cosineSimilarity(b1.embedding, b2.embedding);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Generate recommendations based on collapse analysis
   */
  private generateRecommendations(
    risk: number,
    fiedlerValue: number,
    weakVertices: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (risk > 0.7) {
      recommendations.push(
        'CRITICAL: Immediate action required to prevent swarm collapse.'
      );
      recommendations.push(
        'Consider spawning additional coordination agents to strengthen connectivity.'
      );
    } else if (risk > 0.5) {
      recommendations.push(
        'WARNING: Elevated collapse risk detected. Monitor closely.'
      );
    }

    if (fiedlerValue < 0.1) {
      recommendations.push(
        'Network connectivity is weak. Consider adding redundant communication channels.'
      );
    }

    if (fiedlerValue < 0.05) {
      recommendations.push(
        'ALERT: Near-zero Fiedler value indicates potential false consensus.'
      );
      recommendations.push(
        'Recommend spawning an independent reviewer to verify decisions.'
      );
    }

    if (weakVertices.length > 0) {
      recommendations.push(
        `At-risk agents: ${weakVertices.join(', ')}. Consider reassigning critical tasks.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Swarm health is good. No immediate action required.');
    }

    return recommendations;
  }

  /**
   * Clear all nodes and edges from the graph
   */
  clear(): void {
    this.ensureInitialized();

    this.nodes.clear();
    this.edges.length = 0;
    this.engine!.clear();

    this.logger.debug('Cleared spectral graph');
  }

  /**
   * Dispose of adapter resources
   */
  dispose(): void {
    if (this.engine) {
      this.engine.clear();
      this.engine = null;
    }
    this.nodes.clear();
    this.edges.length = 0;
    this.initialized = false;

    this.logger.info('SpectralAdapter disposed');
  }

  /**
   * Get the number of nodes in the graph
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get the number of edges in the graph
   */
  getEdgeCount(): number {
    return this.edges.length;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a SpectralAdapter
 *
 * @param wasmLoader - WASM module loader
 * @param logger - Optional logger
 * @returns Initialized adapter
 */
export async function createSpectralAdapter(
  wasmLoader: IWasmLoader,
  logger?: CoherenceLogger
): Promise<SpectralAdapter> {
  const adapter = new SpectralAdapter(wasmLoader, logger);
  await adapter.initialize();
  return adapter;
}
