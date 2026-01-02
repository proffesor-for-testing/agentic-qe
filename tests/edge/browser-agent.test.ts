/**
 * BrowserAgent Unit Tests
 *
 * Comprehensive tests for the browser-compatible edge agent implementation.
 * Tests WASM-compatible operations, initialization, lifecycle management,
 * and browser-specific features.
 *
 * @module tests/edge/browser-agent.test
 */

import { createResourceCleanup } from '../helpers/cleanup';
import {
  MockHNSWIndex,
  MockIndexedDBAdapter,
  loadWasm,
  browserFeatures,
  initEdgeRuntime,
} from './__mocks__/ruvector-edge';

// Note: When @ruvector/edge is installed, uncomment the following mock:
// jest.mock('@ruvector/edge', () => require('./__mocks__/ruvector-edge'));

/**
 * BrowserAgent - Edge-compatible agent for browser environments
 * This is a mock implementation for testing purposes
 */
class BrowserAgent {
  private id: string;
  private config: BrowserAgentConfig;
  private vectorIndex: MockHNSWIndex | null = null;
  private storage: MockIndexedDBAdapter | null = null;
  private initialized: boolean = false;
  private state: AgentState = 'idle';

  constructor(config: BrowserAgentConfig) {
    this.id = config.id ?? `browser-agent-${Date.now()}`;
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Check browser features
    if (!browserFeatures.isWasmSupported()) {
      throw new Error('WASM is not supported in this browser');
    }

    if (!browserFeatures.isIndexedDBSupported()) {
      throw new Error('IndexedDB is not supported in this browser');
    }

    // Initialize WASM module
    const wasm = await loadWasm();

    // Initialize vector index
    this.vectorIndex = new wasm.HNSWIndex({
      dimension: this.config.dimension ?? 384,
      maxElements: this.config.maxElements ?? 10000,
      ef: this.config.ef ?? 200,
      m: this.config.m ?? 16,
    });

    // Initialize storage
    this.storage = new MockIndexedDBAdapter(
      this.config.dbName ?? 'browser-agent',
      this.config.storeName ?? 'vectors'
    );
    await this.storage.open();

    this.initialized = true;
    this.state = 'ready';
  }

  async addVector(id: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();
    await this.vectorIndex!.add(id, vector, metadata);
    await this.storage!.put(`vector:${id}`, { id, vector: Array.from(vector), metadata });
  }

  async search(
    query: Float32Array,
    k: number,
    filter?: (id: string) => boolean
  ): Promise<Array<{ id: string; distance: number; metadata?: Record<string, unknown> }>> {
    this.ensureInitialized();
    return this.vectorIndex!.search(query, k, filter);
  }

  async deleteVector(id: string): Promise<boolean> {
    this.ensureInitialized();
    const deleted = await this.vectorIndex!.delete(id);
    await this.storage!.delete(`vector:${id}`);
    return deleted;
  }

  async persist(): Promise<Uint8Array> {
    this.ensureInitialized();
    return this.vectorIndex!.serialize();
  }

  async restore(data: Uint8Array): Promise<void> {
    this.ensureInitialized();
    this.vectorIndex = await MockHNSWIndex.deserialize(data);
  }

  getState(): AgentState {
    return this.state;
  }

  getId(): string {
    return this.id;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getVectorCount(): number {
    return this.vectorIndex?.size ?? 0;
  }

  async shutdown(): Promise<void> {
    if (this.storage) {
      await this.storage.close();
    }
    this.vectorIndex = null;
    this.storage = null;
    this.initialized = false;
    this.state = 'shutdown';
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('BrowserAgent is not initialized. Call initialize() first.');
    }
  }
}

interface BrowserAgentConfig {
  id?: string;
  dimension?: number;
  maxElements?: number;
  ef?: number;
  m?: number;
  dbName?: string;
  storeName?: string;
}

type AgentState = 'idle' | 'ready' | 'processing' | 'error' | 'shutdown';

