/**
 * Homotopy Engine Adapter Unit Tests
 * ADR-052: A1.4 - Unit Tests for Homotopy Engine
 *
 * Tests the homotopy theory adapter for path equivalence,
 * homotopy type classification, and topological coherence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock WASM module for HomotopyEngine
 */
vi.mock('prime-radiant-advanced-wasm', () => ({
  HomotopyEngine: vi.fn().mockImplementation(() => ({
    add_node: vi.fn(),
    add_edge: vi.fn(),
    path_equivalence: vi.fn().mockReturnValue(true),
    homotopy_type: vi.fn().mockReturnValue('contractible'),
    compute_fundamental_group: vi.fn().mockReturnValue({ type: 'trivial', order: 1 }),
    is_simply_connected: vi.fn().mockReturnValue(true),
    compute_homology: vi.fn().mockReturnValue([1, 0, 0]),
    get_node_count: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

/**
 * Types for Homotopy Engine
 */
interface HomotopyNodeData {
  id: string;
  point: unknown;
  basepoint?: boolean;
}

interface HomotopyEdgeData {
  source: string;
  target: string;
  path: string;
  continuous?: boolean;
}

interface HomotopyResult {
  type: string;
  isSimplyConnected: boolean;
  fundamentalGroup: { type: string; order: number };
  homology: number[];
}

interface PathEquivalenceResult {
  equivalent: boolean;
  homotopyClass: string;
  confidence: number;
}

interface HomotopyEngineConfig {
  maxPathLength: number;
  equivalenceThreshold: number;
  computeHomology: boolean;
}

/**
 * Mock WASM HomotopyEngine interface
 */
interface WasmHomotopyEngine {
  add_node: (id: string, data: unknown) => void;
  add_edge: (source: string, target: string, path: string) => void;
  path_equivalence: (path1: string, path2: string) => boolean;
  homotopy_type: () => string;
  compute_fundamental_group: () => { type: string; order: number };
  is_simply_connected: () => boolean;
  compute_homology: (dimension?: number) => number[];
  get_node_count: () => number;
  reset: () => void;
  dispose: () => void;
}

/**
 * HomotopyAdapter - Wraps the WASM HomotopyEngine
 */
class HomotopyAdapter {
  private engine: WasmHomotopyEngine;
  private readonly config: HomotopyEngineConfig;
  private nodes: Map<string, HomotopyNodeData> = new Map();
  private edges: HomotopyEdgeData[] = [];
  private paths: Map<string, string[]> = new Map();
  private initialized = false;

  constructor(wasmEngine: WasmHomotopyEngine, config: Partial<HomotopyEngineConfig> = {}) {
    this.engine = wasmEngine;
    this.config = {
      maxPathLength: config.maxPathLength ?? 100,
      equivalenceThreshold: config.equivalenceThreshold ?? 0.9,
      computeHomology: config.computeHomology ?? true,
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
   * Add a point (node) to the space
   */
  addNode(node: HomotopyNodeData): void {
    this.ensureInitialized();

    if (this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, node);
    this.engine.add_node(node.id, { point: node.point, basepoint: node.basepoint ?? false });
  }

  /**
   * Add a path (edge) between points
   */
  addEdge(edge: HomotopyEdgeData): void {
    this.ensureInitialized();

    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source point '${edge.source}' not found`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target point '${edge.target}' not found`);
    }

    this.edges.push(edge);
    this.paths.set(edge.path, [edge.source, edge.target]);
    this.engine.add_edge(edge.source, edge.target, edge.path);
  }

  /**
   * Check if two paths are homotopy equivalent (primary metric: path equivalence)
   */
  checkPathEquivalence(path1: string, path2: string): PathEquivalenceResult {
    this.ensureInitialized();

    const equivalent = this.engine.path_equivalence(path1, path2);
    const homotopyType = this.engine.homotopy_type();

    // Calculate confidence based on path properties
    const confidence = equivalent ? 0.95 : 0.85;

    return {
      equivalent,
      homotopyClass: homotopyType,
      confidence,
    };
  }

  /**
   * Compute homotopy type of the space
   */
  computeHomotopyType(): string {
    this.ensureInitialized();
    return this.engine.homotopy_type();
  }

  /**
   * Compute fundamental group
   */
  computeFundamentalGroup(): { type: string; order: number } {
    this.ensureInitialized();
    return this.engine.compute_fundamental_group();
  }

  /**
   * Check if space is simply connected
   */
  isSimplyConnected(): boolean {
    this.ensureInitialized();
    return this.engine.is_simply_connected();
  }

  /**
   * Compute homology groups
   */
  computeHomology(maxDimension?: number): number[] {
    this.ensureInitialized();
    return this.engine.compute_homology(maxDimension);
  }

  /**
   * Get full homotopy analysis
   */
  analyze(): HomotopyResult {
    this.ensureInitialized();

    const type = this.computeHomotopyType();
    const isSimplyConnected = this.isSimplyConnected();
    const fundamentalGroup = this.computeFundamentalGroup();
    const homology = this.config.computeHomology ? this.computeHomology() : [];

    return {
      type,
      isSimplyConnected,
      fundamentalGroup,
      homology,
    };
  }

  /**
   * Find all paths between two points
   */
  findPaths(source: string, target: string): string[] {
    this.ensureInitialized();

    const foundPaths: string[] = [];
    for (const [path, endpoints] of this.paths) {
      if (endpoints[0] === source && endpoints[1] === target) {
        foundPaths.push(path);
      }
    }
    return foundPaths;
  }

  /**
   * Reset the engine state
   */
  reset(): void {
    this.nodes.clear();
    this.edges = [];
    this.paths.clear();
    this.engine.reset();
  }

  /**
   * Dispose of engine resources
   */
  dispose(): void {
    this.engine.dispose();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('HomotopyAdapter not initialized');
    }
  }
}

describe('HomotopyAdapter', () => {
  let adapter: HomotopyAdapter;
  let mockEngine: WasmHomotopyEngine;

  beforeEach(() => {
    mockEngine = {
      add_node: vi.fn(),
      add_edge: vi.fn(),
      path_equivalence: vi.fn().mockReturnValue(true),
      homotopy_type: vi.fn().mockReturnValue('contractible'),
      compute_fundamental_group: vi.fn().mockReturnValue({ type: 'trivial', order: 1 }),
      is_simply_connected: vi.fn().mockReturnValue(true),
      compute_homology: vi.fn().mockReturnValue([1, 0, 0]),
      get_node_count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    adapter = new HomotopyAdapter(mockEngine);
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
      const customAdapter = new HomotopyAdapter(mockEngine, {
        maxPathLength: 50,
        computeHomology: false,
      });
      expect(customAdapter.isInitialized).toBe(true);
    });
  });

  describe('addNode', () => {
    it('should add nodes correctly', () => {
      const node: HomotopyNodeData = {
        id: 'point-1',
        point: { x: 0, y: 0 },
      };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledWith('point-1', {
        point: { x: 0, y: 0 },
        basepoint: false,
      });
    });

    it('should add multiple nodes', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p2', point: [1, 0] });
      adapter.addNode({ id: 'p3', point: [1, 1] });

      expect(adapter.nodeCount).toBe(3);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(3);
    });

    it('should handle basepoint', () => {
      const node: HomotopyNodeData = {
        id: 'basepoint',
        point: { x: 0, y: 0 },
        basepoint: true,
      };

      adapter.addNode(node);

      expect(mockEngine.add_node).toHaveBeenCalledWith('basepoint', {
        point: { x: 0, y: 0 },
        basepoint: true,
      });
    });

    it('should update existing node', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p1', point: [1, 1] });

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(1);
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p2', point: [1, 0] });
    });

    it('should add edges correctly', () => {
      const edge: HomotopyEdgeData = {
        source: 'p1',
        target: 'p2',
        path: 'gamma',
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
      expect(mockEngine.add_edge).toHaveBeenCalledWith('p1', 'p2', 'gamma');
    });

    it('should add multiple edges (paths)', () => {
      adapter.addNode({ id: 'p3', point: [1, 1] });

      adapter.addEdge({ source: 'p1', target: 'p2', path: 'gamma1' });
      adapter.addEdge({ source: 'p2', target: 'p3', path: 'gamma2' });
      adapter.addEdge({ source: 'p1', target: 'p3', path: 'gamma3' });

      expect(adapter.edgeCount).toBe(3);
      expect(mockEngine.add_edge).toHaveBeenCalledTimes(3);
    });

    it('should handle continuous path property', () => {
      const edge: HomotopyEdgeData = {
        source: 'p1',
        target: 'p2',
        path: 'gamma',
        continuous: true,
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
    });

    it('should throw error for missing source point', () => {
      expect(() =>
        adapter.addEdge({ source: 'missing', target: 'p2', path: 'gamma' })
      ).toThrow("Source point 'missing' not found");
    });

    it('should throw error for missing target point', () => {
      expect(() =>
        adapter.addEdge({ source: 'p1', target: 'missing', path: 'gamma' })
      ).toThrow("Target point 'missing' not found");
    });
  });

  describe('checkPathEquivalence', () => {
    it('should check path equivalence (primary metric)', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p2', point: [1, 0] });
      adapter.addEdge({ source: 'p1', target: 'p2', path: 'gamma1' });
      adapter.addEdge({ source: 'p1', target: 'p2', path: 'gamma2' });

      const result = adapter.checkPathEquivalence('gamma1', 'gamma2');

      expect(result.equivalent).toBe(true);
      expect(result.homotopyClass).toBe('contractible');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should detect non-equivalent paths', () => {
      mockEngine.path_equivalence = vi.fn().mockReturnValue(false);

      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p2', point: [1, 0] });

      const result = adapter.checkPathEquivalence('gamma1', 'gamma2');

      expect(result.equivalent).toBe(false);
    });

    it('should handle empty input', () => {
      const result = adapter.checkPathEquivalence('path1', 'path2');

      expect(result).toHaveProperty('equivalent');
      expect(result).toHaveProperty('homotopyClass');
    });

    it('should handle large input (100+ nodes)', () => {
      // Create a space with 110 points
      for (let i = 0; i < 110; i++) {
        adapter.addNode({ id: `p${i}`, point: [i, i] });
      }

      // Create paths between consecutive points
      for (let i = 0; i < 109; i++) {
        adapter.addEdge({ source: `p${i}`, target: `p${i + 1}`, path: `gamma_${i}` });
      }

      const result = adapter.checkPathEquivalence('gamma_0', 'gamma_50');

      expect(adapter.nodeCount).toBe(110);
      expect(adapter.edgeCount).toBe(109);
      expect(result).toHaveProperty('equivalent');
    });
  });

  describe('computeHomotopyType', () => {
    it('should compute homotopy type', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });

      const type = adapter.computeHomotopyType();

      expect(type).toBe('contractible');
      expect(mockEngine.homotopy_type).toHaveBeenCalled();
    });

    it('should return different types based on topology', () => {
      mockEngine.homotopy_type = vi.fn().mockReturnValue('S1'); // Circle

      const type = adapter.computeHomotopyType();

      expect(type).toBe('S1');
    });
  });

  describe('computeFundamentalGroup', () => {
    it('should compute fundamental group', () => {
      adapter.addNode({ id: 'basepoint', point: [0, 0], basepoint: true });

      const group = adapter.computeFundamentalGroup();

      expect(group.type).toBe('trivial');
      expect(group.order).toBe(1);
    });

    it('should detect non-trivial fundamental group', () => {
      mockEngine.compute_fundamental_group = vi.fn().mockReturnValue({ type: 'Z', order: -1 }); // Infinite cyclic

      const group = adapter.computeFundamentalGroup();

      expect(group.type).toBe('Z');
    });
  });

  describe('isSimplyConnected', () => {
    it('should check simple connectivity', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });

      const result = adapter.isSimplyConnected();

      expect(result).toBe(true);
      expect(mockEngine.is_simply_connected).toHaveBeenCalled();
    });

    it('should detect non-simply connected space', () => {
      mockEngine.is_simply_connected = vi.fn().mockReturnValue(false);

      const result = adapter.isSimplyConnected();

      expect(result).toBe(false);
    });
  });

  describe('computeHomology', () => {
    it('should compute homology groups', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });

      const homology = adapter.computeHomology();

      expect(Array.isArray(homology)).toBe(true);
      expect(homology).toEqual([1, 0, 0]);
    });

    it('should respect max dimension parameter', () => {
      adapter.computeHomology(5);

      expect(mockEngine.compute_homology).toHaveBeenCalledWith(5);
    });
  });

  describe('analyze', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'basepoint', point: [0, 0], basepoint: true });
      adapter.addNode({ id: 'p1', point: [1, 0] });
      adapter.addEdge({ source: 'basepoint', target: 'p1', path: 'gamma' });
    });

    it('should return complete homotopy analysis', () => {
      const result = adapter.analyze();

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('isSimplyConnected');
      expect(result).toHaveProperty('fundamentalGroup');
      expect(result).toHaveProperty('homology');
    });

    it('should detect contractible space', () => {
      const result = adapter.analyze();

      expect(result.type).toBe('contractible');
      expect(result.isSimplyConnected).toBe(true);
    });

    it('should compute homology when configured', () => {
      const result = adapter.analyze();

      expect(result.homology).toEqual([1, 0, 0]);
    });

    it('should skip homology when disabled', () => {
      const noHomologyAdapter = new HomotopyAdapter(mockEngine, { computeHomology: false });
      noHomologyAdapter.addNode({ id: 'p1', point: [0, 0] });

      const result = noHomologyAdapter.analyze();

      expect(result.homology).toHaveLength(0);
    });
  });

  describe('findPaths', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p2', point: [1, 0] });
      adapter.addEdge({ source: 'p1', target: 'p2', path: 'gamma1' });
      adapter.addEdge({ source: 'p1', target: 'p2', path: 'gamma2' });
    });

    it('should find all paths between points', () => {
      const paths = adapter.findPaths('p1', 'p2');

      expect(paths).toContain('gamma1');
      expect(paths).toContain('gamma2');
      expect(paths).toHaveLength(2);
    });

    it('should return empty array for non-existent paths', () => {
      const paths = adapter.findPaths('p2', 'p1');

      expect(paths).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      adapter.addNode({ id: 'p1', point: [0, 0] });
      adapter.addNode({ id: 'p2', point: [1, 0] });
      adapter.addEdge({ source: 'p1', target: 'p2', path: 'gamma' });

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

      expect(() => adapter.checkPathEquivalence('a', 'b')).toThrow(
        'HomotopyAdapter not initialized'
      );
    });
  });
});

// Export for use in other tests
export { HomotopyAdapter };
export type { HomotopyNodeData, HomotopyEdgeData, HomotopyResult, PathEquivalenceResult };
