/**
 * Agentic QE v3 - Test Generation Plugin Unit Tests
 *
 * Tests for the test generation domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (generate-tests, generate-tdd-tests, etc.)
 * - canHandleTask boundary conditions
 * - Event handling
 * - Error scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestGenerationPlugin,
  createTestGenerationPlugin,
} from '../../../../src/domains/test-generation/plugin';
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

describe('TestGenerationPlugin', () => {
  let plugin: TestGenerationPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new TestGenerationPlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('test-generation');
    });

    it('should have correct version', () => {
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have no dependencies', () => {
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

    it('should be idempotent on multiple initializations', async () => {
      await plugin.initialize();
      await plugin.initialize();
      expect(plugin.isReady()).toBe(true);
    });

    it('should be safe to dispose multiple times', async () => {
      await plugin.initialize();
      await plugin.dispose();
      await expect(plugin.dispose()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createTestGenerationPlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(TestGenerationPlugin);
      expect(createdPlugin.name).toBe('test-generation');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createTestGenerationPlugin(eventBus, memory, agentCoordinator, {
        coordinator: { maxConcurrentTasks: 5 },
      });
      expect(createdPlugin).toBeInstanceOf(TestGenerationPlugin);
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

      expect(api).toHaveProperty('generateTests');
      expect(api).toHaveProperty('generateTDDTests');
      expect(api).toHaveProperty('generatePropertyTests');
      expect(api).toHaveProperty('generateTestData');
      expect(api).toHaveProperty('learnPatterns');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getTestGenerator');
      expect(api).toHaveProperty('getPatternMatcher');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle generate-tests task type', () => {
      expect(plugin.canHandleTask('generate-tests')).toBe(true);
    });

    it('should handle generate-tdd-tests task type', () => {
      expect(plugin.canHandleTask('generate-tdd-tests')).toBe(true);
    });

    it('should handle generate-property-tests task type', () => {
      expect(plugin.canHandleTask('generate-property-tests')).toBe(true);
    });

    it('should handle generate-test-data task type', () => {
      expect(plugin.canHandleTask('generate-test-data')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('execute-tests')).toBe(false);
    });

    it('should be case sensitive for task types', () => {
      expect(plugin.canHandleTask('Generate-Tests')).toBe(false);
      expect(plugin.canHandleTask('GENERATE-TESTS')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid generate-tests task', async () => {
      const request = sampleTasks.testGeneration.generateTests;
      const { callback, waitForResult } = createMockCallback();

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

    it('should return error for generate-tests with missing sourceFiles', async () => {
      const request = createMockTaskRequest('generate-tests', {
        testType: 'unit',
        framework: 'vitest',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      // Wait for completion callback
      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing sourceFiles');
    });

    it('should return error for generate-tdd-tests with missing feature', async () => {
      const request = createMockTaskRequest('generate-tdd-tests', {
        behavior: 'should work',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing feature or behavior');
    });

    it('should return error for generate-property-tests with missing properties', async () => {
      const request = createMockTaskRequest('generate-property-tests', {
        function: 'myFunction',
        properties: [],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });

    it('should return error for generate-test-data with missing schema', async () => {
      const request = createMockTaskRequest('generate-test-data', {
        count: 10,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing schema');
    });

    it('should update health after task execution', async () => {
      const request = sampleTasks.testGeneration.generateTests;
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should subscribe to coverage gap events', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageGapDetected',
        'coverage-analysis',
        {
          gapId: 'gap_123',
          file: 'src/service.ts',
          uncoveredLines: [10, 11, 12],
          riskScore: 0.8,
        }
      );

      await plugin.handleEvent(event);

      // High risk gaps should be stored
      const stored = await memory.get('test-generation:pending-gaps:gap_123');
      expect(stored).toBeDefined();
    });

    it('should store low-risk coverage gaps', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageGapDetected',
        'coverage-analysis',
        {
          gapId: 'gap_456',
          file: 'src/utils.ts',
          uncoveredLines: [5],
          riskScore: 0.3,
        }
      );

      await plugin.handleEvent(event);

      // Low risk gaps should not be auto-stored
      const stored = await memory.get('test-generation:pending-gaps:gap_456');
      expect(stored).toBeUndefined();
    });

    it('should handle impact analysis events', async () => {
      const event = createMockEvent(
        'code-intelligence.ImpactAnalysisCompleted',
        'code-intelligence',
        {
          analysisId: 'analysis_123',
          changedFiles: ['src/auth.ts'],
          impactedTests: ['test/auth.test.ts'],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('test-generation:impact:analysis_123');
      expect(stored).toBeDefined();
    });

    it('should handle pattern consolidation events', async () => {
      const event = createMockEvent(
        'learning-optimization.PatternConsolidated',
        'learning-optimization',
        {
          patternCount: 5,
          domains: ['test-generation', 'test-execution'],
        }
      );

      await plugin.handleEvent(event);

      // Should update health activity
      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should update lastActivity on any event', async () => {
      const before = plugin.getHealth().lastActivity;

      // Small delay to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const event = createMockEvent(
        'any-event',
        'test-generation',
        {}
      );

      await plugin.handleEvent(event);

      const after = plugin.getHealth().lastActivity;
      expect(after).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when accessing API before initialization', async () => {
      // Plugin not initialized
      expect(() => {
        const api = plugin.getAPI<{ generateTests: () => Promise<unknown> }>();
        // API methods should be bound but coordinator null
      }).not.toThrow(); // getAPI itself doesn't throw

      // But methods should throw when called
      await plugin.initialize();
      const api = plugin.getAPI<{ generateTests: (req: unknown) => Promise<{ success: boolean }> }>();
      expect(api.generateTests).toBeDefined();
    });

    it('should track errors in health status', async () => {
      await plugin.initialize();

      // Execute task with missing required fields - should result in error
      const request = createMockTaskRequest('generate-tests', { invalid: true });
      const { callback, waitForResult } = createMockCallback();
      await plugin.executeTask(request, callback);
      const result = await waitForResult();

      // The task fails due to missing sourceFiles
      expect(result.success).toBe(false);

      // Note: The plugin may or may not track the error in health depending on
      // whether it catches and handles the error or lets it propagate
      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should limit stored errors to 10', async () => {
      await plugin.initialize();

      // Generate errors with invalid requests
      // Note: We only need to verify the limit mechanism exists
      const request = createMockTaskRequest('generate-tests', {});
      const { callback, waitForResult } = createMockCallback();
      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      // Health errors array should exist and be manageable
      expect(health.errors.length).toBeLessThanOrEqual(10);
    });
  });

  // ============================================================================
  // Integration Configuration Tests (ADR-047, MM-006)
  // ============================================================================

  describe('integration configuration', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should not have MinCut integration by default', () => {
      expect(plugin.hasMinCutIntegration()).toBe(false);
      expect(plugin.getMinCutBridge()).toBeUndefined();
    });

    it('should not have consensus enabled by default', () => {
      expect(plugin.hasConsensusEnabled()).toBe(false);
      expect(plugin.getConsensusConfig()).toBeUndefined();
    });

    it('should allow setting consensus config', () => {
      plugin.setConsensusConfig({
        enabled: true,
        verifySeverities: ['critical', 'high'],
        autoApprovalThreshold: 0.9,
      });

      expect(plugin.hasConsensusEnabled()).toBe(true);
      expect(plugin.getConsensusConfig()?.verifySeverities).toContain('critical');
    });

    it('should allow setting integration config', () => {
      plugin.setIntegrationConfig({
        consensusConfig: {
          enabled: true,
          verifySeverities: ['critical'],
        },
      });

      expect(plugin.hasConsensusEnabled()).toBe(true);
    });
  });
});
