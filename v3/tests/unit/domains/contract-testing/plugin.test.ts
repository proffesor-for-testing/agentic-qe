/**
 * Agentic QE v3 - Contract Testing Plugin Unit Tests
 *
 * Tests for the contract testing domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (validate-contract, compare-versions, check-compatibility)
 * - Consumer-driven contract validation
 * - Event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ContractTestingPlugin,
  createContractTestingPlugin,
} from '../../../../src/domains/contract-testing/plugin';
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

describe('ContractTestingPlugin', () => {
  let plugin: ContractTestingPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new ContractTestingPlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('contract-testing');
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
      const createdPlugin = createContractTestingPlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(ContractTestingPlugin);
      expect(createdPlugin.name).toBe('contract-testing');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createContractTestingPlugin(eventBus, memory, agentCoordinator, {
        schemaValidator: {},
        apiCompatibility: {},
      });
      expect(createdPlugin).toBeInstanceOf(ContractTestingPlugin);
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

      expect(api).toHaveProperty('validateContract');
      expect(api).toHaveProperty('compareVersions');
      expect(api).toHaveProperty('checkCompatibility');
      expect(api).toHaveProperty('generateContract');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getSchemaValidator');
      expect(api).toHaveProperty('getApiCompatibility');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle validate-contract task type', () => {
      expect(plugin.canHandleTask('validate-contract')).toBe(true);
    });

    it('should handle compare-versions task type', () => {
      expect(plugin.canHandleTask('compare-versions')).toBe(true);
    });

    it('should handle check-compatibility task type', () => {
      expect(plugin.canHandleTask('check-compatibility')).toBe(true);
    });

    it('should handle generate-contract task type', () => {
      expect(plugin.canHandleTask('generate-contract')).toBe(true);
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

    it('should accept valid validate-contract task', async () => {
      const request = sampleTasks.contractTesting.validateContract;
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

    it('should return error for validate-contract with missing contract', async () => {
      const request = createMockTaskRequest('validate-contract', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing contract');
    });

    it('should return error for compare-versions with missing versions', async () => {
      const request = createMockTaskRequest('compare-versions', {
        oldVersion: '1.0.0',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing oldVersion or newVersion');
    });

    it('should return error for check-compatibility with missing provider', async () => {
      const request = createMockTaskRequest('check-compatibility', {
        consumer: 'frontend',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing provider or consumer');
    });

    it('should return error for generate-contract with missing serviceSpec', async () => {
      const request = createMockTaskRequest('generate-contract', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing serviceSpec');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle API version changed events', async () => {
      const event = createMockEvent(
        'api.VersionChanged',
        'api',
        {
          serviceName: 'user-service',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
        }
      );

      await plugin.handleEvent(event);

      // Should store version change for compatibility tracking
      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle deployment completed events', async () => {
      const event = createMockEvent(
        'ci-cd.DeploymentCompleted',
        'ci-cd',
        {
          environment: 'staging',
          services: ['api', 'frontend'],
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
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

    it('should track contract validations', async () => {
      const request = sampleTasks.contractTesting.validateContract;
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
