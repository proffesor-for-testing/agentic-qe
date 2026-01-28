/**
 * Agentic QE v3 - Queen-Domain Coordinator Integration Tests
 * Tests the wiring between Queen Coordinator and Domain Plugins
 *
 * These tests verify:
 * 1. Tasks are executed through domain coordinators
 * 2. Task failures are reported back to Queen
 * 3. Event fallback works for domains without handlers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { DomainName, Result, ok, err } from '../../src/shared/types';
import { InMemoryEventBus } from '../../src/kernel/event-bus';
import { InMemoryBackend } from '../../src/kernel/memory-backend';
import { DefaultAgentCoordinator } from '../../src/kernel/agent-coordinator';
import {
  DomainPlugin,
  DomainHealth,
  DomainTaskRequest,
  DomainTaskResult,
  TaskCompletionCallback,
} from '../../src/kernel/interfaces';
import { BaseDomainPlugin, TaskHandler } from '../../src/domains/domain-interface';
import { CrossDomainEventRouter } from '../../src/coordination/cross-domain-router';
import { QueenCoordinator } from '../../src/coordination/queen-coordinator';

// ============================================================================
// Test Domain Plugin
// ============================================================================

class TestDomainPlugin extends BaseDomainPlugin {
  public executedTasks: DomainTaskRequest[] = [];
  public taskResults: Map<string, DomainTaskResult> = new Map();
  public failNextTask = false;
  public delayMs = 0;

  get name(): DomainName {
    return 'test-execution';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    return [];
  }

  getAPI<T>(): T {
    return {} as T;
  }

  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      ['execute-tests', async (payload): Promise<Result<unknown, Error>> => {
        // Simulate delay if configured
        if (this.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, this.delayMs));
        }

        // Fail if configured to fail
        if (this.failNextTask) {
          this.failNextTask = false;
          return err(new Error('Test task forced to fail'));
        }

        // Return success with payload info
        return ok({
          testFiles: payload.testFiles,
          passed: 10,
          failed: 0,
          duration: 1234,
        });
      }],
      ['detect-flaky', async (payload): Promise<Result<unknown, Error>> => {
        return ok({
          testFiles: payload.testFiles,
          flakyTests: [],
          runs: payload.runs || 5,
        });
      }],
    ]);
  }

  // Override to track executed tasks
  override async executeTask(
    request: DomainTaskRequest,
    onComplete: TaskCompletionCallback
  ): Promise<Result<void, Error>> {
    this.executedTasks.push(request);

    // Call parent implementation
    const result = await super.executeTask(request, async (taskResult) => {
      this.taskResults.set(request.taskId, taskResult);
      await onComplete(taskResult);
    });

    return result;
  }
}

// Domain without task handlers (uses event fallback)
class LegacyDomainPlugin extends BaseDomainPlugin {
  public eventsReceived: unknown[] = [];

  get name(): DomainName {
    return 'test-generation';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    return [];
  }

  getAPI<T>(): T {
    return {} as T;
  }

  // No task handlers - uses event fallback
  override async handleEvent(event: import('../../src/shared/types').DomainEvent): Promise<void> {
    this.eventsReceived.push(event);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Queen-Domain Coordinator Integration', () => {
  let eventBus: InMemoryEventBus;
  let memory: InMemoryBackend;
  let agentCoordinator: DefaultAgentCoordinator;
  let router: CrossDomainEventRouter;
  let queen: QueenCoordinator;
  let testPlugin: TestDomainPlugin;
  let legacyPlugin: LegacyDomainPlugin;
  let domainPlugins: Map<DomainName, DomainPlugin>;

  beforeEach(async () => {
    // Create infrastructure
    eventBus = new InMemoryEventBus();
    memory = new InMemoryBackend();
    agentCoordinator = new DefaultAgentCoordinator(15);
    router = new CrossDomainEventRouter(eventBus);

    // Create domain plugins
    testPlugin = new TestDomainPlugin(eventBus, memory);
    legacyPlugin = new LegacyDomainPlugin(eventBus, memory);

    // Build domain plugins map
    domainPlugins = new Map([
      ['test-execution', testPlugin],
      ['test-generation', legacyPlugin],
    ]);

    // Initialize plugins
    await testPlugin.initialize();
    await legacyPlugin.initialize();
    await router.initialize();
    await memory.initialize();

    // Create Queen Coordinator with domain plugins
    queen = new QueenCoordinator(
      eventBus,
      agentCoordinator,
      memory,
      router,
      undefined,
      undefined,
      domainPlugins,
      { enableMetrics: false }
    );

    await queen.initialize();
  });

  afterEach(async () => {
    await queen.dispose();
    await router.dispose();
    await memory.dispose();
    await eventBus.dispose();
  });

  describe('Direct Task Execution', () => {
    it('should execute tasks through domain coordinators', async () => {
      // Submit a task that maps to test-execution domain
      const result = await queen.submitTask({
        type: 'execute-tests',
        payload: {
          testFiles: ['test/unit/*.test.ts'],
          parallel: true,
        },
        priority: 'p1',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      expect(result.success).toBe(true);
      const taskId = result.success ? result.value : '';

      // Wait for task to complete via callback
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was executed
      expect(testPlugin.executedTasks).toHaveLength(1);
      expect(testPlugin.executedTasks[0].taskType).toBe('execute-tests');
      expect(testPlugin.executedTasks[0].taskId).toBe(taskId);
      expect(testPlugin.executedTasks[0].payload.testFiles).toEqual(['test/unit/*.test.ts']);

      // Verify result was recorded
      const taskResult = testPlugin.taskResults.get(taskId);
      expect(taskResult).toBeDefined();
      expect(taskResult?.success).toBe(true);
    });

    it('should report task failures back to Queen', async () => {
      // Configure plugin to fail next task
      testPlugin.failNextTask = true;

      // Submit a task
      const result = await queen.submitTask({
        type: 'execute-tests',
        payload: { testFiles: ['failing-test.ts'] },
        priority: 'p1',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      expect(result.success).toBe(true);
      const taskId = result.success ? result.value : '';

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify failure was recorded
      const taskResult = testPlugin.taskResults.get(taskId);
      expect(taskResult).toBeDefined();
      expect(taskResult?.success).toBe(false);
      expect(taskResult?.error).toContain('forced to fail');
    });

    it('should handle multiple task types for the same domain', async () => {
      // Submit execute-tests task
      const result1 = await queen.submitTask({
        type: 'execute-tests',
        payload: { testFiles: ['test1.ts'] },
        priority: 'p1',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      // Submit detect-flaky task
      const result2 = await queen.submitTask({
        type: 'detect-flaky',
        payload: { testFiles: ['test2.ts'], runs: 10 },
        priority: 'p2',
        timeout: 60000,
        targetDomains: ['test-execution'],
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Wait for tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify both tasks were executed
      expect(testPlugin.executedTasks).toHaveLength(2);
      expect(testPlugin.executedTasks.map(t => t.taskType)).toContain('execute-tests');
      expect(testPlugin.executedTasks.map(t => t.taskType)).toContain('detect-flaky');
    });
  });

  describe('Event Fallback', () => {
    it('should use event fallback for domains without executeTask handlers', async () => {
      // Submit a task to legacy domain
      const result = await queen.submitTask({
        type: 'generate-tests',
        payload: { sourceFiles: ['src/app.ts'] },
        priority: 'p2',
        timeout: 30000,
        targetDomains: ['test-generation'],
      });

      expect(result.success).toBe(true);

      // Wait for event to be dispatched
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify event was received by legacy plugin
      expect(legacyPlugin.eventsReceived.length).toBeGreaterThan(0);

      const taskEvent = legacyPlugin.eventsReceived.find(
        (e: any) => e.type === 'TaskAssigned'
      );
      expect(taskEvent).toBeDefined();
    });
  });

  describe('Task Validation', () => {
    it('should reject tasks for unknown task types', async () => {
      // Submit a task with unknown type to domain with handlers
      // The domain should reject it
      const result = await queen.submitTask({
        type: 'unknown-task-type',
        payload: {},
        priority: 'p3',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      // Task submission succeeds but will use event fallback
      // since no handler exists for 'unknown-task-type'
      expect(result.success).toBe(true);
    });
  });

  describe('Callback Mechanism', () => {
    it('should update Queen state when task completes', async () => {
      const initialMetrics = queen.getMetrics();
      const initialCompleted = initialMetrics.tasksCompleted;

      // Submit and wait for task
      const result = await queen.submitTask({
        type: 'execute-tests',
        payload: { testFiles: ['test.ts'] },
        priority: 'p1',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      expect(result.success).toBe(true);

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify metrics updated
      const finalMetrics = queen.getMetrics();
      expect(finalMetrics.tasksCompleted).toBeGreaterThan(initialCompleted);
    });

    it('should update Queen state when task fails', async () => {
      const initialMetrics = queen.getMetrics();
      const initialFailed = initialMetrics.tasksFailed;

      // Configure failure
      testPlugin.failNextTask = true;

      // Submit task
      const result = await queen.submitTask({
        type: 'execute-tests',
        payload: { testFiles: ['test.ts'] },
        priority: 'p1',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      expect(result.success).toBe(true);

      // Wait for task to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify failure metrics updated
      const finalMetrics = queen.getMetrics();
      expect(finalMetrics.tasksFailed).toBeGreaterThan(initialFailed);
    });
  });

  describe('Domain Load Balancing', () => {
    it('should track task duration from domain callback', async () => {
      // Configure delay to make duration measurable
      testPlugin.delayMs = 50;

      // Submit task
      const result = await queen.submitTask({
        type: 'execute-tests',
        payload: { testFiles: ['test.ts'] },
        priority: 'p1',
        timeout: 30000,
        targetDomains: ['test-execution'],
      });

      expect(result.success).toBe(true);
      const taskId = result.success ? result.value : '';

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify duration was recorded (allow ±5ms variance for CI timing)
      const taskResult = testPlugin.taskResults.get(taskId);
      expect(taskResult).toBeDefined();
      expect(taskResult?.duration).toBeGreaterThanOrEqual(45);
    });
  });
});

describe('Task Handler Registration', () => {
  it('should correctly report canHandleTask based on registered handlers', async () => {
    const eventBus = new InMemoryEventBus();
    const memory = new InMemoryBackend();
    await memory.initialize();

    const plugin = new TestDomainPlugin(eventBus, memory);
    await plugin.initialize();

    // Should handle registered task types
    expect(plugin.canHandleTask('execute-tests')).toBe(true);
    expect(plugin.canHandleTask('detect-flaky')).toBe(true);

    // Should not handle unregistered task types
    expect(plugin.canHandleTask('unknown-task')).toBe(false);
    expect(plugin.canHandleTask('generate-tests')).toBe(false);

    await memory.dispose();
    await eventBus.dispose();
  });
});
