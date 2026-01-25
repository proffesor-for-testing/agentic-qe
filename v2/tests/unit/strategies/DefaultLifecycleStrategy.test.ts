/**
 * DefaultLifecycleStrategy Unit Tests
 *
 * Tests for the lifecycle strategy implementation.
 */

import { AgentStatus } from '../../../src/types';
import {
  DefaultLifecycleStrategy,
  PooledLifecycleStrategy,
  DisabledLifecycleStrategy,
  createLifecycleStrategy,
} from '../../../src/core/strategies/DefaultLifecycleStrategy';

describe('DefaultLifecycleStrategy', () => {
  let strategy: DefaultLifecycleStrategy;

  beforeEach(() => {
    strategy = new DefaultLifecycleStrategy();
  });

  describe('initialization', () => {
    it('should start in INITIALIZING status', () => {
      expect(strategy.getStatus()).toBe(AgentStatus.INITIALIZING);
    });

    it('should transition to IDLE after initialize', async () => {
      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });
      expect(strategy.getStatus()).toBe(AgentStatus.IDLE);
    });
  });

  describe('state transitions', () => {
    beforeEach(async () => {
      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });
    });

    it('should transition from IDLE to ACTIVE', async () => {
      await strategy.transitionTo(AgentStatus.ACTIVE, 'Starting task');
      expect(strategy.getStatus()).toBe(AgentStatus.ACTIVE);
    });

    it('should transition from ACTIVE back to IDLE', async () => {
      await strategy.transitionTo(AgentStatus.ACTIVE, 'Starting task');
      await strategy.transitionTo(AgentStatus.IDLE, 'Task complete');
      expect(strategy.getStatus()).toBe(AgentStatus.IDLE);
    });

    it('should throw error on invalid transition', async () => {
      await expect(
        strategy.transitionTo(AgentStatus.BUSY, 'Invalid')
      ).rejects.toThrow('Invalid state transition');
    });

    it('should transition to TERMINATED on shutdown', async () => {
      await strategy.shutdown();
      expect(strategy.getStatus()).toBe(AgentStatus.TERMINATED);
    });
  });

  describe('task lifecycle hooks', () => {
    beforeEach(async () => {
      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });
    });

    it('should transition to ACTIVE on onPreTask', async () => {
      await strategy.onPreTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test task' } },
      } as any);
      expect(strategy.getStatus()).toBe(AgentStatus.ACTIVE);
    });

    it('should transition to IDLE on onPostTask', async () => {
      await strategy.onPreTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test task' } },
      } as any);
      await strategy.onPostTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test task' } },
        result: { success: true },
      } as any);
      expect(strategy.getStatus()).toBe(AgentStatus.IDLE);
    });

    it('should handle recoverable errors', async () => {
      await strategy.onPreTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test task' } },
      } as any);
      await strategy.onTaskError({
        error: new Error('Recoverable error'),
        context: { canRetry: true },
      } as any);
      expect(strategy.getStatus()).toBe(AgentStatus.IDLE);
    });

    it('should transition to ERROR on non-recoverable errors', async () => {
      await strategy.onPreTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test task' } },
      } as any);
      await strategy.onTaskError({
        error: new Error('Fatal error'),
        context: { canRetry: false },
      } as any);
      expect(strategy.getStatus()).toBe(AgentStatus.ERROR);
    });
  });

  describe('canAcceptTask', () => {
    beforeEach(async () => {
      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });
    });

    it('should accept tasks when IDLE', () => {
      expect(strategy.canAcceptTask()).toBe(true);
    });

    it('should accept tasks when ACTIVE', async () => {
      await strategy.transitionTo(AgentStatus.ACTIVE, 'Working');
      expect(strategy.canAcceptTask()).toBe(true);
    });

    it('should not accept tasks when in ERROR', async () => {
      await strategy.transitionTo(AgentStatus.ERROR, 'Error state');
      expect(strategy.canAcceptTask()).toBe(false);
    });
  });

  describe('lifecycle handlers', () => {
    it('should notify handlers on state change', async () => {
      const handler = jest.fn();
      strategy.onLifecycleChange(handler);

      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          previousStatus: AgentStatus.INITIALIZING,
          newStatus: AgentStatus.IDLE,
        })
      );
    });
  });

  describe('metrics', () => {
    beforeEach(async () => {
      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });
    });

    it('should track initialization time', () => {
      const metrics = strategy.getMetrics();
      expect(metrics.initializationTime).toBeGreaterThanOrEqual(0);
    });

    it('should track state transitions', async () => {
      await strategy.transitionTo(AgentStatus.ACTIVE, 'Test');
      await strategy.transitionTo(AgentStatus.IDLE, 'Done');

      const metrics = strategy.getMetrics();
      expect(metrics.stateTransitions).toBeGreaterThanOrEqual(2);
    });

    it('should track tasks executed', async () => {
      await strategy.onPreTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test' } },
      } as any);
      await strategy.onPostTask({
        assignment: { task: { id: 'task-1', type: 'test', description: 'test' } },
        result: { success: true },
      } as any);

      const metrics = strategy.getMetrics();
      expect(metrics.tasksExecuted).toBe(1);
    });
  });

  describe('waitForStatus', () => {
    beforeEach(async () => {
      await strategy.initialize({ agentId: 'test-agent', agentType: 'test' });
    });

    it('should resolve immediately if already in target status', async () => {
      await expect(strategy.waitForStatus(AgentStatus.IDLE, 1000)).resolves.toBeUndefined();
    });

    it('should timeout if status not reached', async () => {
      await expect(
        strategy.waitForStatus(AgentStatus.ACTIVE, 100)
      ).rejects.toThrow('Timeout waiting for status');
    });
  });
});

