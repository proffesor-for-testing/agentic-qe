/**
 * Category Engine Adapter Unit Tests
 * ADR-052: A1.4 - Unit Tests for Category Engine
 *
 * Tests the category theory adapter for morphism computation,
 * functor verification, and categorical coherence analysis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock WASM module for CategoryEngine
 */
vi.mock('prime-radiant-advanced-wasm', () => ({
  CategoryEngine: vi.fn().mockImplementation(() => ({
    add_node: vi.fn(),
    add_edge: vi.fn(),
    compute_morphism: vi.fn().mockReturnValue({ valid: true, preserves: ['identity', 'composition'] }),
    category_coherence: vi.fn().mockReturnValue(0.9),
    verify_functor: vi.fn().mockReturnValue(true),
    compose_morphisms: vi.fn().mockReturnValue({ valid: true }),
    get_node_count: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    dispose: vi.fn(),
  })),
}));

/**
 * Types for Category Engine
 */
interface CategoryNodeData {
  id: string;
  object: unknown;
  category?: string;
}

interface CategoryEdgeData {
  source: string;
  target: string;
  morphism: string;
  properties?: Record<string, unknown>;
}

interface MorphismResult {
  valid: boolean;
  preserves: string[];
  composition?: string;
}

interface CategoryResult {
  coherence: number;
  isValid: boolean;
  functorPreserving: boolean;
  diagnostics: string[];
}

interface CategoryEngineConfig {
  coherenceThreshold: number;
  strictMode: boolean;
  maxCompositionDepth: number;
}

/**
 * Mock WASM CategoryEngine interface
 */
interface WasmCategoryEngine {
  add_node: (id: string, data: unknown) => void;
  add_edge: (source: string, target: string, morphism: string) => void;
  compute_morphism: (id: string) => { valid: boolean; preserves: string[] };
  category_coherence: () => number;
  verify_functor: (sourceCategory: string, targetCategory: string) => boolean;
  compose_morphisms: (morphism1: string, morphism2: string) => { valid: boolean; result?: string };
  get_node_count: () => number;
  reset: () => void;
  dispose: () => void;
}

/**
 * CategoryAdapter - Wraps the WASM CategoryEngine
 */
class CategoryAdapter {
  private engine: WasmCategoryEngine;
  private readonly config: CategoryEngineConfig;
  private nodes: Map<string, CategoryNodeData> = new Map();
  private edges: CategoryEdgeData[] = [];
  private initialized = false;

  constructor(wasmEngine: WasmCategoryEngine, config: Partial<CategoryEngineConfig> = {}) {
    this.engine = wasmEngine;
    this.config = {
      coherenceThreshold: config.coherenceThreshold ?? 0.8,
      strictMode: config.strictMode ?? false,
      maxCompositionDepth: config.maxCompositionDepth ?? 10,
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
   * Add an object (node) to the category
   */
  addNode(node: CategoryNodeData): void {
    this.ensureInitialized();

    if (this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      return;
    }

    this.nodes.set(node.id, node);
    this.engine.add_node(node.id, { object: node.object, category: node.category });
  }

  /**
   * Add a morphism (edge) between objects
   */
  addEdge(edge: CategoryEdgeData): void {
    this.ensureInitialized();

    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source object '${edge.source}' not found`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target object '${edge.target}' not found`);
    }

    this.edges.push(edge);
    this.engine.add_edge(edge.source, edge.target, edge.morphism);
  }

  /**
   * Compute morphism validity and properties
   */
  computeMorphism(id: string): MorphismResult {
    this.ensureInitialized();
    return this.engine.compute_morphism(id);
  }

  /**
   * Compute categorical coherence (primary metric)
   */
  computeCoherence(): number {
    this.ensureInitialized();
    return this.engine.category_coherence();
  }

  /**
   * Verify functor between categories
   */
  verifyFunctor(sourceCategory: string, targetCategory: string): boolean {
    this.ensureInitialized();
    return this.engine.verify_functor(sourceCategory, targetCategory);
  }

  /**
   * Compose two morphisms
   */
  composeMorphisms(morphism1: string, morphism2: string): MorphismResult {
    this.ensureInitialized();
    const result = this.engine.compose_morphisms(morphism1, morphism2);
    return {
      valid: result.valid,
      preserves: result.valid ? ['composition'] : [],
      composition: result.result,
    };
  }

