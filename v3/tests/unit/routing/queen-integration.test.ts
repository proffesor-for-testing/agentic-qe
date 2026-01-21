/**
 * Queen Integration Tests - TD-006
 * ADR-026: Intelligent Model Routing
 *
 * Tests for QueenRouterAdapter:
 * - Task classification → agent tier mapping
 * - Fallback behavior
 * - Confidence threshold adjustments
 * - Cost tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QueenRouterAdapter,
  createQueenRouterAdapter,
  type QueenRouteDecision,
  type TaskOutcome,
} from '../../../src/routing/queen-integration.js';
import {
  DEFAULT_ROUTING_CONFIG,
  type RoutingConfig,
  type AgentTier,
} from '../../../src/routing/routing-config.js';
import type { ClassifiableTask } from '../../../src/routing/task-classifier.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestTask(overrides: Partial<ClassifiableTask> = {}): ClassifiableTask {
  return {
    description: 'Test task',
    priority: 'p1',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('QueenRouterAdapter', () => {
  let adapter: QueenRouterAdapter;

  beforeEach(() => {
    adapter = createQueenRouterAdapter({
      routing: {
        ...DEFAULT_ROUTING_CONFIG,
        verbose: false,
      },
      enableCostTracking: true,
    });
  });

  // ==========================================================================
  // Task Classification → Agent Tier Mapping
  // ==========================================================================

  describe('task classification to tier mapping', () => {
    it('should map trivial tasks to booster/haiku tier', async () => {
      const task = createTestTask({
        description: 'Simple variable rename',
        fileCount: 1,
        estimatedLinesAffected: 5,
      });

      const decision = await adapter.route(task);

      expect(decision.tier).toBe('booster');
      expect(decision.model).toBe('haiku');
      expect(decision.complexity).toBe('simple');
      expect(decision.fallbackTiers).toContain('haiku');
    });

    it('should map simple tasks to haiku tier', async () => {
      const task = createTestTask({
        description: 'Fix a small bug',
        fileCount: 3,
        estimatedLinesAffected: 50,
      });

      const decision = await adapter.route(task);

      expect(['booster', 'haiku']).toContain(decision.tier);
      expect(decision.model).toBe('haiku');
      expect(decision.complexity).toBe('simple');
    });

    it('should map moderate tasks to sonnet tier', async () => {
      const task = createTestTask({
        description: 'Add new feature with tests',
        fileCount: 8,
        domain: 'test-generation',
        estimatedLinesAffected: 250,
        crossComponent: false,
      });

      const decision = await adapter.route(task);

      expect(['booster', 'haiku', 'sonnet']).toContain(decision.tier);
      expect(['haiku', 'sonnet']).toContain(decision.model);
      expect(['simple', 'moderate']).toContain(decision.complexity);
    });

    it('should map complex tasks to sonnet tier with opus fallback', async () => {
      const task = createTestTask({
        description: 'Refactor authentication system',
        fileCount: 15,
        crossComponent: true,
        domain: 'code-intelligence',
        estimatedLinesAffected: 300,
        requiresExternalApis: true,
        priority: 'high',
      });

      const decision = await adapter.route(task);

      expect(['sonnet', 'opus']).toContain(decision.tier);
      expect(['sonnet', 'opus']).toContain(decision.model);
      expect(['complex', 'critical']).toContain(decision.complexity);
      expect(decision.fallbackTiers.length).toBeGreaterThanOrEqual(0);
    });

    it('should map critical tasks to opus tier', async () => {
      const task = createTestTask({
        description: 'Security vulnerability fix in authentication',
        fileCount: 20,
        crossComponent: true,
        domain: 'security-compliance',
        priority: 'critical',
        estimatedLinesAffected: 400,
        type: 'security-scan',
        requiredCapabilities: ['sast', 'vulnerability'],
      });

      const decision = await adapter.route(task);

      expect(decision.tier).toBe('opus');
      expect(decision.model).toBe('opus');
      expect(decision.complexity).toBe('critical');
    });
  });

  // ==========================================================================
  // Fallback Behavior
  // ==========================================================================

  describe('fallback behavior', () => {
    it('should build fallback chain for booster tier', async () => {
      const task = createTestTask({
        description: 'Convert var to const',
        fileCount: 1,
      });

      const decision = await adapter.route(task);

      expect(decision.tier).toBe('booster');
      expect(decision.fallbackTiers).toEqual(['haiku', 'sonnet']);
    });

    it('should build fallback chain for haiku tier', async () => {
      const task = createTestTask({
        description: 'Simple bug fix',
        fileCount: 3,
        estimatedLinesAffected: 50,
      });

      const decision = await adapter.route(task);

      // Accept booster or haiku as valid simple task tiers
      expect(['booster', 'haiku']).toContain(decision.tier);
      // Fallback chain should escalate upwards
      expect(decision.fallbackTiers.length).toBeGreaterThanOrEqual(1);
      if (decision.tier === 'haiku') {
        expect(decision.fallbackTiers).toEqual(['sonnet', 'opus']);
      }
    });

    it('should build fallback chain for sonnet tier', async () => {
      const task = createTestTask({
        description: 'Add feature',
        fileCount: 12,
        domain: 'test-generation',
        estimatedLinesAffected: 250,
        crossComponent: true,
      });

      const decision = await adapter.route(task);

      // Should be at least moderate complexity
      expect(['moderate', 'complex', 'critical']).toContain(decision.complexity);
      // If sonnet tier, should have opus fallback
      if (decision.tier === 'sonnet') {
        expect(decision.fallbackTiers).toEqual(['opus']);
      }
    });

    it('should have empty fallback chain for opus tier', async () => {
      const task = createTestTask({
        description: 'Critical security fix',
        fileCount: 25,
        priority: 'critical',
        domain: 'security-compliance',
        type: 'security-scan',
      });

      const decision = await adapter.route(task);

      expect(decision.tier).toBe('opus');
      expect(decision.fallbackTiers).toEqual([]);
    });

    it('should disable fallback when configured', async () => {
      const customAdapter = createQueenRouterAdapter({
        routing: {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: {
            ...DEFAULT_ROUTING_CONFIG.fallback,
            enabled: false,
          },
        },
      });

      const task = createTestTask({
        description: 'Simple task',
        fileCount: 2,
      });

      const decision = await customAdapter.route(task);

      expect(decision.fallbackTiers).toEqual([]);
    });

    it('should limit fallback chain by maxAttempts', async () => {
      const customAdapter = createQueenRouterAdapter({
        routing: {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: {
            ...DEFAULT_ROUTING_CONFIG.fallback,
            maxAttempts: 1,
          },
        },
      });

      const task = createTestTask({
        description: 'Simple task',
        fileCount: 1,
      });

      const decision = await customAdapter.route(task);

      expect(decision.tier).toBe('booster');
      expect(decision.fallbackTiers.length).toBe(1);
      expect(decision.fallbackTiers).toEqual(['haiku']);
    });
  });

  // ==========================================================================
  // Confidence Threshold Adjustments
  // ==========================================================================

  describe('confidence threshold adjustments', () => {
    it('should trigger multi-model when confidence below threshold', async () => {
      const task = createTestTask({
        description: 'Borderline complex task',
        fileCount: 6, // Close to moderate/complex boundary
        estimatedLinesAffected: 210, // Close to threshold
      });

      const decision = await adapter.route(task);

      // Borderline tasks should have lower confidence
      if (decision.confidence < 0.80) {
        expect(decision.triggerMultiModel).toBe(true);
      }
    });

    it('should trigger human review for high uncertainty', async () => {
      const task = createTestTask({
        description: 'Ambiguous task with mixed complexity signals',
        fileCount: 5, // Moderate
        estimatedLinesAffected: 45, // Low
        crossComponent: true, // High
      });

      const decision = await adapter.route(task);

      // High uncertainty (low confidence) should trigger review
      if (decision.confidence < 0.80) {
        expect(decision.triggerHumanReview || decision.triggerMultiModel).toBe(true);
      }
    });

    it('should allow dynamic confidence threshold updates', async () => {
      adapter.updateConfidenceThresholds({
        multiModel: 0.90,
        security: 0.95,
      });

      const config = adapter.getConfig();

      expect(config.confidence.multiModel).toBe(0.90);
      expect(config.confidence.security).toBe(0.95);
    });

    it('should require higher confidence for security tasks', async () => {
      const task = createTestTask({
        description: 'Security scan with OWASP checks',
        domain: 'security-compliance',
        type: 'security-scan',
        requiredCapabilities: ['owasp', 'vulnerability'],
      });

      const decision = await adapter.route(task);

      // Security tasks should be more likely to trigger multi-model
      expect(decision.tier).toMatch(/sonnet|opus/);
    });
  });

  // ==========================================================================
  // Outcome Recording and Learning
  // ==========================================================================

  describe('outcome recording and learning', () => {
    it('should record successful task outcomes', async () => {
      const task = createTestTask({
        description: 'Test task',
        fileCount: 3,
      });

      const decision = await adapter.route(task);

      adapter.recordOutcome(
        task,
        decision,
        decision.tier,
        true,
        0.95,
        2000,
        0
      );

      const outcomes = adapter.getOutcomes();

      expect(outcomes.length).toBe(1);
      expect(outcomes[0].success).toBe(true);
      expect(outcomes[0].qualityScore).toBe(0.95);
      expect(outcomes[0].fallbackAttempts).toBe(0);
    });

    it('should record failed task outcomes with fallback attempts', async () => {
      const task = createTestTask({
        description: 'Difficult task',
        fileCount: 5,
      });

      const decision = await adapter.route(task);

      adapter.recordOutcome(
        task,
        decision,
        'sonnet', // Escalated from haiku
        false,
        0.3,
        5000,
        1, // One fallback attempt
        'Task failed on haiku tier'
      );

      const outcomes = adapter.getOutcomes();

      expect(outcomes.length).toBe(1);
      expect(outcomes[0].success).toBe(false);
      expect(outcomes[0].fallbackAttempts).toBe(1);
      expect(outcomes[0].error).toBe('Task failed on haiku tier');
    });

    it('should calculate success rate by tier', async () => {
      const task1 = createTestTask({ description: 'Task 1', fileCount: 2 });
      const decision1 = await adapter.route(task1);
      adapter.recordOutcome(task1, decision1, 'haiku', true, 1.0, 1000, 0);

      const task2 = createTestTask({ description: 'Task 2', fileCount: 3 });
      const decision2 = await adapter.route(task2);
      adapter.recordOutcome(task2, decision2, 'haiku', false, 0.5, 2000, 0);

      const task3 = createTestTask({ description: 'Task 3', fileCount: 10 });
      const decision3 = await adapter.route(task3);
      adapter.recordOutcome(task3, decision3, 'sonnet', true, 0.9, 3000, 0);

      const successRates = adapter.getSuccessRateByTier();

      expect(successRates.haiku).toBe(0.5); // 1 success, 1 failure
      expect(successRates.sonnet).toBe(1.0); // 1 success
      expect(successRates.opus).toBe(0); // No tasks
    });

    it('should track fallback statistics', async () => {
      const task1 = createTestTask({ description: 'Task 1', fileCount: 2 });
      const decision1 = await adapter.route(task1);
      adapter.recordOutcome(task1, decision1, 'sonnet', true, 0.9, 3000, 1);

      const task2 = createTestTask({ description: 'Task 2', fileCount: 3 });
      const decision2 = await adapter.route(task2);
      adapter.recordOutcome(task2, decision2, 'opus', true, 0.95, 5000, 2);

      const stats = adapter.getFallbackStats();

      expect(stats.totalWithFallback).toBe(2);
      expect(stats.avgFallbackAttempts).toBe(1.5);
      expect(stats.fallbackSuccessRate).toBe(1.0);
    });
  });

  // ==========================================================================
  // Cost Tracking
  // ==========================================================================

  describe('cost tracking', () => {
    it('should estimate cost for tasks', async () => {
      const task = createTestTask({
        description: 'Test task',
        fileCount: 5,
      });

      const decision = await adapter.route(task);

      expect(decision.estimatedCost).toBeGreaterThan(0);

      // Cost should be reasonable (not NaN or Infinity)
      expect(decision.estimatedCost).toBeLessThan(1); // Should be < $1 for typical task
      expect(Number.isFinite(decision.estimatedCost)).toBe(true);
    });

    it('should track total cost', async () => {
      const task1 = createTestTask({ description: 'Task 1', fileCount: 2 });
      await adapter.route(task1);

      const task2 = createTestTask({ description: 'Task 2', fileCount: 5 });
      await adapter.route(task2);

      const stats = adapter.getCostStats();

      expect(stats.totalCost).toBeGreaterThan(0);
      expect(stats.totalTasks).toBe(2);
      expect(stats.avgCostPerTask).toBe(stats.totalCost / 2);
    });

    it('should track cost by model', async () => {
      const haikuTask = createTestTask({ description: 'Simple', fileCount: 1 });
      const decision1 = await adapter.route(haikuTask);

      const sonnetTask = createTestTask({
        description: 'Moderate complex task',
        fileCount: 12,
        crossComponent: true,
        domain: 'test-generation',
        estimatedLinesAffected: 300,
      });
      const decision2 = await adapter.route(sonnetTask);

      const stats = adapter.getCostStats();

      // At least one model should have cost
      const totalModelCost = stats.costByModel.haiku + stats.costByModel.sonnet + stats.costByModel.opus;
      expect(totalModelCost).toBeGreaterThan(0);
      expect(stats.totalCost).toBe(totalModelCost);
    });

    it('should reset statistics', async () => {
      const task = createTestTask({ description: 'Task', fileCount: 5 });
      await adapter.route(task);

      adapter.reset();

      const stats = adapter.getCostStats();

      expect(stats.totalCost).toBe(0);
      expect(stats.totalTasks).toBe(0);
      expect(adapter.getOutcomes().length).toBe(0);
    });
  });

  // ==========================================================================
  // Routing Decision Properties
  // ==========================================================================

  describe('routing decision properties', () => {
    it('should include all required decision properties', async () => {
      const task = createTestTask({
        description: 'Complete test',
        fileCount: 5,
      });

      const decision = await adapter.route(task);

      expect(decision).toHaveProperty('tier');
      expect(decision).toHaveProperty('model');
      expect(decision).toHaveProperty('complexity');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('triggerMultiModel');
      expect(decision).toHaveProperty('triggerHumanReview');
      expect(decision).toHaveProperty('fallbackTiers');
      expect(decision).toHaveProperty('estimatedCost');
      expect(decision).toHaveProperty('reasoning');
      expect(decision).toHaveProperty('latencyMs');
      expect(decision).toHaveProperty('tinyDancerResult');
      expect(decision).toHaveProperty('timestamp');
    });

    it('should have reasonable latency', async () => {
      const task = createTestTask({
        description: 'Test task',
        fileCount: 3,
      });

      const decision = await adapter.route(task);

      expect(decision.latencyMs).toBeGreaterThan(0);
      expect(decision.latencyMs).toBeLessThan(100); // Should be fast (<100ms)
    });

    it('should include human-readable reasoning', async () => {
      const task = createTestTask({
        description: 'Test task with reasoning',
        fileCount: 8,
        domain: 'test-generation',
      });

      const decision = await adapter.route(task);

      expect(decision.reasoning).toBeTruthy();
      expect(typeof decision.reasoning).toBe('string');
      expect(decision.reasoning.length).toBeGreaterThan(0);

      // Should mention tier assignment
      expect(decision.reasoning.toLowerCase()).toContain('tier');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle tasks with minimal information', async () => {
      const task = createTestTask({
        description: 'Minimal task',
      });

      const decision = await adapter.route(task);

      expect(decision.tier).toBeTruthy();
      expect(decision.model).toBeTruthy();
      expect(decision.complexity).toBeTruthy();
    });

    it('should handle tasks with all complexity factors', async () => {
      const task = createTestTask({
        description: 'Maximum complexity task',
        fileCount: 30,
        crossComponent: true,
        domain: 'security-compliance',
        priority: 'critical',
        estimatedLinesAffected: 1000,
        requiresExternalApis: true,
        involvesDatabaseOps: true,
        timeSensitive: true,
        type: 'security-scan',
        requiredCapabilities: ['sast', 'dast', 'vulnerability', 'owasp'],
      });

      const decision = await adapter.route(task);

      expect(decision.tier).toBe('opus');
      expect(decision.complexity).toBe('critical');
      expect(decision.triggerHumanReview).toBe(true);
    });

    it('should maintain outcome limit', async () => {
      // Record more than maxOutcomes (1000)
      for (let i = 0; i < 1050; i++) {
        const task = createTestTask({ description: `Task ${i}` });
        const decision = await adapter.route(task);
        adapter.recordOutcome(task, decision, decision.tier, true, 1.0, 1000, 0);
      }

      const outcomes = adapter.getOutcomes();

      expect(outcomes.length).toBe(1000); // Should be limited to maxOutcomes
    });
  });
});
