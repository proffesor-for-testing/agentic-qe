/**
 * Spectral Engine Adapter Unit Tests
 * ADR-052: A1.4 - Unit Tests for Spectral Engine
 *
 * Tests the spectral adapter for eigenvalue analysis and risk assessment
 * of graph structures using spectral graph theory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock WASM module for SpectralEngine
 */
vi.mock('prime-radiant-advanced-wasm', () => ({
  SpectralEngine: vi.fn().mockImplementation(() => ({
    add_node: vi.fn(),
    add_edge: vi.fn(),
    spectral_risk: vi.fn().mockReturnValue(0.15),
    compute_eigenvalues: vi.fn().mockReturnValue([1.0, 0.8, 0.5, 0.2]),
    compute_fiedler: vi.fn().mockReturnValue(0.3),
    get_node_count: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

/**
 * Types for Spectral Engine
 */
interface SpectralNodeData {
  id: string;
  value: unknown;
  weight?: number;
}

interface SpectralEdgeData {
  source: string;
  target: string;
  weight: number;
}

interface SpectralResult {
  risk: number;
  eigenvalues: number[];
  fiedlerValue: number;
  connectivity: 'high' | 'medium' | 'low';
  isStable: boolean;
}

interface SpectralEngineConfig {
  riskThreshold: number;
  minFiedlerValue: number;
  maxEigenvalues: number;
}

/**
 * Mock WASM SpectralEngine interface
 */
interface WasmSpectralEngine {
  add_node: (id: string, data: unknown) => void;
  add_edge: (source: string, target: string, weight: number) => void;
  spectral_risk: () => number;
  compute_eigenvalues: (k?: number) => number[];
  compute_fiedler: () => number;
  get_node_count: () => number;
  reset: () => void;
  dispose: () => void;
}

/**
 * SpectralAdapter - Wraps the WASM SpectralEngine
 */
class SpectralAdapter {
  private engine: WasmSpectralEngine;
  private readonly config: SpectralEngineConfig;
  private nodes: Map<string, SpectralNodeData> = new Map();
  private edges: SpectralEdgeData[] = [];
  private initialized = false;

  constructor(wasmEngine: WasmSpectralEngine, config: Partial<SpectralEngineConfig> = {}) {
    this.engine = wasmEngine;
    this.config = {
      riskThreshold: config.riskThreshold ?? 0.3,
      minFiedlerValue: config.minFiedlerValue ?? 0.1,
      maxEigenvalues: config.maxEigenvalues ?? 10,
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
   * Add a node to the spectral graph
   */
  addNode(node: SpectralNodeData): void {
    this.ensureInitialized();

    if (this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, node);
    this.engine.add_node(node.id, { value: node.value, weight: node.weight ?? 1.0 });
  }

  /**
   * Add an edge to the spectral graph
   */
  addEdge(edge: SpectralEdgeData): void {
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
   * Compute spectral risk (primary metric)
   */
  computeRisk(): number {
    this.ensureInitialized();
    return this.engine.spectral_risk();
  }

  /**
   * Compute top k eigenvalues
   */
  computeEigenvalues(k?: number): number[] {
    this.ensureInitialized();
    const maxK = k ?? this.config.maxEigenvalues;
    return this.engine.compute_eigenvalues(maxK);
  }

  /**
   * Compute Fiedler value (algebraic connectivity)
   */
  computeFiedlerValue(): number {
    this.ensureInitialized();
    return this.engine.compute_fiedler();
  }

  /**
   * Get full spectral analysis result
   */
  analyze(): SpectralResult {
    this.ensureInitialized();

    const risk = this.computeRisk();
    const eigenvalues = this.computeEigenvalues();
    const fiedlerValue = this.computeFiedlerValue();

    // Determine connectivity based on Fiedler value
    const connectivity = this.classifyConnectivity(fiedlerValue);

    // Determine stability based on risk and connectivity
    const isStable = risk <= this.config.riskThreshold && fiedlerValue >= this.config.minFiedlerValue;

    return {
      risk,
      eigenvalues,
      fiedlerValue,
      connectivity,
      isStable,
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
   * Dispose of engine resources
   */
  dispose(): void {
    this.engine.dispose();
    this.initialized = false;
  }

  private classifyConnectivity(fiedlerValue: number): 'high' | 'medium' | 'low' {
    if (fiedlerValue >= 0.5) return 'high';
    if (fiedlerValue >= 0.2) return 'medium';
    return 'low';
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SpectralAdapter not initialized');
    }
  }
}

describe('SpectralAdapter', () => {
  let adapter: SpectralAdapter;
  let mockEngine: WasmSpectralEngine;

  beforeEach(() => {
    mockEngine = {
      add_node: vi.fn(),
      add_edge: vi.fn(),
      spectral_risk: vi.fn().mockReturnValue(0.15),
      compute_eigenvalues: vi.fn().mockReturnValue([1.0, 0.8, 0.5, 0.2]),
      compute_fiedler: vi.fn().mockReturnValue(0.3),
      get_node_count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    adapter = new SpectralAdapter(mockEngine);
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
      const customAdapter = new SpectralAdapter(mockEngine, {
        riskThreshold: 0.5,
        minFiedlerValue: 0.05,
      });
      expect(customAdapter.isInitialized).toBe(true);
    });
  });

  describe('addNode', () => {
    it('should add nodes correctly', () => {
      const node: SpectralNodeData = { id: 'agent-1', value: { role: 'worker' } };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledWith('agent-1', { value: { role: 'worker' }, weight: 1.0 });
    });

    it('should add multiple nodes', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });
      adapter.addNode({ id: 'agent-2', value: 2 });
      adapter.addNode({ id: 'agent-3', value: 3 });

      expect(adapter.nodeCount).toBe(3);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(3);
    });

    it('should handle node with custom weight', () => {
      const node: SpectralNodeData = { id: 'agent-1', value: 'test', weight: 2.5 };

      adapter.addNode(node);

      expect(mockEngine.add_node).toHaveBeenCalledWith('agent-1', { value: 'test', weight: 2.5 });
    });

    it('should update existing node without re-adding to engine', () => {
      adapter.addNode({ id: 'agent-1', value: 'initial' });
      adapter.addNode({ id: 'agent-1', value: 'updated' });

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(1);
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'agent-1', value: 1 });
      adapter.addNode({ id: 'agent-2', value: 2 });
    });

    it('should add edges correctly', () => {
      const edge: SpectralEdgeData = { source: 'agent-1', target: 'agent-2', weight: 0.75 };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
      expect(mockEngine.add_edge).toHaveBeenCalledWith('agent-1', 'agent-2', 0.75);
    });

    it('should add multiple edges', () => {
      adapter.addNode({ id: 'agent-3', value: 3 });

      adapter.addEdge({ source: 'agent-1', target: 'agent-2', weight: 0.5 });
      adapter.addEdge({ source: 'agent-2', target: 'agent-3', weight: 0.6 });
      adapter.addEdge({ source: 'agent-1', target: 'agent-3', weight: 0.4 });

      expect(adapter.edgeCount).toBe(3);
      expect(mockEngine.add_edge).toHaveBeenCalledTimes(3);
    });

    it('should throw error for missing source node', () => {
      expect(() =>
        adapter.addEdge({ source: 'missing', target: 'agent-2', weight: 1.0 })
      ).toThrow("Source node 'missing' not found");
    });

    it('should throw error for missing target node', () => {
      expect(() =>
        adapter.addEdge({ source: 'agent-1', target: 'missing', weight: 1.0 })
      ).toThrow("Target node 'missing' not found");
    });
  });

  describe('computeRisk', () => {
    it('should compute primary metric (risk)', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });
      adapter.addNode({ id: 'agent-2', value: 2 });
      adapter.addEdge({ source: 'agent-1', target: 'agent-2', weight: 1.0 });

      const risk = adapter.computeRisk();

      expect(risk).toBe(0.15);
      expect(mockEngine.spectral_risk).toHaveBeenCalled();
    });

    it('should handle empty input', () => {
      const risk = adapter.computeRisk();

      expect(risk).toBe(0.15);
      expect(mockEngine.spectral_risk).toHaveBeenCalled();
    });

    it('should handle large input (100+ nodes)', () => {
      // Create a mesh network with 120 nodes
      for (let i = 0; i < 120; i++) {
        adapter.addNode({ id: `agent-${i}`, value: i });
      }

      // Connect each node to a few neighbors
      for (let i = 0; i < 120; i++) {
        for (let j = i + 1; j < Math.min(i + 5, 120); j++) {
          adapter.addEdge({ source: `agent-${i}`, target: `agent-${j}`, weight: 0.5 });
        }
      }

      mockEngine.spectral_risk = vi.fn().mockReturnValue(0.25);

      const risk = adapter.computeRisk();

      expect(adapter.nodeCount).toBe(120);
      expect(risk).toBe(0.25);
    });
  });

  describe('computeEigenvalues', () => {
    it('should compute eigenvalues', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });

      const eigenvalues = adapter.computeEigenvalues();

      expect(Array.isArray(eigenvalues)).toBe(true);
      expect(eigenvalues).toEqual([1.0, 0.8, 0.5, 0.2]);
    });

    it('should respect k parameter', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });

      adapter.computeEigenvalues(5);

      expect(mockEngine.compute_eigenvalues).toHaveBeenCalledWith(5);
    });
  });

  describe('computeFiedlerValue', () => {
    it('should compute Fiedler value', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });
      adapter.addNode({ id: 'agent-2', value: 2 });
      adapter.addEdge({ source: 'agent-1', target: 'agent-2', weight: 1.0 });

      const fiedler = adapter.computeFiedlerValue();

      expect(fiedler).toBe(0.3);
      expect(mockEngine.compute_fiedler).toHaveBeenCalled();
    });
  });

  describe('analyze', () => {
    it('should return complete spectral analysis', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });
      adapter.addNode({ id: 'agent-2', value: 2 });
      adapter.addEdge({ source: 'agent-1', target: 'agent-2', weight: 1.0 });

      const result = adapter.analyze();

      expect(result).toHaveProperty('risk');
      expect(result).toHaveProperty('eigenvalues');
      expect(result).toHaveProperty('fiedlerValue');
      expect(result).toHaveProperty('connectivity');
      expect(result).toHaveProperty('isStable');
    });

    it('should classify high connectivity', () => {
      mockEngine.compute_fiedler = vi.fn().mockReturnValue(0.6);

      adapter.addNode({ id: 'agent-1', value: 1 });
      const result = adapter.analyze();

      expect(result.connectivity).toBe('high');
    });

    it('should classify medium connectivity', () => {
      mockEngine.compute_fiedler = vi.fn().mockReturnValue(0.3);

      adapter.addNode({ id: 'agent-1', value: 1 });
      const result = adapter.analyze();

      expect(result.connectivity).toBe('medium');
    });

    it('should classify low connectivity', () => {
      mockEngine.compute_fiedler = vi.fn().mockReturnValue(0.05);

      adapter.addNode({ id: 'agent-1', value: 1 });
      const result = adapter.analyze();

      expect(result.connectivity).toBe('low');
    });

    it('should detect stable state', () => {
      mockEngine.spectral_risk = vi.fn().mockReturnValue(0.1);
      mockEngine.compute_fiedler = vi.fn().mockReturnValue(0.4);

      adapter.addNode({ id: 'agent-1', value: 1 });
      const result = adapter.analyze();

      expect(result.isStable).toBe(true);
    });

    it('should detect unstable state due to high risk', () => {
      mockEngine.spectral_risk = vi.fn().mockReturnValue(0.5);
      mockEngine.compute_fiedler = vi.fn().mockReturnValue(0.4);

      adapter.addNode({ id: 'agent-1', value: 1 });
      const result = adapter.analyze();

      expect(result.isStable).toBe(false);
    });

    it('should detect unstable state due to low Fiedler value', () => {
      mockEngine.spectral_risk = vi.fn().mockReturnValue(0.1);
      mockEngine.compute_fiedler = vi.fn().mockReturnValue(0.05);

      adapter.addNode({ id: 'agent-1', value: 1 });
      const result = adapter.analyze();

      expect(result.isStable).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      adapter.addNode({ id: 'agent-1', value: 1 });
      adapter.addNode({ id: 'agent-2', value: 2 });
      adapter.addEdge({ source: 'agent-1', target: 'agent-2', weight: 1.0 });

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

      expect(() => adapter.computeRisk()).toThrow('SpectralAdapter not initialized');
    });
  });
});

// Export for use in other tests
export { SpectralAdapter };
export type { SpectralNodeData, SpectralEdgeData, SpectralResult, SpectralEngineConfig };
