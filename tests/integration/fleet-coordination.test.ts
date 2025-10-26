/**
 * Fleet Coordination Integration Tests
 * Testing complete coordination scenarios between FleetManager, Agents, and EventBus
 */

import { FleetManager } from '@core/FleetManager';
import { Agent, AgentStatus } from '@core/Agent';
import { Task, TaskStatus } from '@core/Task';
import { EventBus } from '@core/EventBus';
import { Database } from '@utils/Database';
import { Logger } from '@utils/Logger';

// Mock external dependencies but use real coordination logic
jest.mock('@utils/Database');
jest.mock('@utils/Logger');

// Test Agent implementation for integration testing
class TestIntegrationAgent extends Agent {
  private executionDelay: number = 10;
  private shouldFail: boolean = false;

  setExecutionDelay(delay: number) {
    this.executionDelay = delay;
  }

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  protected async onInitialize(): Promise<void> {
    // Simulate initialization work
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  protected async onStart(): Promise<void> {
    // Simulate startup work
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  protected async onStop(): Promise<void> {
    // Simulate cleanup work
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  protected async executeTaskLogic(task: Task): Promise<any> {
    // Simulate task execution with configurable delay
    await new Promise(resolve => setTimeout(resolve, this.executionDelay));

    if (this.shouldFail) {
      throw new Error(`Task execution failed: ${task.getId()}`);
    }

    return {
      taskId: task.getId(),
      result: 'success',
      executedBy: this.getId(),
      executionTime: this.executionDelay,
      timestamp: new Date()
    };
  }

  protected async initializeCapabilities(): Promise<void> {
    this.capabilities = [
      {
        name: 'test-execution',
        version: '1.0.0',
        description: 'Test execution capabilities',
        taskTypes: ['unit-test', 'integration-test', 'e2e-test']
      }
    ];
  }
}

describe('Fleet Coordination Integration Tests', () => {
  let fleetManager: FleetManager;
  let eventBus: EventBus;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  const createFleetConfig = () => ({
    fleet: {
      id: 'test-fleet',
      name: 'Test Fleet',
      maxAgents: 10,
      heartbeatInterval: 30000,
      taskTimeout: 300000
    },
    agents: [
      {
        type: 'test-integration',
        count: 3,
        config: { testMode: true }
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
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Database
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue({}),
      all: jest.fn().mockResolvedValue([])
    } as any;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create real EventBus for integration testing
    eventBus = new EventBus();
    await eventBus.initialize();

    // Mock agent factory to return our test agents
    const originalImport = jest.requireActual('../../src/agents');
    jest.doMock('../../src/agents', () => ({
      ...originalImport,
      createAgent: jest.fn((type: string, id: string, config: any, eventBus: EventBus) => {
        return new TestIntegrationAgent(id, type, config, eventBus);
      })
    }));

    fleetManager = new FleetManager(createFleetConfig());
  });

  afterEach(async () => {
    // Stop fleet manager gracefully
    if (fleetManager) {
      try {
        await fleetManager.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
      fleetManager = null as any;
    }

    // Clean up event bus
    if (eventBus) {
      eventBus.removeAllListeners();
      eventBus = null as any;
    }

    // Wait for all pending async operations
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setTimeout(resolve, 50));

    // Restore and clear mocks
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Clear mock implementations
    mockDatabase = null as any;
    mockLogger = null as any;

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Fleet Initialization and Agent Spawning', () => {
    it('should initialize fleet and spawn initial agents successfully', async () => {
      await fleetManager.initialize();
      await fleetManager.start();

      const status = fleetManager.getStatus();
      expect(status.totalAgents).toBe(3); // As configured
      expect(status.status).toBe('running');

      // Verify all agents are active
      const agents = fleetManager.getAllAgents();
      expect(agents).toHaveLength(3);
      agents.forEach(agent => {
        expect(agent.getStatus()).toBe(AgentStatus.ACTIVE);
      });
    });

    it('should coordinate agent initialization through event bus', async () => {
      const eventSpy = jest.spyOn(eventBus, 'emit');

      await fleetManager.initialize();
      await fleetManager.start();

      // Should emit events for fleet and agent lifecycle
      expect(eventSpy).toHaveBeenCalledWith('fleet:started', expect.any(Object));
      expect(eventSpy).toHaveBeenCalledWith('agent:spawned', expect.any(Object));
    });

    it('should handle agent spawn failures gracefully', async () => {
      // Mock agent creation to fail for one agent
      let callCount = 0;
      jest.doMock('../../src/agents', () => ({
        createAgent: jest.fn(() => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Agent creation failed');
          }
          return new TestIntegrationAgent(`agent-${callCount}`, 'test-integration', {}, eventBus);
        })
      }));

      const newFleetManager = new FleetManager(createFleetConfig());

      await expect(newFleetManager.initialize()).rejects.toThrow();

      // Cleanup should still work
      await newFleetManager.stop();
    });
  });

  describe('Task Distribution and Execution', () => {
    beforeEach(async () => {
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should distribute and execute tasks across available agents', async () => {
      const tasks = [
        new Task('task-1', 'unit-test', { test: 'data1' }),
        new Task('task-2', 'integration-test', { test: 'data2' }),
        new Task('task-3', 'e2e-test', { test: 'data3' })
      ];

      const completedTasks: string[] = [];
      const taskCompletionPromises: Promise<void>[] = [];

      // Listen for task completion events
      eventBus.on('task:completed', (data) => {
        completedTasks.push(data.taskId);
      });

      // Submit tasks concurrently
      for (const task of tasks) {
        taskCompletionPromises.push(
          new Promise((resolve) => {
            eventBus.once(`task:completed:${task.getId()}`, () => resolve());
            fleetManager.submitTask(task);
          })
        );
      }

      // Wait for all tasks to complete
      await Promise.all(taskCompletionPromises.map(p =>
        Promise.race([p, new Promise(resolve => setTimeout(resolve, 1000))])
      ));

      expect(completedTasks).toHaveLength(3);
      expect(completedTasks).toContain('task-1');
      expect(completedTasks).toContain('task-2');
      expect(completedTasks).toContain('task-3');

      // Verify fleet status shows completed tasks
      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(3);
      expect(status.runningTasks).toBe(0);
    });

    it('should handle task failures and maintain fleet stability', async () => {
      // Configure one agent to fail
      const agents = fleetManager.getAllAgents() as TestIntegrationAgent[];
      agents[0].setShouldFail(true);

      const successTask = new Task('success-task', 'unit-test', { test: 'success' });
      const failTask = new Task('fail-task', 'unit-test', { test: 'fail' });

      const eventPromises = [
        new Promise(resolve => eventBus.once('task:completed', resolve)),
        new Promise(resolve => eventBus.once('task:failed', resolve))
      ];

      await fleetManager.submitTask(successTask);
      await fleetManager.submitTask(failTask);

      // Wait for both events
      await Promise.all(eventPromises.map(p =>
        Promise.race([p, new Promise(resolve => setTimeout(resolve, 1000))])
      ));

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(1);
      expect(status.failedTasks).toBe(1);

      // Fleet should still be operational
      expect(status.status).toBe('running');
      expect(status.activeAgents).toBeGreaterThan(0);
    });

    it('should queue tasks when all agents are busy', async () => {
      const agents = fleetManager.getAllAgents() as TestIntegrationAgent[];

      // Set high execution delay to make agents busy longer
      agents.forEach(agent => agent.setExecutionDelay(100));

      // Submit more tasks than available agents
      const tasks = Array.from({ length: 5 }, (_, i) =>
        new Task(`queue-task-${i}`, 'unit-test', { index: i })
      );

      // Submit all tasks quickly
      const submitPromises = tasks.map(task => fleetManager.submitTask(task));
      await Promise.all(submitPromises);

      // Some tasks should be queued initially
      let queuedTasks = 0;
      tasks.forEach(task => {
        if (task.getStatus() === TaskStatus.QUEUED) {
          queuedTasks++;
        }
      });

      expect(queuedTasks).toBeGreaterThan(0);

      // Wait for all tasks to eventually complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(5);
    });
  });

  describe('Agent Communication and Coordination', () => {
    beforeEach(async () => {
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should coordinate agent status updates through event bus', async () => {
      const statusEvents: any[] = [];

      eventBus.on('agent:started', (data) => statusEvents.push({ type: 'started', ...data }));
      eventBus.on('agent:stopped', (data) => statusEvents.push({ type: 'stopped', ...data }));

      const agents = fleetManager.getAllAgents();
      const testAgent = agents[0];

      // Stop and restart an agent
      await testAgent.stop();
      await testAgent.start();

      expect(statusEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'stopped', agentId: testAgent.getId() }),
          expect.objectContaining({ type: 'started', agentId: testAgent.getId() })
        ])
      );
    });

    it('should handle agent failures and recovery', async () => {
      const errorEvents: any[] = [];

      eventBus.on('agent:error', (data) => errorEvents.push(data));

      const agents = fleetManager.getAllAgents();
      const testAgent = agents[0];

      // Simulate agent error
      testAgent.emit('error', new Error('Agent malfunction'));

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toMatchObject({
        agentId: testAgent.getId(),
        error: expect.any(Error)
      });

      expect(testAgent.getStatus()).toBe(AgentStatus.ERROR);
    });

    it('should maintain coordination during concurrent operations', async () => {
      const agents = fleetManager.getAllAgents() as TestIntegrationAgent[];

      // Perform multiple concurrent operations
      const operations = [
        // Task submissions
        ...Array.from({ length: 3 }, (_, i) =>
          fleetManager.submitTask(new Task(`concurrent-${i}`, 'unit-test', {}))
        ),
        // Agent operations
        agents[0].stop().then(() => agents[0].start()),
        // Fleet status queries
        Promise.resolve(fleetManager.getStatus()),
        Promise.resolve(fleetManager.getStatus())
      ];

      await Promise.all(operations);

      // Fleet should remain stable
      const finalStatus = fleetManager.getStatus();
      expect(finalStatus.status).toBe('running');
      expect(finalStatus.activeAgents).toBeGreaterThan(0);
    });
  });

  describe('Fleet Lifecycle Management', () => {
    it('should handle graceful shutdown of entire fleet', async () => {
      await fleetManager.initialize();
      await fleetManager.start();

      // Submit some tasks
      const tasks = [
        new Task('shutdown-task-1', 'unit-test', {}),
        new Task('shutdown-task-2', 'integration-test', {})
      ];

      await Promise.all(tasks.map(task => fleetManager.submitTask(task)));

      // Allow some processing time
      await new Promise(resolve => setTimeout(resolve, 50));

      // Shutdown fleet
      await fleetManager.stop();

      const finalStatus = fleetManager.getStatus();
      expect(finalStatus.status).toBe('stopped');

      // All agents should be stopped
      const agents = fleetManager.getAllAgents();
      agents.forEach(agent => {
        expect(agent.getStatus()).toBe(AgentStatus.STOPPED);
      });
    });

    it('should handle partial agent removal during operation', async () => {
      await fleetManager.initialize();
      await fleetManager.start();

      const initialAgentCount = fleetManager.getAllAgents().length;
      const agentToRemove = fleetManager.getAllAgents()[0];

      // Remove one agent
      await fleetManager.removeAgent(agentToRemove.getId());

      expect(fleetManager.getAllAgents()).toHaveLength(initialAgentCount - 1);

      // Fleet should continue operating
      const task = new Task('post-removal-task', 'unit-test', {});
      await expect(fleetManager.submitTask(task)).resolves.not.toThrow();

      // Wait for task completion
      await new Promise(resolve => setTimeout(resolve, 100));

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(1);
    });

    it('should handle dynamic agent spawning during operation', async () => {
      await fleetManager.initialize();
      await fleetManager.start();

      const initialAgentCount = fleetManager.getAllAgents().length;

      // Spawn additional agent
      const newAgent = await fleetManager.spawnAgent('test-integration', { dynamic: true });

      expect(fleetManager.getAllAgents()).toHaveLength(initialAgentCount + 1);
      expect(newAgent.getStatus()).toBe(AgentStatus.ACTIVE);

      // New agent should be able to handle tasks
      const task = new Task('dynamic-agent-task', 'unit-test', {});
      await fleetManager.submitTask(task);

      await new Promise(resolve => setTimeout(resolve, 100));

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(1);
    });
  });

  describe('Error Recovery and Resilience', () => {
    beforeEach(async () => {
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should recover from database connection issues', async () => {
      // Simulate database failure
      mockDatabase.run.mockRejectedValueOnce(new Error('Database connection lost'));

      const task = new Task('db-failure-task', 'unit-test', {});

      // Should handle gracefully and continue operation
      await expect(fleetManager.submitTask(task)).resolves.not.toThrow();

      // Reset database mock
      mockDatabase.run.mockResolvedValue({ lastID: 1, changes: 1 });

      // Subsequent operations should work
      const secondTask = new Task('recovery-task', 'unit-test', {});
      await fleetManager.submitTask(secondTask);

      await new Promise(resolve => setTimeout(resolve, 100));

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBeGreaterThan(0);
    });

    it('should handle event bus communication failures', async () => {
      // Mock event bus to fail
      const originalEmit = eventBus.emit;
      eventBus.emit = jest.fn().mockImplementation(() => {
        throw new Error('Event bus failure');
      });

      const task = new Task('eventbus-failure-task', 'unit-test', {});

      // Should handle gracefully
      await expect(fleetManager.submitTask(task)).resolves.not.toThrow();

      // Restore event bus
      eventBus.emit = originalEmit;

      // Operations should continue
      const status = fleetManager.getStatus();
      expect(status.status).toBe('running');
    });

    it('should maintain fleet coherence during multiple failures', async () => {
      const agents = fleetManager.getAllAgents() as TestIntegrationAgent[];

      // Cause multiple types of failures
      agents[0].setShouldFail(true); // Task execution failure
      agents[1].emit('error', new Error('Agent internal error')); // Agent error
      mockDatabase.run.mockRejectedValueOnce(new Error('DB error')); // DB failure

      // Submit multiple tasks
      const tasks = Array.from({ length: 5 }, (_, i) =>
        new Task(`resilience-task-${i}`, 'unit-test', {})
      );

      for (const task of tasks) {
        await fleetManager.submitTask(task);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Fleet should still be operational
      const status = fleetManager.getStatus();
      expect(status.status).toBe('running');
      expect(status.activeAgents).toBeGreaterThan(0);
      expect(status.completedTasks + status.failedTasks).toBeGreaterThan(0);
    });
  });

  describe('Performance and Load Testing', () => {
    beforeEach(async () => {
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should handle high task throughput efficiently', async () => {
      // Reduced from 50 to 20 tasks to prevent memory issues
      const taskCount = 20;
      const startTime = Date.now();

      // Submit many tasks rapidly
      const tasks = Array.from({ length: taskCount }, (_, i) =>
        new Task(`load-task-${i}`, 'unit-test', { index: i })
      );

      const submitPromises = tasks.map(task => fleetManager.submitTask(task));
      await Promise.all(submitPromises);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 1000));

      const endTime = Date.now();
      const duration = endTime - startTime;

      const status = fleetManager.getStatus();
      expect(status.completedTasks + status.failedTasks).toBe(taskCount);

      // Should handle load in reasonable time
      expect(duration).toBeLessThan(2000);

      // Cleanup between load tests
      await new Promise(resolve => setTimeout(resolve, 100));
      if (global.gc) {
        global.gc();
      }
    });

    it('should maintain performance with agent scaling', async () => {
      // Reduced from 5 to 2 additional agents to prevent memory issues
      const additionalAgents = 2;
      for (let i = 0; i < additionalAgents; i++) {
        await fleetManager.spawnAgent('test-integration', { additional: i });
      }

      const totalAgents = fleetManager.getAllAgents().length;
      expect(totalAgents).toBe(3 + additionalAgents); // 3 initial + 2 additional

      // Test with scaled fleet
      const tasks = Array.from({ length: 20 }, (_, i) =>
        new Task(`scaled-task-${i}`, 'unit-test', {})
      );

      const startTime = Date.now();

      for (const task of tasks) {
        await fleetManager.submitTask(task);
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // More agents should handle tasks faster
      expect(duration).toBeLessThan(1000);

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(20);

      // Cleanup between load tests
      await new Promise(resolve => setTimeout(resolve, 100));
      if (global.gc) {
        global.gc();
      }
    });
  });
});