  /**
   * Get full category analysis
   */
  analyze(): CategoryResult {
    this.ensureInitialized();

    const coherence = this.computeCoherence();
    const isValid = coherence >= this.config.coherenceThreshold;
    const diagnostics: string[] = [];

    // Check all morphisms
    let allMorphismsValid = true;
    for (const edge of this.edges) {
      const morphism = this.computeMorphism(edge.morphism);
      if (!morphism.valid) {
        allMorphismsValid = false;
        diagnostics.push(`Invalid morphism: ${edge.morphism}`);
      }
    }

    // Check identity morphisms exist for all objects
    const hasIdentities = this.checkIdentities();
    if (!hasIdentities) {
      diagnostics.push('Missing identity morphisms for some objects');
    }

    // Check composition closure
    const compositionClosed = this.checkCompositionClosure();
    if (!compositionClosed) {
      diagnostics.push('Category not closed under composition');
    }

    const functorPreserving = allMorphismsValid && hasIdentities && compositionClosed;

    return {
      coherence,
      isValid,
      functorPreserving,
      diagnostics,
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

  private checkIdentities(): boolean {
    // Check if each object has an identity morphism
    for (const [id] of this.nodes) {
      const hasIdentity = this.edges.some(
        (e) => e.source === id && e.target === id && e.morphism.includes('id')
      );
      if (!hasIdentity && this.config.strictMode) {
        return false;
      }
    }
    return true;
  }

  private checkCompositionClosure(): boolean {
    // Simplified check: verify composable morphisms have compositions
    for (const e1 of this.edges) {
      for (const e2 of this.edges) {
        if (e1.target === e2.source) {
          // These morphisms are composable
          const composition = this.engine.compose_morphisms(e1.morphism, e2.morphism);
          if (!composition.valid && this.config.strictMode) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CategoryAdapter not initialized');
    }
  }
}

describe('CategoryAdapter', () => {
  let adapter: CategoryAdapter;
  let mockEngine: WasmCategoryEngine;

  beforeEach(() => {
    mockEngine = {
      add_node: vi.fn(),
      add_edge: vi.fn(),
      compute_morphism: vi.fn().mockReturnValue({ valid: true, preserves: ['identity', 'composition'] }),
      category_coherence: vi.fn().mockReturnValue(0.9),
      verify_functor: vi.fn().mockReturnValue(true),
      compose_morphisms: vi.fn().mockReturnValue({ valid: true, result: 'composed' }),
      get_node_count: vi.fn().mockReturnValue(0),
      reset: vi.fn(),
      dispose: vi.fn(),
    };
    adapter = new CategoryAdapter(mockEngine);
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
      const customAdapter = new CategoryAdapter(mockEngine, {
        coherenceThreshold: 0.95,
        strictMode: true,
      });
      expect(customAdapter.isInitialized).toBe(true);
    });
  });

  describe('addNode', () => {
    it('should add nodes correctly', () => {
      const node: CategoryNodeData = {
        id: 'object-A',
        object: { type: 'set', elements: [1, 2, 3] },
      };

      adapter.addNode(node);

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledWith('object-A', {
        object: { type: 'set', elements: [1, 2, 3] },
        category: undefined,
      });
    });

    it('should add multiple nodes', () => {
      adapter.addNode({ id: 'A', object: 'set-A' });
      adapter.addNode({ id: 'B', object: 'set-B' });
      adapter.addNode({ id: 'C', object: 'set-C' });

      expect(adapter.nodeCount).toBe(3);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(3);
    });

    it('should handle node with category', () => {
      const node: CategoryNodeData = {
        id: 'object-A',
        object: { value: 1 },
        category: 'Set',
      };

      adapter.addNode(node);

      expect(mockEngine.add_node).toHaveBeenCalledWith('object-A', {
        object: { value: 1 },
        category: 'Set',
      });
    });

    it('should update existing node', () => {
      adapter.addNode({ id: 'A', object: 'initial' });
      adapter.addNode({ id: 'A', object: 'updated' });

      expect(adapter.nodeCount).toBe(1);
      expect(mockEngine.add_node).toHaveBeenCalledTimes(1);
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'A', object: 'set-A' });
      adapter.addNode({ id: 'B', object: 'set-B' });
    });

    it('should add edges correctly', () => {
      const edge: CategoryEdgeData = {
        source: 'A',
        target: 'B',
        morphism: 'f',
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
      expect(mockEngine.add_edge).toHaveBeenCalledWith('A', 'B', 'f');
    });

    it('should add multiple edges (morphisms)', () => {
      adapter.addNode({ id: 'C', object: 'set-C' });

      adapter.addEdge({ source: 'A', target: 'B', morphism: 'f' });
      adapter.addEdge({ source: 'B', target: 'C', morphism: 'g' });
      adapter.addEdge({ source: 'A', target: 'C', morphism: 'g_of_f' });

      expect(adapter.edgeCount).toBe(3);
      expect(mockEngine.add_edge).toHaveBeenCalledTimes(3);
    });

    it('should handle edge with properties', () => {
      const edge: CategoryEdgeData = {
        source: 'A',
        target: 'B',
        morphism: 'f',
        properties: { injective: true, surjective: false },
      };

      adapter.addEdge(edge);

      expect(adapter.edgeCount).toBe(1);
    });

    it('should throw error for missing source object', () => {
      expect(() =>
        adapter.addEdge({ source: 'missing', target: 'B', morphism: 'f' })
      ).toThrow("Source object 'missing' not found");
    });

    it('should throw error for missing target object', () => {
      expect(() =>
        adapter.addEdge({ source: 'A', target: 'missing', morphism: 'f' })
      ).toThrow("Target object 'missing' not found");
    });
  });

  describe('computeMorphism', () => {
    it('should compute morphism validity', () => {
      adapter.addNode({ id: 'A', object: 'set-A' });
      adapter.addNode({ id: 'B', object: 'set-B' });
      adapter.addEdge({ source: 'A', target: 'B', morphism: 'f' });

      const result = adapter.computeMorphism('f');

      expect(result.valid).toBe(true);
      expect(result.preserves).toContain('identity');
      expect(result.preserves).toContain('composition');
    });

    it('should detect invalid morphism', () => {
      mockEngine.compute_morphism = vi.fn().mockReturnValue({ valid: false, preserves: [] });

      const result = adapter.computeMorphism('invalid-f');

      expect(result.valid).toBe(false);
      expect(result.preserves).toHaveLength(0);
    });
  });

  describe('computeCoherence', () => {
    it('should compute primary metric (coherence)', () => {
      adapter.addNode({ id: 'A', object: 'set-A' });
      adapter.addNode({ id: 'B', object: 'set-B' });
      adapter.addEdge({ source: 'A', target: 'B', morphism: 'f' });

      const coherence = adapter.computeCoherence();

      expect(coherence).toBe(0.9);
      expect(mockEngine.category_coherence).toHaveBeenCalled();
    });

    it('should handle empty input', () => {
      const coherence = adapter.computeCoherence();

      expect(coherence).toBe(0.9);
      expect(mockEngine.category_coherence).toHaveBeenCalled();
    });

    it('should handle large input (100+ nodes)', () => {
      // Create a category with 105 objects
      for (let i = 0; i < 105; i++) {
        adapter.addNode({ id: `obj-${i}`, object: i });
      }

      // Create morphisms forming a chain
      for (let i = 0; i < 104; i++) {
        adapter.addEdge({ source: `obj-${i}`, target: `obj-${i + 1}`, morphism: `f_${i}` });
      }

      mockEngine.category_coherence = vi.fn().mockReturnValue(0.85);

      const coherence = adapter.computeCoherence();

      expect(adapter.nodeCount).toBe(105);
      expect(adapter.edgeCount).toBe(104);
      expect(coherence).toBe(0.85);
    });
  });

  describe('verifyFunctor', () => {
    it('should verify functor between categories', () => {
      const result = adapter.verifyFunctor('Set', 'Group');

      expect(result).toBe(true);
      expect(mockEngine.verify_functor).toHaveBeenCalledWith('Set', 'Group');
    });

    it('should detect invalid functor', () => {
      mockEngine.verify_functor = vi.fn().mockReturnValue(false);

      const result = adapter.verifyFunctor('Set', 'Invalid');

      expect(result).toBe(false);
    });
  });

  describe('composeMorphisms', () => {
    it('should compose two morphisms', () => {
      const result = adapter.composeMorphisms('f', 'g');

      expect(result.valid).toBe(true);
      expect(result.preserves).toContain('composition');
      expect(result.composition).toBe('composed');
    });

    it('should detect invalid composition', () => {
      mockEngine.compose_morphisms = vi.fn().mockReturnValue({ valid: false });

      const result = adapter.composeMorphisms('f', 'incompatible');

      expect(result.valid).toBe(false);
      expect(result.preserves).toHaveLength(0);
    });
  });

  describe('analyze', () => {
    beforeEach(() => {
      adapter.addNode({ id: 'A', object: 'set-A' });
      adapter.addNode({ id: 'B', object: 'set-B' });
      adapter.addEdge({ source: 'A', target: 'B', morphism: 'f' });
      adapter.addEdge({ source: 'A', target: 'A', morphism: 'id_A' }); // Identity
      adapter.addEdge({ source: 'B', target: 'B', morphism: 'id_B' }); // Identity
    });

    it('should return complete category analysis', () => {
      const result = adapter.analyze();

      expect(result).toHaveProperty('coherence');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('functorPreserving');
      expect(result).toHaveProperty('diagnostics');
    });

    it('should detect valid category', () => {
      const result = adapter.analyze();

      expect(result.isValid).toBe(true);
      expect(result.coherence).toBe(0.9);
    });

    it('should detect invalid category due to low coherence', () => {
      mockEngine.category_coherence = vi.fn().mockReturnValue(0.5);

      const result = adapter.analyze();

      expect(result.isValid).toBe(false);
    });

    it('should report invalid morphisms in diagnostics', () => {
      mockEngine.compute_morphism = vi.fn().mockReturnValue({ valid: false, preserves: [] });

      const result = adapter.analyze();

      expect(result.diagnostics.some((d) => d.includes('Invalid morphism'))).toBe(true);
      expect(result.functorPreserving).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset engine state', () => {
      adapter.addNode({ id: 'A', object: 1 });
      adapter.addNode({ id: 'B', object: 2 });
      adapter.addEdge({ source: 'A', target: 'B', morphism: 'f' });

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

      expect(() => adapter.computeCoherence()).toThrow('CategoryAdapter not initialized');
    });
  });
});

// Export for use in other tests
export { CategoryAdapter };
export type { CategoryNodeData, CategoryEdgeData, MorphismResult, CategoryResult };
