/**
 * PerformanceTracker Integration Tests with BaseAgent
 * Tests Phase 2 (Milestone 2.2) - Performance tracking integration
 *
 * Validates:
 * - BaseAgent initializes PerformanceTracker when enableLearning=true
 * - Performance metrics tracked across task lifecycle
 * - <100ms overhead requirement met
 * - All 17 QE agents can use performance tracking
 */

import { EventEmitter } from 'events';
import { BaseAgent, BaseAgentConfig } from '../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { PerformanceTracker } from '../../src/learning/PerformanceTracker';
import {
  AgentStatus,
  QEAgentType,
  AgentContext,
  QETask,
  TaskAssignment
} from '../../src/types';

// Mock QE Agent implementation for testing
class TestQEAgent extends BaseAgent {
  private simulatedDelay: number;

  constructor(config: BaseAgentConfig, simulatedDelay: number = 10) {
    super(config);
    this.simulatedDelay = simulatedDelay;
  }

  protected async initializeComponents(): Promise<void> {
    // Minimal initialization
  }

  protected async performTask(task: QETask): Promise<any> {
    // Simulate task execution
    await new Promise(resolve => setTimeout(resolve, this.simulatedDelay));
    return { success: true, task: task.type };
  }

  protected async loadKnowledge(): Promise<void> {
    // No-op for test
  }

  protected async cleanup(): Promise<void> {
    // No-op for test
  }
}

