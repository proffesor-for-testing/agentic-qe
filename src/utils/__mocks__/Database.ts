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
  public initialize: jest.Mock<() => Promise<void>>;
  public close: jest.Mock<() => Promise<void>>;
  public exec: jest.Mock<(sql: string) => void>;
  public run: jest.Mock<(sql: string, params?: any[]) => Promise<{ lastID: number; changes: number }>>;
  public get: jest.Mock<(sql: string, params?: any[]) => Promise<any>>;
  public all: jest.Mock<(sql: string, params?: any[]) => Promise<any[]>>;
  public prepare: jest.Mock<(sql: string) => any>;
  public stats: jest.Mock<() => Promise<any>>;
  public compact: jest.Mock<() => Promise<void>>;
  public transaction: jest.Mock<(callback: () => void) => void>;
  public upsertFleet: jest.Mock<(fleet: any) => Promise<void>>;
  public upsertAgent: jest.Mock<(agent: any) => Promise<void>>;
  public upsertTask: jest.Mock<(task: any) => Promise<void>>;
  public insertEvent: jest.Mock<(event: any) => Promise<void>>;
  public insertMetric: jest.Mock<(metric: any) => Promise<void>>;

  constructor(dbPath: string = './data/fleet.db') {
    this.dbPath = dbPath;

    // Assign mock functions directly to instance
    this.initialize = mockDatabase.initialize as jest.Mock<() => Promise<void>>;
    this.close = mockDatabase.close as jest.Mock<() => Promise<void>>;
    this.exec = jest.fn<(sql: string) => void>(() => mockDatabase.exec());
    this.run = jest.fn<(sql: string, params?: any[]) => Promise<{ lastID: number; changes: number }>>(async () => {
      const result = mockDatabase.run() as { lastInsertRowid?: number; changes?: number };
      return {
        lastID: result.lastInsertRowid || 0,
        changes: result.changes || 0
      };
    });
    this.get = jest.fn<(sql: string, params?: any[]) => Promise<any>>(async () => mockDatabase.get());
    this.all = jest.fn<(sql: string, params?: any[]) => Promise<any[]>>(async () => mockDatabase.all() as any[]);
    this.prepare = jest.fn<(sql: string) => any>(() => mockDatabase.prepare());
    this.stats = mockDatabase.stats as jest.Mock<() => Promise<any>>;
    this.compact = mockDatabase.compact as jest.Mock<() => Promise<void>>;
    this.transaction = jest.fn<(callback: () => void) => void>((callback: () => void) => mockDatabase.transaction(callback));
    this.upsertFleet = mockDatabase.upsertFleet as jest.Mock<(fleet: any) => Promise<void>>;
    this.upsertAgent = mockDatabase.upsertAgent as jest.Mock<(agent: any) => Promise<void>>;
    this.upsertTask = mockDatabase.upsertTask as jest.Mock<(task: any) => Promise<void>>;
    this.insertEvent = mockDatabase.insertEvent as jest.Mock<(event: any) => Promise<void>>;
    this.insertMetric = mockDatabase.insertMetric as jest.Mock<(metric: any) => Promise<void>>;
  }

  // Test helper
  _resetMocks(): void {
    mockDatabase._resetMocks();
  }
}

// Default export for easier mocking
export default Database;
