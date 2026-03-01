/**
 * Agentic QE v3 - Cohomology Engine Adapter
 *
 * Wraps the Prime Radiant CohomologyEngine for sheaf cohomology operations.
 * Used for contradiction detection using sheaf Laplacian energy.
 *
 * Sheaf Laplacian Energy Formula:
 * E(S) = sum of w_e * ||rho_u(x_u) - rho_v(x_v)||^2
 *
 * Where:
 * - w_e: Edge weight (relationship importance)
 * - rho: Restriction maps (information transformation)
 * - x: Node states (embedded representations)
 * - Lower energy = higher coherence
 *
 * @module integrations/coherence/engines/cohomology-adapter
 */

import type {
  CoherenceNode,
  CoherenceEdge,
  Contradiction,
  ContradictionRaw,
  ICohomologyEngine,
  IRawCohomologyEngine,
  IWasmLoader,
  CoherenceLogger,
  WasmModule,
} from '../types';
import { WasmNotLoadedError, DEFAULT_COHERENCE_LOGGER } from '../types';
import type { Severity } from '../../../shared/types';

// ============================================================================
// WASM Engine Wrapper
// ============================================================================

/**
 * Creates an ICohomologyEngine wrapper around the raw WASM engine
 * Translates from snake_case adapter interface to camelCase WASM API
 *
 * IMPORTANT: WASM expects numeric node IDs (usize), so we maintain
 * a bidirectional mapping between string IDs and numeric indices.
 */
