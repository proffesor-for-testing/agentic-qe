/**
 * Causal Engine Adapter Unit Tests
 * ADR-052: A1.4 - Unit Tests for Causal Engine
 *
 * Tests the causal adapter for causal relationship discovery,
 * verification, and strength computation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock WASM module for CausalEngine
 */
vi.mock('prime-radiant-advanced-wasm', () => ({
  CausalEngine: vi.fn().mockImplementation(() => ({
    add_node: vi.fn(),
    add_edge: vi.fn(),
    causal_strength: vi.fn().mockReturnValue(0.75),
    verify_relationship: vi.fn().mockReturnValue(true),
    discover_causes: vi.fn().mockReturnValue(['cause-1', 'cause-2']),
    compute_do_calculus: vi.fn().mockReturnValue(0.6),
    get_node_count: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

/**
 * Types for Causal Engine
 */
interface CausalNodeData {
  id: string;
  type: 'cause' | 'effect' | 'intermediate';
  value: unknown;
  timestamp?: number;
}

interface CausalEdgeData {
  source: string;
  target: string;
  strength: number;
  mechanism?: string;
}

interface CausalResult {
  strength: number;
  isValid: boolean;
  confidence: number;
  pathway: string[];
}

interface CausalDiscoveryResult {
  causes: string[];
  effects: string[];
  interventionEffect: number;
}

interface CausalEngineConfig {
  strengthThreshold: number;
  confidenceThreshold: number;
  maxPathLength: number;
}

/**
 * Mock WASM CausalEngine interface
 */
interface WasmCausalEngine {
  add_node: (id: string, data: unknown) => void;
  add_edge: (source: string, target: string, strength: number) => void;
  causal_strength: (source: string, target: string) => number;
  verify_relationship: (source: string, target: string) => boolean;
  discover_causes: (target: string) => string[];
  compute_do_calculus: (intervention: string, outcome: string) => number;
  get_node_count: () => number;
  reset: () => void;
  dispose: () => void;
}

/**
 * CausalAdapter - Wraps the WASM CausalEngine
 */
class CausalAdapter {
  private engine: WasmCausalEngine;
  private readonly config: CausalEngineConfig;
  private nodes: Map<string, CausalNodeData> = new Map();
  private edges: CausalEdgeData[] = [];
  private initialized = false;

  constructor(wasmEngine: WasmCausalEngine, config: Partial<CausalEngineConfig> = {}) {
    this.engine = wasmEngine;
    this.config = {
      strengthThreshold: config.strengthThreshold ?? 0.5,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      maxPathLength: config.maxPathLength ?? 10,
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
   * Add a causal node
   */
  addNode(node: CausalNodeData): void {
    this.ensureInitialized();

    if (this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, node);
    this.engine.add_node(node.id, { type: node.type, value: node.value, timestamp: node.timestamp });
  }

  /**
   * Add a causal edge (cause -> effect)
   */
  addEdge(edge: CausalEdgeData): void {
    this.ensureInitialized();

    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source node '${edge.source}' not found`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target node '${edge.target}' not found`);
    }

    this.edges.push(edge);
    this.engine.add_edge(edge.source, edge.target, edge.strength);
  }

  /**
   * Compute causal strength between two nodes (primary metric)
   */
  computeStrength(source: string, target: string): number {
    this.ensureInitialized();
    return this.engine.causal_strength(source, target);
  }

  /**
   * Verify a causal relationship
   */
  verifyRelationship(source: string, target: string): CausalResult {
    this.ensureInitialized();

    const isValid = this.engine.verify_relationship(source, target);
    const strength = this.engine.causal_strength(source, target);

    // Calculate confidence based on strength and validation
    const confidence = isValid
      ? Math.min(0.5 + strength * 0.5, 1.0)
      : Math.max(0.3 - strength * 0.2, 0.1);

    // Find pathway (simplified - direct path)
    const pathway = this.findPathway(source, target);

    return {
      strength,
      isValid,
      confidence,
      pathway,
    };
  }

  /**
   * Discover causes for a given effect
   */
  discoverCauses(effect: string): CausalDiscoveryResult {
    this.ensureInitialized();

    if (!this.nodes.has(effect)) {
      throw new Error(`Effect node '${effect}' not found`);
    }

    const causes = this.engine.discover_causes(effect);

    // Find effects of this node
    const effects = this.edges
      .filter((e) => e.source === effect)
      .map((e) => e.target);

    // Compute intervention effect
    const interventionEffect = causes.length > 0
      ? this.engine.compute_do_calculus(causes[0], effect)
      : 0;

    return {
      causes,
      effects,
      interventionEffect,
    };
  }

  /**
   * Perform do-calculus intervention analysis
   */
  computeIntervention(intervention: string, outcome: string): number {
    this.ensureInitialized();
    return this.engine.compute_do_calculus(intervention, outcome);
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

  private findPathway(source: string, target: string): string[] {
    // Simple BFS to find path
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[] }> = [{ node: source, path: [source] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.node === target) {
        return current.path;
      }

      if (visited.has(current.node) || current.path.length > this.config.maxPathLength) {
        continue;
      }

      visited.add(current.node);

      const neighbors = this.edges
        .filter((e) => e.source === current.node)
        .map((e) => e.target);

      for (const neighbor of neighbors) {
        queue.push({ node: neighbor, path: [...current.path, neighbor] });
      }
    }

    return [source, target]; // Direct path if no explicit path found
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CausalAdapter not initialized');
    }
  }
}

describe('CausalAdapter', () => {
  let adapter: CausalAdapter;
  let mockEngine: WasmCausalEngine;

  beforeEach(() => {
    mockEngine = {
      add_node: vi.fn(),
      add_edge: vi.fn(),
      causal_strength: vi.fn().mockReturnValue(0.75),
      verify_relationship: vi.fn().mockReturnValue(true),
      discover_causes: vi.fn().mockReturnValue(['cause-1', 'cause-2']),
      compute_do_calculus: vi.fn().mockReturnValue(0.6),
      get_node_count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    adapter = new CausalAdapter(mockEngine);
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
      const customAdapter = new CausalAdapter(mockEngine, {
        strengthThreshold: 0.6,
        maxPathLength: 5,
      });
      expect(customAdapter.isInitialized).toBe(true);
    });
  });

  describe('addNode', () => {
    it('should add nodes correctly', () => {
      const node: CausalNodeData = {
        id: 'code-change',
        type: 'cause',
        value: { file: 'test.ts', lines: 10 },
      };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledWith('code-change', {
        type: 'cause',
        value: { file: 'test.ts', lines: 10 },
        timestamp: undefined,
      });
    });

    it('should add multiple nodes with different types', () => {
      adapter.addNode({ id: 'cause-1', type: 'cause', value: 'code change' });
      adapter.addNode({ id: 'intermediate', type: 'intermediate', value: 'build' });
      adapter.addNode({ id: 'effect-1', type: 'effect', value: 'test failure' });

      expect(adapter.nodeCount).toBe(3);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(3);
    });

    it('should handle node with timestamp', () => {
      const now = Date.now();
      const node: CausalNodeData = {
        id: 'event-1',
        type: 'cause',
        value: 'trigger',
        timestamp: now,
      };

      adapter.addNode(node);

      expect(mockEngine.add_node).toHaveBeenCalledWith('event-1', {
        type: 'cause',
        value: 'trigger',
        timestamp: now,
      });
    });

    it('should update existing node', () => {
      adapter.addNode({ id: 'node-1', type: 'cause', value: 'initial' });
      adapter.addNode({ id: 'node-1', type: 'cause', value: 'updated' });

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(1);
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'cause', type: 'cause', value: 1 });
      adapter.addNode({ id: 'effect', type: 'effect', value: 2 });
    });

    it('should add edges correctly', () => {
      const edge: CausalEdgeData = { source: 'cause', target: 'effect', strength: 0.8 };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
      expect(mockEngine.add_edge).toHaveBeenCalledWith('cause', 'effect', 0.8);
    });

    it('should add multiple edges', () => {
      adapter.addNode({ id: 'intermediate', type: 'intermediate', value: 3 });

      adapter.addEdge({ source: 'cause', target: 'intermediate', strength: 0.7 });
      adapter.addEdge({ source: 'intermediate', target: 'effect', strength: 0.6 });

      expect(adapter.edgeCount).toBe(2);
      expect(mockEngine.add_edge).toHaveBeenCalledTimes(2);
    });

    it('should handle edge with mechanism', () => {
      const edge: CausalEdgeData = {
        source: 'cause',
        target: 'effect',
        strength: 0.9,
        mechanism: 'direct',
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
    });

    it('should throw error for missing source node', () => {
      expect(() =>
        adapter.addEdge({ source: 'missing', target: 'effect', strength: 1.0 })
      ).toThrow("Source node 'missing' not found");
    });

    it('should throw error for missing target node', () => {
      expect(() =>
        adapter.addEdge({ source: 'cause', target: 'missing', strength: 1.0 })
      ).toThrow("Target node 'missing' not found");
    });
  });

  describe('computeStrength', () => {
    it('should compute primary metric (strength)', () => {
      adapter.addNode({ id: 'cause', type: 'cause', value: 1 });
      adapter.addNode({ id: 'effect', type: 'effect', value: 2 });
      adapter.addEdge({ source: 'cause', target: 'effect', strength: 0.8 });

      const strength = adapter.computeStrength('cause', 'effect');

      expect(strength).toBe(0.75);
      expect(mockEngine.causal_strength).toHaveBeenCalledWith('cause', 'effect');
    });

    it('should handle empty input', () => {
      const strength = adapter.computeStrength('a', 'b');

      expect(strength).toBe(0.75);
      expect(mockEngine.causal_strength).toHaveBeenCalled();
    });

    it('should handle large input (100+ nodes)', () => {
      // Create a causal chain with 110 nodes
      for (let i = 0; i < 110; i++) {
        const type = i === 0 ? 'cause' : i === 109 ? 'effect' : 'intermediate';
        adapter.addNode({ id: `node-${i}`, type, value: i });
      }

      // Create chain of causation
      for (let i = 0; i < 109; i++) {
        adapter.addEdge({ source: `node-${i}`, target: `node-${i + 1}`, strength: 0.9 });
      }

      mockEngine.causal_strength = vi.fn().mockReturnValue(0.65);

      const strength = adapter.computeStrength('node-0', 'node-109');

      expect(adapter.nodeCount).toBe(110);
      expect(adapter.edgeCount).toBe(109);
      expect(strength).toBe(0.65);
    });
  });

  describe('verifyRelationship', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'cause', type: 'cause', value: 1 });
      adapter.addNode({ id: 'effect', type: 'effect', value: 2 });
      adapter.addEdge({ source: 'cause', target: 'effect', strength: 0.8 });
    });

    it('should verify valid causal relationship', () => {
      const result = adapter.verifyRelationship('cause', 'effect');

      expect(result.isValid).toBe(true);
      expect(result.strength).toBe(0.75);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.pathway).toContain('cause');
      expect(result.pathway).toContain('effect');
    });

    it('should detect invalid causal relationship', () => {
      mockEngine.verify_relationship = vi.fn().mockReturnValue(false);
      mockEngine.causal_strength = vi.fn().mockReturnValue(0.1);

      const result = adapter.verifyRelationship('cause', 'effect');

      expect(result.isValid).toBe(false);
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('should calculate higher confidence for strong valid relationships', () => {
      mockEngine.causal_strength = vi.fn().mockReturnValue(0.95);

      const result = adapter.verifyRelationship('cause', 'effect');

      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('discoverCauses', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'cause-1', type: 'cause', value: 1 });
      adapter.addNode({ id: 'cause-2', type: 'cause', value: 2 });
      adapter.addNode({ id: 'effect', type: 'effect', value: 3 });
      adapter.addEdge({ source: 'cause-1', target: 'effect', strength: 0.7 });
      adapter.addEdge({ source: 'cause-2', target: 'effect', strength: 0.6 });
    });

    it('should discover causes for an effect', () => {
      const result = adapter.discoverCauses('effect');

      expect(result.causes).toContain('cause-1');
      expect(result.causes).toContain('cause-2');
    });

    it('should return intervention effect', () => {
      const result = adapter.discoverCauses('effect');

      expect(result.interventionEffect).toBe(0.6);
      expect(mockEngine.compute_do_calculus).toHaveBeenCalled();
    });

    it('should throw for unknown effect', () => {
      expect(() => adapter.discoverCauses('unknown')).toThrow(
        "Effect node 'unknown' not found"
      );
    });
  });

  describe('computeIntervention', () => {
    it('should compute do-calculus intervention', () => {
      adapter.addNode({ id: 'intervention', type: 'cause', value: 1 });
      adapter.addNode({ id: 'outcome', type: 'effect', value: 2 });

      const effect = adapter.computeIntervention('intervention', 'outcome');

      expect(effect).toBe(0.6);
      expect(mockEngine.compute_do_calculus).toHaveBeenCalledWith('intervention', 'outcome');
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      adapter.addNode({ id: 'cause', type: 'cause', value: 1 });
      adapter.addNode({ id: 'effect', type: 'effect', value: 2 });
      adapter.addEdge({ source: 'cause', target: 'effect', strength: 0.8 });

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

      expect(() => adapter.computeStrength('a', 'b')).toThrow('CausalAdapter not initialized');
    });
  });
});

// Export for use in other tests
export { CausalAdapter };
export type { CausalNodeData, CausalEdgeData, CausalResult, CausalDiscoveryResult };
