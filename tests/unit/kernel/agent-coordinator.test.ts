/**
 * Agentic QE v3 - Agent Coordinator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator';

describe('DefaultAgentCoordinator', () => {
  let coordinator: DefaultAgentCoordinator;

  beforeEach(() => {
    coordinator = new DefaultAgentCoordinator(15); // Max 15 concurrent agents
  });

  afterEach(async () => {
    await coordinator.dispose();
  });

  describe('spawn', () => {
    it('should spawn an agent and return its ID', async () => {
      const result = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: ['unit-tests', 'jest'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeDefined();
        expect(typeof result.value).toBe('string');
      }
    });

    it('should enforce max concurrent agent limit', async () => {
      // Spawn 15 agents (the limit)
      for (let i = 0; i < 15; i++) {
        const result = await coordinator.spawn({
          name: `agent-${i}`,
          domain: 'test-generation',
          type: 'generator',
          capabilities: [],
        });
        expect(result.success).toBe(true);
      }

      // 16th agent should fail
      const result = await coordinator.spawn({
        name: 'agent-16',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('maximum concurrent agents');
      }
    });
  });

  describe('getStatus', () => {
    it('should return agent status', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(spawnResult.success).toBe(true);
      if (spawnResult.success) {
        const status = coordinator.getStatus(spawnResult.value);
        expect(status).toBe('running');
      }
    });

    it('should return undefined for unknown agent', () => {
      const status = coordinator.getStatus('unknown-id');
      expect(status).toBeUndefined();
    });
  });

  describe('listAgents', () => {
    it('should list all agents', async () => {
      await coordinator.spawn({
        name: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      await coordinator.spawn({
        name: 'agent-2',
        domain: 'coverage-analysis',
        type: 'analyzer',
        capabilities: [],
      });

      const agents = coordinator.listAgents();
      expect(agents).toHaveLength(2);
    });

    it('should filter by domain', async () => {
      await coordinator.spawn({
        name: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      await coordinator.spawn({
        name: 'agent-2',
        domain: 'coverage-analysis',
        type: 'analyzer',
        capabilities: [],
      });

      const agents = coordinator.listAgents({ domain: 'test-generation' });
      expect(agents).toHaveLength(1);
      expect(agents[0].domain).toBe('test-generation');
    });

    it('should filter by status', async () => {
      const result1 = await coordinator.spawn({
        name: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      await coordinator.spawn({
        name: 'agent-2',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (result1.success) {
        await coordinator.stop(result1.value);
      }

      const runningAgents = coordinator.listAgents({ status: 'running' });
      expect(runningAgents).toHaveLength(1);

      const completedAgents = coordinator.listAgents({ status: 'completed' });
      expect(completedAgents).toHaveLength(1);
    });
  });

  describe('stop', () => {
    it('should stop a running agent', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(spawnResult.success).toBe(true);
      if (spawnResult.success) {
        const stopResult = await coordinator.stop(spawnResult.value);
        expect(stopResult.success).toBe(true);

        const status = coordinator.getStatus(spawnResult.value);
        expect(status).toBe('completed');
      }
    });

    it('should fail to stop non-existent agent', async () => {
      const result = await coordinator.stop('unknown-id');
      expect(result.success).toBe(false);
    });
  });

  describe('canSpawn', () => {
    it('should return true when under limit', () => {
      expect(coordinator.canSpawn()).toBe(true);
    });

    it('should return false when at limit', async () => {
      for (let i = 0; i < 15; i++) {
        await coordinator.spawn({
          name: `agent-${i}`,
          domain: 'test-generation',
          type: 'generator',
          capabilities: [],
        });
      }

      expect(coordinator.canSpawn()).toBe(false);
    });
  });

  describe('getActiveCount', () => {
    it('should count only running and queued agents', async () => {
      const result1 = await coordinator.spawn({
        name: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      await coordinator.spawn({
        name: 'agent-2',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(coordinator.getActiveCount()).toBe(2);

      if (result1.success) {
        await coordinator.stop(result1.value);
      }

      expect(coordinator.getActiveCount()).toBe(1);
    });
  });

  describe('listAgents filtering', () => {
    it('should filter by type', async () => {
      await coordinator.spawn({
        name: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      await coordinator.spawn({
        name: 'agent-2',
        domain: 'test-generation',
        type: 'executor',
        capabilities: [],
      });

      const generators = coordinator.listAgents({ type: 'generator' });
      expect(generators).toHaveLength(1);
      expect(generators[0].type).toBe('generator');

      const executors = coordinator.listAgents({ type: 'executor' });
      expect(executors).toHaveLength(1);
      expect(executors[0].type).toBe('executor');
    });
  });

  describe('stop edge cases', () => {
    it('should fail to stop already stopped agent', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(spawnResult.success).toBe(true);
      if (spawnResult.success) {
        // Stop once
        const firstStop = await coordinator.stop(spawnResult.value);
        expect(firstStop.success).toBe(true);

        // Try to stop again
        const secondStop = await coordinator.stop(spawnResult.value);
        expect(secondStop.success).toBe(false);
        if (!secondStop.success) {
          expect(secondStop.error.message).toContain('is not running');
        }
      }
    });
  });

  describe('markCompleted', () => {
    it('should mark a running agent as completed', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(spawnResult.success).toBe(true);
      if (spawnResult.success) {
        coordinator.markCompleted(spawnResult.value);
        const status = coordinator.getStatus(spawnResult.value);
        expect(status).toBe('completed');
      }
    });

    it('should do nothing for non-existent agent', () => {
      // Should not throw
      coordinator.markCompleted('nonexistent-id');
    });

    it('should do nothing for non-running agent', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (spawnResult.success) {
        // Mark completed first
        coordinator.markCompleted(spawnResult.value);
        expect(coordinator.getStatus(spawnResult.value)).toBe('completed');

        // Try to mark completed again (should do nothing)
        coordinator.markCompleted(spawnResult.value);
        expect(coordinator.getStatus(spawnResult.value)).toBe('completed');
      }
    });
  });

  describe('markFailed', () => {
    it('should mark a running agent as failed', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      expect(spawnResult.success).toBe(true);
      if (spawnResult.success) {
        coordinator.markFailed(spawnResult.value);
        const status = coordinator.getStatus(spawnResult.value);
        expect(status).toBe('failed');
      }
    });

    it('should do nothing for non-existent agent', () => {
      // Should not throw
      coordinator.markFailed('nonexistent-id');
    });

    it('should do nothing for non-running agent', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (spawnResult.success) {
        // Mark failed first
        coordinator.markFailed(spawnResult.value);
        expect(coordinator.getStatus(spawnResult.value)).toBe('failed');

        // Try to mark failed again (should do nothing)
        coordinator.markFailed(spawnResult.value);
        expect(coordinator.getStatus(spawnResult.value)).toBe('failed');
      }
    });
  });

  describe('cleanup', () => {
    it('should remove completed agents older than TTL', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (spawnResult.success) {
        coordinator.markCompleted(spawnResult.value);

        // Wait a small amount so the completion time is in the past
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Cleanup with 5ms TTL (agent completed 10ms ago)
        const cleaned = coordinator.cleanup(5);
        expect(cleaned).toBe(1);

        // Agent should be gone
        const status = coordinator.getStatus(spawnResult.value);
        expect(status).toBeUndefined();
      }
    });

    it('should remove failed agents older than TTL', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (spawnResult.success) {
        coordinator.markFailed(spawnResult.value);

        // Wait a small amount so the completion time is in the past
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Cleanup with 5ms TTL (agent failed 10ms ago)
        const cleaned = coordinator.cleanup(5);
        expect(cleaned).toBe(1);
      }
    });

    it('should not remove running agents', async () => {
      await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      const cleaned = coordinator.cleanup(0);
      expect(cleaned).toBe(0);
      expect(coordinator.listAgents()).toHaveLength(1);
    });

    it('should not remove recently completed agents within TTL', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (spawnResult.success) {
        coordinator.markCompleted(spawnResult.value);

        // Cleanup with large TTL (1 hour)
        const cleaned = coordinator.cleanup(3600000);
        expect(cleaned).toBe(0);

        // Agent should still exist
        expect(coordinator.getStatus(spawnResult.value)).toBe('completed');
      }
    });

    it('should use default TTL of 1 hour', async () => {
      const spawnResult = await coordinator.spawn({
        name: 'test-agent',
        domain: 'test-generation',
        type: 'generator',
        capabilities: [],
      });

      if (spawnResult.success) {
        coordinator.markCompleted(spawnResult.value);

        // Default TTL - recently completed should not be cleaned
        const cleaned = coordinator.cleanup();
        expect(cleaned).toBe(0);
      }
    });
  });
});
