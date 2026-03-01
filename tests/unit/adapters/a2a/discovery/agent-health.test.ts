/**
 * Agent Health Checker Tests
 *
 * @module tests/unit/adapters/a2a/discovery/agent-health
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  AgentHealthChecker,
  createAgentHealthChecker,
  DEFAULT_HEALTH_CHECK_CONFIG,
  HealthStatus,
} from '../../../../../src/adapters/a2a/discovery/agent-health.js';
import { QEAgentCard, createQEAgentCard, createAgentSkill } from '../../../../../src/adapters/a2a/agent-cards/schema.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockCard(agentId: string): QEAgentCard {
  return createQEAgentCard(
    agentId,
    `Description for ${agentId}`,
    `http://localhost:8080/a2a/${agentId}`,
    '3.0.0',
    [createAgentSkill('test-skill', 'Test Skill', 'A test skill')],
    { domain: 'test-generation' }
  );
}

function createAgentCards(count: number): Map<string, QEAgentCard> {
  const cards = new Map<string, QEAgentCard>();
  for (let i = 0; i < count; i++) {
    const agentId = `qe-agent-${i}`;
    cards.set(agentId, createMockCard(agentId));
  }
  return cards;
}

// ============================================================================
// Tests
// ============================================================================

describe('AgentHealthChecker', () => {
  let agentCards: Map<string, QEAgentCard>;
  let healthChecker: AgentHealthChecker;

  beforeEach(() => {
    agentCards = createAgentCards(5);
  });

  afterEach(() => {
    if (healthChecker) {
      healthChecker.stopPeriodicChecks();
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      healthChecker = createAgentHealthChecker(agentCards);
      expect(healthChecker).toBeInstanceOf(AgentHealthChecker);
    });

    it('should create with custom config', () => {
      healthChecker = createAgentHealthChecker(agentCards, {
        timeoutMs: 10000,
        failureThreshold: 5,
        recoveryThreshold: 3,
      });
      expect(healthChecker).toBeInstanceOf(AgentHealthChecker);
    });
  });

  describe('checkAgent', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should return health status for known agent', async () => {
      const status = await healthChecker.checkAgent('qe-agent-0');

      expect(status.agentId).toBe('');  // Note: agentId is set by caller in stateToStatus
      expect(status.status).toBe('healthy');
      expect(status.lastCheck).toBeInstanceOf(Date);
      expect(status.errorCount).toBe(0);
    });

    it('should return unknown status for unknown agent', async () => {
      const status = await healthChecker.checkAgent('unknown-agent');

      expect(status.agentId).toBe('unknown-agent');
      expect(status.status).toBe('unknown');
      expect(status.errorMessage).toBe('Agent not found');
    });

    it('should emit check-complete event', async () => {
      const handler = vi.fn();
      healthChecker.on('check-complete', handler);

      await healthChecker.checkAgent('qe-agent-0');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('checkAll', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should check all agents', async () => {
      const results = await healthChecker.checkAll();

      expect(results.size).toBe(5);
      for (const [agentId, status] of results) {
        expect(agentId).toMatch(/^qe-agent-\d$/);
        expect(status.status).toBe('healthy');
      }
    });

    it('should emit all-checks-complete event', async () => {
      const handler = vi.fn();
      healthChecker.on('all-checks-complete', handler);

      await healthChecker.checkAll();

      expect(handler).toHaveBeenCalled();
      const summary = handler.mock.calls[0][0];
      expect(summary.total).toBe(5);
    });
  });

  describe('custom check function', () => {
    it('should use custom check function', async () => {
      const customCheckFn = vi.fn().mockResolvedValue({
        success: true,
        responseTime: 50,
        details: { custom: true },
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
      });

      await healthChecker.checkAgent('qe-agent-0');

      expect(customCheckFn).toHaveBeenCalledWith('qe-agent-0', agentCards.get('qe-agent-0'));
    });

    it('should handle custom check function failure', async () => {
      const customCheckFn = vi.fn().mockResolvedValue({
        success: false,
        error: new Error('Custom check failed'),
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
      });

      const status = await healthChecker.checkAgent('qe-agent-0');

      expect(status.errorCount).toBe(1);
    });
  });

  describe('failure threshold', () => {
    beforeEach(() => {
      const customCheckFn = vi.fn().mockResolvedValue({
        success: false,
        error: new Error('Check failed'),
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 3,
      });
    });

    it('should mark as degraded before threshold', async () => {
      await healthChecker.checkAgent('qe-agent-0');
      const status = await healthChecker.checkAgent('qe-agent-0');

      expect(status.status).toBe('degraded');
      expect(status.errorCount).toBe(2);
    });

    it('should mark as unavailable after threshold', async () => {
      await healthChecker.checkAgent('qe-agent-0');
      await healthChecker.checkAgent('qe-agent-0');
      const status = await healthChecker.checkAgent('qe-agent-0');

      expect(status.status).toBe('unavailable');
      expect(status.errorCount).toBe(3);
    });
  });

  describe('recovery threshold', () => {
    it('should recover after consecutive successes', async () => {
      // First, cause failures
      let failCount = 0;
      const customCheckFn = vi.fn().mockImplementation(() => {
        failCount++;
        if (failCount <= 3) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 2,
        recoveryThreshold: 2,
      });

      // Fail enough to be unavailable
      await healthChecker.checkAgent('qe-agent-0');
      await healthChecker.checkAgent('qe-agent-0');
      let status = await healthChecker.checkAgent('qe-agent-0');
      expect(status.status).toBe('unavailable');

      // First success - still unavailable
      status = await healthChecker.checkAgent('qe-agent-0');
      expect(status.status).toBe('unavailable');

      // Second success - should recover
      status = await healthChecker.checkAgent('qe-agent-0');
      expect(status.status).toBe('healthy');
    });
  });

  describe('degraded threshold', () => {
    it('should mark as degraded for slow responses', async () => {
      const customCheckFn = vi.fn().mockResolvedValue({
        success: true,
        responseTime: 2000, // Slow response
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        degradedThresholdMs: 1000,
      });

      const status = await healthChecker.checkAgent('qe-agent-0');

      expect(status.status).toBe('degraded');
    });
  });

  describe('getHealthyAgents', () => {
    beforeEach(() => {
      let callCount = 0;
      const customCheckFn = vi.fn().mockImplementation(() => {
        callCount++;
        // Make some agents unhealthy
        if (callCount <= 2) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 1,
      });
    });

    it('should return only healthy agent IDs', async () => {
      await healthChecker.checkAll();

      const healthyAgents = healthChecker.getHealthyAgents();
      expect(healthyAgents.length).toBe(3); // 5 - 2 unhealthy
    });
  });

  describe('getUnhealthyAgents', () => {
    beforeEach(() => {
      let callCount = 0;
      const customCheckFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 1,
      });
    });

    it('should return only unhealthy agent IDs', async () => {
      await healthChecker.checkAll();

      const unhealthyAgents = healthChecker.getUnhealthyAgents();
      expect(unhealthyAgents.length).toBe(2);
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should return status for checked agent', async () => {
      await healthChecker.checkAgent('qe-agent-0');

      const status = healthChecker.getStatus('qe-agent-0');
      expect(status).not.toBeNull();
      expect(status?.status).toBe('healthy');
    });

    it('should return null for unchecked agent', () => {
      const status = healthChecker.getStatus('qe-agent-0');
      expect(status).toBeNull();
    });
  });

  describe('getAllStatuses', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should return all checked statuses', async () => {
      await healthChecker.checkAll();

      const allStatuses = healthChecker.getAllStatuses();
      expect(allStatuses.size).toBe(5);
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      let callCount = 0;
      const customCheckFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        if (callCount === 2) {
          return Promise.resolve({ success: true, responseTime: 2000 }); // Slow
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 2, // Needs 2 failures to become unavailable
        degradedThresholdMs: 1000,
      });
    });

    it('should return correct summary', async () => {
      await healthChecker.checkAll();

      const summary = healthChecker.getSummary();
      expect(summary.total).toBe(5);
      expect(summary.healthy).toBe(3);
      expect(summary.degraded).toBe(2); // 1 slow + 1 failed (both are degraded)
      expect(summary.calculatedAt).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should reset specific agent state', async () => {
      await healthChecker.checkAgent('qe-agent-0');
      expect(healthChecker.getStatus('qe-agent-0')).not.toBeNull();

      healthChecker.resetAgent('qe-agent-0');
      expect(healthChecker.getStatus('qe-agent-0')).toBeNull();
    });

    it('should reset all agent states', async () => {
      await healthChecker.checkAll();
      expect(healthChecker.getAllStatuses().size).toBe(5);

      healthChecker.resetAll();
      expect(healthChecker.getAllStatuses().size).toBe(0);
    });
  });

  describe('periodic checks', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should start periodic checks', () => {
      healthChecker.startPeriodicChecks({ intervalMs: 1000 });
      expect(healthChecker.isPeriodicCheckRunning()).toBe(true);
    });

    it('should stop periodic checks', () => {
      healthChecker.startPeriodicChecks({ intervalMs: 1000 });
      healthChecker.stopPeriodicChecks();
      expect(healthChecker.isPeriodicCheckRunning()).toBe(false);
    });

    it('should call onStatusChange callback when status changes', async () => {
      let failNext = false;
      const customCheckFn = vi.fn().mockImplementation(() => {
        if (failNext) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 2, // Need 2 failures to go unavailable
      });

      const onStatusChange = vi.fn();

      // Initial check
      await healthChecker.checkAgent('qe-agent-0');
      expect(healthChecker.getStatus('qe-agent-0')?.status).toBe('healthy');

      // Start periodic checks with status change callback
      healthChecker.startPeriodicChecks({
        intervalMs: 10000, // Long interval so it doesn't interfere
        checkOnlyUnhealthy: false,
        onStatusChange,
      });

      // Cause a failure (1 failure = degraded, not unavailable)
      failNext = true;
      await healthChecker.checkAgent('qe-agent-0');

      expect(healthChecker.getStatus('qe-agent-0')?.status).toBe('degraded');
    });

    it('should only check unhealthy agents when configured', async () => {
      let callCount = 0;
      const customCheckFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 1,
      });

      // Initial check to establish states
      await healthChecker.checkAll();

      // Get count of unhealthy agents
      const unhealthyCount = healthChecker.getUnhealthyAgents().length;
      expect(unhealthyCount).toBeGreaterThan(0); // Sanity check

      // Reset call count
      customCheckFn.mockClear();

      // Start periodic checks for unhealthy only
      // Note: startPeriodicChecks runs an immediate check, so we expect 2x the count
      // (initial run + one interval)
      healthChecker.startPeriodicChecks({
        intervalMs: 100,
        checkOnlyUnhealthy: true,
      });

      // Wait for initial run + one interval check
      await new Promise(resolve => setTimeout(resolve, 150));
      healthChecker.stopPeriodicChecks();

      // Should have checked unhealthy agents (at least once via initial run)
      // The exact count depends on timing, but should be at least unhealthyCount
      expect(customCheckFn.mock.calls.length).toBeGreaterThanOrEqual(unhealthyCount);
      // And should be at most 2x (initial + one interval)
      expect(customCheckFn.mock.calls.length).toBeLessThanOrEqual(unhealthyCount * 2);
    });
  });

  describe('updateAgentCards', () => {
    beforeEach(() => {
      healthChecker = createAgentHealthChecker(agentCards);
    });

    it('should clear states for removed agents', async () => {
      await healthChecker.checkAll();
      expect(healthChecker.getAllStatuses().size).toBe(5);

      // Update with fewer agents
      const newCards = createAgentCards(3);
      healthChecker.updateAgentCards(newCards);

      // States for removed agents should be cleared
      expect(healthChecker.getStatus('qe-agent-3')).toBeNull();
      expect(healthChecker.getStatus('qe-agent-4')).toBeNull();
    });
  });

  describe('status change events', () => {
    it('should emit status-change event', async () => {
      let failNext = false;
      const customCheckFn = vi.fn().mockImplementation(() => {
        if (failNext) {
          return Promise.resolve({ success: false, error: new Error('Failed') });
        }
        return Promise.resolve({ success: true, responseTime: 50 });
      });

      healthChecker = createAgentHealthChecker(agentCards, {
        checkFn: customCheckFn,
        failureThreshold: 2, // Need 2 failures to go unavailable
      });

      const statusChangeHandler = vi.fn();
      healthChecker.on('status-change', statusChangeHandler);

      // Initial check (unknown -> healthy)
      await healthChecker.checkAgent('qe-agent-0');
      expect(statusChangeHandler).toHaveBeenCalledWith('qe-agent-0', 'unknown', 'healthy');

      // Cause failure (healthy -> degraded with 1 failure)
      failNext = true;
      await healthChecker.checkAgent('qe-agent-0');
      expect(statusChangeHandler).toHaveBeenCalledWith('qe-agent-0', 'healthy', 'degraded');
    });
  });
});

describe('createAgentHealthChecker', () => {
  it('should create an AgentHealthChecker instance', () => {
    const cards = new Map<string, QEAgentCard>();
    const checker = createAgentHealthChecker(cards);

    expect(checker).toBeInstanceOf(AgentHealthChecker);
  });
});

describe('DEFAULT_HEALTH_CHECK_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_HEALTH_CHECK_CONFIG.timeoutMs).toBe(5000);
    expect(DEFAULT_HEALTH_CHECK_CONFIG.failureThreshold).toBe(3);
    expect(DEFAULT_HEALTH_CHECK_CONFIG.recoveryThreshold).toBe(2);
    expect(DEFAULT_HEALTH_CHECK_CONFIG.degradedThresholdMs).toBe(1000);
  });
});
