/**
 * Mock for agentdb ESM module
 * Prevents "Unexpected token 'export'" errors in Jest
 *
 * Updated: Fixed createDatabase to return Promise and HNSWIndex.buildIndex
 *
 * IMPORTANT: Don't use jest.fn().mockImplementation() because jest.config.js
 * has resetMocks: true which clears implementations between tests.
 * Instead, use a real async function that wraps jest.fn() for tracking.
 */

// Create mock database object with all required methods
// AgentDBService expects: db.exec(), db.run(), db.get(), db.all(), db.close()
const createMockDatabase = () => ({
  // Direct methods used by AgentDBService
  exec: jest.fn().mockResolvedValue(undefined),
  run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
  get: jest.fn().mockResolvedValue({ count: 0, rowid: 1 }),
  all: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
  save: jest.fn().mockResolvedValue(undefined),
  // Statement-based API (for sql.js compatibility)
  prepare: jest.fn().mockReturnValue({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn().mockReturnValue([]),
    step: jest.fn().mockReturnValue(false),
    bind: jest.fn(),
    free: jest.fn(),
    getAsObject: jest.fn().mockReturnValue({})
  })
});

// Track calls for testing purposes
const createDatabaseCalls: any[] = [];

// IMPORTANT: createDatabase must return a Promise
// Using a real async function that won't be reset by resetMocks: true
export async function createDatabase(dbPath?: string): Promise<ReturnType<typeof createMockDatabase>> {
  createDatabaseCalls.push({ dbPath, timestamp: Date.now() });
  return createMockDatabase();
}

// Allow tests to check calls
(createDatabase as any).mock = { calls: createDatabaseCalls };
(createDatabase as any).mockClear = () => { createDatabaseCalls.length = 0; };

export class WASMVectorSearch {
  private config: any;

  constructor(db?: any, config?: any) {
    this.config = config;
  }

  search = jest.fn().mockReturnValue([]);
  add = jest.fn();
  remove = jest.fn();
  clear = jest.fn();
  clearIndex = jest.fn(); // Called in close()
  buildIndex = jest.fn().mockResolvedValue(undefined);

  // Statistics method used by AgentDBService.getStats()
  getStats(): { vectorCount: number; memoryUsage: number } {
    return {
      vectorCount: 0,
      memoryUsage: 0
    };
  }
}

export class HNSWIndex {
  private ready = false;
  private db: any;
  private config: any;

  constructor(db?: any, config?: any) {
    this.db = db;
    this.config = config;
  }

  isReady(): boolean {
    return this.ready;
  }

  // Match the real API: buildIndex(tableName?: string)
  async buildIndex(tableName?: string): Promise<void> {
    this.ready = true;
  }

  // Keep old method for backwards compatibility
  async build() {
    this.ready = true;
  }

  // Statistics method used by AgentDBService.getStats()
  getStats(): { indexSize: number; memoryUsage: number; efSearch: number } {
    return {
      indexSize: 0,
      memoryUsage: 0,
      efSearch: this.config?.efSearch || 50
    };
  }

  addVector = jest.fn();
  addPoint = jest.fn();
  search = jest.fn().mockReturnValue([]);
  searchKnn = jest.fn().mockReturnValue({ neighbors: [], distances: [] });
  remove = jest.fn();
  clear = jest.fn();
}

export const AgentDB = {
  initialize: jest.fn().mockResolvedValue(undefined),
  getStats: jest.fn().mockResolvedValue({
    patterns: { count: 0 },
    sessions: { count: 0 },
    embeddings: { dimension: 384 }
  }),
  close: jest.fn().mockResolvedValue(undefined)
};

// ReasoningBank mock for RealAgentDBAdapter
export class ReasoningBank {
  private db: any;
  private config: any;

  constructor(db?: any, config?: any) {
    this.db = db;
    this.config = config;
  }

  async initialize(): Promise<void> {}
  storeReasoning = jest.fn().mockResolvedValue(undefined);
  retrieveReasoning = jest.fn().mockResolvedValue([]);
  search = jest.fn().mockResolvedValue([]);
}

// EmbeddingService mock for RealAgentDBAdapter
export class EmbeddingService {
  private config: any;

  constructor(config?: any) {
    this.config = config;
  }

  async embed(text: string): Promise<Float32Array> {
    // Return mock 384-dimensional embedding
    return new Float32Array(384).fill(0.1);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(384).fill(0.1));
  }

  getDimension(): number {
    return 384;
  }
}

// HNSWConfig type export
export interface HNSWConfig {
  M?: number;
  efConstruction?: number;
  efSearch?: number;
  numThreads?: number;
}

// HNSWSearchResult type export
export interface HNSWSearchResult {
  id: string;
  distance: number;
  metadata?: Record<string, any>;
}

export default {
  createDatabase,
  WASMVectorSearch,
  HNSWIndex,
  AgentDB,
  ReasoningBank,
  EmbeddingService
};
