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
  initialize: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),

  // Query methods (synchronous for better-sqlite3 compatibility)
  query: jest.fn().mockReturnValue({ rows: [] }),

  // Prepared statement support
  prepare: jest.fn().mockReturnValue({
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
  each: jest.fn().mockReturnValue(undefined),

  // Utility methods
  pragma: jest.fn().mockReturnValue(undefined),
  stats: jest.fn().mockResolvedValue({
    total: 0,
    active: 0,
    size: 1024,
    tables: 15,
    lastModified: new Date()
  }),
  compact: jest.fn().mockResolvedValue(undefined),

  // Transaction support
  transaction: jest.fn((callback) => callback()),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),

  // Domain-specific methods (from real Database class)
  upsertFleet: jest.fn().mockResolvedValue(undefined),
  upsertAgent: jest.fn().mockResolvedValue(undefined),
  upsertTask: jest.fn().mockResolvedValue(undefined),
  insertEvent: jest.fn().mockResolvedValue(undefined),
  insertMetric: jest.fn().mockResolvedValue(undefined),

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
    return mockDatabase.initialize();
  }

  async close(): Promise<void> {
    return mockDatabase.close();
  }

  // Query methods
  exec(sql: string): void {
    return mockDatabase.exec(sql);
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    const result = mockDatabase.run(sql, params);
    return {
      lastID: result.lastInsertRowid || 0,
      changes: result.changes || 0
    };
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    return mockDatabase.get(sql, params);
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    return mockDatabase.all(sql, params);
  }

  // Prepared statements
  prepare(sql: string): any {
    return mockDatabase.prepare(sql);
  }

  // Utility methods
  async stats(): Promise<any> {
    return mockDatabase.stats();
  }

  async compact(): Promise<void> {
    return mockDatabase.compact();
  }

  // Transaction support
  transaction(callback: () => void): void {
    return mockDatabase.transaction(callback);
  }

  // Domain-specific methods
  async upsertFleet(fleet: any): Promise<void> {
    return mockDatabase.upsertFleet(fleet);
  }

  async upsertAgent(agent: any): Promise<void> {
    return mockDatabase.upsertAgent(agent);
  }

  async upsertTask(task: any): Promise<void> {
    return mockDatabase.upsertTask(task);
  }

  async insertEvent(event: any): Promise<void> {
    return mockDatabase.insertEvent(event);
  }

  async insertMetric(metric: any): Promise<void> {
    return mockDatabase.insertMetric(metric);
  }

  // Test helper
  _resetMocks(): void {
    mockDatabase._resetMocks();
  }
}

// Default export for easier mocking
export default Database;