describe('PooledLifecycleStrategy', () => {
  let strategy: PooledLifecycleStrategy;

  beforeEach(async () => {
    strategy = new PooledLifecycleStrategy();
    await strategy.initialize({ agentId: 'pooled-agent', agentType: 'test' });
  });

  it('should track reuse count on reset', async () => {
    // First, move to ACTIVE state so reset can transition back to IDLE
    await strategy.transitionTo(AgentStatus.ACTIVE, 'Working');
    await strategy.reset();

    // Move to ACTIVE again for second reset
    await strategy.transitionTo(AgentStatus.ACTIVE, 'Working again');
    await strategy.reset();

    const metrics = strategy.getPoolMetrics();
    expect(metrics.reuseCount).toBe(2);
  });

  it('should reset to IDLE state', async () => {
    await strategy.transitionTo(AgentStatus.ACTIVE, 'Working');
    await strategy.reset();

    expect(strategy.getStatus()).toBe(AgentStatus.IDLE);
  });
});

describe('DisabledLifecycleStrategy', () => {
  let strategy: DisabledLifecycleStrategy;

  beforeEach(() => {
    strategy = new DisabledLifecycleStrategy();
  });

  it('should be in IDLE by default', async () => {
    await strategy.initialize();
    expect(strategy.getStatus()).toBe(AgentStatus.IDLE);
  });

  it('should allow any transition', async () => {
    await strategy.transitionTo(AgentStatus.ACTIVE);
    expect(strategy.getStatus()).toBe(AgentStatus.ACTIVE);
  });

  it('should always accept tasks', () => {
    expect(strategy.canAcceptTask()).toBe(true);
  });
});

describe('createLifecycleStrategy factory', () => {
  it('should create default strategy', () => {
    const strategy = createLifecycleStrategy('default');
    expect(strategy).toBeInstanceOf(DefaultLifecycleStrategy);
  });

  it('should create pooled strategy', () => {
    const strategy = createLifecycleStrategy('pooled');
    expect(strategy).toBeInstanceOf(PooledLifecycleStrategy);
  });

  it('should create disabled strategy', () => {
    const strategy = createLifecycleStrategy('disabled');
    expect(strategy).toBeInstanceOf(DisabledLifecycleStrategy);
  });
});
