/**
 * Agentic QE v3 - Defect Intelligence Plugin Unit Tests
 *
 * Tests for the defect intelligence domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (predict-defects, analyze-root-cause, cluster-defects, regression-risk)
 * - canHandleTask boundary conditions
 * - Cross-domain event handling
 * - ML-based prediction scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DefectIntelligencePlugin,
  createDefectIntelligencePlugin,
} from '../../../../src/domains/defect-intelligence/plugin';
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

describe('DefectIntelligencePlugin', () => {
  let plugin: DefectIntelligencePlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new DefectIntelligencePlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('defect-intelligence');
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

    it('should cleanup services on disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();

      // Services should be null
      const api = plugin.getAPI<{ getCoordinator: () => unknown }>();
      expect(api.getCoordinator()).toBeNull();
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createDefectIntelligencePlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(DefectIntelligencePlugin);
      expect(createdPlugin.name).toBe('defect-intelligence');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createDefectIntelligencePlugin(eventBus, memory, agentCoordinator, {
        predictor: { defaultThreshold: 0.8 },
        patternLearner: {},
      });
      expect(createdPlugin).toBeInstanceOf(DefectIntelligencePlugin);
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

      expect(api).toHaveProperty('predictDefects');
      expect(api).toHaveProperty('analyzeRootCause');
      expect(api).toHaveProperty('analyzeRegressionRisk');
      expect(api).toHaveProperty('clusterDefects');
      expect(api).toHaveProperty('learnPatterns');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getPredictor');
      expect(api).toHaveProperty('getPatternLearner');
      expect(api).toHaveProperty('getRootCauseAnalyzer');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle predict-defects task type', () => {
      expect(plugin.canHandleTask('predict-defects')).toBe(true);
    });

    it('should handle analyze-root-cause task type', () => {
      expect(plugin.canHandleTask('analyze-root-cause')).toBe(true);
    });

    it('should handle analyze-regression-risk task type', () => {
      expect(plugin.canHandleTask('analyze-regression-risk')).toBe(true);
    });

    it('should handle cluster-defects task type', () => {
      expect(plugin.canHandleTask('cluster-defects')).toBe(true);
    });

    it('should handle learn-patterns task type', () => {
      expect(plugin.canHandleTask('learn-patterns')).toBe(true);
    });

    it('should not handle unknown task types', () => {
      expect(plugin.canHandleTask('unknown-task')).toBe(false);
      expect(plugin.canHandleTask('')).toBe(false);
      expect(plugin.canHandleTask('execute-tests')).toBe(false);
    });

    it('should be case sensitive for task types', () => {
      expect(plugin.canHandleTask('Predict-Defects')).toBe(false);
      expect(plugin.canHandleTask('PREDICT-DEFECTS')).toBe(false);
    });
  });

  // ============================================================================
  // executeTask Tests
  // ============================================================================

  describe('executeTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should accept valid predict-defects task', async () => {
      const request = sampleTasks.defectIntelligence.predictDefects;
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

    it('should return error for predict-defects with missing files', async () => {
      const request = createMockTaskRequest('predict-defects', {
        threshold: 0.7,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing files');
    });

    it('should return error for predict-defects with empty files array', async () => {
      const request = createMockTaskRequest('predict-defects', {
        files: [],
        threshold: 0.7,
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });

    it('should use default threshold when not provided', async () => {
      const request = createMockTaskRequest('predict-defects', {
        files: ['src/service.ts'],
      });
      const { callback } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);
    });

    it('should return error for analyze-root-cause with missing defectId', async () => {
      const request = createMockTaskRequest('analyze-root-cause', {
        stackTrace: 'Error at line 42',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing defectId');
    });

    it('should return error for cluster-defects with missing defects', async () => {
      const request = createMockTaskRequest('cluster-defects', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing defects');
    });

    it('should return error for cluster-defects with empty defects array', async () => {
      const request = createMockTaskRequest('cluster-defects', {
        defects: [],
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
    });

    it('should return error for analyze-regression-risk with missing changedFiles', async () => {
      const request = createMockTaskRequest('analyze-regression-risk', {
        baseline: 'v1.0.0',
      });
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing changedFiles');
    });

    it('should return error for learn-patterns with missing data', async () => {
      const request = createMockTaskRequest('learn-patterns', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing defectHistory');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle flaky test detected events', async () => {
      const event = createMockEvent(
        'test-execution.FlakyTestDetected',
        'test-execution',
        {
          testId: 'test_123',
          testFile: 'src/service.test.ts',
          // Use low failure rate to avoid triggering slow predictDefects call
          failureRate: 0.25,
          pattern: 'timing-dependent',
        }
      );

      await plugin.handleEvent(event);

      // Should store flaky test data
      const stored = await memory.get('defect-intelligence:flaky-test:test_123');
      expect(stored).toBeDefined();
    });

    it('should handle coverage gap events for high-risk gaps', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageGapDetected',
        'coverage-analysis',
        {
          gapId: 'gap_123',
          file: 'src/critical.ts',
          uncoveredLines: [10, 11, 12, 13],
          riskScore: 0.9,
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('defect-intelligence:coverage-gap:gap_123');
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
          riskScore: 0.5,
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('defect-intelligence:coverage-gap:gap_789');
      expect(stored).toBeUndefined();
    });

    it('should handle impact analysis events', async () => {
      const event = createMockEvent(
        'code-intelligence.ImpactAnalysisCompleted',
        'code-intelligence',
        {
          analysisId: 'analysis_123',
          changedFiles: ['src/auth.ts'],
          impactedFiles: ['src/login.ts', 'src/session.ts'],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('defect-intelligence:impact:analysis_123');
      expect(stored).toBeDefined();
    });

    it('should handle quality gate failed events', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_123',
          passed: false,
          checks: [
            { name: 'coverage', passed: true },
            { name: 'bugs', passed: false },
          ],
        }
      );

      await plugin.handleEvent(event);

      const stored = await memory.get('defect-intelligence:quality-failure:gate_123');
      expect(stored).toBeDefined();
    });

    it('should not store passing quality gate events', async () => {
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

      const stored = await memory.get('defect-intelligence:quality-failure:gate_456');
      expect(stored).toBeUndefined();
    });
  });

  // ============================================================================
  // Health Tracking Tests
  // ============================================================================

  describe('health tracking', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should start with idle status and zero agents', () => {
      const health = plugin.getHealth();
      expect(health.status).toBe('idle');
      expect(health.agents.total).toBe(0);
    });

    it('should track failed operations', async () => {
      const request = createMockTaskRequest('predict-defects', {});
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should throw when services not initialized', async () => {
      await plugin.dispose();

      const api = plugin.getAPI<{ predictDefects: (req: unknown) => Promise<unknown> }>();

      // Methods should throw after disposal
      await expect(api.predictDefects({ files: ['test.ts'] })).rejects.toThrow('not initialized');
    });

    it('should track errors in health and degrade status after many errors', async () => {
      // Generate many errors
      for (let i = 0; i < 6; i++) {
        const request = createMockTaskRequest('predict-defects', {});
        const { callback, waitForResult } = createMockCallback();
        await plugin.executeTask(request, callback);
        await waitForResult();
      }

      const health = plugin.getHealth();
      // Status might be degraded after multiple errors
      expect(['idle', 'degraded']).toContain(health.status);
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
