/**
 * Cohomology Engine Adapter Unit Tests
 * ADR-052: A1.4 - Unit Tests for Cohomology Engine
 *
 * Tests the cohomology adapter for sheaf Laplacian energy calculations
 * and cohomology dimension computations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock WASM module for CohomologyEngine
 */
vi.mock('prime-radiant-advanced-wasm', () => ({
  CohomologyEngine: vi.fn().mockImplementation(() => ({
    add_node: vi.fn(),
    add_edge: vi.fn(),
    sheaf_laplacian_energy: vi.fn().mockReturnValue(0.05),
    compute_cohomology_dimension: vi.fn().mockReturnValue(1),
    get_node_count: vi.fn().mockReturnValue(0),
    get_edge_count: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

/**
 * Types for Cohomology Engine
 */
interface NodeData {
  id: string;
  value: unknown;
  metadata?: Record<string, unknown>;
}

interface EdgeData {
  source: string;
  target: string;
  weight: number;
  type?: string;
}

interface CohomologyResult {
  energy: number;
  dimension: number;
  isStable: boolean;
  confidence: number;
}

interface CohomologyEngineConfig {
  energyThreshold: number;
  stabilityThreshold: number;
  maxNodes: number;
}

/**
 * Mock WASM CohomologyEngine interface
 */
interface WasmCohomologyEngine {
  add_node: (id: string, data: unknown) => void;
  add_edge: (source: string, target: string, weight: number) => void;
  sheaf_laplacian_energy: () => number;
  compute_cohomology_dimension: () => number;
  get_node_count: () => number;
  get_edge_count: () => number;
  reset: () => void;
  dispose: () => void;
}

/**
 * CohomologyAdapter - Wraps the WASM CohomologyEngine
 */
class CohomologyAdapter {
  private engine: WasmCohomologyEngine;
  private readonly config: CohomologyEngineConfig;
  private nodes: Map<string, NodeData> = new Map();
  private edges: EdgeData[] = [];
  private initialized = false;

  constructor(wasmEngine: WasmCohomologyEngine, config: Partial<CohomologyEngineConfig> = {}) {
    this.engine = wasmEngine;
    this.config = {
      energyThreshold: config.energyThreshold ?? 0.1,
      stabilityThreshold: config.stabilityThreshold ?? 0.7,
      maxNodes: config.maxNodes ?? 10000,
    };
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  /**
   * Add a node to the cohomology complex
   */
  addNode(node: NodeData): void {
    this.ensureInitialized();

    if (this.nodes.size >= this.config.maxNodes) {
      throw new Error(`Maximum node limit (${this.config.maxNodes}) reached`);
    }

    if (this.nodes.has(node.id)) {
      // Update existing node
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, node);
    this.engine.add_node(node.id, node.value);
  }

  /**
   * Add an edge between nodes
   */
  addEdge(edge: EdgeData): void {
    this.ensureInitialized();

    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source node '${edge.source}' not found`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target node '${edge.target}' not found`);
    }

    this.edges.push(edge);
    this.engine.add_edge(edge.source, edge.target, edge.weight);
  }

  /**
   * Compute sheaf Laplacian energy
   */
  computeEnergy(): number {
    this.ensureInitialized();
    return this.engine.sheaf_laplacian_energy();
  }

  /**
   * Compute cohomology dimension
   */
  computeDimension(): number {
    this.ensureInitialized();
    return this.engine.compute_cohomology_dimension();
  }

  /**
   * Get full cohomology analysis result
   */
  analyze(): CohomologyResult {
    this.ensureInitialized();

    const energy = this.computeEnergy();
    const dimension = this.computeDimension();
    const isStable = energy <= this.config.energyThreshold;

    // Confidence based on data quality
    const confidence = this.calculateConfidence(energy, dimension);

    return {
      energy,
      dimension,
      isStable,
      confidence,
    };
  }

  /**
   * Reset the engine state
   */
  reset(): void {
    this.nodes.clear();
    this.edges = [];
    this.engine.reset();
  }

  /**
   * Dispose of the engine resources
   */
  dispose(): void {
    this.engine.dispose();
    this.initialized = false;
  }

  private calculateConfidence(energy: number, dimension: number): number {
    // More nodes and edges = higher confidence
    const dataScore = Math.min(1, (this.nodes.size + this.edges.length) / 100);

    // Lower energy = higher confidence in stability
    const energyScore = 1 - Math.min(1, energy);

    // Reasonable dimension = higher confidence
    const dimensionScore = dimension > 0 && dimension <= 10 ? 1 : 0.5;

    return (dataScore + energyScore + dimensionScore) / 3;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CohomologyAdapter not initialized');
    }
  }
}

describe('CohomologyAdapter', () => {
  let adapter: CohomologyAdapter;
  let mockEngine: WasmCohomologyEngine;

  beforeEach(() => {
    mockEngine = {
      add_node: vi.fn(),
      add_edge: vi.fn(),
      sheaf_laplacian_energy: vi.fn().mockReturnValue(0.05),
      compute_cohomology_dimension: vi.fn().mockReturnValue(1),
      get_node_count: vi.fn().mockReturnValue(0),
      get_edge_count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    adapter = new CohomologyAdapter(mockEngine);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with WASM loader', () => {
      expect(adapter.isInitialized).toBe(true);
    });

    it('should use default configuration', () => {
      expect(adapter.nodeCount).toBe(0);
      expect(adapter.edgeCount).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customAdapter = new CohomologyAdapter(mockEngine, {
        energyThreshold: 0.2,
        maxNodes: 5000,
      });
      expect(customAdapter.isInitialized).toBe(true);
    });
  });

  describe('addNode', () => {
    it('should add nodes correctly', () => {
      const node: NodeData = { id: 'node-1', value: { data: 'test' } };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledWith('node-1', { data: 'test' });
    });

    it('should add multiple nodes', () => {
      adapter.addNode({ id: 'node-1', value: 1 });
      adapter.addNode({ id: 'node-2', value: 2 });
      adapter.addNode({ id: 'node-3', value: 3 });

      expect(adapter.nodeCount).toBe(3);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(3);
    });

    it('should update existing node', () => {
      adapter.addNode({ id: 'node-1', value: 'initial' });
      adapter.addNode({ id: 'node-1', value: 'updated' });

      expect(adapter.nodeCount).toBe(1);
      // First call adds, second updates (doesn't call engine again)
      expect(mockEngine.add_node).toHaveBeenCalledTimes(1);
    });

    it('should handle node with metadata', () => {
      const node: NodeData = {
        id: 'node-1',
        value: 'test',
        metadata: { type: 'belief', source: 'agent-1' },
      };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
    });

    it('should throw error when max nodes reached', () => {
      const limitedAdapter = new CohomologyAdapter(mockEngine, { maxNodes: 2 });

      limitedAdapter.addNode({ id: 'node-1', value: 1 });
      limitedAdapter.addNode({ id: 'node-2', value: 2 });

      expect(() => limitedAdapter.addNode({ id: 'node-3', value: 3 })).toThrow(
        'Maximum node limit (2) reached'
      );
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'source', value: 1 });
      adapter.addNode({ id: 'target', value: 2 });
    });

    it('should add edges correctly', () => {
      const edge: EdgeData = { source: 'source', target: 'target', weight: 0.8 };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
      expect(mockEngine.add_edge).toHaveBeenCalledWith('source', 'target', 0.8);
    });

    it('should add multiple edges', () => {
      adapter.addNode({ id: 'third', value: 3 });

      adapter.addEdge({ source: 'source', target: 'target', weight: 0.5 });
      adapter.addEdge({ source: 'target', target: 'third', weight: 0.7 });

      expect(adapter.edgeCount).toBe(2);
      expect(mockEngine.add_edge).toHaveBeenCalledTimes(2);
    });

    it('should throw error for missing source node', () => {
      expect(() =>
        adapter.addEdge({ source: 'missing', target: 'target', weight: 1.0 })
      ).toThrow("Source node 'missing' not found");
    });

    it('should throw error for missing target node', () => {
      expect(() =>
        adapter.addEdge({ source: 'source', target: 'missing', weight: 1.0 })
      ).toThrow("Target node 'missing' not found");
    });

    it('should handle edge with type', () => {
      const edge: EdgeData = {
        source: 'source',
        target: 'target',
        weight: 0.9,
        type: 'causal',
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
    });
  });

  describe('computeEnergy', () => {
    it('should compute primary metric (energy)', () => {
      adapter.addNode({ id: 'node-1', value: 1 });
      adapter.addNode({ id: 'node-2', value: 2 });
      adapter.addEdge({ source: 'node-1', target: 'node-2', weight: 1.0 });

      const energy = adapter.computeEnergy();

      expect(energy).toBe(0.05);
      expect(mockEngine.sheaf_laplacian_energy).toHaveBeenCalled();
    });

    it('should handle empty input', () => {
      const energy = adapter.computeEnergy();

      expect(energy).toBe(0.05); // Default mock return
      expect(mockEngine.sheaf_laplacian_energy).toHaveBeenCalled();
    });

    it('should handle large input (100+ nodes)', () => {
      // Add 150 nodes
      for (let i = 0; i < 150; i++) {
        adapter.addNode({ id: `node-${i}`, value: i });
      }

      // Add edges to form a chain
      for (let i = 0; i < 149; i++) {
        adapter.addEdge({ source: `node-${i}`, target: `node-${i + 1}`, weight: 1.0 });
      }

      mockEngine.sheaf_laplacian_energy = vi.fn().mockReturnValue(0.15);

      const energy = adapter.computeEnergy();

      expect(adapter.nodeCount).toBe(150);
      expect(adapter.edgeCount).toBe(149);
      expect(energy).toBe(0.15);
    });
  });

  describe('computeDimension', () => {
    it('should compute cohomology dimension', () => {
      adapter.addNode({ id: 'node-1', value: 1 });

      const dimension = adapter.computeDimension();

      expect(dimension).toBe(1);
      expect(mockEngine.compute_cohomology_dimension).toHaveBeenCalled();
    });

    it('should return correct dimension for complex graph', () => {
      mockEngine.compute_cohomology_dimension = vi.fn().mockReturnValue(3);

      for (let i = 0; i < 10; i++) {
        adapter.addNode({ id: `node-${i}`, value: i });
      }

      const dimension = adapter.computeDimension();

      expect(dimension).toBe(3);
    });
  });

  describe('analyze', () => {
    it('should return complete analysis result', () => {
      adapter.addNode({ id: 'node-1', value: 1 });
      adapter.addNode({ id: 'node-2', value: 2 });
      adapter.addEdge({ source: 'node-1', target: 'node-2', weight: 1.0 });

      const result = adapter.analyze();

      expect(result).toHaveProperty('energy');
      expect(result).toHaveProperty('dimension');
      expect(result).toHaveProperty('isStable');
      expect(result).toHaveProperty('confidence');
      expect(result.isStable).toBe(true); // 0.05 < 0.1 threshold
    });

    it('should detect unstable state', () => {
      mockEngine.sheaf_laplacian_energy = vi.fn().mockReturnValue(0.5);

      adapter.addNode({ id: 'node-1', value: 1 });

      const result = adapter.analyze();

      expect(result.isStable).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      adapter.addNode({ id: 'node-1', value: 1 });
      adapter.addNode({ id: 'node-2', value: 2 });
      adapter.addEdge({ source: 'node-1', target: 'node-2', weight: 1.0 });

      expect(adapter.nodeCount).toBe(2);
      expect(adapter.edgeCount).toBe(1);

      adapter.reset();

      expect(adapter.nodeCount).toBe(0);
      expect(adapter.edgeCount).toBe(0);
      expect(mockEngine.reset).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose engine resources', () => {
      adapter.dispose();

      expect(mockEngine.dispose).toHaveBeenCalled();
      expect(adapter.isInitialized).toBe(false);
    });

    it('should throw after disposal', () => {
      adapter.dispose();

      expect(() => adapter.addNode({ id: 'test', value: 1 })).toThrow(
        'CohomologyAdapter not initialized'
      );
    });
  });
});

// Export for use in other tests
export { CohomologyAdapter };
export type { NodeData, EdgeData, CohomologyResult, CohomologyEngineConfig };
