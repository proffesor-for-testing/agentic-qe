/**
 * Agentic QE v3 - Test Execution Plugin Unit Tests
 *
 * Tests for the test execution domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (execute-tests, detect-flaky, retry-tests)
 * - canHandleTask boundary conditions
 * - Cross-domain event handling
 * - Health tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestExecutionPlugin,
  createTestExecutionPlugin,
} from '../../../../src/domains/test-execution/plugin';
import {
  MockEventBus,
  MockMemoryBackend,
  createMockTaskRequest,
  createMockCallback,
  createMockEvent,
  sampleTasks,
  expectSuccess,
  expectError,
} from '../plugin-test-utils';

describe('TestExecutionPlugin', () => {
  let plugin: TestExecutionPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    // Note: TestExecutionPlugin only takes eventBus and memory (no agentCoordinator)
    plugin = new TestExecutionPlugin(eventBus, memory);
  });

  afterEach(async () => {
    if (plugin.isReady()) {
      await plugin.dispose();
    }
    await eventBus.dispose();
    await memory.dispose();
  });

  // ============================================================================
  // Metadata Tests
  // ============================================================================

  describe('metadata', () => {
    it('should have correct domain name', () => {
      expect(plugin.name).toBe('test-execution');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should depend on test-generation', () => {
      expect(plugin.dependencies).toContain('test-generation');
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
      expect(health.status).toBe('idle');
    });

    it('should not be ready after disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();
      expect(plugin.isReady()).toBe(false);
    });

    it('should set unhealthy status on disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();
      const health = plugin.getHealth();
      expect(health.status).toBe('unhealthy');
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createTestExecutionPlugin(eventBus, memory);
      expect(createdPlugin).toBeInstanceOf(TestExecutionPlugin);
      expect(createdPlugin.name).toBe('test-execution');
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    it('should throw when called before initialization', () => {
      expect(() => plugin.getAPI()).toThrow('Plugin not initialized');
    });

    it('should return API with all expected methods after initialization', async () => {
      await plugin.initialize();
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('runTests');
      expect(api).toHaveProperty('execute');
      expect(api).toHaveProperty('executeParallel');
      expect(api).toHaveProperty('detectFlaky');
      expect(api).toHaveProperty('retry');
      expect(api).toHaveProperty('getStats');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle execute-tests task type', () => {
      expect(plugin.canHandleTask('execute-tests')).toBe(true);
    });

    it('should handle detect-flaky task type', () => {
      expect(plugin.canHandleTask('detect-flaky')).toBe(true);
    });

    it('should handle retry-tests task type', () => {
      expect(plugin.canHandleTask('retry-tests')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('generate-tests')).toBe(false);
    });

    it('should be case sensitive for task types', () => {
      expect(plugin.canHandleTask('Execute-Tests')).toBe(false);
      expect(plugin.canHandleTask('EXECUTE-TESTS')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid execute-tests task with testFiles', async () => {
      const request = sampleTasks.testExecution.executeTests;
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

    it('should return error for execute-tests with missing testFiles and framework', async () => {
      const request = createMockTaskRequest('execute-tests', {
        parallel: true,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing testFiles or framework');
    });

    it('should accept execute-tests with framework (full request format)', async () => {
      const request = createMockTaskRequest('execute-tests', {
        framework: 'vitest',
        timeout: 30000,
      });
      const { callback } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);
    });

    it('should return error for detect-flaky with missing testFiles', async () => {
      const request = createMockTaskRequest('detect-flaky', {
        runs: 5,
        threshold: 0.1,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing testFiles');
    });

    it('should use default values for detect-flaky', async () => {
      const request = createMockTaskRequest('detect-flaky', {
        testFiles: ['test.test.ts'],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);
    });

    it('should return error for retry-tests with missing runId', async () => {
      const request = createMockTaskRequest('retry-tests', {
        failedTests: ['test1'],
        maxRetries: 3,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing runId or failedTests');
    });

    it('should return error for retry-tests with missing failedTests', async () => {
      const request = createMockTaskRequest('retry-tests', {
        runId: 'run_123',
        maxRetries: 3,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle test suite created events', async () => {
      const event = createMockEvent(
        'test-generation.TestSuiteCreated',
        'test-generation',
        {
          suiteId: 'suite_123',
          testCount: 10,
          sourceFiles: ['src/index.ts'],
        }
      );

      await plugin.handleEvent(event);

      // Should store correlation data
      const stored = await memory.get(`suite-event:suite_123`);
      expect(stored).toBeDefined();
    });

    it('should handle quality gate evaluated events', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_123',
          passed: false,
          checks: [
            { name: 'coverage', passed: true },
            { name: 'tests', passed: false },
          ],
        }
      );

      await plugin.handleEvent(event);

      // Should store quality context for failing gates
      const stored = await memory.get(`quality-context:gate_123`);
      expect(stored).toBeDefined();
    });

    it('should not store quality context for passing gates', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_456',
          passed: true,
          checks: [{ name: 'coverage', passed: true }],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get(`quality-context:gate_456`);
      expect(stored).toBeUndefined();
    });

    it('should handle coverage gap detected events for high-risk gaps', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageGapDetected',
        'coverage-analysis',
        {
          gapId: 'gap_123',
          file: 'src/critical.ts',
          uncoveredLines: [10, 11, 12],
          riskScore: 0.9,
        }
      );

      await plugin.handleEvent(event);

      // Should store high-risk gap
      const stored = await memory.get(`coverage-gap:gap_123`);
      expect(stored).toBeDefined();
    });

    it('should not store low-risk coverage gaps', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageGapDetected',
        'coverage-analysis',
        {
          gapId: 'gap_789',
          file: 'src/utils.ts',
          uncoveredLines: [5],
          riskScore: 0.3,
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get(`coverage-gap:gap_789`);
      expect(stored).toBeUndefined();
    });

    it('should update health activity on events', async () => {
      const event = createMockEvent(
        'test-generation.TestSuiteCreated',
        'test-generation',
        { suiteId: 'test', testCount: 1, sourceFiles: [] }
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

    it('should update lastActivity on task execution', async () => {
      const initialHealth = plugin.getHealth();
      const initialActivity = initialHealth.lastActivity;

      // Use setImmediate for minimal async tick
      await new Promise(resolve => setImmediate(resolve));

      const request = sampleTasks.testExecution.executeTests;
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
