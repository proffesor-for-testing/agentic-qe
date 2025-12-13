/**
 * LifecycleManagerAdapter Unit Tests
 *
 * Tests the adapter that bridges AgentLifecycleManager to AgentLifecycleStrategy.
 */

import { AgentId, AgentStatus } from '../../../src/types';
import { AgentLifecycleManager } from '../../../src/agents/lifecycle/AgentLifecycleManager';
import { LifecycleManagerAdapter, createLifecycleAdapter } from '../../../src/agents/adapters';

describe('LifecycleManagerAdapter', () => {
  let manager: AgentLifecycleManager;
  let adapter: LifecycleManagerAdapter;
  let agentId: AgentId;

  beforeEach(() => {
    agentId = {
      id: 'test-agent-1',
      type: 'test-generator',
      created: new Date(),
    };
    manager = new AgentLifecycleManager(agentId);
    adapter = new LifecycleManagerAdapter(manager);
  });

  describe('getStatus', () => {
    it('should return the manager status', () => {
      expect(adapter.getStatus()).toBe(AgentStatus.INITIALIZING);
    });

    it('should reflect status changes', async () => {
      await manager.initialize();
      // After initialization, agent is IDLE (ready for tasks), not ACTIVE
      expect(adapter.getStatus()).toBe(AgentStatus.IDLE);
    });
  });

  describe('transitionTo', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should transition to IDLE', async () => {
      await adapter.transitionTo(AgentStatus.IDLE);
      expect(adapter.getStatus()).toBe(AgentStatus.IDLE);
    });

    it('should transition to ACTIVE', async () => {
      manager.markIdle();
      await adapter.transitionTo(AgentStatus.ACTIVE);
      expect(adapter.getStatus()).toBe(AgentStatus.ACTIVE);
    });

    it('should transition to ERROR', async () => {
      await adapter.transitionTo(AgentStatus.ERROR, 'Test error');
      expect(adapter.getStatus()).toBe(AgentStatus.ERROR);
    });
  });

  describe('waitForStatus', () => {
    it('should resolve immediately if already in status', async () => {
      await manager.initialize();
      // After initialization, agent is IDLE (ready for tasks), not ACTIVE
      await expect(adapter.waitForStatus(AgentStatus.IDLE, 1000)).resolves.toBeUndefined();
    });

    it('should timeout if status not reached', async () => {
      await expect(adapter.waitForStatus(AgentStatus.TERMINATED, 100))
        .rejects.toThrow('Timeout');
    });
  });

  describe('waitForReady', () => {
    it('should resolve when IDLE (ready after initialization)', async () => {
      await manager.initialize();
      await expect(adapter.waitForReady(1000)).resolves.toBeUndefined();
    });

    it('should resolve when IDLE', async () => {
      await manager.initialize();
      manager.markIdle();
      await expect(adapter.waitForReady(1000)).resolves.toBeUndefined();
    });

    it('should timeout if not ready', async () => {
      await expect(adapter.waitForReady(100)).rejects.toThrow('Timeout');
    });
  });

  describe('canAcceptTask', () => {
    it('should return false when INITIALIZING', () => {
      expect(adapter.canAcceptTask()).toBe(false);
    });

    it('should return true when ACTIVE', async () => {
      await manager.initialize();
      expect(adapter.canAcceptTask()).toBe(true);
    });

    it('should return true when IDLE', async () => {
      await manager.initialize();
      manager.markIdle();
      expect(adapter.canAcceptTask()).toBe(true);
    });

    it('should return false when ERROR', async () => {
      manager.markError('Test error');
      expect(adapter.canAcceptTask()).toBe(false);
    });
  });

  describe('lifecycle hooks', () => {
    it('should call onPostTask and increment tasks executed', async () => {
      await adapter.onPostTask({
        assignment: { id: 'test', task: { id: 'task-1', type: 'test' } as any },
        result: {}
      });

      const metrics = adapter.getMetrics();
      expect(metrics.tasksExecuted).toBe(1);
    });

    it('should handle onPreTask without error', async () => {
      await expect(adapter.onPreTask({
        assignment: { id: 'test', task: { id: 'task-1', type: 'test' } as any }
      })).resolves.toBeUndefined();
    });

    it('should handle onTaskError without error', async () => {
      await expect(adapter.onTaskError({
        assignment: { id: 'test', task: { id: 'task-1', type: 'test' } as any },
        error: new Error('Test')
      })).resolves.toBeUndefined();
    });
  });

  describe('onLifecycleChange', () => {
    it('should call handler on status change', async () => {
      const handler = jest.fn();
      adapter.onLifecycleChange(handler);

      await manager.initialize();
      await adapter.transitionTo(AgentStatus.IDLE);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          newStatus: AgentStatus.IDLE,
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('getMetrics', () => {
    it('should return lifecycle metrics', () => {
      const metrics = adapter.getMetrics();

      expect(metrics).toEqual(expect.objectContaining({
        uptime: expect.any(Number),
        tasksExecuted: 0,
        lastActivity: expect.any(Date),
      }));
    });
  });

  describe('reset', () => {
    it('should reset the adapter state', async () => {
      await adapter.onPostTask({
        assignment: { id: 'test', task: { id: 'task-1', type: 'test' } as any },
        result: {}
      });

      expect(adapter.getMetrics().tasksExecuted).toBe(1);

      await adapter.reset();

      expect(adapter.getMetrics().tasksExecuted).toBe(0);
    });
  });

  describe('createLifecycleAdapter factory', () => {
    it('should create an adapter from a manager', () => {
      const factoryAdapter = createLifecycleAdapter(manager);
      expect(factoryAdapter.getStatus()).toBe(AgentStatus.INITIALIZING);
    });
  });
});
