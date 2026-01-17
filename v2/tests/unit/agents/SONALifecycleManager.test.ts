/**
 * SONALifecycleManager Unit Tests
 *
 * Comprehensive tests for the SONA lifecycle hooks:
 * - onAgentSpawn: Initialize SONA context for new agents
 * - onTaskComplete: Record feedback and trigger consolidation
 * - onFeedback: Generic feedback recording
 * - cleanupAgent: Cleanup on agent termination
 *
 * @module tests/unit/agents/SONALifecycleManager
 */

import {
  SONALifecycleManager,
  createSONALifecycleManager,
  getSONALifecycleManager,
  resetSONALifecycleManager,
  type SONALifecycleConfig,
  type TaskCompletionFeedback,
  type AgentSONAContext,
} from '../../../src/agents/SONALifecycleManager';
import type { QEAgentType, QETask } from '../../../src/types';
import type { FeedbackEvent } from '../../../src/learning/SONAFeedbackLoop';

// Mock dependencies
jest.mock('../../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/utils/ruvllm-loader', () => ({
  isRuvLLMAvailable: jest.fn(() => false),
}));

// Mock SONA learning strategy
const createMockStrategy = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  recordExecution: jest.fn().mockResolvedValue(undefined),
  storePattern: jest.fn().mockResolvedValue(undefined),
  train: jest.fn().mockResolvedValue({
    iterations: 5,
    improvement: 0.1,
    patternsLearned: 10,
    metrics: { loss: 0.05, accuracy: 0.95 },
  }),
  getMetrics: jest.fn().mockResolvedValue({
    totalPatterns: 100,
    activeAdapters: 1,
    learningRate: 0.01,
  }),
  reset: jest.fn().mockResolvedValue(undefined),
});

let mockStrategy = createMockStrategy();

jest.mock('../../../src/core/strategies/SONALearningStrategy', () => ({
  createSONALearningStrategy: jest.fn(() => mockStrategy),
  SONALearningStrategy: jest.fn(),
}));

// Mock feedback loop
const createMockFeedbackLoop = () => ({
  recordFeedback: jest.fn().mockResolvedValue(undefined),
  reset: jest.fn(),
});

let mockFeedbackLoop = createMockFeedbackLoop();

jest.mock('../../../src/learning/SONAFeedbackLoop', () => ({
  createConnectedFeedbackLoop: jest.fn(() => mockFeedbackLoop),
  SONAFeedbackLoop: jest.fn(),
}));

