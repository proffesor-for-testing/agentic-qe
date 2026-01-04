/**
 * Mock for @ruvector/edge module
 *
 * Provides mock implementations of WASM-compatible edge APIs for testing
 * browser-based vector search and storage functionality.
 */

// Mock HNSW Index for browser
export class MockHNSWIndex {
  private vectors: Map<string, Float32Array> = new Map();
  private metadata: Map<string, Record<string, unknown>> = new Map();
  private dimension: number;
  private maxElements: number;
  private ef: number = 200;
  private m: number = 16;

  constructor(config: {
    dimension: number;
    maxElements?: number;
    ef?: number;
    m?: number;
  }) {
    this.dimension = config.dimension;
    this.maxElements = config.maxElements ?? 10000;
    this.ef = config.ef ?? 200;
    this.m = config.m ?? 16;
  }

  async add(id: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void> {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }
    if (this.vectors.size >= this.maxElements) {
      throw new Error('Index is full');
    }
    this.vectors.set(id, vector);
    if (metadata) {
      this.metadata.set(id, metadata);
    }
  }

  async search(
    query: Float32Array,
    k: number,
    filter?: (id: string) => boolean
  ): Promise<Array<{ id: string; distance: number; metadata?: Record<string, unknown> }>> {
    if (query.length !== this.dimension) {
      throw new Error(`Query dimension mismatch: expected ${this.dimension}, got ${query.length}`);
    }

    const results: Array<{ id: string; distance: number; metadata?: Record<string, unknown> }> = [];

    const entries = Array.from(this.vectors.entries());
    for (const [id, vector] of entries) {
      if (filter && !filter(id)) continue;

      // Calculate cosine distance
      const distance = this.cosineDistance(query, vector);
      results.push({
        id,
        distance,
        metadata: this.metadata.get(id),
      });
    }

    // Sort by distance ascending
    results.sort((a, b) => a.distance - b.distance);

    return results.slice(0, k);
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.vectors.has(id);
    this.vectors.delete(id);
    this.metadata.delete(id);
    return existed;
  }

  async has(id: string): Promise<boolean> {
    return this.vectors.has(id);
  }

  get size(): number {
    return this.vectors.size;
  }

  async serialize(): Promise<Uint8Array> {
    const data = {
      dimension: this.dimension,
      maxElements: this.maxElements,
      ef: this.ef,
      m: this.m,
      vectors: Array.from(this.vectors.entries()).map(([id, vec]) => ({
        id,
        vector: Array.from(vec),
        metadata: this.metadata.get(id),
      })),
    };
    return new TextEncoder().encode(JSON.stringify(data));
  }

  static async deserialize(data: Uint8Array): Promise<MockHNSWIndex> {
    const json = JSON.parse(new TextDecoder().decode(data));
    const index = new MockHNSWIndex({
      dimension: json.dimension,
      maxElements: json.maxElements,
      ef: json.ef,
      m: json.m,
    });

    for (const entry of json.vectors) {
      await index.add(entry.id, new Float32Array(entry.vector), entry.metadata);
    }

    return index;
  }

  private cosineDistance(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity; // Convert similarity to distance
  }
}

// Mock WASM module loader
// Using function implementation to avoid jest.clearAllMocks() issues
export const loadWasm = jest.fn(() => Promise.resolve({
  HNSWIndex: MockHNSWIndex,
  version: '1.0.0-mock',
  isWasmSupported: true,
}));

// Mock IndexedDB adapter
export class MockIndexedDBAdapter {
  private store: Map<string, unknown> = new Map();
  private dbName: string;
  private storeName: string;

  constructor(dbName: string, storeName: string = 'vectors') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  async open(): Promise<void> {
    // Mock open operation
  }

  async close(): Promise<void> {
    // Mock close operation
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async getAll<T>(): Promise<T[]> {
    return Array.from(this.store.values()) as T[];
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  async transaction<T>(
    mode: 'readonly' | 'readwrite',
    fn: (store: MockIndexedDBAdapter) => Promise<T>
  ): Promise<T> {
    return fn(this);
  }
}

// Mock browser feature detection
// These are created as functions that always return expected values
// to avoid issues with jest.clearAllMocks() resetting return values
export const browserFeatures = {
  isIndexedDBSupported: jest.fn(() => true),
  isWasmSupported: jest.fn(() => true),
  isSharedArrayBufferSupported: jest.fn(() => true),
  isWebWorkersSupported: jest.fn(() => true),
  getMaxMemory: jest.fn(() => 2 * 1024 * 1024 * 1024), // 2GB
  getBrowserInfo: jest.fn(() => ({
    name: 'Chrome',
    version: '120.0.0',
    isMobile: false,
  })),
};

// Mock edge runtime initialization
export const initEdgeRuntime = jest.fn(() => Promise.resolve({
  wasm: {
    HNSWIndex: MockHNSWIndex,
    version: '1.0.0-mock',
  },
  storage: MockIndexedDBAdapter,
  features: browserFeatures,
}));

// Export types for TypeScript
export interface HNSWConfig {
  dimension: number;
  maxElements?: number;
  ef?: number;
  m?: number;
}

export interface SearchResult {
  id: string;
  distance: number;
  metadata?: Record<string, unknown>;
}

export interface EdgeRuntimeConfig {
  dbName?: string;
  storeName?: string;
  wasmPath?: string;
}
