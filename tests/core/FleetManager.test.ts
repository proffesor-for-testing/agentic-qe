/**
 * FleetManager Tests
 */

import { FleetManager } from '../../src/core/FleetManager';
import { Config } from '../../src/utils/Config';

describe('FleetManager', () => {
  let fleetManager: FleetManager;
  let mockConfig: any;

  beforeEach(async () => {
    mockConfig = {
      fleet: {
        id: 'test-fleet',
        name: 'Test Fleet',
        maxAgents: 5,
        heartbeatInterval: 30000,
        taskTimeout: 300000
      },
      agents: [
        {
          type: 'test-executor',
          count: 2,
          config: {}
        }
      ],
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
    // Stop fleet manager gracefully
    if (fleetManager) {
      try {
        await fleetManager.stop();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Wait for all async operations
    await new Promise(resolve => setImmediate(resolve));

    // Clear all mocks
    jest.clearAllMocks();

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

    it('should spawn new agents', async () => {
      const agent = await fleetManager.spawnAgent('test-executor');

      expect(agent).toBeDefined();
      expect(agent.getType()).toBe('test-executor');
    });

    it('should list all agents', () => {
      const agents = fleetManager.getAllAgents();
      expect(Array.isArray(agents)).toBe(true);
    });
  });
});