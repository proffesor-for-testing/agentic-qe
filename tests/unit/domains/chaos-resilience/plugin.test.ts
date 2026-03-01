/**
 * Agentic QE v3 - Chaos Resilience Plugin Unit Tests
 *
 * Tests for the chaos resilience domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (run-experiment, run-load-test, assess-resilience)
 * - Fault injection scenarios
 * - Event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ChaosResiliencePlugin,
  createChaosResiliencePlugin,
} from '../../../../src/domains/chaos-resilience/plugin';
import {
  MockEventBus,
  MockMemoryBackend,
  MockAgentCoordinator,
  createMockTaskRequest,
  createMockCallback,
  createMockEvent,
  verifyIdleHealth,
  sampleTasks,
  expectSuccess,
  expectError,
} from '../plugin-test-utils';

describe('ChaosResiliencePlugin', () => {
  let plugin: ChaosResiliencePlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new ChaosResiliencePlugin(eventBus, memory, agentCoordinator);
  });

  afterEach(async () => {
    if (plugin.isReady()) {
      await plugin.dispose();
    }
    await eventBus.dispose();
    await memory.dispose();
    await agentCoordinator.dispose();
  });

  // ============================================================================
  // Metadata Tests
  // ============================================================================

  describe('metadata', () => {
    it('should have correct domain name', () => {
      expect(plugin.name).toBe('chaos-resilience');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have no required dependencies', () => {
      expect(plugin.dependencies).toEqual([]);
    });
  });

  // ============================================================================
  // Lifecycle Tests
  // ============================================================================

  describe('lifecycle', () => {
    it('should not be ready before initialization', () => {
      expect(plugin.isReady()).toBe(false);
    });

    it('should be ready after initialization', async () => {
      await plugin.initialize();
      expect(plugin.isReady()).toBe(true);
    });

    it('should have idle health status after initialization', async () => {
      await plugin.initialize();
      const health = plugin.getHealth();
      verifyIdleHealth(health);
    });

    it('should not be ready after disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();
      expect(plugin.isReady()).toBe(false);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createChaosResiliencePlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(ChaosResiliencePlugin);
      expect(createdPlugin.name).toBe('chaos-resilience');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createChaosResiliencePlugin(eventBus, memory, agentCoordinator, {
        chaosEngine: {},
        loadTester: {},
      });
      expect(createdPlugin).toBeInstanceOf(ChaosResiliencePlugin);
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should return API with all expected methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('runExperiment');
      expect(api).toHaveProperty('runLoadTest');
      expect(api).toHaveProperty('assessResilience');
      expect(api).toHaveProperty('getExperimentHistory');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getChaosEngine');
      expect(api).toHaveProperty('getLoadTester');
      expect(api).toHaveProperty('getResilienceAssessor');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle run-experiment task type', () => {
      expect(plugin.canHandleTask('run-experiment')).toBe(true);
    });

    it('should handle run-load-test task type', () => {
      expect(plugin.canHandleTask('run-load-test')).toBe(true);
    });

    it('should handle assess-resilience task type', () => {
      expect(plugin.canHandleTask('assess-resilience')).toBe(true);
    });

    it('should handle inject-fault task type', () => {
      expect(plugin.canHandleTask('inject-fault')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('execute-tests')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid run-experiment task', async () => {
      const request = sampleTasks.chaosResilience.runExperiment;
      const { callback } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);
    });

    it('should return error for unknown task type', async () => {
      const request = createMockTaskRequest('unknown-task', {});
      const { callback } = createMockCallback();

      const result = await plugin.executeTask(request, callback);
      expectError(result);
      expect(result.error.message).toContain('no handler');
    });

    it('should return error for run-experiment with missing experimentId', async () => {
      const request = createMockTaskRequest('run-experiment', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing experimentId');
    });

    it('should return error for run-load-test with missing testId', async () => {
      const request = createMockTaskRequest('run-load-test', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing testId');
    });

    it('should return error for assess-resilience with missing services', async () => {
      const request = createMockTaskRequest('assess-resilience', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing services');
    });

    it('should return error for inject-fault with missing faultType', async () => {
      const request = createMockTaskRequest('inject-fault', {
        target: 'api-service',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing faultType or target');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle deployment completed events', async () => {
      const event = createMockEvent(
        'ci-cd.DeploymentCompleted',
        'ci-cd',
        {
          environment: 'staging',
          version: '1.0.0',
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle quality gate events for resilience assessment', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_123',
          passed: true,
          checks: [{ name: 'resilience', passed: true }],
        }
      );

      await plugin.handleEvent(event);

      // Should store for correlation
      const stored = await memory.get('chaos-resilience:gate-context:gate_123');
      expect(stored).toBeDefined();
    });
  });

  // ============================================================================
  // Health Tracking Tests
  // ============================================================================

  describe('health tracking', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should start with idle status', () => {
      const health = plugin.getHealth();
      expect(health.status).toBe('idle');
    });

    it('should track experiment executions', async () => {
      const request = sampleTasks.chaosResilience.runExperiment;
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Integration Configuration Tests
  // ============================================================================

  describe('integration configuration', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should not have MinCut integration by default', () => {
      expect(plugin.hasMinCutIntegration()).toBe(false);
    });

    it('should not have consensus enabled by default', () => {
      expect(plugin.hasConsensusEnabled()).toBe(false);
    });
  });
});
