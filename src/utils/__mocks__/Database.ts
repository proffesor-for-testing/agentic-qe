/**
 * Comprehensive Database Mock with Shared Mock Functions
 *
 * Ensures all Database instances share the same mock functions
 * to prevent "is not a function" errors.
 */

import { jest } from '@jest/globals';

// CRITICAL: Shared mock functions that ALL instances will use
const sharedMockFunctions = {
  initialize: jest.fn().mockResolvedValue(undefined) as any,
  close: jest.fn().mockResolvedValue(undefined) as any,
  exec: jest.fn().mockReturnValue(undefined) as any,
  run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }) as any,
  get: jest.fn().mockResolvedValue(undefined) as any,
  all: jest.fn().mockResolvedValue([]) as any,
  prepare: jest.fn().mockReturnValue({
    run: jest.fn().mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: jest.fn().mockReturnValue(undefined),
    all: jest.fn().mockReturnValue([]),
    finalize: jest.fn().mockReturnValue(undefined)
  }) as any,
  stats: jest.fn().mockResolvedValue({
    total: 0,
    active: 0,
    size: 1024,
    tables: 15,
    lastModified: new Date()
  }) as any,
  compact: jest.fn().mockResolvedValue(undefined) as any,
  transaction: jest.fn((callback: () => void) => callback()) as any,
  beginTransaction: jest.fn().mockResolvedValue(undefined) as any,
  commit: jest.fn().mockResolvedValue(undefined) as any,
  rollback: jest.fn().mockResolvedValue(undefined) as any,
  upsertFleet: jest.fn().mockResolvedValue(undefined) as any,
  upsertAgent: jest.fn().mockResolvedValue(undefined) as any,
  upsertTask: jest.fn().mockResolvedValue(undefined) as any,
  insertEvent: jest.fn().mockResolvedValue(undefined) as any,
  insertMetric: jest.fn().mockResolvedValue(undefined) as any,
  getAllQValues: jest.fn().mockResolvedValue([]) as any,
  storeQValue: jest.fn().mockResolvedValue(undefined) as any,
  query: jest.fn().mockReturnValue({ rows: [] }) as any,
  each: jest.fn().mockReturnValue(undefined) as any,
  pragma: jest.fn().mockReturnValue(undefined) as any,
  upsertQValue: jest.fn().mockResolvedValue(undefined) as any,
  getQValue: jest.fn().mockResolvedValue(null) as any,
  getStateQValues: jest.fn().mockResolvedValue([]) as any,
  storeLearningExperience: jest.fn().mockResolvedValue(undefined) as any,
  getLearningExperiences: jest.fn().mockResolvedValue([]) as any,
  storeLearningSnapshot: jest.fn().mockResolvedValue(undefined) as any,
  getLearningStatistics: jest.fn().mockResolvedValue({
    totalExperiences: 0,
    avgReward: 0,
    qTableSize: 0,
    recentImprovement: 0
  }) as any,
  pruneOldExperiences: jest.fn().mockResolvedValue(0) as any,
  getLearningHistory: jest.fn().mockResolvedValue({
    experiences: [],
    summary: {
      totalExperiences: 0,
      avgReward: 0,
      recentAvgReward: 0,
      improvementRate: 0,
      qTableSize: 0
    }
  }) as any
};

/**
 * Database class mock that shares functions across ALL instances
 */
export class Database {
  private dbPath: string;

  // Declare properties (TypeScript compatibility)
  public initialize: jest.Mock<() => Promise<void>>;
  public close: jest.Mock<() => Promise<void>>;
  public exec: jest.Mock<(sql: string) => void>;
  public run: jest.Mock;
  public get: jest.Mock;
  public all: jest.Mock;
  public prepare: jest.Mock;
  public stats: jest.Mock<() => Promise<any>>;
  public compact: jest.Mock<() => Promise<void>>;
  public transaction: jest.Mock;
  public beginTransaction: jest.Mock<() => Promise<void>>;
  public commit: jest.Mock<() => Promise<void>>;
  public rollback: jest.Mock<() => Promise<void>>;
  public upsertFleet: jest.Mock;
  public upsertAgent: jest.Mock;
  public upsertTask: jest.Mock;
  public insertEvent: jest.Mock;
  public insertMetric: jest.Mock;
  public getAllQValues: jest.Mock;
  public storeQValue: jest.Mock;
  public query: jest.Mock<() => { rows: any[] }>;
  public each: jest.Mock<() => void>;
  public pragma: jest.Mock<() => any>;
  public upsertQValue: jest.Mock;
  public getQValue: jest.Mock;
  public getStateQValues: jest.Mock;
  public storeLearningExperience: jest.Mock;
  public getLearningExperiences: jest.Mock;
  public storeLearningSnapshot: jest.Mock;
  public getLearningStatistics: jest.Mock;
  public pruneOldExperiences: jest.Mock;
  public getLearningHistory: jest.Mock;

  constructor(dbPath: string = './data/fleet.db') {
    this.dbPath = dbPath;

    // CRITICAL: Assign shared mock functions (NOT new instances)
    // Use 'as any' to bypass Jest mock type incompatibilities
    this.initialize = sharedMockFunctions.initialize as any;
    this.close = sharedMockFunctions.close as any;
    this.exec = sharedMockFunctions.exec as any;
    this.run = sharedMockFunctions.run as any;
    this.get = sharedMockFunctions.get as any;
    this.all = sharedMockFunctions.all as any;
    this.prepare = sharedMockFunctions.prepare as any;
    this.stats = sharedMockFunctions.stats as any;
    this.compact = sharedMockFunctions.compact as any;
    this.transaction = sharedMockFunctions.transaction as any;
    this.beginTransaction = sharedMockFunctions.beginTransaction as any;
    this.commit = sharedMockFunctions.commit as any;
    this.rollback = sharedMockFunctions.rollback as any;
    this.upsertFleet = sharedMockFunctions.upsertFleet as any;
    this.upsertAgent = sharedMockFunctions.upsertAgent as any;
    this.upsertTask = sharedMockFunctions.upsertTask as any;
    this.insertEvent = sharedMockFunctions.insertEvent as any;
    this.insertMetric = sharedMockFunctions.insertMetric as any;
    this.getAllQValues = sharedMockFunctions.getAllQValues as any;
    this.storeQValue = sharedMockFunctions.storeQValue as any;
    this.query = sharedMockFunctions.query as any;
    this.each = sharedMockFunctions.each as any;
    this.pragma = sharedMockFunctions.pragma as any;
    this.upsertQValue = sharedMockFunctions.upsertQValue as any;
    this.getQValue = sharedMockFunctions.getQValue as any;
    this.getStateQValues = sharedMockFunctions.getStateQValues as any;
    this.storeLearningExperience = sharedMockFunctions.storeLearningExperience as any;
    this.getLearningExperiences = sharedMockFunctions.getLearningExperiences as any;
    this.storeLearningSnapshot = sharedMockFunctions.storeLearningSnapshot as any;
    this.getLearningStatistics = sharedMockFunctions.getLearningStatistics as any;
    this.pruneOldExperiences = sharedMockFunctions.pruneOldExperiences as any;
    this.getLearningHistory = sharedMockFunctions.getLearningHistory as any;
  }

  // Test helper to reset ALL mocks
  static _resetAllMocks(): void {
    Object.values(sharedMockFunctions).forEach(mockFn => {
      if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
        (mockFn as jest.Mock).mockClear();
      }
    });
  }
}

// Export for legacy code compatibility
export const mockDatabase = sharedMockFunctions;
export default Database;
