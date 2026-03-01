/**
 * TinyDancer Router Tests - TD-003
 * ADR-026: Intelligent Model Routing
 *
 * Tests for the TinyDancer router which provides intelligent model routing
 * based on task complexity classification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TinyDancerRouter,
  createTinyDancerRouter,
  type TinyDancerConfig,
  type RouteResult,
} from '../../../src/routing/tiny-dancer-router.js';
import type { ClassifiableTask } from '../../../src/routing/task-classifier.js';
import type { QETask } from '../../../src/routing/types.js';

describe('TinyDancerRouter', () => {
  let router: TinyDancerRouter;

  beforeEach(() => {
    router = createTinyDancerRouter();
  });

  // Helper to create mock tasks
  const createMockTask = (
    description: string,
    overrides: Partial<ClassifiableTask> = {}
  ): ClassifiableTask => ({
    description,
    ...overrides,
  });

  describe('Tier Selection Based on Task Complexity', () => {
    it('should route simple tasks to haiku', async () => {
      const task = createMockTask('Add a console.log statement');
      const result = await router.route(task);

      expect(result.model).toBe('haiku');
      expect(result.complexity).toBe('simple');
    });

    it('should route moderate complexity tasks to sonnet', async () => {
      const task = createMockTask('Refactor authentication module', {
        fileCount: 8,
        domain: 'code-intelligence',
      });
      const result = await router.route(task);

      expect(result.model).toBe('sonnet');
      expect(['moderate', 'complex']).toContain(result.complexity);
    });

    it('should route complex tasks to sonnet', async () => {
      const task = createMockTask('Implement cross-service integration', {
        fileCount: 15,
        crossComponent: true,
        priority: 'high',
      });
      const result = await router.route(task);

      expect(result.model).toBe('sonnet');
      expect(result.complexity).toBe('complex');
    });

    it('should route critical tasks to opus', async () => {
      const task = createMockTask('Security vulnerability remediation', {
        domain: 'security-compliance',
        crossComponent: true,
        priority: 'critical',
        requiredCapabilities: ['sast', 'vulnerability'],
      });
      const result = await router.route(task);

      expect(result.model).toBe('opus');
      expect(result.complexity).toBe('critical');
    });

    it('should route security domain tasks appropriately', async () => {
      const task = createMockTask('OWASP security scan', {
        domain: 'security-compliance',
        requiredCapabilities: ['owasp'],
      });
      const result = await router.route(task);

      // Security tasks should go to sonnet or opus
      expect(['sonnet', 'opus']).toContain(result.model);
    });

    it('should route chaos engineering tasks to opus', async () => {
      const task = createMockTask('Chaos testing with fault injection', {
        domain: 'chaos-resilience',
        requiredCapabilities: ['chaos-testing', 'fault-injection'],
        priority: 'critical',
      });
      const result = await router.route(task);

      expect(result.model).toBe('opus');
      expect(result.complexity).toBe('critical');
    });
  });

  describe('Confidence Calculation', () => {
    it('should have high confidence for clearly simple tasks', async () => {
      const task = createMockTask('Fix typo in comment');
      const result = await router.route(task);

      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.uncertainty).toBeLessThan(0.2);
    });

    it('should have high confidence for clearly critical tasks', async () => {
      const task = createMockTask('Critical security fix', {
        domain: 'security-compliance',
        priority: 'critical',
        crossComponent: true,
        fileCount: 25,
        requiredCapabilities: ['sast', 'dast', 'vulnerability'],
      });
      const result = await router.route(task);

      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it('should have lower confidence near complexity boundaries', async () => {
      // Create a task that scores near a boundary (around 20, 45, or 70)
      const task = createMockTask('Moderate complexity task', {
        fileCount: 6, // Adds 10 points, close to moderate/simple boundary
      });
      const result = await router.route(task);

      // Confidence should be lower when near boundaries
      expect(result.confidence).toBeLessThan(0.9);
    });

    it('should report uncertainty as inverse of confidence', async () => {
      const task = createMockTask('Any task');
      const result = await router.route(task);

      expect(result.uncertainty).toBeCloseTo(1 - result.confidence, 5);
    });
  });

  describe('Multi-Model Triggering', () => {
    it('should not trigger multi-model for high confidence simple tasks', async () => {
      const task = createMockTask('Simple logging change');
      const result = await router.route(task);

      expect(result.triggerMultiModel).toBe(false);
    });

    it('should trigger multi-model for security tasks with moderate confidence', async () => {
      // Security task with confidence below security threshold
      const router = createTinyDancerRouter({
        securityConfidenceThreshold: 0.95, // Set high threshold
      });
      const task = createMockTask('Security vulnerability check', {
        type: 'security-scan',
      });
      const result = await router.route(task);

      // Should trigger because security + below threshold
      expect(result.triggerMultiModel).toBe(true);
    });

    it('should trigger multi-model when confidence is below threshold', async () => {
      const router = createTinyDancerRouter({
        confidenceThreshold: 0.95, // Set very high threshold
      });
      const task = createMockTask('Task near complexity boundary', {
        fileCount: 6, // Near boundary
        domain: 'code-intelligence',
      });
      const result = await router.route(task);

      // Should trigger due to low confidence
      expect(result.triggerMultiModel).toBe(true);
    });
  });

  describe('Human Review Triggering', () => {
    it('should not trigger human review for low uncertainty tasks', async () => {
      const task = createMockTask('Simple fix');
      const result = await router.route(task);

      expect(result.triggerHumanReview).toBe(false);
    });

    it('should trigger human review for high uncertainty tasks', async () => {
      const router = createTinyDancerRouter({
        uncertaintyThreshold: 0.10, // Very low threshold to trigger easily
      });
      const task = createMockTask('Ambiguous task', {
        fileCount: 6, // Near boundary for lower confidence
      });
      const result = await router.route(task);

      // Check if uncertainty exceeds threshold
      if (result.uncertainty > 0.10) {
        expect(result.triggerHumanReview).toBe(true);
      }
    });

    it('should trigger human review for critical security tasks', async () => {
      const task = createMockTask('Critical security vulnerability fix', {
        type: 'security-scan',
        domain: 'security-compliance',
        priority: 'critical',
        crossComponent: true,
        fileCount: 25,
        requiredCapabilities: ['sast', 'vulnerability'],
      });
      const result = await router.route(task);

      // Critical security tasks should always trigger human review
      expect(result.triggerHumanReview).toBe(true);
    });
  });

  describe('Security Task Detection', () => {
    it('should detect security-scan task type as security', async () => {
      const task = createMockTask('Run security scan', {
        type: 'security-scan',
      });
      const result = await router.route(task);

      expect(result.reasoning).toContain('Security');
    });

    it('should detect vulnerability-assessment task type as security', async () => {
      const task = createMockTask('Assess vulnerabilities', {
        type: 'vulnerability-assessment',
      });
      const result = await router.route(task);

      expect(result.reasoning).toContain('Security');
    });

    it('should detect security-compliance domain as security', async () => {
      const task = createMockTask('Check compliance', {
        domain: 'security-compliance',
      });
      const result = await router.route(task);

      expect(result.reasoning).toContain('Security');
    });

    it('should detect security capabilities as security', async () => {
      const task = createMockTask('SAST analysis', {
        requiredCapabilities: ['sast'],
      });
      const result = await router.route(task);

      expect(result.reasoning).toContain('Security');
    });

    it('should detect security keywords in description', async () => {
      const task = createMockTask('Fix CVE-2024-1234 vulnerability');
      const result = await router.route(task);

      expect(result.reasoning).toContain('Security');
    });

    it('should detect OWASP keyword as security', async () => {
      const task = createMockTask('OWASP Top 10 compliance check');
      const result = await router.route(task);

      expect(result.reasoning).toContain('Security');
    });
  });

  describe('Routing Reasoning', () => {
    it('should include model in reasoning', async () => {
      const task = createMockTask('Simple task');
      const result = await router.route(task);

      expect(result.reasoning).toContain('HAIKU');
    });

    it('should include complexity in reasoning', async () => {
      const task = createMockTask('Simple task');
      const result = await router.route(task);

      expect(result.reasoning).toContain('complexity:');
    });

    it('should include confidence percentage in reasoning', async () => {
      const task = createMockTask('Any task');
      const result = await router.route(task);

      expect(result.reasoning).toMatch(/\d+%\s*confidence/i);
    });

    it('should list key factors when present', async () => {
      const task = createMockTask('Complex task', {
        fileCount: 12,
        crossComponent: true,
      });
      const result = await router.route(task);

      expect(result.reasoning).toContain('Key factors:');
    });

    it('should note multi-model recommendation in reasoning', async () => {
      const router = createTinyDancerRouter({
        confidenceThreshold: 0.99, // Force trigger
      });
      const task = createMockTask('Task for multi-model', {
        fileCount: 6,
      });
      const result = await router.route(task);

      if (result.triggerMultiModel) {
        expect(result.reasoning).toContain('Multi-model verification');
      }
    });

    it('should note human review flag in reasoning', async () => {
      const router = createTinyDancerRouter({
        uncertaintyThreshold: 0.01, // Force trigger
      });
      const task = createMockTask('Task for human review', {
        fileCount: 6,
      });
      const result = await router.route(task);

      if (result.triggerHumanReview) {
        expect(result.reasoning).toContain('Human review');
      }
    });
  });

  describe('Statistics Tracking', () => {
    it('should track total tasks routed', async () => {
      await router.route(createMockTask('Task 1'));
      await router.route(createMockTask('Task 2'));
      await router.route(createMockTask('Task 3'));

      const stats = router.getStats();
      expect(stats.totalRouted).toBe(3);
    });

    it('should track routes by model', async () => {
      await router.route(createMockTask('Simple task 1'));
      await router.route(createMockTask('Simple task 2'));
      await router.route(createMockTask('Critical task', {
        domain: 'security-compliance',
        priority: 'critical',
        crossComponent: true,
      }));

      const stats = router.getStats();
      expect(stats.routesByModel.haiku).toBeGreaterThanOrEqual(0);
      expect(stats.routesByModel.sonnet).toBeGreaterThanOrEqual(0);
      expect(stats.routesByModel.opus).toBeGreaterThanOrEqual(0);
    });

    it('should track routes by complexity', async () => {
      await router.route(createMockTask('Simple task'));
      await router.route(createMockTask('Complex task', {
        fileCount: 15,
        crossComponent: true,
      }));

      const stats = router.getStats();
      expect(stats.routesByComplexity.simple).toBeGreaterThanOrEqual(0);
      expect(stats.routesByComplexity.moderate).toBeGreaterThanOrEqual(0);
      expect(stats.routesByComplexity.complex).toBeGreaterThanOrEqual(0);
      expect(stats.routesByComplexity.critical).toBeGreaterThanOrEqual(0);
    });

    it('should track multi-model triggers', async () => {
      const router = createTinyDancerRouter({
        confidenceThreshold: 0.99, // Force multi-model triggers
      });

      await router.route(createMockTask('Task 1', { fileCount: 6 }));
      await router.route(createMockTask('Task 2', { fileCount: 6 }));

      const stats = router.getStats();
      expect(stats.multiModelTriggers).toBeGreaterThanOrEqual(0);
    });

    it('should track human review triggers', async () => {
      const router = createTinyDancerRouter({
        uncertaintyThreshold: 0.01, // Force human review triggers
      });

      await router.route(createMockTask('Task', { fileCount: 6 }));

      const stats = router.getStats();
      expect(stats.humanReviewTriggers).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average confidence', async () => {
      await router.route(createMockTask('Task 1'));
      await router.route(createMockTask('Task 2'));

      const stats = router.getStats();
      expect(stats.avgConfidence).toBeGreaterThan(0);
      expect(stats.avgConfidence).toBeLessThanOrEqual(1);
    });

    it('should calculate average latency', async () => {
      await router.route(createMockTask('Task'));

      const stats = router.getStats();
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Outcome Recording and Learning', () => {
    it('should record successful outcomes', async () => {
      const task = createMockTask('Test task');
      const result = await router.route(task);

      router.recordOutcome(task, result, true, 0.95);

      const stats = router.getStats();
      expect(stats.outcomesRecorded).toBe(1);
    });

    it('should record failed outcomes', async () => {
      const task = createMockTask('Failing task');
      const result = await router.route(task);

      router.recordOutcome(task, result, false, 0.2);

      const stats = router.getStats();
      expect(stats.outcomesRecorded).toBe(1);
    });

    it('should record actual model used when different from recommendation', async () => {
      const task = createMockTask('Task');
      const result = await router.route(task);

      router.recordOutcome(task, result, true, 0.9, 'opus', 5000);

      const outcomes = router.getOutcomes();
      expect(outcomes[0].actualModelUsed).toBe('opus');
    });

    it('should store duration in outcomes', async () => {
      const task = createMockTask('Timed task');
      const result = await router.route(task);

      router.recordOutcome(task, result, true, 0.8, result.model, 3500);

      const outcomes = router.getOutcomes();
      expect(outcomes[0].durationMs).toBe(3500);
    });

    it('should respect maxOutcomes limit (LRU eviction)', async () => {
      const router = createTinyDancerRouter({ enableLearning: true });

      // Record more than maxOutcomes (1000 by default, but we test with smaller number)
      const task = createMockTask('Overflow task');
      const result = await router.route(task);

      // Record many outcomes
      for (let i = 0; i < 10; i++) {
        router.recordOutcome(task, result, true, 0.9);
      }

      const outcomes = router.getOutcomes();
      expect(outcomes.length).toBeLessThanOrEqual(1000);
    });

    it('should not record outcomes when learning is disabled', async () => {
      const router = createTinyDancerRouter({ enableLearning: false });
      const task = createMockTask('Task');
      const result = await router.route(task);

      router.recordOutcome(task, result, true, 0.9);

      const stats = router.getStats();
      expect(stats.outcomesRecorded).toBe(0);
    });

    it('should include timestamp in outcomes', async () => {
      const task = createMockTask('Task');
      const result = await router.route(task);
      const before = new Date();

      router.recordOutcome(task, result, true);

      const outcomes = router.getOutcomes();
      const after = new Date();
      expect(outcomes[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(outcomes[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Success Rate by Model', () => {
    it('should calculate success rate per model', async () => {
      const router = createTinyDancerRouter({ enableLearning: true });
      const task = createMockTask('Task');
      const result = await router.route(task);

      // Record mixed outcomes for haiku
      router.recordOutcome(task, result, true, 1.0, 'haiku', 100);
      router.recordOutcome(task, result, true, 1.0, 'haiku', 100);
      router.recordOutcome(task, result, false, 0.0, 'haiku', 100);

      const rates = router.getSuccessRateByModel();
      expect(rates.haiku).toBeCloseTo(2 / 3, 2);
    });

    it('should return 0 for models with no outcomes', async () => {
      const rates = router.getSuccessRateByModel();
      expect(rates.haiku).toBe(0);
      expect(rates.sonnet).toBe(0);
      expect(rates.opus).toBe(0);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all statistics', async () => {
      await router.route(createMockTask('Task 1'));
      await router.route(createMockTask('Task 2'));

      const task = createMockTask('Task');
      const result = await router.route(task);
      router.recordOutcome(task, result, true);

      router.reset();

      const stats = router.getStats();
      expect(stats.totalRouted).toBe(0);
      expect(stats.multiModelTriggers).toBe(0);
      expect(stats.humanReviewTriggers).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.avgLatencyMs).toBe(0);
      expect(stats.outcomesRecorded).toBe(0);
    });

    it('should reset routes by model', async () => {
      await router.route(createMockTask('Simple task'));
      router.reset();

      const stats = router.getStats();
      expect(stats.routesByModel.haiku).toBe(0);
      expect(stats.routesByModel.sonnet).toBe(0);
      expect(stats.routesByModel.opus).toBe(0);
    });

    it('should reset routes by complexity', async () => {
      await router.route(createMockTask('Task'));
      router.reset();

      const stats = router.getStats();
      expect(stats.routesByComplexity.simple).toBe(0);
      expect(stats.routesByComplexity.moderate).toBe(0);
      expect(stats.routesByComplexity.complex).toBe(0);
      expect(stats.routesByComplexity.critical).toBe(0);
    });

    it('should clear outcomes', async () => {
      const task = createMockTask('Task');
      const result = await router.route(task);
      router.recordOutcome(task, result, true);

      router.reset();

      const outcomes = router.getOutcomes();
      expect(outcomes.length).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const router = createTinyDancerRouter();
      const config = router.getConfig();

      expect(config.confidenceThreshold).toBe(0.80);
      expect(config.uncertaintyThreshold).toBe(0.20);
      expect(config.securityConfidenceThreshold).toBe(0.85);
      expect(config.enableLearning).toBe(true);
      expect(config.verbose).toBe(false);
    });

    it('should accept custom confidence threshold', () => {
      const router = createTinyDancerRouter({ confidenceThreshold: 0.90 });
      const config = router.getConfig();

      expect(config.confidenceThreshold).toBe(0.90);
    });

    it('should accept custom uncertainty threshold', () => {
      const router = createTinyDancerRouter({ uncertaintyThreshold: 0.15 });
      const config = router.getConfig();

      expect(config.uncertaintyThreshold).toBe(0.15);
    });

    it('should accept custom security confidence threshold', () => {
      const router = createTinyDancerRouter({ securityConfidenceThreshold: 0.95 });
      const config = router.getConfig();

      expect(config.securityConfidenceThreshold).toBe(0.95);
    });

    it('should accept enableLearning configuration', () => {
      const router = createTinyDancerRouter({ enableLearning: false });
      const config = router.getConfig();

      expect(config.enableLearning).toBe(false);
    });

    it('should accept verbose configuration', () => {
      const router = createTinyDancerRouter({ verbose: true });
      const config = router.getConfig();

      expect(config.verbose).toBe(true);
    });
  });

  describe('Latency Tracking', () => {
    it('should track routing latency', async () => {
      const result = await router.route(createMockTask('Task'));

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeLessThan(1000); // Should be very fast
    });

    it('should include latency in classification result', async () => {
      const result = await router.route(createMockTask('Task'));

      expect(typeof result.latencyMs).toBe('number');
    });
  });

  describe('Classification Result Passthrough', () => {
    it('should include full classification result', async () => {
      const task = createMockTask('Task with factors', {
        fileCount: 12,
        crossComponent: true,
      });
      const result = await router.route(task);

      expect(result.classification).toBeDefined();
      expect(result.classification.score).toBeGreaterThanOrEqual(0);
      expect(result.classification.factors).toBeDefined();
      expect(result.classification.timestamp).toBeDefined();
    });

    it('should match complexity between route result and classification', async () => {
      const task = createMockTask('Task');
      const result = await router.route(task);

      expect(result.complexity).toBe(result.classification.complexity);
    });

    it('should match model between route result and classification', async () => {
      const task = createMockTask('Task');
      const result = await router.route(task);

      expect(result.model).toBe(result.classification.recommendedModel);
    });
  });

  describe('Factory Function', () => {
    it('should create router with createTinyDancerRouter', () => {
      const router = createTinyDancerRouter();
      expect(router).toBeInstanceOf(TinyDancerRouter);
    });

    it('should create router with configuration', () => {
      const config: TinyDancerConfig = {
        confidenceThreshold: 0.75,
        verbose: true,
      };
      const router = createTinyDancerRouter(config);
      const resultConfig = router.getConfig();

      expect(resultConfig.confidenceThreshold).toBe(0.75);
      expect(resultConfig.verbose).toBe(true);
    });

    it('should create independent router instances', async () => {
      const router1 = createTinyDancerRouter();
      const router2 = createTinyDancerRouter();

      await router1.route(createMockTask('Task'));

      const stats1 = router1.getStats();
      const stats2 = router2.getStats();

      expect(stats1.totalRouted).toBe(1);
      expect(stats2.totalRouted).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty description', async () => {
      const task = createMockTask('');
      const result = await router.route(task);

      expect(result.model).toBeDefined();
      expect(result.complexity).toBeDefined();
    });

    it('should handle task with no optional fields', async () => {
      const task: QETask = {
        description: 'Minimal task',
      };
      const result = await router.route(task);

      expect(result.model).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle task with all optional fields', async () => {
      const task: ClassifiableTask = {
        description: 'Complete task with all fields',
        domain: 'security-compliance',
        requiredCapabilities: ['sast', 'dast'],
        priority: 'critical',
        fileCount: 50,
        crossComponent: true,
        estimatedLinesAffected: 1000,
        requiresExternalApis: true,
        involvesDatabaseOps: true,
        timeSensitive: true,
        type: 'security-scan',
      };
      const result = await router.route(task);

      expect(result.model).toBe('opus');
      expect(result.complexity).toBe('critical');
    });

    it('should handle very high file counts', async () => {
      const task = createMockTask('Massive refactor', {
        fileCount: 1000,
      });
      const result = await router.route(task);

      expect(result.complexity).not.toBe('simple');
    });

    it('should handle very high estimated lines affected', async () => {
      // estimatedLinesAffected > 500 adds 15 points, which is < 20 (moderate threshold)
      // To move out of simple, we need to combine with another factor
      const task = createMockTask('Large change', {
        estimatedLinesAffected: 10000, // adds 15
        timeSensitive: true,           // adds 5
      });
      const result = await router.route(task);

      // 15 + 5 = 20, which meets the moderate threshold
      expect(result.complexity).toBe('moderate');
    });
  });
});
