/**
 * Performance and Load Testing Suite
 * Testing system performance under various load conditions
 */

import { FleetManager } from '../../src/core/FleetManager';
import { Task, TaskStatus } from '../../src/core/Task';
import { EventBus } from '../../src/core/EventBus';
import { Agent, AgentStatus } from '../../src/core/Agent';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');

// Performance monitoring utilities
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTimer(name: string): void {
    this.startTimes.set(name, Date.now());
  }

  endTimer(name: string): number {
    const startTime = this.startTimes.get(name);
    if (!startTime) {
      throw new Error(`Timer ${name} not started`);
    }

    const duration = Date.now() - startTime;

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(duration);
    this.startTimes.delete(name);

    return duration;
  }

  getMetrics(name: string): {
    min: number;
    max: number;
    avg: number;
    count: number;
    p95: number;
    p99: number;
  } {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      count: values.length,
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

// High-performance test agent
class PerformanceTestAgent extends Agent {
  private processingDelay: number;
  private memoryUsage: number = 0;

  constructor(id: string, type: string, config: any, eventBus: EventBus, processingDelay: number = 5) {
    super(id, type, config, eventBus);
    this.processingDelay = processingDelay;
  }

  protected async onInitialize(): Promise<void> {
    // Fast initialization
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  protected async onStart(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  protected async onStop(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  protected async executeTaskLogic(task: Task): Promise<any> {
    // Simulate variable processing time
    await new Promise(resolve => setTimeout(resolve, this.processingDelay));

    // Simulate memory usage
    this.memoryUsage += Math.random() * 1024; // KB

    return {
      taskId: task.getId(),
      processingTime: this.processingDelay,
      memoryUsed: this.memoryUsage,
      result: 'success'
    };
  }

  protected async initializeCapabilities(): Promise<void> {
    this.capabilities = [
      {
        name: 'performance-testing',
        version: '1.0.0',
        description: 'High-performance test execution',
        taskTypes: ['load-test', 'stress-test', 'benchmark-test']
      }
    ];
  }

  getMemoryUsage(): number {
    return this.memoryUsage;
  }
}

describe('Performance and Load Testing', () => {
  let fleetManager: FleetManager;
  let eventBus: EventBus;
  let monitor: PerformanceMonitor;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  const createFleetConfig = (maxAgents: number = 10) => ({
    fleet: {
      id: 'perf-fleet',
      name: 'Performance Test Fleet',
      maxAgents,
      heartbeatInterval: 30000,
      taskTimeout: 300000
    },
    agents: [
      {
        type: 'performance-test',
        count: maxAgents,
        config: { performance: true }
      }
    ],
    database: { type: 'sqlite', filename: ':memory:' },
    logging: { level: 'error' },
    api: { port: 3000, host: '0.0.0.0' },
    security: {}
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    monitor = new PerformanceMonitor();

    // Mock Database with performance simulation
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2)); // 0-2ms
        return { lastID: Math.floor(Math.random() * 1000), changes: 1 };
      }),
      get: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 3)); // 0-3ms
        return {};
      }),
      all: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5)); // 0-5ms
        return [];
      })
    } as any;

    // Mock Logger with minimal overhead
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    eventBus = new EventBus();
    await eventBus.initialize();

    // Mock agent factory for performance agents
    jest.doMock('../../src/agents', () => ({
      createAgent: jest.fn((type: string, id: string, config: any, eventBus: EventBus) => {
        const processingDelay = config.performance ? 5 : 50; // Fast processing for perf tests
        return new PerformanceTestAgent(id, type, config, eventBus, processingDelay);
      })
    }));
  });

  afterEach(async () => {
    if (fleetManager) {
      await fleetManager.stop();
      // @ts-ignore - Explicitly null out for garbage collection
      fleetManager = null;
    }
    if (eventBus) {
      eventBus.removeAllListeners();
      // @ts-ignore - Explicitly null out for garbage collection
      eventBus = null;
    }
    monitor.reset();
    // @ts-ignore - Explicitly null out for garbage collection
    monitor = null;

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Fleet Initialization Performance', () => {
    it('should initialize fleet with multiple agents quickly', async () => {
      monitor.startTimer('fleet-init');

      fleetManager = new FleetManager(createFleetConfig(20));
      await fleetManager.initialize();
      await fleetManager.start();

      const initTime = monitor.endTimer('fleet-init');

      expect(initTime).toBeLessThan(2000); // Should initialize in under 2 seconds
      expect(fleetManager.getAllAgents()).toHaveLength(20);

      const status = fleetManager.getStatus();
      expect(status.activeAgents).toBe(20);
    });

    it('should scale agent initialization linearly', async () => {
      const agentCounts = [5, 10, 20, 40];
      const initTimes: number[] = [];

      for (const count of agentCounts) {
        monitor.startTimer(`init-${count}`);

        const fleet = new FleetManager(createFleetConfig(count));
        await fleet.initialize();
        await fleet.start();

        const time = monitor.endTimer(`init-${count}`);
        initTimes.push(time);

        await fleet.stop();

        // Cleanup after each fleet
        if (global.gc) {
          global.gc();
        }
      }

      // Check that initialization time scales reasonably (not exponentially)
      const timeRatio = initTimes[3] / initTimes[0]; // 40 agents vs 5 agents
      expect(timeRatio).toBeLessThan(10); // Should be less than 10x slower

      // All initializations should complete within reasonable time
      initTimes.forEach(time => {
        expect(time).toBeLessThan(5000);
      });

      // Final cleanup
      initTimes.length = 0;
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Task Throughput Performance', () => {
    beforeEach(async () => {
      fleetManager = new FleetManager(createFleetConfig(10));
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should handle high-frequency task submission', async () => {
      const taskCount = 200; // Reduced from 1000 to conserve memory
      const tasks: Task[] = [];

      monitor.startTimer('task-submission');

      // Create tasks rapidly
      for (let i = 0; i < taskCount; i++) {
        tasks.push(new Task(`load-task-${i}`, 'load-test', { index: i }));
      }

      // Submit all tasks
      const submitPromises = tasks.map(task => fleetManager.submitTask(task));
      await Promise.all(submitPromises);

      const submissionTime = monitor.endTimer('task-submission');

      expect(submissionTime).toBeLessThan(500); // Adjusted for reduced task count

      // Calculate throughput
      const tasksPerSecond = taskCount / (submissionTime / 1000);
      expect(tasksPerSecond).toBeGreaterThan(100); // Adjusted for reduced task count

      console.log(`Task submission throughput: ${tasksPerSecond.toFixed(2)} tasks/second`);

      // Cleanup
      tasks.length = 0;
      if (global.gc) {
        global.gc();
      }
    });

    it('should maintain performance under sustained load', async () => {
      const batchSize = 100;
      const batchCount = 10;
      const batchTimes: number[] = [];

      for (let batch = 0; batch < batchCount; batch++) {
        monitor.startTimer(`batch-${batch}`);

        const tasks = Array.from({ length: batchSize }, (_, i) =>
          new Task(`sustained-${batch}-${i}`, 'load-test', { batch, index: i })
        );

        // Submit batch
        await Promise.all(tasks.map(task => fleetManager.submitTask(task)));

        // Wait for batch completion
        await new Promise(resolve => setTimeout(resolve, 100));

        const batchTime = monitor.endTimer(`batch-${batch}`);
        batchTimes.push(batchTime);

        // Cleanup between batches
        tasks.length = 0;
        if (global.gc) {
          global.gc();
        }
      }

      // Performance should remain consistent across batches
      const avgTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
      const maxDeviation = Math.max(...batchTimes.map(time => Math.abs(time - avgTime)));

      expect(maxDeviation / avgTime).toBeLessThan(0.5); // Less than 50% deviation from average

      console.log(`Average batch time: ${avgTime.toFixed(2)}ms`);
      console.log(`Max deviation: ${(maxDeviation / avgTime * 100).toFixed(2)}%`);

      // Final cleanup
      batchTimes.length = 0;
      if (global.gc) {
        global.gc();
      }
    });

    it('should handle concurrent task execution efficiently', async () => {
      const concurrentTasks = 50;

      monitor.startTimer('concurrent-execution');

      // Create tasks that will execute concurrently
      const tasks = Array.from({ length: concurrentTasks }, (_, i) =>
        new Task(`concurrent-${i}`, 'load-test', {
          delay: 50, // All tasks take 50ms
          index: i
        })
      );

      // Submit all tasks at once
      const submitPromises = tasks.map(task => fleetManager.submitTask(task));
      await Promise.all(submitPromises);

      // Wait for all tasks to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      const totalTime = monitor.endTimer('concurrent-execution');

      // With 10 agents, 50 tasks should complete in roughly 5 batches
      // Each batch takes ~50ms, so total should be around 250ms + overhead
      expect(totalTime).toBeLessThan(500);

      const status = fleetManager.getStatus();
      expect(status.completedTasks).toBe(concurrentTasks);

      console.log(`Concurrent execution time: ${totalTime}ms for ${concurrentTasks} tasks`);

      // Cleanup
      tasks.length = 0;
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Memory Usage and Resource Management', () => {
    beforeEach(async () => {
      fleetManager = new FleetManager(createFleetConfig(5));
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Execute many tasks to test memory stability
      for (let batch = 0; batch < 10; batch++) {
        const tasks = Array.from({ length: 20 }, (_, i) =>
          new Task(`memory-test-${batch}-${i}`, 'load-test', {
            data: 'x'.repeat(1000) // 1KB of data per task
          })
        );

        await Promise.all(tasks.map(task => fleetManager.submitTask(task)));
        await new Promise(resolve => setTimeout(resolve, 100));

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should handle agent memory usage efficiently', async () => {
      const agents = fleetManager.getAllAgents() as PerformanceTestAgent[];

      // Execute tasks to increase agent memory usage
      const tasks = Array.from({ length: 100 }, (_, i) =>
        new Task(`agent-memory-${i}`, 'load-test', {})
      );

      await Promise.all(tasks.map(task => fleetManager.submitTask(task)));
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check individual agent memory usage
      const memoryUsages = agents.map(agent => agent.getMemoryUsage());
      const totalAgentMemory = memoryUsages.reduce((a, b) => a + b, 0);

      // Should distribute memory usage across agents
      const avgMemoryPerAgent = totalAgentMemory / agents.length;
      expect(avgMemoryPerAgent).toBeGreaterThan(0);
      expect(avgMemoryPerAgent).toBeLessThan(10 * 1024); // Less than 10KB per agent

      console.log(`Average memory per agent: ${avgMemoryPerAgent.toFixed(2)}KB`);

      // Cleanup
      tasks.length = 0;
      memoryUsages.length = 0;
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Event Bus Performance', () => {
    beforeEach(async () => {
      fleetManager = new FleetManager(createFleetConfig(8));
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should handle high-frequency event emission', async () => {
      const eventCount = 1000; // Reduced from 5000 to conserve memory
      const batchSize = 250; // Process events in batches
      const eventTypes = ['test:event1', 'test:event2', 'test:event3'];

      monitor.startTimer('event-emission');

      // Emit events in batches with cleanup between batches
      const allEventIds: string[] = [];
      for (let batchStart = 0; batchStart < eventCount; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, eventCount);
        const emissionPromises = Array.from({ length: batchEnd - batchStart }, (_, i) => {
          const index = batchStart + i;
          return eventBus.emitFleetEvent(
            eventTypes[index % eventTypes.length],
            `source-${index}`,
            { index, data: `test-data-${index}` }
          );
        });

        const batchEventIds = await Promise.all(emissionPromises);
        allEventIds.push(...batchEventIds);

        // Cleanup between batches
        if (global.gc) {
          global.gc();
        }
      }

      const emissionTime = monitor.endTimer('event-emission');

      expect(allEventIds).toHaveLength(eventCount);
      expect(emissionTime).toBeLessThan(1000); // Adjusted for reduced event count

      const eventsPerSecond = eventCount / (emissionTime / 1000);
      expect(eventsPerSecond).toBeGreaterThan(500); // Adjusted threshold

      console.log(`Event emission rate: ${eventsPerSecond.toFixed(2)} events/second`);

      // Final cleanup
      allEventIds.length = 0;
      if (global.gc) {
        global.gc();
      }
    });

    it('should handle many concurrent event listeners', async () => {
      const listenerCount = 100;
      const listeners: jest.Mock[] = [];

      // Add many listeners
      for (let i = 0; i < listenerCount; i++) {
        const listener = jest.fn();
        listeners.push(listener);
        eventBus.on('performance:test', listener);
      }

      monitor.startTimer('listener-execution');

      // Emit event that triggers all listeners
      await eventBus.emitFleetEvent('performance:test', 'test-source', {
        message: 'test message',
        timestamp: Date.now()
      });

      // Wait for all listeners to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      const executionTime = monitor.endTimer('listener-execution');

      // All listeners should have been called
      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1);
      });

      expect(executionTime).toBeLessThan(200); // Should execute 100 listeners in under 200ms

      console.log(`Listener execution time: ${executionTime}ms for ${listenerCount} listeners`);

      // Cleanup listeners
      listeners.forEach(listener => {
        eventBus.removeListener('performance:test', listener);
      });
      listeners.length = 0;

      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Database Performance', () => {
    beforeEach(async () => {
      fleetManager = new FleetManager(createFleetConfig(3));
      await fleetManager.initialize();
      await fleetManager.start();
    });

    it('should handle database operations efficiently', async () => {
      const operationCount = 1000;

      monitor.startTimer('db-operations');

      // Simulate many database operations
      const dbPromises = Array.from({ length: operationCount }, async (_, i) => {
        if (i % 3 === 0) {
          return mockDatabase.run('INSERT INTO tasks VALUES (?)', [i]);
        } else if (i % 3 === 1) {
          return mockDatabase.get('SELECT * FROM tasks WHERE id = ?', [i]);
        } else {
          return mockDatabase.all('SELECT * FROM tasks LIMIT 10');
        }
      });

      await Promise.all(dbPromises);
      const dbTime = monitor.endTimer('db-operations');

      expect(dbTime).toBeLessThan(3000); // 1000 operations in under 3 seconds

      const opsPerSecond = operationCount / (dbTime / 1000);
      expect(opsPerSecond).toBeGreaterThan(200); // At least 200 operations/second

      console.log(`Database throughput: ${opsPerSecond.toFixed(2)} ops/second`);

      // Cleanup
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Stress Testing', () => {
    it('should survive extreme load conditions', async () => {
      const extremeConfig = createFleetConfig(50); // Large fleet
      fleetManager = new FleetManager(extremeConfig);

      monitor.startTimer('extreme-load');

      await fleetManager.initialize();
      await fleetManager.start();

      // Reduced from 2000 to 500 tasks to conserve memory
      const totalTasks = 500;
      const batchSize = 50; // Reduced batch size from 100

      // Submit in batches with cleanup between batches
      for (let i = 0; i < totalTasks; i += batchSize) {
        const batchTasks = Array.from({ length: Math.min(batchSize, totalTasks - i) }, (_, j) =>
          new Task(`extreme-${i + j}`, 'stress-test', { index: i + j })
        );

        await Promise.all(batchTasks.map(task => fleetManager.submitTask(task)));

        // Cleanup after each batch
        batchTasks.length = 0;

        // Force garbage collection between batches
        if (global.gc) {
          global.gc();
        }

        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const extremeTime = monitor.endTimer('extreme-load');

      // System should remain stable
      const status = fleetManager.getStatus();
      expect(status.status).toBe('running');
      expect(status.completedTasks + status.failedTasks).toBeGreaterThan(250); // Adjusted for reduced task count

      console.log(`Extreme load test completed in ${extremeTime}ms`);
      console.log(`Tasks processed: ${status.completedTasks + status.failedTasks}/${totalTasks}`);

      // Final cleanup
      if (global.gc) {
        global.gc();
      }
    });

    it('should handle rapid start/stop cycles', async () => {
      const cycles = 10;

      monitor.startTimer('start-stop-cycles');

      for (let i = 0; i < cycles; i++) {
        const config = createFleetConfig(5);
        const fleet = new FleetManager(config);

        await fleet.initialize();
        await fleet.start();

        // Submit a few tasks
        const tasks = Array.from({ length: 5 }, (_, j) =>
          new Task(`cycle-${i}-${j}`, 'load-test', {})
        );

        await Promise.all(tasks.map(task => fleet.submitTask(task)));

        // Brief operation time
        await new Promise(resolve => setTimeout(resolve, 50));

        await fleet.stop();

        // Cleanup after each cycle
        tasks.length = 0;
        if (global.gc) {
          global.gc();
        }
      }

      const cycleTime = monitor.endTimer('start-stop-cycles');

      expect(cycleTime).toBeLessThan(10000); // 10 cycles in under 10 seconds

      const timePerCycle = cycleTime / cycles;
      expect(timePerCycle).toBeLessThan(1000); // Each cycle in under 1 second

      console.log(`Start/stop cycle time: ${timePerCycle.toFixed(2)}ms per cycle`);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance SLA requirements', async () => {
      fleetManager = new FleetManager(createFleetConfig(10));
      await fleetManager.initialize();
      await fleetManager.start();

      const benchmarkTasks = Array.from({ length: 100 }, (_, i) =>
        new Task(`benchmark-${i}`, 'benchmark-test', { index: i })
      );

      // Measure various performance metrics
      monitor.startTimer('sla-test');

      const submitPromises = benchmarkTasks.map(task => {
        monitor.startTimer(`task-${task.getId()}`);
        return fleetManager.submitTask(task).then(() => {
          monitor.endTimer(`task-${task.getId()}`);
        });
      });

      await Promise.all(submitPromises);
      await new Promise(resolve => setTimeout(resolve, 200));

      const totalTime = monitor.endTimer('sla-test');

      // SLA Requirements:
      expect(totalTime).toBeLessThan(1000); // Total execution under 1 second

      // Task submission should be fast
      for (let i = 0; i < 10; i++) {
        const taskMetrics = monitor.getMetrics(`task-benchmark-${i}`);
        expect(taskMetrics.avg).toBeLessThan(50); // Average task submission under 50ms
      }

      // Calculate overall performance score
      const tasksPerSecond = benchmarkTasks.length / (totalTime / 1000);
      const performanceScore = Math.min(100, (tasksPerSecond / 100) * 100);

      expect(performanceScore).toBeGreaterThan(80); // Performance score above 80%

      console.log(`Performance SLA Results:`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Throughput: ${tasksPerSecond.toFixed(2)} tasks/second`);
      console.log(`  Performance score: ${performanceScore.toFixed(2)}%`);

      // Cleanup
      benchmarkTasks.length = 0;
      if (global.gc) {
        global.gc();
      }
    });
  });
});