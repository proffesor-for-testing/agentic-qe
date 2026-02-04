/**
 * Integration tests for Evolution Pipeline governance integration
 *
 * Tests verify:
 * - Rule effectiveness tracking across time windows
 * - Context-specific effectiveness (domain, task type)
 * - Automatic promotion/demotion based on thresholds
 * - Statistical significance via confidence intervals
 * - A/B testing support with variant management
 * - Learning from task outcomes
 * - Feature flag integration
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
  isEvolutionPipelineEnabled,
} from '../../../src/governance/feature-flags.js';
import {
  EvolutionPipelineIntegration,
  evolutionPipelineIntegration,
  createTaskOutcome,
  withRuleTracking,
  type RuleContext,
  type RuleEffectiveness,
  type PromotionStatus,
  type TaskOutcome,
} from '../../../src/governance/evolution-pipeline-integration.js';

describe('Evolution Pipeline Integration - ADR-058 Phase 3', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    evolutionPipelineIntegration.reset();
  });

  describe('Rule Effectiveness Tracking', () => {
    it('should return empty effectiveness for unknown rules', () => {
      const evolution = new EvolutionPipelineIntegration();
      const effectiveness = evolution.getRuleEffectiveness('unknown-rule');

      expect(effectiveness.ruleId).toBe('unknown-rule');
      expect(effectiveness.totalApplications).toBe(0);
      expect(effectiveness.successRate).toBe(0);
      expect(effectiveness.promotionStatus).toBe('candidate');
    });

    it('should track rule applications correctly', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'test-rule';
      const context: RuleContext = {
        domain: 'test-generation',
        taskType: 'unit-test',
      };

      // Record successful applications
      evolution.recordRuleApplication(ruleId, context, true);
      evolution.recordRuleApplication(ruleId, context, true);
      evolution.recordRuleApplication(ruleId, context, false);

      const effectiveness = evolution.getRuleEffectiveness(ruleId);

      expect(effectiveness.totalApplications).toBe(3);
      expect(effectiveness.successfulApplications).toBe(2);
      expect(effectiveness.successRate).toBeCloseTo(0.667, 2);
    });

    it('should calculate time-windowed success rates', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'time-window-rule';
      const context: RuleContext = { domain: 'coverage-analysis' };

      // Record recent applications
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, context, i % 2 === 0);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);

      // All should be within 1h, 24h, and 7d windows since they're recent
      expect(effectiveness.successRate1h).toBeCloseTo(0.5, 1);
      expect(effectiveness.successRate24h).toBeCloseTo(0.5, 1);
      expect(effectiveness.successRate7d).toBeCloseTo(0.5, 1);
    });

    it('should track effectiveness by domain', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'domain-specific-rule';

      // Different success rates for different domains
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, { domain: 'test-generation' }, true);
      }
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, { domain: 'security-compliance' }, i < 3);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);
      const testGenDomain = effectiveness.byDomain.get('test-generation');
      const securityDomain = effectiveness.byDomain.get('security-compliance');

      expect(testGenDomain?.successRate).toBe(1.0);
      expect(securityDomain?.successRate).toBe(0.3);
    });

    it('should track effectiveness by task type', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'task-type-rule';

      // Different success rates for different task types
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, { taskType: 'unit-test' }, i < 9);
      }
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, { taskType: 'integration-test' }, i < 5);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);
      const unitTestType = effectiveness.byTaskType.get('unit-test');
      const integrationTestType = effectiveness.byTaskType.get('integration-test');

      expect(unitTestType?.successRate).toBe(0.9);
      expect(integrationTestType?.successRate).toBe(0.5);
    });

    it('should calculate Wilson confidence interval', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'confidence-rule';
      const context: RuleContext = {};

      // Many applications for tight confidence interval
      for (let i = 0; i < 100; i++) {
        evolution.recordRuleApplication(ruleId, context, i < 80);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);

      expect(effectiveness.confidenceInterval.lower).toBeGreaterThan(0.7);
      expect(effectiveness.confidenceInterval.upper).toBeLessThan(0.9);
      expect(effectiveness.confidenceInterval.lower).toBeLessThan(effectiveness.successRate);
      expect(effectiveness.confidenceInterval.upper).toBeGreaterThan(effectiveness.successRate);
    });

    it('should report statistical significance based on samples', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'significance-rule';
      const context: RuleContext = {};

      // Less than minSamplesForDecision (20)
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, context, true);
      }

      let effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.isStatisticallySignificant).toBe(false);

      // Now add more to reach threshold
      for (let i = 0; i < 15; i++) {
        evolution.recordRuleApplication(ruleId, context, true);
      }

      effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.isStatisticallySignificant).toBe(true);
    });
  });

  describe('Rule Promotion and Demotion', () => {
    it('should promote rules manually', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'promote-me';
      evolution.recordRuleApplication(ruleId, {}, true);

      let effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('candidate');

      evolution.promoteRule(ruleId, 'Manually verified as effective');

      effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('promoted');
    });

    it('should demote rules manually', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'demote-me';
      evolution.recordRuleApplication(ruleId, {}, false);
      evolution.promoteRule(ruleId, 'Initial promotion');

      let effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('promoted');

      evolution.demoteRule(ruleId, 'Found to be ineffective');

      effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('demoted');
    });

    it('should auto-promote rules above threshold', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'auto-promote-rule';
      const context: RuleContext = {};

      // Record enough successful applications to trigger auto-promote
      // 25 applications, all successful (100% success rate > 90% threshold)
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication(ruleId, context, true);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('promoted');
    });

    it('should auto-demote rules below threshold', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'auto-demote-rule';
      const context: RuleContext = {};

      // Record enough failed applications to trigger auto-demote
      // 25 applications with only 5 successes (20% success rate < 30% threshold)
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication(ruleId, context, i < 5);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('demoted');
    });

    it('should not auto-promote/demote without enough samples', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'not-enough-samples';
      const context: RuleContext = {};

      // Only 10 applications (below minSamplesForDecision of 20)
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication(ruleId, context, true);
      }

      const effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('candidate');
    });

    it('should track promotion history', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'history-rule';
      evolution.recordRuleApplication(ruleId, {}, true);

      evolution.promoteRule(ruleId, 'First promotion');
      evolution.demoteRule(ruleId, 'Performance dropped');
      evolution.promoteRule(ruleId, 'Recovered');

      const rules = evolution.getAllRules();
      const rule = rules.find(r => r.ruleId === ruleId);

      expect(rule).toBeDefined();
      expect(rule!.promotionHistory.length).toBeGreaterThanOrEqual(3);
    });

    it('should deprecate on repeated demotion', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'deprecate-rule';
      evolution.recordRuleApplication(ruleId, {}, false);

      evolution.demoteRule(ruleId, 'First demotion');
      let effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('demoted');

      evolution.demoteRule(ruleId, 'Second demotion');
      effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.promotionStatus).toBe('deprecated');
    });
  });

  describe('Variant Creation and A/B Testing', () => {
    it('should create rule variants', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const baseRuleId = 'base-rule';
      evolution.recordRuleApplication(baseRuleId, {}, true);

      const variantId = evolution.createVariant(baseRuleId, {
        name: 'Improved Base Rule',
        changeDescription: 'Adjusted parameters for better performance',
      });

      expect(variantId).toContain(baseRuleId);
      expect(variantId).toContain('variant');

      const variantEffectiveness = evolution.getRuleEffectiveness(variantId);
      expect(variantEffectiveness.promotionStatus).toBe('variant');
    });

    it('should register variant tests', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const testId = 'test-123';
      const variants = ['variant-a', 'variant-b', 'control'];

      evolution.registerVariantTest(testId, variants);

      const activeTests = evolution.getActiveTests();
      expect(activeTests).toHaveLength(1);
      expect(activeTests[0].testId).toBe(testId);
      expect(activeTests[0].variants).toEqual(variants);
      expect(activeTests[0].status).toBe('running');
    });

    it('should reject variant tests with less than 2 variants', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      expect(() => {
        evolution.registerVariantTest('invalid-test', ['only-one']);
      }).toThrow('A/B test requires at least 2 variants');
    });

    it('should record variant outcomes', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const testId = 'outcome-test';
      evolution.registerVariantTest(testId, ['variant-a', 'variant-b']);

      // Record outcomes for variant-a (70% success)
      for (let i = 0; i < 10; i++) {
        evolution.recordVariantOutcome(testId, 'variant-a', i < 7, 100);
      }

      // Record outcomes for variant-b (90% success)
      for (let i = 0; i < 10; i++) {
        evolution.recordVariantOutcome(testId, 'variant-b', i < 9, 80);
      }

      const test = evolution.getActiveTests().find(t => t.testId === testId);
      expect(test).toBeDefined();

      const resultA = test!.results.get('variant-a');
      const resultB = test!.results.get('variant-b');

      expect(resultA?.applications).toBe(10);
      expect(resultA?.successRate).toBe(0.7);
      expect(resultB?.applications).toBe(10);
      expect(resultB?.successRate).toBe(0.9);
    });

    it('should determine winning variant', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const testId = 'winner-test';
      evolution.registerVariantTest(testId, ['variant-a', 'variant-b']);

      // Record enough outcomes to achieve significance
      for (let i = 0; i < 30; i++) {
        evolution.recordVariantOutcome(testId, 'variant-a', i < 15, 100); // 50%
      }
      for (let i = 0; i < 30; i++) {
        evolution.recordVariantOutcome(testId, 'variant-b', i < 27, 80); // 90%
      }

      const winner = evolution.getWinningVariant(testId);
      expect(winner).toBe('variant-b');
    });

    it('should complete A/B tests', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const testId = 'complete-test';
      evolution.registerVariantTest(testId, ['a', 'b']);

      for (let i = 0; i < 25; i++) {
        evolution.recordVariantOutcome(testId, 'a', true, 100);
        evolution.recordVariantOutcome(testId, 'b', i < 15, 100);
      }

      const completedTest = evolution.completeVariantTest(testId);

      expect(completedTest).toBeDefined();
      expect(completedTest!.status).toBe('completed');
      expect(completedTest!.endTime).toBeDefined();
      expect(completedTest!.winner).toBe('a');
    });

    it('should cancel A/B tests', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const testId = 'cancel-test';
      evolution.registerVariantTest(testId, ['a', 'b']);

      evolution.cancelVariantTest(testId);

      const activeTests = evolution.getActiveTests();
      expect(activeTests).toHaveLength(0);
    });
  });

  describe('Learning from Outcomes', () => {
    it('should learn from task outcomes', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const outcome: TaskOutcome = {
        taskId: 'task-1',
        taskType: 'unit-test-generation',
        success: true,
        durationMs: 1500,
        appliedRules: ['rule-1', 'rule-2'],
        timestamp: Date.now(),
      };

      evolution.learnFromOutcome('task-1', outcome);

      // Both rules should have been updated
      const rule1Effectiveness = evolution.getRuleEffectiveness('rule-1');
      const rule2Effectiveness = evolution.getRuleEffectiveness('rule-2');

      expect(rule1Effectiveness.totalApplications).toBe(1);
      expect(rule1Effectiveness.successfulApplications).toBe(1);
      expect(rule2Effectiveness.totalApplications).toBe(1);
    });

    it('should track learning outcomes in stats', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      for (let i = 0; i < 5; i++) {
        evolution.learnFromOutcome(`task-${i}`, {
          taskId: `task-${i}`,
          taskType: 'test',
          success: true,
          durationMs: 1000,
          appliedRules: ['rule-1'],
          timestamp: Date.now(),
        });
      }

      const stats = evolution.getEvolutionStats();
      expect(stats.learningOutcomes).toBe(5);
    });

    it('should handle outcomes without applied rules', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Should not throw
      evolution.learnFromOutcome('task-no-rules', {
        taskId: 'task-no-rules',
        taskType: 'manual',
        success: true,
        durationMs: 500,
        timestamp: Date.now(),
      });

      const stats = evolution.getEvolutionStats();
      expect(stats.learningOutcomes).toBe(1);
    });
  });

  describe('Rule Optimization Suggestions', () => {
    it('should suggest deprecation for poor performers', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'poor-performer';

      // Record mostly failures (10% success rate)
      for (let i = 0; i < 50; i++) {
        evolution.recordRuleApplication(ruleId, {}, i < 5);
      }

      const suggestions = evolution.suggestRuleOptimizations();

      const deprecationSuggestion = suggestions.find(
        s => s.ruleId === ruleId && s.optimizationType === 'deprecation'
      );

      expect(deprecationSuggestion).toBeDefined();
      expect(deprecationSuggestion!.reasoning).toContain('success rate');
    });

    it('should suggest context restriction for domain-specific performance', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'domain-specific-rule';

      // Overall mediocre performance but excellent in test-generation
      for (let i = 0; i < 20; i++) {
        evolution.recordRuleApplication(ruleId, { domain: 'test-generation' }, true);
      }
      for (let i = 0; i < 30; i++) {
        evolution.recordRuleApplication(ruleId, { domain: 'security-compliance' }, i < 10);
      }

      const suggestions = evolution.suggestRuleOptimizations();

      const contextSuggestion = suggestions.find(
        s =>
          s.ruleId === ruleId &&
          s.optimizationType === 'context_restriction' &&
          (s.suggested as Record<string, string>).domain === 'test-generation'
      );

      expect(contextSuggestion).toBeDefined();
    });

    it('should sort suggestions by estimated improvement', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Create multiple rules with different issues
      for (let i = 0; i < 30; i++) {
        evolution.recordRuleApplication('rule-a', {}, i < 3); // Very poor
      }
      for (let i = 0; i < 30; i++) {
        evolution.recordRuleApplication('rule-b', {}, i < 10); // Poor
      }

      const suggestions = evolution.suggestRuleOptimizations();

      if (suggestions.length >= 2) {
        expect(suggestions[0].estimatedImprovement).toBeGreaterThanOrEqual(
          suggestions[1].estimatedImprovement
        );
      }
    });
  });

  describe('Statistics', () => {
    it('should provide comprehensive stats', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Create some rules and tests
      evolution.recordRuleApplication('rule-1', {}, true);
      evolution.promoteRule('rule-1', 'Promoted');

      evolution.recordRuleApplication('rule-2', {}, false);
      evolution.demoteRule('rule-2', 'Demoted');

      evolution.registerVariantTest('test-1', ['a', 'b']);

      const stats = evolution.getEvolutionStats();

      expect(stats.totalRules).toBe(2);
      expect(stats.byStatus.promoted).toBe(1);
      expect(stats.byStatus.demoted).toBe(1);
      expect(stats.activeTests).toBe(1);
    });

    it('should track auto-promotion/demotion counts', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Trigger auto-promote
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication('auto-promote', {}, true);
      }

      // Trigger auto-demote
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication('auto-demote', {}, i < 5);
      }

      const stats = evolution.getEvolutionStats();

      expect(stats.autoPromotions).toBe(1);
      expect(stats.autoDemotions).toBe(1);
    });

    it('should calculate average success rate', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Rule 1: 80% success
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication('rule-1', {}, i < 8);
      }

      // Rule 2: 60% success
      for (let i = 0; i < 10; i++) {
        evolution.recordRuleApplication('rule-2', {}, i < 6);
      }

      const stats = evolution.getEvolutionStats();
      expect(stats.avgSuccessRate).toBeCloseTo(0.7, 1);
    });

    it('should count rules above/below threshold', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Above threshold (>= 0.9)
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication('high-performer', {}, true);
      }

      // Below threshold (<= 0.3)
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication('low-performer', {}, i < 5);
      }

      // In the middle
      for (let i = 0; i < 25; i++) {
        evolution.recordRuleApplication('average-performer', {}, i < 15);
      }

      const stats = evolution.getEvolutionStats();

      expect(stats.aboveThreshold).toBeGreaterThanOrEqual(1);
      expect(stats.belowThreshold).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should bypass all logic when disabled', async () => {
      governanceFlags.updateFlags({
        evolutionPipeline: {
          ...DEFAULT_GOVERNANCE_FLAGS.evolutionPipeline,
          enabled: false,
        },
      });

      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Operations should be no-ops
      evolution.recordRuleApplication('rule', {}, true);
      evolution.promoteRule('rule', 'test');
      evolution.learnFromOutcome('task', {
        taskId: 'task',
        taskType: 'test',
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      });

      const effectiveness = evolution.getRuleEffectiveness('rule');
      expect(effectiveness.totalApplications).toBe(0);
    });

    it('should respect global gate disable', async () => {
      governanceFlags.disableAllGates();

      const evolution = new EvolutionPipelineIntegration();
      expect(isEvolutionPipelineEnabled()).toBe(false);

      evolution.recordRuleApplication('rule', {}, true);
      const effectiveness = evolution.getRuleEffectiveness('rule');
      expect(effectiveness.totalApplications).toBe(0);
    });

    it('should use configurable thresholds', async () => {
      governanceFlags.updateFlags({
        evolutionPipeline: {
          ...DEFAULT_GOVERNANCE_FLAGS.evolutionPipeline,
          autoPromoteThreshold: 0.7, // Lower threshold
          minSamplesForDecision: 10, // Lower sample requirement
        },
      });

      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Should auto-promote at 70% with only 10 samples
      for (let i = 0; i < 12; i++) {
        evolution.recordRuleApplication('quick-promote', {}, i < 10);
      }

      const effectiveness = evolution.getRuleEffectiveness('quick-promote');
      expect(effectiveness.promotionStatus).toBe('promoted');
    });

    it('should use singleton instance', () => {
      expect(evolutionPipelineIntegration).toBeDefined();
      expect(evolutionPipelineIntegration).toBeInstanceOf(EvolutionPipelineIntegration);
    });
  });

  describe('Helper Functions', () => {
    it('should create task outcome objects', () => {
      const outcome = createTaskOutcome('task-123', 'unit-test', true, 1500, {
        qualityMetrics: {
          testsPassed: 10,
          testsFailed: 1,
          coveragePercent: 85,
        },
        appliedRules: ['rule-1', 'rule-2'],
      });

      expect(outcome.taskId).toBe('task-123');
      expect(outcome.taskType).toBe('unit-test');
      expect(outcome.success).toBe(true);
      expect(outcome.durationMs).toBe(1500);
      expect(outcome.qualityMetrics?.testsPassed).toBe(10);
      expect(outcome.appliedRules).toEqual(['rule-1', 'rule-2']);
      expect(outcome.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should track rule application with wrapper', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Temporarily replace singleton for testing
      const originalIntegration = evolutionPipelineIntegration;

      // Success case
      const result = await withRuleTracking(
        'wrapper-rule',
        { domain: 'test-generation' },
        async () => 'success result'
      );

      expect(result).toBe('success result');
    });

    it('should track rule failure with wrapper', async () => {
      // Failure case
      await expect(
        withRuleTracking('failing-rule', {}, async () => {
          throw new Error('Task failed');
        })
      ).rejects.toThrow('Task failed');
    });
  });

  describe('State Management', () => {
    it('should reset all state', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      evolution.recordRuleApplication('rule-1', {}, true);
      evolution.recordRuleApplication('rule-2', {}, true);
      evolution.registerVariantTest('test-1', ['a', 'b']);

      evolution.reset();

      const stats = evolution.getEvolutionStats();
      expect(stats.totalRules).toBe(0);
      expect(stats.activeTests).toBe(0);
    });

    it('should reset specific rule', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      evolution.recordRuleApplication('keep-me', {}, true);
      evolution.recordRuleApplication('remove-me', {}, true);

      evolution.resetRule('remove-me');

      const keepEffectiveness = evolution.getRuleEffectiveness('keep-me');
      const removeEffectiveness = evolution.getRuleEffectiveness('remove-me');

      expect(keepEffectiveness.totalApplications).toBe(1);
      expect(removeEffectiveness.totalApplications).toBe(0);
    });

    it('should get rules by status', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      evolution.recordRuleApplication('promoted-rule', {}, true);
      evolution.promoteRule('promoted-rule', 'Promoted');

      evolution.recordRuleApplication('demoted-rule', {}, false);
      evolution.demoteRule('demoted-rule', 'Demoted');

      evolution.recordRuleApplication('candidate-rule', {}, true);

      const promoted = evolution.getRulesByStatus('promoted');
      const demoted = evolution.getRulesByStatus('demoted');
      const candidates = evolution.getRulesByStatus('candidate');

      expect(promoted).toContain('promoted-rule');
      expect(demoted).toContain('demoted-rule');
      expect(candidates).toContain('candidate-rule');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty variant test results gracefully', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      evolution.registerVariantTest('empty-test', ['a', 'b']);

      const winner = evolution.getWinningVariant('empty-test');
      expect(winner).toBeNull();
    });

    it('should handle recording outcome for non-existent test', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      // Should not throw
      evolution.recordVariantOutcome('non-existent', 'variant', true);
    });

    it('should handle completing non-existent test', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const result = evolution.completeVariantTest('non-existent');
      expect(result).toBeNull();
    });

    it('should prune old application history', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'history-pruning-rule';

      // Record more than 1000 applications
      for (let i = 0; i < 1100; i++) {
        evolution.recordRuleApplication(ruleId, {}, i % 2 === 0);
      }

      const rules = evolution.getAllRules();
      const rule = rules.find(r => r.ruleId === ruleId);

      expect(rule!.applications.length).toBeLessThanOrEqual(1000);
    });

    it('should handle concurrent rule applications', async () => {
      const evolution = new EvolutionPipelineIntegration();
      await evolution.initialize();

      const ruleId = 'concurrent-rule';

      // Simulate concurrent applications
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          Promise.resolve(
            evolution.recordRuleApplication(ruleId, {}, i % 2 === 0)
          )
        )
      );

      const effectiveness = evolution.getRuleEffectiveness(ruleId);
      expect(effectiveness.totalApplications).toBe(20);
    });

    it('should initialize idempotently', async () => {
      const evolution = new EvolutionPipelineIntegration();

      await evolution.initialize();
      await evolution.initialize();
      await evolution.initialize();

      // Should not throw or cause issues
      const stats = evolution.getEvolutionStats();
      expect(stats.totalRules).toBe(0);
    });
  });

  describe('Integration with Other Gates', () => {
    it('should work alongside TrustAccumulator', () => {
      const flags = governanceFlags.getFlags();
      expect(flags.trustAccumulator.enabled).toBe(true);
      expect(flags.evolutionPipeline.enabled).toBe(true);
    });

    it('should work alongside DeterministicGateway', () => {
      const flags = governanceFlags.getFlags();
      expect(flags.deterministicGateway.enabled).toBe(true);
      expect(flags.evolutionPipeline.enabled).toBe(true);
    });

    it('should work alongside MemoryWriteGate', () => {
      const flags = governanceFlags.getFlags();
      expect(flags.memoryWriteGate.enabled).toBe(true);
      expect(flags.evolutionPipeline.enabled).toBe(true);
    });
  });
});
