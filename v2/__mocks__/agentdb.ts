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

// In-memory storage for stateful mock behavior
const mockStorage = new Map<string, Map<string, any>>();

// Get or create table storage
const getTableStorage = (dbPath: string, table: string = 'patterns') => {
  const key = `${dbPath}:${table}`;
  if (!mockStorage.has(key)) {
    mockStorage.set(key, new Map());
  }
  return mockStorage.get(key)!;
};

// Create mock database object with all required methods
// AgentDBService expects: db.exec(), db.run(), db.get(), db.all(), db.close()
const createMockDatabase = (dbPath: string = 'default') => {
  let rowIdCounter = 0;

  return {
    _dbPath: dbPath,
    // Direct methods used by AgentDBService
    exec: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      const storage = getTableStorage(dbPath);

      // Handle INSERT OR REPLACE
      if (sql.includes('INSERT OR REPLACE INTO patterns')) {
        const id = params?.[0];
        if (id) {
          rowIdCounter++;
          storage.set(id, {
            id,
            type: params?.[1],
            domain: params?.[2],
            data: params?.[3],
            confidence: params?.[4],
            usage_count: params?.[5],
            success_count: params?.[6],
            embedding: params?.[7],
            created_at: params?.[8],
            last_used: params?.[9],
            metadata: params?.[10],
            rowid: rowIdCounter
          });
        }
        return { lastID: rowIdCounter, changes: 1 };
      }

      // Handle DELETE
      if (sql.includes('DELETE FROM patterns WHERE id')) {
        const id = params?.[0];
        const existed = storage.has(id);
        storage.delete(id);
        return { changes: existed ? 1 : 0 };
      }

      return { lastID: rowIdCounter, changes: 1 };
    }),
    get: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
      const storage = getTableStorage(dbPath);

      // Handle COUNT(*)
      if (sql.includes('COUNT(*)')) {
        return { count: storage.size };
      }

      // Handle SELECT by id
      if (sql.includes('WHERE id = ?')) {
        const id = params?.[0];
        return storage.get(id) || null;
      }

      // Handle SELECT by rowid
      if (sql.includes('WHERE rowid = ?')) {
        const rowid = params?.[0];
        for (const row of storage.values()) {
          if (row.rowid === rowid) {
            return row;
          }
        }
        return null;
      }

      return { count: storage.size, rowid: 1 };
    }),
    all: jest.fn().mockImplementation(async () => {
      const storage = getTableStorage(dbPath);
      return Array.from(storage.values());
    }),
    close: jest.fn().mockImplementation(async () => {
      // Clear storage for this database on close
      mockStorage.delete(`${dbPath}:patterns`);
    }),
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
  };
};

// Track calls for testing purposes
const createDatabaseCalls: any[] = [];

// Clear all mock storage between tests
export function clearMockStorage(): void {
  mockStorage.clear();
}

// IMPORTANT: createDatabase must return a Promise
// Using a real async function that won't be reset by resetMocks: true
export async function createDatabase(dbPath?: string): Promise<ReturnType<typeof createMockDatabase>> {
  createDatabaseCalls.push({ dbPath, timestamp: Date.now() });
  return createMockDatabase(dbPath || 'default');
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
  clearMockStorage,
  WASMVectorSearch,
  HNSWIndex,
  AgentDB,
  ReasoningBank,
  EmbeddingService
};