describe('PerformanceTracker Integration with BaseAgent', () => {
  let eventBus: EventEmitter;
  let memoryStore: SwarmMemoryManager;
  let context: AgentContext;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = new SwarmMemoryManager(':memory:'); // Use in-memory database for tests
    await memoryStore.initialize();

    context = {
      project: {
        name: 'test-project',
        root: '/test',
        config: {}
      },
      environment: {
        node: 'development',
        ci: false
      }
    };
  });

  afterEach(async () => {
    if (memoryStore) {
      await memoryStore.close();
    }
    eventBus.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should initialize PerformanceTracker when enableLearning=true', async () => {
      const agent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      });

      await agent.initialize();

      // Access protected property for testing
      const performanceTracker = (agent as any).performanceTracker;
      expect(performanceTracker).toBeDefined();
      expect(performanceTracker).toBeInstanceOf(PerformanceTracker);
    });

    it('should NOT initialize PerformanceTracker when enableLearning=false', async () => {
      const agent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: false
      });

      await agent.initialize();

      const performanceTracker = (agent as any).performanceTracker;
      expect(performanceTracker).toBeUndefined();
    });

    it('should NOT initialize PerformanceTracker when enableLearning is omitted (default)', async () => {
      const agent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus
        // enableLearning not specified, defaults to false
      });

      await agent.initialize();

      const performanceTracker = (agent as any).performanceTracker;
      expect(performanceTracker).toBeUndefined();
    });
  });

  describe('Task Lifecycle Tracking', () => {
    let agent: TestQEAgent;
    let performanceTracker: PerformanceTracker;

    beforeEach(async () => {
      agent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      });

      await agent.initialize();
      performanceTracker = (agent as any).performanceTracker;
    });

    it('should track task start time in onPreTask hook', async () => {
      const task: QETask = {
        type: 'generate-tests',
        description: 'Generate unit tests',
        priority: 'high'
      };

      const assignment: TaskAssignment = {
        id: 'task-1',
        task,
        agentId: (agent as any).agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Execute task
      await agent.executeTask(assignment);

      // Verify taskStartTime was set (accessed via reflection for testing)
      const taskStartTime = (agent as any).taskStartTime;
      expect(taskStartTime).toBeDefined();
      expect(typeof taskStartTime).toBe('number');
    });

    it('should record performance snapshot in onPostTask hook', async () => {
      const task: QETask = {
        type: 'generate-tests',
        description: 'Generate unit tests',
        priority: 'high'
      };

      const assignment: TaskAssignment = {
        id: 'task-2',
        task,
        agentId: (agent as any).agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Execute task
      await agent.executeTask(assignment);

      // Verify snapshot was recorded
      const snapshotCount = performanceTracker.getSnapshotCount();
      expect(snapshotCount).toBeGreaterThan(0);
    });

    it('should record failure snapshot in onTaskError hook', async () => {
      // Create agent that throws error
      const failingAgent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      });

      // Override performTask to throw error
      (failingAgent as any).performTask = async () => {
        throw new Error('Simulated task failure');
      };

      await failingAgent.initialize();
      const tracker = (failingAgent as any).performanceTracker;

      const task: QETask = {
        type: 'generate-tests',
        description: 'Generate unit tests',
        priority: 'high'
      };

      const assignment: TaskAssignment = {
        id: 'task-3',
        task,
        agentId: (failingAgent as any).agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Execute task (should fail)
      await expect(failingAgent.executeTask(assignment)).rejects.toThrow('Simulated task failure');

      // Verify failure snapshot was recorded
      const snapshotCount = tracker.getSnapshotCount();
      expect(snapshotCount).toBeGreaterThan(0);
    });

    it('should track multiple tasks and accumulate metrics', async () => {
      const tasks = [
        { type: 'generate-tests', description: 'Test 1' },
        { type: 'generate-tests', description: 'Test 2' },
        { type: 'generate-tests', description: 'Test 3' }
      ];

      // Execute multiple tasks
      for (let i = 0; i < tasks.length; i++) {
        const task: QETask = {
          ...tasks[i],
          priority: 'high'
        };

        const assignment: TaskAssignment = {
          id: `task-${i}`,
          task,
          agentId: (agent as any).agentId.id,
          assignedAt: new Date(),
          status: 'assigned'
        };

        await agent.executeTask(assignment);
      }

      // Verify multiple snapshots
      const snapshotCount = performanceTracker.getSnapshotCount();
      expect(snapshotCount).toBe(tasks.length);

      // Verify metrics accumulated
      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(tasks.length);
    });
  });

  describe('Performance Overhead Validation', () => {
    it('should add <100ms overhead per task with PerformanceTracker enabled', async () => {
      const agentWithTracking = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      }, 50); // 50ms simulated work

      const agentWithoutTracking = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: false
      }, 50); // Same 50ms simulated work

      await agentWithTracking.initialize();
      await agentWithoutTracking.initialize();

      const task: QETask = {
        type: 'generate-tests',
        description: 'Performance test',
        priority: 'high'
      };

      // Measure with tracking
      const startWithTracking = Date.now();
      await agentWithTracking.assignTask(task);
      const timeWithTracking = Date.now() - startWithTracking;

      // Measure without tracking
      const startWithoutTracking = Date.now();
      await agentWithoutTracking.assignTask(task);
      const timeWithoutTracking = Date.now() - startWithoutTracking;

      const overhead = timeWithTracking - timeWithoutTracking;

      console.log(`Time with tracking: ${timeWithTracking}ms`);
      console.log(`Time without tracking: ${timeWithoutTracking}ms`);
      console.log(`Overhead: ${overhead}ms`);

      // Overhead should be < 100ms
      expect(overhead).toBeLessThan(100);
    });

    it('should maintain low overhead across 10 tasks', async () => {
      const agent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      }, 20); // 20ms per task

      await agent.initialize();

      const overheads: number[] = [];

      for (let i = 0; i < 10; i++) {
        const task: QETask = {
          type: 'generate-tests',
          description: `Performance test ${i}`,
          priority: 'high'
        };

        const start = Date.now();
        await agent.assignTask(task);
        const totalTime = Date.now() - start;

        // Overhead is total time minus simulated work time
        const overhead = totalTime - 20;
        overheads.push(overhead);
      }

      const avgOverhead = overheads.reduce((a, b) => a + b, 0) / overheads.length;
      const maxOverhead = Math.max(...overheads);

      console.log(`Average overhead: ${avgOverhead.toFixed(2)}ms`);
      console.log(`Max overhead: ${maxOverhead}ms`);
      console.log(`All overheads: ${overheads.map(o => `${o}ms`).join(', ')}`);

      // Average and max overhead should be < 100ms
      expect(avgOverhead).toBeLessThan(100);
      expect(maxOverhead).toBeLessThan(100);
    });
  });

  describe('Multi-Agent Type Support', () => {
    const agentTypes = [
      QEAgentType.TEST_GENERATOR,
      QEAgentType.TEST_EXECUTOR,
      QEAgentType.RESULT_ANALYZER,
      QEAgentType.COVERAGE_ANALYZER,
      QEAgentType.TEST_OPTIMIZER
    ];

    it.each(agentTypes)('should support PerformanceTracker for %s agent type', async (agentType) => {
      const agent = new TestQEAgent({
        type: agentType,
        capabilities: [{ name: 'testing', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      });

      await agent.initialize();

      const performanceTracker = (agent as any).performanceTracker;
      expect(performanceTracker).toBeDefined();
      expect(performanceTracker).toBeInstanceOf(PerformanceTracker);

      // Execute a task to verify integration
      const task: QETask = {
        type: 'test-task',
        description: `Test for ${agentType}`,
        priority: 'high'
      };

      await agent.assignTask(task);

      // Verify snapshot recorded
      const snapshotCount = performanceTracker.getSnapshotCount();
      expect(snapshotCount).toBeGreaterThan(0);
    });
  });

  describe('Performance Report Generation', () => {
    it('should generate performance report through PerformanceTracker', async () => {
      const agent = new TestQEAgent({
        type: QEAgentType.TEST_GENERATOR,
        capabilities: [{ name: 'test-generation', level: 'expert' }],
        context,
        memoryStore,
        eventBus,
        enableLearning: true
      });

      await agent.initialize();
      const tracker = (agent as any).performanceTracker;

      // Execute multiple tasks
      for (let i = 0; i < 5; i++) {
        const task: QETask = {
          type: 'generate-tests',
          description: `Test ${i}`,
          priority: 'high'
        };
        await agent.assignTask(task);
      }

      // Generate report
      const report = await tracker.generateReport();

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.improvement).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });
});