function createCohomologyEngineWrapper(rawEngine: IRawCohomologyEngine): ICohomologyEngine {
  // Internal state for graph building
  const nodes = new Map<string, { embedding: Float64Array }>();
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
  // WASM sheaf cohomology expects:
  // { nodes: [{id: number, label: string, section: number[], weight: number}], edges: [...] }
  // "section" is the sheaf theory term for local data at each stalk
  const buildGraph = (): unknown => ({
    nodes: Array.from(nodes.entries()).map(([id, data]) => ({
      id: getOrCreateIndex(id), // Convert string ID to numeric index
      label: id, // Original string ID as label
      section: Array.from(data.embedding), // Sheaf section = the embedding data
      weight: 1.0, // Node weight (importance) - default to 1.0
    })),
    edges: edges.map(e => ({
      source: getOrCreateIndex(e.source), // Convert to numeric
      target: getOrCreateIndex(e.target), // Convert to numeric
      weight: e.weight,
    })),
  });

  return {
    add_node(id: string, embedding: Float64Array): void {
      nodes.set(id, { embedding });
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
      // (indices are reused to avoid graph corruption)
      // Remove associated edges
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].source === id || edges[i].target === id) {
          edges.splice(i, 1);
        }
      }
    },

    remove_edge(source: string, target: string): void {
      const idx = edges.findIndex(e => e.source === source && e.target === target);
      if (idx >= 0) edges.splice(idx, 1);
    },

    sheaf_laplacian_energy(): number {
      const graph = buildGraph();
      return rawEngine.consistencyEnergy(graph);
    },

    detect_contradictions(threshold: number): ContradictionRaw[] {
      const graph = buildGraph();
      const obstructions = rawEngine.detectObstructions(graph) as Array<{
        node1: number; // WASM returns numeric IDs
        node2: number;
        energy: number;
      }> | null;

      if (!obstructions) return [];

      return obstructions
        .filter(o => o.energy > threshold)
        .map(o => ({
          node1: getStringId(o.node1), // Convert back to string ID
          node2: getStringId(o.node2), // Convert back to string ID
          severity: o.energy,
          distance: o.energy,
        }));
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
// Cohomology Adapter Interface
// ============================================================================

/**
 * Interface for the cohomology adapter
 */
export interface ICohomologyAdapter {
  /** Initialize the adapter */
  initialize(): Promise<void>;
  /** Check if initialized */
  isInitialized(): boolean;
  /** Add a node to the graph */
  addNode(node: CoherenceNode): void;
  /** Add an edge between nodes */
  addEdge(edge: CoherenceEdge): void;
  /** Remove a node */
  removeNode(nodeId: string): void;
  /** Remove an edge */
  removeEdge(source: string, target: string): void;
  /** Compute sheaf Laplacian energy */
  computeEnergy(): number;
  /** Detect contradictions */
  detectContradictions(threshold?: number): Contradiction[];
  /** Clear the graph */
  clear(): void;
  /** Dispose of resources */
  dispose(): void;
}

// ============================================================================
// Cohomology Adapter Implementation
// ============================================================================

/**
 * Adapter for the Prime Radiant CohomologyEngine
 *
 * Provides sheaf cohomology operations for detecting contradictions
 * in belief systems and agent states.
 *
 * @example
 * ```typescript
 * const adapter = new CohomologyAdapter(wasmLoader, logger);
 * await adapter.initialize();
 *
 * adapter.addNode({ id: 'belief-1', embedding: [...] });
 * adapter.addNode({ id: 'belief-2', embedding: [...] });
 * adapter.addEdge({ source: 'belief-1', target: 'belief-2', weight: 0.8 });
 *
 * const energy = adapter.computeEnergy();
 * const contradictions = adapter.detectContradictions(0.1);
 * ```
 */
export class CohomologyAdapter implements ICohomologyAdapter {
  private engine: ICohomologyEngine | null = null;
  private initialized = false;
  private readonly nodes = new Map<string, CoherenceNode>();
  private readonly edges: CoherenceEdge[] = [];

  /**
   * Create a new CohomologyAdapter
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

    this.logger.debug('Initializing CohomologyAdapter');

    const isAvailable = await this.wasmLoader.isAvailable();
    if (!isAvailable) {
      throw new WasmNotLoadedError(
        'WASM module is not available. Cannot initialize CohomologyAdapter.'
      );
    }

    const module = await this.wasmLoader.load();
    // Create wrapper around raw WASM engine
    const rawEngine = new module.CohomologyEngine();
    this.engine = createCohomologyEngineWrapper(rawEngine);
    this.initialized = true;

    this.logger.info('CohomologyAdapter initialized successfully');
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
        'CohomologyAdapter not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Add a node to the coherence graph
   *
   * @param node - The node to add
   */
  addNode(node: CoherenceNode): void {
    this.ensureInitialized();

    // Store locally for reference
    this.nodes.set(node.id, node);

    // Add to WASM engine
    const embedding = new Float64Array(node.embedding);
    this.engine!.add_node(node.id, embedding);

    this.logger.debug('Added node to cohomology graph', {
      nodeId: node.id,
      embeddingDim: node.embedding.length,
    });
  }

  /**
   * Add an edge between two nodes
   *
   * @param edge - The edge to add
   */
  addEdge(edge: CoherenceEdge): void {
    this.ensureInitialized();

    // Store locally for reference
    this.edges.push(edge);

    // Add to WASM engine
    this.engine!.add_edge(edge.source, edge.target, edge.weight);

    this.logger.debug('Added edge to cohomology graph', {
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
    });
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

    // Also remove edges connected to this node
    const indicesToRemove: number[] = [];
    this.edges.forEach((edge, index) => {
      if (edge.source === nodeId || edge.target === nodeId) {
        indicesToRemove.push(index);
      }
    });
    indicesToRemove.reverse().forEach(i => this.edges.splice(i, 1));

    this.logger.debug('Removed node from cohomology graph', { nodeId });
  }

  /**
   * Remove an edge from the graph
   *
   * @param source - Source node ID
   * @param target - Target node ID
   */
  removeEdge(source: string, target: string): void {
    this.ensureInitialized();

    // Remove from local storage
    const index = this.edges.findIndex(
      e => e.source === source && e.target === target
    );
    if (index >= 0) {
      this.edges.splice(index, 1);
    }

    this.engine!.remove_edge(source, target);

    this.logger.debug('Removed edge from cohomology graph', { source, target });
  }

  /**
   * Compute the sheaf Laplacian energy of the graph
   *
   * Lower energy indicates higher coherence.
   *
   * @returns The energy value (>= 0)
   */
  computeEnergy(): number {
    this.ensureInitialized();

    const energy = this.engine!.sheaf_laplacian_energy();

    this.logger.debug('Computed sheaf Laplacian energy', { energy });

    return energy;
  }

  /**
   * Detect contradictions in the graph
   *
   * @param threshold - Energy threshold for contradiction detection (default: 0.1)
   * @returns List of detected contradictions
   */
  detectContradictions(threshold: number = 0.1): Contradiction[] {
    this.ensureInitialized();

    const rawContradictions = this.engine!.detect_contradictions(threshold);

    const contradictions = rawContradictions.map(raw =>
      this.transformContradiction(raw)
    );

    this.logger.debug('Detected contradictions', {
      count: contradictions.length,
      threshold,
    });

    return contradictions;
  }

  /**
   * Transform raw WASM contradiction to domain type
   */
  private transformContradiction(raw: ContradictionRaw): Contradiction {
    return {
      nodeIds: [raw.node1, raw.node2],
      severity: this.severityFromDistance(raw.severity),
      description: this.generateContradictionDescription(raw),
      confidence: 1 - raw.distance, // Higher distance = lower confidence it's a true contradiction
      resolution: this.suggestResolution(raw),
    };
  }

  /**
   * Map severity score to severity level
   */
  private severityFromDistance(severity: number): Severity {
    if (severity >= 0.9) return 'critical';
    if (severity >= 0.7) return 'high';
    if (severity >= 0.4) return 'medium';
    if (severity >= 0.2) return 'low';
    return 'info';
  }

  /**
   * Generate a human-readable description of the contradiction
   */
  private generateContradictionDescription(raw: ContradictionRaw): string {
    const node1 = this.nodes.get(raw.node1);
    const node2 = this.nodes.get(raw.node2);

    if (node1?.metadata?.statement && node2?.metadata?.statement) {
      return `Contradiction detected between "${node1.metadata.statement}" and "${node2.metadata.statement}"`;
    }

    return `Contradiction detected between nodes '${raw.node1}' and '${raw.node2}' with distance ${raw.distance.toFixed(3)}`;
  }

  /**
   * Suggest a resolution for the contradiction
   */
  private suggestResolution(raw: ContradictionRaw): string {
    if (raw.severity >= 0.9) {
      return 'Critical contradiction requires manual review. Consider removing one of the conflicting beliefs.';
    }
    if (raw.severity >= 0.7) {
      return 'High-severity contradiction. Recommend gathering additional evidence to determine which belief is correct.';
    }
    if (raw.severity >= 0.4) {
      return 'Moderate contradiction. Consider adding context or constraints to differentiate the beliefs.';
    }
    return 'Low-severity contradiction. May be resolved with additional context or can be safely ignored.';
  }

  /**
   * Clear all nodes and edges from the graph
   */
  clear(): void {
    this.ensureInitialized();

    this.nodes.clear();
    this.edges.length = 0;
    this.engine!.clear();

    this.logger.debug('Cleared cohomology graph');
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

    this.logger.info('CohomologyAdapter disposed');
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

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): CoherenceNode | undefined {
    return this.nodes.get(nodeId);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a CohomologyAdapter
 *
 * @param wasmLoader - WASM module loader
 * @param logger - Optional logger
 * @returns Initialized adapter
 */
export async function createCohomologyAdapter(
  wasmLoader: IWasmLoader,
  logger?: CoherenceLogger
): Promise<CohomologyAdapter> {
  const adapter = new CohomologyAdapter(wasmLoader, logger);
  await adapter.initialize();
  return adapter;
}