describe('BrowserAgent', () => {
  const cleanup = createResourceCleanup();
  let agent: BrowserAgent;

  beforeEach(() => {
    // Reset mock implementations before each test
    // (jest.clearAllMocks is called globally, so we need to re-setup mocks)
    browserFeatures.isWasmSupported.mockImplementation(() => true);
    browserFeatures.isIndexedDBSupported.mockImplementation(() => true);
    browserFeatures.isSharedArrayBufferSupported.mockImplementation(() => true);
    browserFeatures.isWebWorkersSupported.mockImplementation(() => true);
    browserFeatures.getMaxMemory.mockImplementation(() => 2 * 1024 * 1024 * 1024);
    browserFeatures.getBrowserInfo.mockImplementation(() => ({
      name: 'Chrome',
      version: '120.0.0',
      isMobile: false,
    }));
    loadWasm.mockImplementation(() => Promise.resolve({
      HNSWIndex: MockHNSWIndex,
      version: '1.0.0-mock',
      isWasmSupported: true,
    }));

    agent = new BrowserAgent({
      id: 'test-agent',
      dimension: 384,
      maxElements: 1000,
    });
  });

  afterEach(async () => {
    if (agent && agent.isInitialized()) {
      await agent.shutdown();
    }
    await cleanup.afterEach();
  });

  describe('Initialization', () => {
    it('should initialize successfully with default config', async () => {
      await agent.initialize();

      expect(agent.isInitialized()).toBe(true);
      expect(agent.getState()).toBe('ready');
      expect(loadWasm).toHaveBeenCalled();
    });

    it('should initialize with custom configuration', async () => {
      const customAgent = new BrowserAgent({
        id: 'custom-agent',
        dimension: 512,
        maxElements: 5000,
        ef: 100,
        m: 32,
        dbName: 'custom-db',
        storeName: 'custom-store',
      });

      await customAgent.initialize();

      expect(customAgent.isInitialized()).toBe(true);
      expect(customAgent.getId()).toBe('custom-agent');

      await customAgent.shutdown();
    });

    it('should be idempotent - multiple initialize calls should not fail', async () => {
      await agent.initialize();
      await agent.initialize();
      await agent.initialize();

      expect(agent.isInitialized()).toBe(true);
      expect(loadWasm).toHaveBeenCalledTimes(1);
    });

    it('should throw error when WASM is not supported', async () => {
      browserFeatures.isWasmSupported.mockReturnValueOnce(false);

      await expect(agent.initialize()).rejects.toThrow('WASM is not supported');
    });

    it('should throw error when IndexedDB is not supported', async () => {
      browserFeatures.isIndexedDBSupported.mockReturnValueOnce(false);

      await expect(agent.initialize()).rejects.toThrow('IndexedDB is not supported');
    });

    it('should generate unique ID when not provided', async () => {
      const agentWithoutId = new BrowserAgent({ dimension: 384 });
      await agentWithoutId.initialize();

      expect(agentWithoutId.getId()).toMatch(/^browser-agent-\d+$/);

      await agentWithoutId.shutdown();
    });
  });

  describe('Vector Operations', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should add vectors successfully', async () => {
      const vector = new Float32Array(384).fill(0.5);

      await agent.addVector('vec-1', vector, { label: 'test' });

      expect(agent.getVectorCount()).toBe(1);
    });

    it('should add multiple vectors', async () => {
      const vectors = [
        { id: 'vec-1', data: new Float32Array(384).fill(0.1) },
        { id: 'vec-2', data: new Float32Array(384).fill(0.2) },
        { id: 'vec-3', data: new Float32Array(384).fill(0.3) },
      ];

      for (const v of vectors) {
        await agent.addVector(v.id, v.data);
      }

      expect(agent.getVectorCount()).toBe(3);
    });

    it('should reject vectors with wrong dimension', async () => {
      const wrongDimensionVector = new Float32Array(256).fill(0.5);

      await expect(agent.addVector('wrong', wrongDimensionVector)).rejects.toThrow(
        'Vector dimension mismatch'
      );
    });

    it('should search vectors with similarity ranking', async () => {
      // Add test vectors
      const vec1 = new Float32Array(384).fill(0.1);
      const vec2 = new Float32Array(384).fill(0.5);
      const vec3 = new Float32Array(384).fill(0.9);

      await agent.addVector('low', vec1, { type: 'low' });
      await agent.addVector('mid', vec2, { type: 'mid' });
      await agent.addVector('high', vec3, { type: 'high' });

      // Query vector similar to high
      const query = new Float32Array(384).fill(0.85);
      const results = await agent.search(query, 2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('high');
      expect(results[0].distance).toBeLessThan(results[1].distance);
    });

    it('should apply filter during search', async () => {
      await agent.addVector('keep-1', new Float32Array(384).fill(0.5), { keep: true });
      await agent.addVector('keep-2', new Float32Array(384).fill(0.5), { keep: true });
      await agent.addVector('skip', new Float32Array(384).fill(0.5), { keep: false });

      const query = new Float32Array(384).fill(0.5);
      const results = await agent.search(query, 10, (id) => id.startsWith('keep'));

      expect(results).toHaveLength(2);
      expect(results.every(r => r.id.startsWith('keep'))).toBe(true);
    });

    it('should delete vectors', async () => {
      const vector = new Float32Array(384).fill(0.5);
      await agent.addVector('to-delete', vector);

      expect(agent.getVectorCount()).toBe(1);

      const deleted = await agent.deleteVector('to-delete');

      expect(deleted).toBe(true);
      expect(agent.getVectorCount()).toBe(0);
    });

    it('should return false when deleting non-existent vector', async () => {
      const deleted = await agent.deleteVector('non-existent');

      expect(deleted).toBe(false);
    });

    it('should preserve metadata during search', async () => {
      const metadata = {
        label: 'test-label',
        category: 'A',
        score: 0.95,
        tags: ['tag1', 'tag2'],
      };

      await agent.addVector('with-meta', new Float32Array(384).fill(0.5), metadata);

      const query = new Float32Array(384).fill(0.5);
      const results = await agent.search(query, 1);

      expect(results[0].metadata).toEqual(metadata);
    });
  });

  describe('Persistence', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should serialize index to bytes', async () => {
      await agent.addVector('vec-1', new Float32Array(384).fill(0.5));
      await agent.addVector('vec-2', new Float32Array(384).fill(0.3));

      const serialized = await agent.persist();

      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBeGreaterThan(0);
    });

    it('should restore index from bytes', async () => {
      // Add vectors and serialize
      await agent.addVector('vec-1', new Float32Array(384).fill(0.5));
      await agent.addVector('vec-2', new Float32Array(384).fill(0.3));
      const serialized = await agent.persist();

      // Create new agent and restore
      const newAgent = new BrowserAgent({ id: 'restored-agent', dimension: 384 });
      await newAgent.initialize();
      await newAgent.restore(serialized);

      expect(newAgent.getVectorCount()).toBe(2);

      // Verify search still works
      const query = new Float32Array(384).fill(0.5);
      const results = await newAgent.search(query, 2);
      expect(results).toHaveLength(2);

      await newAgent.shutdown();
    });

    it('should preserve metadata during serialization', async () => {
      await agent.addVector('meta-vec', new Float32Array(384).fill(0.5), {
        label: 'preserved',
        value: 42,
      });
      const serialized = await agent.persist();

      const newAgent = new BrowserAgent({ id: 'restored-agent', dimension: 384 });
      await newAgent.initialize();
      await newAgent.restore(serialized);

      const query = new Float32Array(384).fill(0.5);
      const results = await newAgent.search(query, 1);

      expect(results[0].metadata).toEqual({ label: 'preserved', value: 42 });

      await newAgent.shutdown();
    });
  });

  describe('Lifecycle Management', () => {
    it('should transition through states correctly', async () => {
      expect(agent.getState()).toBe('idle');

      await agent.initialize();
      expect(agent.getState()).toBe('ready');

      await agent.shutdown();
      expect(agent.getState()).toBe('shutdown');
    });

    it('should throw error when operating on uninitialized agent', async () => {
      await expect(
        agent.addVector('vec', new Float32Array(384).fill(0.5))
      ).rejects.toThrow('not initialized');

      await expect(
        agent.search(new Float32Array(384).fill(0.5), 5)
      ).rejects.toThrow('not initialized');

      await expect(agent.persist()).rejects.toThrow('not initialized');
    });

    it('should handle shutdown gracefully when not initialized', async () => {
      await expect(agent.shutdown()).resolves.not.toThrow();
      expect(agent.getState()).toBe('shutdown');
    });

    it('should cleanup resources on shutdown', async () => {
      await agent.initialize();
      await agent.addVector('vec', new Float32Array(384).fill(0.5));

      await agent.shutdown();

      expect(agent.isInitialized()).toBe(false);
      expect(agent.getVectorCount()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should handle WASM load failure gracefully', async () => {
      loadWasm.mockRejectedValueOnce(new Error('WASM load failed'));

      const failingAgent = new BrowserAgent({ dimension: 384 });

      await expect(failingAgent.initialize()).rejects.toThrow('WASM load failed');
      expect(failingAgent.isInitialized()).toBe(false);
    });

    it('should reject invalid query dimensions', async () => {
      const invalidQuery = new Float32Array(128).fill(0.5);

      await expect(agent.search(invalidQuery, 5)).rejects.toThrow('dimension mismatch');
    });

    it('should handle max elements limit', async () => {
      const smallAgent = new BrowserAgent({ dimension: 4, maxElements: 2 });
      await smallAgent.initialize();

      await smallAgent.addVector('v1', new Float32Array([0.1, 0.2, 0.3, 0.4]));
      await smallAgent.addVector('v2', new Float32Array([0.5, 0.6, 0.7, 0.8]));

      await expect(
        smallAgent.addVector('v3', new Float32Array([0.9, 1.0, 1.1, 1.2]))
      ).rejects.toThrow('Index is full');

      await smallAgent.shutdown();
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should handle bulk vector insertion efficiently', async () => {
      const vectorCount = 100;
      const startTime = Date.now();

      for (let i = 0; i < vectorCount; i++) {
        const vector = new Float32Array(384);
        for (let j = 0; j < 384; j++) {
          vector[j] = Math.random();
        }
        await agent.addVector(`vec-${i}`, vector, { index: i });
      }

      const duration = Date.now() - startTime;

      expect(agent.getVectorCount()).toBe(vectorCount);
      // Should complete 100 insertions in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should search efficiently with many vectors', async () => {
      // Add 50 vectors
      for (let i = 0; i < 50; i++) {
        const vector = new Float32Array(384);
        for (let j = 0; j < 384; j++) {
          vector[j] = Math.random();
        }
        await agent.addVector(`vec-${i}`, vector);
      }

      const query = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        query[i] = Math.random();
      }

      const startTime = Date.now();
      const results = await agent.search(query, 10);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      // Search should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Browser Feature Detection', () => {
    it('should check WASM support before initialization', async () => {
      await agent.initialize();

      expect(browserFeatures.isWasmSupported).toHaveBeenCalled();
    });

    it('should check IndexedDB support before initialization', async () => {
      await agent.initialize();

      expect(browserFeatures.isIndexedDBSupported).toHaveBeenCalled();
    });

    it('should query browser capabilities', () => {
      const info = browserFeatures.getBrowserInfo();

      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('isMobile');
    });

    it('should report available memory', () => {
      const maxMemory = browserFeatures.getMaxMemory();

      expect(typeof maxMemory).toBe('number');
      expect(maxMemory).toBeGreaterThan(0);
    });
  });
});
