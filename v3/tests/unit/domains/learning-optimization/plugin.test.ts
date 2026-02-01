/**
 * Agentic QE v3 - Learning Optimization Plugin Unit Tests
 *
 * Tests for the learning optimization domain plugin covering:
 * - Lifecycle management (initialize/dispose)
 * - Task handlers (run-learning-cycle, optimize-strategies, share-learnings)
 * - Pattern learning and strategy optimization
 * - Cross-domain event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LearningOptimizationPlugin,
  createLearningOptimizationPlugin,
} from '../../../../src/domains/learning-optimization/plugin';
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

describe('LearningOptimizationPlugin', () => {
  let plugin: LearningOptimizationPlugin;
  let eventBus: MockEventBus;
  let memory: MockMemoryBackend;
  let agentCoordinator: MockAgentCoordinator;

  beforeEach(() => {
    eventBus = new MockEventBus();
    memory = new MockMemoryBackend();
    agentCoordinator = new MockAgentCoordinator();
    plugin = new LearningOptimizationPlugin(eventBus, memory, agentCoordinator);
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
      expect(plugin.name).toBe('learning-optimization');
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

    it('should cleanup all services on disposal', async () => {
      await plugin.initialize();
      await plugin.dispose();

      const api = plugin.getAPI<{ getCoordinator: () => unknown }>();
      expect(api.getCoordinator()).toBeNull();
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('factory function', () => {
    it('should create plugin via factory function', () => {
      const createdPlugin = createLearningOptimizationPlugin(eventBus, memory, agentCoordinator);
      expect(createdPlugin).toBeInstanceOf(LearningOptimizationPlugin);
      expect(createdPlugin.name).toBe('learning-optimization');
    });

    it('should accept optional configuration', () => {
      const createdPlugin = createLearningOptimizationPlugin(eventBus, memory, agentCoordinator, {
        learningService: {},
        transferService: {},
        optimizerService: {},
      });
      expect(createdPlugin).toBeInstanceOf(LearningOptimizationPlugin);
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

  describe('getAPI', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should return API with coordinator methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('runLearningCycle');
      expect(api).toHaveProperty('optimizeAllStrategies');
      expect(api).toHaveProperty('shareCrossDomainLearnings');
      expect(api).toHaveProperty('getLearningDashboard');
      expect(api).toHaveProperty('exportModels');
      expect(api).toHaveProperty('importModels');
    });

    it('should return API with pattern learning methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('learnPattern');
      expect(api).toHaveProperty('findMatchingPatterns');
      expect(api).toHaveProperty('applyPattern');
      expect(api).toHaveProperty('updatePatternFeedback');
      expect(api).toHaveProperty('getPatternStats');
    });

    it('should return API with knowledge transfer methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('queryKnowledge');
      expect(api).toHaveProperty('transferKnowledge');
    });

    it('should return API with strategy optimization methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('optimizeStrategy');
      expect(api).toHaveProperty('runABTest');
      expect(api).toHaveProperty('recommendStrategy');
      expect(api).toHaveProperty('evaluateStrategy');
    });

    it('should return API with internal accessor methods', () => {
      const api = plugin.getAPI<Record<string, unknown>>();

      expect(api).toHaveProperty('getCoordinator');
      expect(api).toHaveProperty('getActiveWorkflows');
      expect(api).toHaveProperty('getLearningService');
      expect(api).toHaveProperty('getTransferService');
      expect(api).toHaveProperty('getOptimizerService');
      expect(api).toHaveProperty('getProductionIntelService');
    });
  });

  // ============================================================================
  // canHandleTask Tests
  // ============================================================================

  describe('canHandleTask', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle run-learning-cycle task type', () => {
      expect(plugin.canHandleTask('run-learning-cycle')).toBe(true);
    });

    it('should handle optimize-strategies task type', () => {
      expect(plugin.canHandleTask('optimize-strategies')).toBe(true);
    });

    it('should handle share-learnings task type', () => {
      expect(plugin.canHandleTask('share-learnings')).toBe(true);
    });

    it('should handle learn-pattern task type', () => {
      expect(plugin.canHandleTask('learn-pattern')).toBe(true);
    });

    it('should handle query-knowledge task type', () => {
      expect(plugin.canHandleTask('query-knowledge')).toBe(true);
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

    it('should accept valid run-learning-cycle task', async () => {
      const request = sampleTasks.learningOptimization.runLearningCycle;
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

    it('should return error for run-learning-cycle with missing domain', async () => {
      const request = createMockTaskRequest('run-learning-cycle', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing domain');
    });

    it('should return error for learn-pattern with missing experiences', async () => {
      const request = createMockTaskRequest('learn-pattern', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing experiences');
    });

    it('should return error for query-knowledge with missing query', async () => {
      const request = createMockTaskRequest('query-knowledge', {});
      const { callback, waitForResult } = createMockCallback();

      const acceptResult = await plugin.executeTask(request, callback);
      expectSuccess(acceptResult);

      const result = await waitForResult();
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing query');
    });
  });

  // ============================================================================
  // Event Handling Tests
  // ============================================================================

  describe('event handling', () => {
    beforeEach(async () => {
      await plugin.initialize();
    });

    it('should handle test generated events', async () => {
      const event = createMockEvent(
        'test-generation.TestGenerated',
        'test-generation',
        {
          testId: 'test_123',
          testFile: 'test.test.ts',
          testType: 'unit',
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle test run completed events', async () => {
      const event = createMockEvent(
        'test-execution.TestRunCompleted',
        'test-execution',
        {
          runId: 'run_123',
          passed: 95,
          failed: 5,
          duration: 1000,
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle coverage gap events', async () => {
      const event = createMockEvent(
        'coverage-analysis.CoverageGapDetected',
        'coverage-analysis',
        {
          gapId: 'gap_123',
          file: 'src/service.ts',
          riskScore: 0.8,
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle quality gate events', async () => {
      const event = createMockEvent(
        'quality-assessment.QualityGateEvaluated',
        'quality-assessment',
        {
          gateId: 'gate_123',
          passed: true,
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle defect predicted events', async () => {
      const event = createMockEvent(
        'defect-intelligence.DefectPredicted',
        'defect-intelligence',
        {
          predictionId: 'pred_123',
          probability: 0.75,
        }
      );

      await plugin.handleEvent(event);

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should handle impact analysis events', async () => {
      const event = createMockEvent(
        'code-intelligence.ImpactAnalysisCompleted',
        'code-intelligence',
        {
          analysisId: 'analysis_123',
          changedFiles: ['src/auth.ts'],
          impactedFiles: ['src/login.ts'],
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

    it('should track successful learning cycles', async () => {
      const request = sampleTasks.learningOptimization.runLearningCycle;
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.lastActivity).toBeInstanceOf(Date);
    });

    it('should track failed operations', async () => {
      const request = createMockTaskRequest('run-learning-cycle', {});
      const { callback, waitForResult } = createMockCallback();

      await plugin.executeTask(request, callback);
      await waitForResult();

      const health = plugin.getHealth();
      expect(health.errors.length).toBeGreaterThan(0);
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