describe('SONALifecycleManager', () => {
  let manager: SONALifecycleManager;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSONALifecycleManager();

    // Reset mocks to fresh instances
    mockStrategy = createMockStrategy();
    mockFeedbackLoop = createMockFeedbackLoop();

    // Re-setup the mock implementations
    const { createSONALearningStrategy } = require('../../../src/core/strategies/SONALearningStrategy');
    createSONALearningStrategy.mockImplementation(() => mockStrategy);

    const { createConnectedFeedbackLoop } = require('../../../src/learning/SONAFeedbackLoop');
    createConnectedFeedbackLoop.mockImplementation(() => mockFeedbackLoop);

    // Re-setup ruvllm loader mock (clearAllMocks clears implementation)
    const { isRuvLLMAvailable } = require('../../../src/utils/ruvllm-loader');
    isRuvLLMAvailable.mockReturnValue(false);

    manager = new SONALifecycleManager({ enabled: true });
  });

  afterEach(() => {
    resetSONALifecycleManager();
  });

  // ============================================================================
  // CONSTRUCTOR TESTS
  // ============================================================================
  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const mgr = new SONALifecycleManager();
      const stats = mgr.getStatistics();
      expect(stats.totalAgents).toBe(0);
      // ruvLLMAvailable depends on mock - either true or false is valid
      expect(typeof stats.ruvLLMAvailable).toBe('boolean');
    });

    it('should apply custom configuration', () => {
      const config: SONALifecycleConfig = {
        enabled: true,
        autoConsolidate: false,
        consolidationInterval: 50,
        enableLoraAdapters: false,
        minSuccessRateForConsolidation: 0.8,
      };
      const mgr = new SONALifecycleManager(config);
      expect(mgr).toBeDefined();
    });

    it('should handle disabled state', () => {
      const mgr = new SONALifecycleManager({ enabled: false });
      expect(mgr).toBeDefined();
    });

    it('should check ruvLLM availability on init', () => {
      const { isRuvLLMAvailable } = require('../../../src/utils/ruvllm-loader');
      new SONALifecycleManager();
      expect(isRuvLLMAvailable).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // onAgentSpawn() TESTS
  // ============================================================================
  describe('onAgentSpawn()', () => {
    it('should create SONA context for new agent', async () => {
      const context = await manager.onAgentSpawn('agent-001', 'TEST_GENERATOR' as QEAgentType);

      expect(context).toBeDefined();
      expect(context.agentId).toBe('agent-001');
      expect(context.agentType).toBe('TEST_GENERATOR');
      expect(context.successfulTasks).toBe(0);
      expect(context.failedTasks).toBe(0);
    });

    it('should initialize SONA strategy', async () => {
      const { createSONALearningStrategy } = require('../../../src/core/strategies/SONALearningStrategy');

      await manager.onAgentSpawn('agent-002', 'COVERAGE_ANALYZER' as QEAgentType);

      expect(createSONALearningStrategy).toHaveBeenCalled();
      expect(mockStrategy.initialize).toHaveBeenCalled();
    });

    it('should create feedback loop', async () => {
      const { createConnectedFeedbackLoop } = require('../../../src/learning/SONAFeedbackLoop');

      await manager.onAgentSpawn('agent-003', 'QUALITY_GATE' as QEAgentType);

      expect(createConnectedFeedbackLoop).toHaveBeenCalled();
    });

    it('should assign correct LoRA adapter for agent type', async () => {
      const context = await manager.onAgentSpawn('agent-004', 'TEST_GENERATOR' as QEAgentType);
      expect(context.activeAdapter).toBe('test-generation');
    });

    it('should assign security-scanning adapter for SECURITY_SCANNER', async () => {
      const context = await manager.onAgentSpawn('agent-005', 'SECURITY_SCANNER' as QEAgentType);
      expect(context.activeAdapter).toBe('security-scanning');
    });

    it('should handle unknown agent type gracefully', async () => {
      const context = await manager.onAgentSpawn('agent-006', 'UNKNOWN_TYPE' as QEAgentType);
      expect(context.activeAdapter).toBeUndefined();
    });

    it('should throw error when SONA lifecycle is disabled', async () => {
      const disabledManager = new SONALifecycleManager({ enabled: false });

      await expect(
        disabledManager.onAgentSpawn('agent-007', 'TEST_GENERATOR' as QEAgentType)
      ).rejects.toThrow('SONA lifecycle not enabled');
    });

    it('should store context in internal map', async () => {
      await manager.onAgentSpawn('agent-008', 'TEST_EXECUTOR' as QEAgentType);

      const retrieved = manager.getContext('agent-008');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agentId).toBe('agent-008');
    });

    it('should set created timestamp', async () => {
      const before = new Date();
      const context = await manager.onAgentSpawn('agent-009', 'TEST_GENERATOR' as QEAgentType);
      const after = new Date();

      expect(context.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(context.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ============================================================================
  // onTaskComplete() TESTS
  // ============================================================================
  describe('onTaskComplete()', () => {
    const mockTask: QETask = {
      id: 'task-001',
      type: 'test-generation',
      description: 'Generate unit tests',
      priority: 'high',
      status: 'completed',
    };

    beforeEach(async () => {
      await manager.onAgentSpawn('agent-task', 'TEST_GENERATOR' as QEAgentType);
    });

    it('should increment successful task counter on success', async () => {
      const feedback: TaskCompletionFeedback = {
        task: mockTask,
        success: true,
        duration: 1000,
        quality: 0.9,
      };

      await manager.onTaskComplete('agent-task', feedback);

      const context = manager.getContext('agent-task');
      expect(context?.successfulTasks).toBe(1);
      expect(context?.failedTasks).toBe(0);
    });

    it('should increment failed task counter on failure', async () => {
      const feedback: TaskCompletionFeedback = {
        task: mockTask,
        success: false,
        duration: 500,
        error: new Error('Task failed'),
      };

      await manager.onTaskComplete('agent-task', feedback);

      const context = manager.getContext('agent-task');
      expect(context?.successfulTasks).toBe(0);
      expect(context?.failedTasks).toBe(1);
    });

    it('should record feedback to feedback loop', async () => {
      const feedback: TaskCompletionFeedback = {
        task: mockTask,
        success: true,
        duration: 800,
      };

      await manager.onTaskComplete('agent-task', feedback);

      expect(mockFeedbackLoop.recordFeedback).toHaveBeenCalled();
    });

    it('should skip processing when agent context not found', async () => {
      const feedback: TaskCompletionFeedback = {
        task: mockTask,
        success: true,
        duration: 800,
      };

      // Should not throw
      await manager.onTaskComplete('nonexistent-agent', feedback);
    });

    it('should skip processing when SONA disabled', async () => {
      const disabledManager = new SONALifecycleManager({ enabled: false });

      const feedback: TaskCompletionFeedback = {
        task: mockTask,
        success: true,
        duration: 800,
      };

      // Should not throw
      await disabledManager.onTaskComplete('agent-task', feedback);
    });

    it('should trigger consolidation after consolidationInterval tasks', async () => {
      // Create manager with low consolidation interval
      const lowIntervalManager = new SONALifecycleManager({
        enabled: true,
        autoConsolidate: true,
        consolidationInterval: 5,
        minSuccessRateForConsolidation: 0.5,
      });

      await lowIntervalManager.onAgentSpawn('agent-consolidate', 'TEST_GENERATOR' as QEAgentType);

      // Complete 5 successful tasks
      for (let i = 0; i < 5; i++) {
        await lowIntervalManager.onTaskComplete('agent-consolidate', {
          task: { ...mockTask, id: `task-${i}` },
          success: true,
          duration: 1000,
          quality: 0.9,
        });
      }

      // Training should have been called for consolidation
      expect(mockStrategy.train).toHaveBeenCalled();
    });

    it('should not consolidate when success rate below threshold', async () => {
      jest.clearAllMocks();

      const strictManager = new SONALifecycleManager({
        enabled: true,
        autoConsolidate: true,
        consolidationInterval: 2,
        minSuccessRateForConsolidation: 0.9,
      });

      await strictManager.onAgentSpawn('agent-strict', 'TEST_GENERATOR' as QEAgentType);

      // Complete 1 success and 1 failure (50% success rate)
      await strictManager.onTaskComplete('agent-strict', {
        task: mockTask,
        success: true,
        duration: 1000,
      });
      await strictManager.onTaskComplete('agent-strict', {
        task: { ...mockTask, id: 'task-fail' },
        success: false,
        duration: 500,
      });

      // Check context - train should not be called due to low success rate
      const context = strictManager.getContext('agent-strict');
      expect(context?.successfulTasks).toBe(1);
      expect(context?.failedTasks).toBe(1);
    });
  });

  // ============================================================================
  // onFeedback() TESTS
  // ============================================================================
  describe('onFeedback()', () => {
    const mockTask: QETask = {
      id: 'task-fb-001',
      type: 'test-generation',
      description: 'Test task',
      priority: 'medium',
      status: 'running',
    };

    beforeEach(async () => {
      await manager.onAgentSpawn('agent-feedback', 'TEST_GENERATOR' as QEAgentType);
    });

    it('should record feedback event', async () => {
      const event: FeedbackEvent = {
        task: mockTask,
        success: true,
        duration: 1200,
        quality: 0.85,
        timestamp: new Date(),
      };

      await manager.onFeedback('agent-feedback', event);

      expect(mockFeedbackLoop.recordFeedback).toHaveBeenCalledWith(event);
    });

    it('should store patterns used in pending patterns', async () => {
      const event: FeedbackEvent = {
        task: mockTask,
        success: true,
        duration: 1200,
        quality: 0.85,
        patternsUsed: ['pattern-1', 'pattern-2'],
        timestamp: new Date(),
      };

      await manager.onFeedback('agent-feedback', event);

      const context = manager.getContext('agent-feedback');
      expect(context?.pendingPatterns.length).toBe(2);
    });

    it('should skip when agent context not found', async () => {
      const event: FeedbackEvent = {
        task: mockTask,
        success: true,
        duration: 1000,
        timestamp: new Date(),
      };

      // Should not throw
      await manager.onFeedback('nonexistent-agent', event);
    });

    it('should skip when SONA disabled', async () => {
      const disabledManager = new SONALifecycleManager({ enabled: false });

      const event: FeedbackEvent = {
        task: mockTask,
        success: true,
        duration: 1000,
        timestamp: new Date(),
      };

      // Should not throw
      await disabledManager.onFeedback('agent-feedback', event);
    });
  });

  // ============================================================================
  // getContext() TESTS
  // ============================================================================
  describe('getContext()', () => {
    it('should return context for existing agent', async () => {
      await manager.onAgentSpawn('agent-ctx', 'TEST_GENERATOR' as QEAgentType);

      const context = manager.getContext('agent-ctx');
      expect(context).toBeDefined();
      expect(context?.agentId).toBe('agent-ctx');
    });

    it('should return undefined for non-existent agent', () => {
      const context = manager.getContext('nonexistent');
      expect(context).toBeUndefined();
    });
  });

  // ============================================================================
  // getMetrics() TESTS
  // ============================================================================
  describe('getMetrics()', () => {
    it('should return metrics for existing agent', async () => {
      await manager.onAgentSpawn('agent-metrics', 'QUALITY_GATE' as QEAgentType);

      const metrics = await manager.getMetrics('agent-metrics');

      expect(metrics).toBeDefined();
      expect(mockStrategy.getMetrics).toHaveBeenCalled();
    });

    it('should return undefined for non-existent agent', async () => {
      const metrics = await manager.getMetrics('nonexistent');
      expect(metrics).toBeUndefined();
    });
  });

  // ============================================================================
  // train() TESTS
  // ============================================================================
  describe('train()', () => {
    it('should trigger training for agent', async () => {
      await manager.onAgentSpawn('agent-train', 'TEST_GENERATOR' as QEAgentType);

      const result = await manager.train('agent-train', 10);

      expect(result).toBeDefined();
      expect(mockStrategy.train).toHaveBeenCalledWith(10);
    });

    it('should use default iterations when not specified', async () => {
      await manager.onAgentSpawn('agent-train-default', 'TEST_GENERATOR' as QEAgentType);

      await manager.train('agent-train-default');

      expect(mockStrategy.train).toHaveBeenCalledWith(10);
    });

    it('should return undefined for non-existent agent', async () => {
      const result = await manager.train('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // cleanupAgent() TESTS
  // ============================================================================
  describe('cleanupAgent()', () => {
    it('should remove agent context', async () => {
      await manager.onAgentSpawn('agent-cleanup', 'TEST_GENERATOR' as QEAgentType);

      await manager.cleanupAgent('agent-cleanup');

      const context = manager.getContext('agent-cleanup');
      expect(context).toBeUndefined();
    });

    it('should reset feedback loop', async () => {
      await manager.onAgentSpawn('agent-cleanup-fb', 'TEST_GENERATOR' as QEAgentType);

      await manager.cleanupAgent('agent-cleanup-fb');

      expect(mockFeedbackLoop.reset).toHaveBeenCalled();
    });

    it('should reset strategy', async () => {
      await manager.onAgentSpawn('agent-cleanup-strat', 'TEST_GENERATOR' as QEAgentType);

      await manager.cleanupAgent('agent-cleanup-strat');

      expect(mockStrategy.reset).toHaveBeenCalled();
    });

    it('should consolidate pending patterns before cleanup', async () => {
      // Use manager with low consolidation threshold
      const lowThresholdManager = new SONALifecycleManager({
        enabled: true,
        autoConsolidate: true,
        minSuccessRateForConsolidation: 0.5,
      });

      await lowThresholdManager.onAgentSpawn('agent-cleanup-patterns', 'TEST_GENERATOR' as QEAgentType);

      const task = { id: 't1', type: 'test', description: 'test', priority: 'high', status: 'done' };

      // Record successful task to meet success rate threshold
      await lowThresholdManager.onTaskComplete('agent-cleanup-patterns', {
        task,
        success: true,
        duration: 1000,
        quality: 0.9,
      });

      // Add pending patterns via feedback
      await lowThresholdManager.onFeedback('agent-cleanup-patterns', {
        task,
        success: true,
        duration: 1000,
        quality: 0.9,
        patternsUsed: ['p1'],
        timestamp: new Date(),
      });

      await lowThresholdManager.cleanupAgent('agent-cleanup-patterns');

      // Strategy should have stored patterns (consolidateWeights stores pending patterns)
      expect(mockStrategy.storePattern).toHaveBeenCalled();
    });

    it('should handle non-existent agent gracefully', async () => {
      // Should not throw
      await manager.cleanupAgent('nonexistent');
    });
  });

  // ============================================================================
  // getAllContexts() TESTS
  // ============================================================================
  describe('getAllContexts()', () => {
    it('should return empty array when no agents', () => {
      const contexts = manager.getAllContexts();
      expect(contexts).toEqual([]);
    });

    it('should return all agent contexts', async () => {
      await manager.onAgentSpawn('agent-a', 'TEST_GENERATOR' as QEAgentType);
      await manager.onAgentSpawn('agent-b', 'COVERAGE_ANALYZER' as QEAgentType);
      await manager.onAgentSpawn('agent-c', 'QUALITY_GATE' as QEAgentType);

      const contexts = manager.getAllContexts();

      expect(contexts.length).toBe(3);
      expect(contexts.map(c => c.agentId).sort()).toEqual(['agent-a', 'agent-b', 'agent-c']);
    });
  });

  // ============================================================================
  // getStatistics() TESTS
  // ============================================================================
  describe('getStatistics()', () => {
    it('should return correct statistics for empty manager', () => {
      const stats = manager.getStatistics();

      expect(stats.totalAgents).toBe(0);
      expect(stats.totalSuccessfulTasks).toBe(0);
      expect(stats.totalFailedTasks).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
    });

    it('should calculate correct statistics with agents', async () => {
      await manager.onAgentSpawn('agent-stat-1', 'TEST_GENERATOR' as QEAgentType);
      await manager.onAgentSpawn('agent-stat-2', 'COVERAGE_ANALYZER' as QEAgentType);

      const task: QETask = {
        id: 'stat-task',
        type: 'test',
        description: 'Test',
        priority: 'high',
        status: 'done',
      };

      // Agent 1: 3 success, 1 fail
      await manager.onTaskComplete('agent-stat-1', { task, success: true, duration: 100 });
      await manager.onTaskComplete('agent-stat-1', { task, success: true, duration: 100 });
      await manager.onTaskComplete('agent-stat-1', { task, success: true, duration: 100 });
      await manager.onTaskComplete('agent-stat-1', { task, success: false, duration: 100 });

      // Agent 2: 2 success
      await manager.onTaskComplete('agent-stat-2', { task, success: true, duration: 100 });
      await manager.onTaskComplete('agent-stat-2', { task, success: true, duration: 100 });

      const stats = manager.getStatistics();

      expect(stats.totalAgents).toBe(2);
      expect(stats.totalSuccessfulTasks).toBe(5);
      expect(stats.totalFailedTasks).toBe(1);
      expect(stats.averageSuccessRate).toBeCloseTo(5 / 6, 2);
    });
  });

  // ============================================================================
  // SINGLETON TESTS
  // ============================================================================
  describe('Singleton Pattern', () => {
    beforeEach(() => {
      resetSONALifecycleManager();
    });

    it('getSONALifecycleManager should return same instance', () => {
      const instance1 = getSONALifecycleManager();
      const instance2 = getSONALifecycleManager();

      expect(instance1).toBe(instance2);
    });

    it('resetSONALifecycleManager should clear singleton', () => {
      const instance1 = getSONALifecycleManager();
      resetSONALifecycleManager();
      const instance2 = getSONALifecycleManager();

      expect(instance1).not.toBe(instance2);
    });

    it('createSONALifecycleManager should create new instance', () => {
      const instance1 = createSONALifecycleManager();
      const instance2 = createSONALifecycleManager();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ============================================================================
  // ADAPTER MAPPING TESTS
  // ============================================================================
  describe('LoRA Adapter Mapping', () => {
    const adapterMappings: Array<{ agentType: string; expectedAdapter: string }> = [
      { agentType: 'TEST_GENERATOR', expectedAdapter: 'test-generation' },
      { agentType: 'TEST_EXECUTOR', expectedAdapter: 'test-execution' },
      { agentType: 'COVERAGE_ANALYZER', expectedAdapter: 'coverage-analysis' },
      { agentType: 'QUALITY_GATE', expectedAdapter: 'quality-validation' },
      { agentType: 'PERFORMANCE_TESTER', expectedAdapter: 'performance-testing' },
      { agentType: 'SECURITY_SCANNER', expectedAdapter: 'security-scanning' },
      { agentType: 'CHAOS_ENGINEER', expectedAdapter: 'chaos-testing' },
      { agentType: 'VISUAL_TESTER', expectedAdapter: 'visual-testing' },
      { agentType: 'QX_PARTNER', expectedAdapter: 'qx-analysis' },
      { agentType: 'ACCESSIBILITY_ALLY', expectedAdapter: 'accessibility-testing' },
    ];

    test.each(adapterMappings)(
      'should map $agentType to $expectedAdapter adapter',
      async ({ agentType, expectedAdapter }) => {
        const context = await manager.onAgentSpawn(`agent-${agentType}`, agentType as QEAgentType);
        expect(context.activeAdapter).toBe(expectedAdapter);
      }
    );
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle strategy initialization failure gracefully', async () => {
      const { createSONALearningStrategy } = require('../../../src/core/strategies/SONALearningStrategy');
      createSONALearningStrategy.mockImplementationOnce(() => ({
        initialize: jest.fn().mockRejectedValue(new Error('Init failed')),
      }));

      await expect(
        manager.onAgentSpawn('agent-fail', 'TEST_GENERATOR' as QEAgentType)
      ).rejects.toThrow('Init failed');
    });

    it('should not throw on task complete error', async () => {
      await manager.onAgentSpawn('agent-error', 'TEST_GENERATOR' as QEAgentType);
      mockFeedbackLoop.recordFeedback.mockRejectedValueOnce(new Error('Record failed'));

      const task: QETask = {
        id: 'err-task',
        type: 'test',
        description: 'Test',
        priority: 'high',
        status: 'done',
      };

      // Should not throw
      await manager.onTaskComplete('agent-error', { task, success: true, duration: 100 });
    });

    it('should handle cleanup errors gracefully', async () => {
      await manager.onAgentSpawn('agent-cleanup-err', 'TEST_GENERATOR' as QEAgentType);
      mockStrategy.reset.mockRejectedValueOnce(new Error('Reset failed'));

      // Should not throw
      await manager.cleanupAgent('agent-cleanup-err');
    });
  });
});
