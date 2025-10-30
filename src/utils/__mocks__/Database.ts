/**
 * Comprehensive Database Mock
 *
 * Provides complete mock implementation of Database class with all required methods
 * for better-sqlite3 compatibility and test isolation.
 */

import { jest } from '@jest/globals';

/**
 * Mock database that matches the Database class interface
 * Supports both synchronous (better-sqlite3) and async patterns
 */
export const mockDatabase = {
  // Core lifecycle methods
  initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),

  // Query methods (synchronous for better-sqlite3 compatibility)
  query: jest.fn<() => { rows: any[] }>().mockReturnValue({ rows: [] }),

  // Prepared statement support
  prepare: jest.fn<() => any>().mockReturnValue({
    run: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: jest.fn().mockReturnValue(undefined),
    all: jest.fn().mockReturnValue([]),
    finalize: jest.fn().mockReturnValue(undefined)
  }),

  // Direct execution methods (synchronous for better-sqlite3)
  run: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
  get: jest.fn().mockReturnValue(undefined),
  all: jest.fn().mockReturnValue([]),
  exec: jest.fn().mockReturnValue(undefined),
  each: jest.fn<() => void>().mockReturnValue(undefined),

  // Utility methods
  pragma: jest.fn<() => any>().mockReturnValue(undefined),
  stats: jest.fn<() => Promise<any>>().mockResolvedValue({
    total: 0,
    active: 0,
    size: 1024,
    tables: 15,
    lastModified: new Date()
  }),
  compact: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),

  // Transaction support
  transaction: jest.fn<(callback: () => void) => void>((callback: () => void) => callback()),
  beginTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),

  // Domain-specific methods (from real Database class)
  upsertFleet: jest.fn<(fleet: any) => Promise<void>>().mockResolvedValue(undefined),
  upsertAgent: jest.fn<(agent: any) => Promise<void>>().mockResolvedValue(undefined),
  upsertTask: jest.fn<(task: any) => Promise<void>>().mockResolvedValue(undefined),
  insertEvent: jest.fn<(event: any) => Promise<void>>().mockResolvedValue(undefined),
  insertMetric: jest.fn<(metric: any) => Promise<void>>().mockResolvedValue(undefined),

  // Additional helper methods for testing
  _resetMocks: () => {
    Object.values(mockDatabase).forEach(value => {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as jest.Mock).mockClear();
      }
    });
  }
};

/**
 * Database class mock that can be used with jest.mock()
 */
export class Database {
  private dbPath: string;

  constructor(dbPath: string = './data/fleet.db') {
    this.dbPath = dbPath;
  }

  // Lifecycle
  async initialize(): Promise<void> {
    return mockDatabase.initialize() as Promise<void>;
  }

  async close(): Promise<void> {
    return mockDatabase.close() as Promise<void>;
  }

  // Query methods
  exec(sql: string): void {
    mockDatabase.exec();
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    const result = mockDatabase.run() as { lastInsertRowid?: number; changes?: number };
    return {
      lastID: result.lastInsertRowid || 0,
      changes: result.changes || 0
    };
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    return mockDatabase.get();
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    return mockDatabase.all() as any[];
  }

  // Prepared statements
  prepare(sql: string): any {
    return mockDatabase.prepare();
  }

  // Utility methods
  async stats(): Promise<any> {
    return mockDatabase.stats() as Promise<any>;
  }

  async compact(): Promise<void> {
    return mockDatabase.compact() as Promise<void>;
  }

  // Transaction support
  transaction(callback: () => void): void {
    mockDatabase.transaction(callback);
  }

  // Domain-specific methods
  async upsertFleet(fleet: any): Promise<void> {
    return mockDatabase.upsertFleet(fleet) as Promise<void>;
  }

  async upsertAgent(agent: any): Promise<void> {
    return mockDatabase.upsertAgent(agent) as Promise<void>;
  }

  async upsertTask(task: any): Promise<void> {
    return mockDatabase.upsertTask(task) as Promise<void>;
  }

  async insertEvent(event: any): Promise<void> {
    return mockDatabase.insertEvent(event) as Promise<void>;
  }

  async insertMetric(metric: any): Promise<void> {
    return mockDatabase.insertMetric(metric) as Promise<void>;
  }

  // Test helper
  _resetMocks(): void {
    mockDatabase._resetMocks();
  }
}

// Default export for easier mocking
export default Database;
