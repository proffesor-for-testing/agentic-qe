/**
 * FleetManager Tests
 */

// Mock Logger before any imports that use it
jest.mock('../../src/utils/Logger', () => {
  const mockLoggerInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    child: jest.fn(function() { return this; }),
    setLevel: jest.fn(),
    getLevel: jest.fn(() => 'info')
  };

  return {
    Logger: {
      getInstance: jest.fn(() => mockLoggerInstance)
    },
    LogLevel: {
      ERROR: 'error',
      WARN: 'warn',
      INFO: 'info',
      DEBUG: 'debug'
    }
  };
});

// Mock Database before any imports that use it
jest.mock('../../src/utils/Database', () => {
  // Create mock class that properly implements Database interface
  class MockDatabase {
    initialize = jest.fn().mockResolvedValue(undefined);
    close = jest.fn().mockResolvedValue(undefined);
    query = jest.fn().mockReturnValue({ rows: [] });
    run = jest.fn().mockResolvedValue({ lastID: 1, changes: 1 });
    get = jest.fn().mockResolvedValue(undefined);
    all = jest.fn().mockResolvedValue([]);
    exec = jest.fn().mockReturnValue(undefined);
    upsertFleet = jest.fn().mockResolvedValue(undefined);
    upsertAgent = jest.fn().mockResolvedValue(undefined);
    upsertTask = jest.fn().mockResolvedValue(undefined);
    insertEvent = jest.fn().mockResolvedValue(undefined);
    insertMetric = jest.fn().mockResolvedValue(undefined);
    stats = jest.fn().mockResolvedValue({ total: 0, active: 0 });
    compact = jest.fn().mockResolvedValue(undefined);
  }

  return {
    Database: MockDatabase
  };
});

// Mock EventBus to prevent Logger dependency issues
jest.mock('../../src/core/EventBus', () => {
  const EventEmitter = require('events');

  class MockEventBus extends EventEmitter {
    private static instance: any = null;

    static getInstance() {
      if (!MockEventBus.instance) {
        MockEventBus.instance = new MockEventBus();
      }
      return MockEventBus.instance;
    }

    static resetInstance() {
      if (MockEventBus.instance) {
        MockEventBus.instance.removeAllListeners();
        MockEventBus.instance = null;
      }
    }

    initialize = jest.fn().mockResolvedValue(undefined);
    close = jest.fn().mockResolvedValue(undefined);
    publish = jest.fn().mockResolvedValue(undefined);
    subscribe = jest.fn();
    unsubscribe = jest.fn();

    constructor() {
      super();
      this.setMaxListeners(1000);
    }
  }

  return {
    EventBus: MockEventBus
  };
});

// Mock MemoryManager to prevent Logger and Database dependency issues
jest.mock('../../src/core/MemoryManager', () => {
  const EventEmitter = require('events');

  class MockMemoryManager extends EventEmitter {
    initialize = jest.fn().mockResolvedValue(undefined);
    shutdown = jest.fn().mockResolvedValue(undefined);
    store = jest.fn().mockResolvedValue(undefined);
    retrieve = jest.fn().mockResolvedValue(undefined);
    delete = jest.fn().mockResolvedValue(true);
    search = jest.fn().mockResolvedValue([]);
    getStats = jest.fn().mockResolvedValue({
      totalKeys: 0,
      totalSize: 0,
      namespaces: [],
      expiredKeys: 0,
      persistentKeys: 0
    });

    constructor(database?: any) {
      super();
    }
  }

  return {
    MemoryManager: MockMemoryManager
  };
});

import { FleetManager } from '../../src/core/FleetManager';
import { Config } from '../../src/utils/Config';
import { createResourceCleanup } from '../helpers/cleanup';

describe('FleetManager', () => {
  let fleetManager: FleetManager;
  let mockConfig: any;
  const cleanup = createResourceCleanup();

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    mockConfig = {
      fleet: {
        id: 'test-fleet',
        name: 'Test Fleet',
        maxAgents: 5,
        heartbeatInterval: 30000,
        taskTimeout: 300000
      },
      // Don't create agents during initialization - we'll test agent spawning separately
      agents: [],
      database: {
        type: 'sqlite',
        filename: ':memory:'
      },
      logging: {
        level: 'error'
      },
      api: {
        port: 3000,
        host: '0.0.0.0'
      },
      security: {}
    };

    fleetManager = new FleetManager(mockConfig);
  });

  afterEach(async () => {
    // Stop fleet manager gracefully (includes agent cleanup)
    if (fleetManager) {
      try {
        await fleetManager.stop();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Comprehensive cleanup using helper utilities
    await cleanup.afterEach();

    // Clear references
    fleetManager = null as any;
    mockConfig = null as any;
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(fleetManager.initialize()).resolves.not.toThrow();
    });

    it('should start after initialization', async () => {
      await fleetManager.initialize();
      await expect(fleetManager.start()).resolves.not.toThrow();
    });
  });

  describe('status', () => {
    it('should return fleet status', async () => {
      await fleetManager.initialize();

      const status = fleetManager.getStatus();

      expect(status).toMatchObject({
        activeAgents: expect.any(Number),
        totalAgents: expect.any(Number),
        runningTasks: expect.any(Number),
        completedTasks: expect.any(Number),
        failedTasks: expect.any(Number),
        uptime: expect.any(Number),
        status: expect.stringMatching(/initializing|running|stopped/)
      });
    });
  });

  describe('agent management', () => {
    beforeEach(async () => {
      await fleetManager.initialize();
    });

    it('should list all agents', () => {
      const agents = fleetManager.getAllAgents();
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBe(0); // No agents created during initialization
    });

    // TODO: Add proper agent spawning tests with mocked createAgent factory
    // Currently skipped because we need to mock the entire agent factory
    it.skip('should spawn new agents', async () => {
      const agent = await fleetManager.spawnAgent('test-executor');

      expect(agent).toBeDefined();
      expect(agent.getType()).toBe('test-executor');
    });
  });
});