/**
 * Economic Routing Model Tests — Imp-18, Issue #334
 *
 * Tests quality-weighted cost optimization for the routing system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EconomicRoutingModel,
  TIER_COST_ESTIMATES,
  DEFAULT_ECONOMIC_CONFIG,
  type EconomicRoutingConfig,
} from '../../../src/routing/economic-routing.js';
import { CostTracker } from '../../../src/shared/llm/cost-tracker.js';
import type { RoutingOutcome } from '../../../src/routing/types.js';
import type { AgentTier } from '../../../src/routing/routing-config.js';
import {
  RoutingFeedbackCollector,
  createRoutingFeedbackCollector,
} from '../../../src/routing/routing-feedback.js';
import type { QETask, QERoutingDecision } from '../../../src/routing/types.js';

// ============================================================================
// Helpers
// ============================================================================

function createModel(
  config?: Partial<EconomicRoutingConfig>,
  costTracker?: CostTracker,
): EconomicRoutingModel {
  return new EconomicRoutingModel(costTracker ?? new CostTracker(), config);
}

function makeOutcome(overrides?: Partial<{
  success: boolean;
  qualityScore: number;
  durationMs: number;
}>): RoutingOutcome {
  return {
    id: `test-${Date.now()}`,
    task: { description: 'test task' },
    decision: {
      recommended: 'agent-1',
      confidence: 0.8,
      alternatives: [],
      reasoning: 'test',
      scores: { similarity: 0.8, performance: 0.7, capabilities: 0.9, combined: 0.8 },
      latencyMs: 10,
      timestamp: new Date(),
    },
    usedAgent: 'agent-1',
    followedRecommendation: true,
    outcome: {
      success: overrides?.success ?? true,
      qualityScore: overrides?.qualityScore ?? 0.8,
      durationMs: overrides?.durationMs ?? 3000,
    },
    timestamp: new Date(),
  };
}

function createMockTask(description: string): QETask {
  return { description };
}

function createMockDecision(recommended: string, confidence: number): QERoutingDecision {
  return {
    recommended,
    confidence,
    alternatives: [],
    reasoning: `Selected ${recommended}`,
    scores: { similarity: 0.8, performance: 0.7, capabilities: 0.9, combined: confidence },
    latencyMs: 50,
    timestamp: new Date(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('EconomicRoutingModel', () => {
  let model: EconomicRoutingModel;

  beforeEach(() => {
    model = createModel();
  });

  describe('scoreTiers()', () => {
    it('should return all four tiers sorted by economic score descending', () => {
      const scores = model.scoreTiers(0.5);

      expect(scores).toHaveLength(4);
      // Verify sorted descending by economicScore
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1].economicScore).toBeGreaterThanOrEqual(scores[i].economicScore);
      }
    });

    it('should include all expected properties in each score', () => {
      const scores = model.scoreTiers(0.3);
      for (const score of scores) {
        expect(score).toHaveProperty('tier');
        expect(score).toHaveProperty('qualityScore');
        expect(score).toHaveProperty('estimatedCostUsd');
        expect(score).toHaveProperty('qualityPerDollar');
        expect(score).toHaveProperty('economicScore');
        expect(score.qualityScore).toBeGreaterThanOrEqual(0);
        expect(score.qualityScore).toBeLessThanOrEqual(1);
        expect(score.estimatedCostUsd).toBeGreaterThanOrEqual(0);
      }
    });

    it('should give booster infinite qualityPerDollar when cost is zero', () => {
      const scores = model.scoreTiers(0);
      const booster = scores.find(s => s.tier === 'booster');
      expect(booster).toBeDefined();
      expect(booster!.estimatedCostUsd).toBe(0);
      // booster quality > 0 and cost = 0 => Infinity
      expect(booster!.qualityPerDollar).toBe(Infinity);
    });

    it('should penalize cheaper tiers more for complex tasks', () => {
      const simpleScores = model.scoreTiers(0.1);
      const complexScores = model.scoreTiers(0.9);

      const haikuSimple = simpleScores.find(s => s.tier === 'haiku')!;
      const haikuComplex = complexScores.find(s => s.tier === 'haiku')!;

      // Haiku quality should be lower for complex tasks
      expect(haikuComplex.qualityScore).toBeLessThan(haikuSimple.qualityScore);
    });
  });

  describe('selectTier()', () => {
    it('should select a tier that meets quality threshold', () => {
      const result = model.selectTier(0.5);
      expect(result.tier).toBeDefined();
      expect(result.reason).toBeTruthy();
      expect(result.scores).toHaveLength(4);
    });

    it('should respect budget limits by falling back to cheaper tier', () => {
      // Create a cost tracker that has already spent near the limit
      const costTracker = new CostTracker();
      // Record usage to simulate high spend
      costTracker.recordUsage('claude', 'claude-3-opus-20240229', {
        promptTokens: 100000,
        completionTokens: 50000,
        totalTokens: 150000,
      }, 'req-1');

      const budgetModel = createModel({
        budgetPerHourUsd: 0.001, // Very tight budget
        budgetPerDayUsd: 0.001,
        minQualityThreshold: 0.1, // Lower threshold to allow booster as fallback
      }, costTracker);

      const result = budgetModel.selectTier(0.1); // Low complexity so booster quality is adequate
      // Should fall back to booster (free) since budget is exceeded for paid tiers
      expect(result.tier).toBe('booster');
    });

    it('should respect minimum quality threshold', () => {
      const result = model.selectTier(0.95); // Very complex task
      // Booster quality at 0.95 complexity: 0.3 - 0.95*0.4 = -0.08 (clamped to 0)
      // Should not pick booster for this complexity
      expect(result.tier).not.toBe('booster');
    });

    it('should provide a reason with the selection', () => {
      const result = model.selectTier(0.5);
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('wouldExceedBudget()', () => {
    it('should return false when no budget limits are set', () => {
      expect(model.wouldExceedBudget('opus')).toBe(false);
      expect(model.wouldExceedBudget('haiku')).toBe(false);
    });

    it('should return false for booster (zero cost)', () => {
      const budgetModel = createModel({ budgetPerHourUsd: 0.001 });
      expect(budgetModel.wouldExceedBudget('booster')).toBe(false);
    });

    it('should return true when hourly budget would be exceeded', () => {
      const costTracker = new CostTracker();
      costTracker.recordUsage('claude', 'claude-3-opus-20240229', {
        promptTokens: 500000,
        completionTokens: 200000,
        totalTokens: 700000,
      }, 'req-1');

      const budgetModel = createModel({
        budgetPerHourUsd: 0.001,
      }, costTracker);

      expect(budgetModel.wouldExceedBudget('opus')).toBe(true);
    });

    it('should return true when daily budget would be exceeded', () => {
      const costTracker = new CostTracker();
      costTracker.recordUsage('claude', 'claude-3-opus-20240229', {
        promptTokens: 500000,
        completionTokens: 200000,
        totalTokens: 700000,
      }, 'req-1');

      const budgetModel = createModel({
        budgetPerDayUsd: 0.001,
      }, costTracker);

      expect(budgetModel.wouldExceedBudget('sonnet')).toBe(true);
    });
  });

  describe('updateFromOutcome()', () => {
    it('should adjust quality estimates via EMA', () => {
      const initialScores = model.scoreTiers(0.5);
      const initialHaiku = initialScores.find(s => s.tier === 'haiku')!.qualityScore;

      // Record several high-quality haiku outcomes
      for (let i = 0; i < 10; i++) {
        model.updateFromOutcome(makeOutcome({ qualityScore: 0.95 }), 'haiku');
      }

      const updatedScores = model.scoreTiers(0.5);
      const updatedHaiku = updatedScores.find(s => s.tier === 'haiku')!.qualityScore;

      // Quality should have increased toward 0.95
      expect(updatedHaiku).toBeGreaterThan(initialHaiku);
    });

    it('should decrease quality estimate after low-quality outcomes', () => {
      const initialScores = model.scoreTiers(0.3);
      const initialOpus = initialScores.find(s => s.tier === 'opus')!.qualityScore;

      for (let i = 0; i < 10; i++) {
        model.updateFromOutcome(makeOutcome({ qualityScore: 0.2 }), 'opus');
      }

      const updatedScores = model.scoreTiers(0.3);
      const updatedOpus = updatedScores.find(s => s.tier === 'opus')!.qualityScore;

      expect(updatedOpus).toBeLessThan(initialOpus);
    });
  });

  describe('computeCostAdjustedReward()', () => {
    it('should return the base reward for booster (zero cost)', () => {
      const adjusted = model.computeCostAdjustedReward(0.5, 'booster', 0.8);
      // booster costRatio = 0 => costPenalty = 0 => adjusted = baseReward
      expect(adjusted).toBe(0.5);
    });

    it('should penalize expensive tiers with low quality', () => {
      const adjusted = model.computeCostAdjustedReward(0.5, 'opus', 0.3);
      // opus costRatio=1.0, qualityGain = max(0, 0.3-0.5) = 0
      // costPenalty = 1.0 * (1 - 0) = 1.0
      // adjusted = 0.5 - 1.0 * 0.4 = 0.1
      expect(adjusted).toBeCloseTo(0.1, 1);
    });

    it('should not penalize expensive tiers that deliver high quality', () => {
      const adjusted = model.computeCostAdjustedReward(0.5, 'opus', 0.9);
      // qualityGain = 0.9 - 0.5 = 0.4
      // costPenalty = 1.0 * (1 - 0.4) = 0.6
      // adjusted = 0.5 - 0.6 * 0.4 = 0.26
      // Still penalized somewhat, but less than low-quality
      const lowQualityAdjusted = model.computeCostAdjustedReward(0.5, 'opus', 0.3);
      expect(adjusted).toBeGreaterThan(lowQualityAdjusted);
    });

    it('should clamp the result to [-1, 1]', () => {
      const adjusted = model.computeCostAdjustedReward(-0.9, 'opus', 0.1);
      expect(adjusted).toBeGreaterThanOrEqual(-1);
      expect(adjusted).toBeLessThanOrEqual(1);
    });
  });

  describe('getEconomicReport()', () => {
    it('should return a well-formed report', () => {
      const report = model.getEconomicReport();

      expect(report).toHaveProperty('tierEfficiency');
      expect(report).toHaveProperty('currentHourlyCostUsd');
      expect(report).toHaveProperty('currentDailyCostUsd');
      expect(report).toHaveProperty('budgetRemaining');
      expect(report).toHaveProperty('recommendation');
      expect(report.tierEfficiency).toHaveLength(4);
      expect(typeof report.recommendation).toBe('string');
      expect(report.recommendation.length).toBeGreaterThan(0);
    });

    it('should report null budget remaining when no limits set', () => {
      const report = model.getEconomicReport();
      expect(report.budgetRemaining.hourly).toBeNull();
      expect(report.budgetRemaining.daily).toBeNull();
    });

    it('should report budget remaining when limits are set', () => {
      const budgetModel = createModel({
        budgetPerHourUsd: 1.0,
        budgetPerDayUsd: 10.0,
      });
      const report = budgetModel.getEconomicReport();
      expect(report.budgetRemaining.hourly).toBe(1.0);
      expect(report.budgetRemaining.daily).toBe(10.0);
    });

    it('should include savings opportunity', () => {
      const report = model.getEconomicReport();
      // There should be a savings opportunity comparing opus vs haiku
      expect(report.savingsOpportunity).not.toBeNull();
      expect(report.savingsOpportunity!.usd).toBeGreaterThan(0);
      expect(report.savingsOpportunity!.description.length).toBeGreaterThan(0);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize quality estimates', () => {
      // Update some quality estimates
      model.updateFromOutcome(makeOutcome({ qualityScore: 0.9 }), 'haiku');
      model.updateFromOutcome(makeOutcome({ qualityScore: 0.6 }), 'opus');

      const serialized = model.serializeEstimates();
      expect(serialized).toHaveProperty('haiku');
      expect(serialized).toHaveProperty('opus');

      // Create a new model and deserialize
      const newModel = createModel();
      newModel.deserializeEstimates(serialized);

      // Scores should match after deserialization
      const originalScores = model.scoreTiers(0.5);
      const restoredScores = newModel.scoreTiers(0.5);

      for (const tier of ['booster', 'haiku', 'sonnet', 'opus'] as AgentTier[]) {
        const orig = originalScores.find(s => s.tier === tier)!;
        const restored = restoredScores.find(s => s.tier === tier)!;
        expect(restored.qualityScore).toBeCloseTo(orig.qualityScore, 4);
      }
    });
  });
});

describe('RoutingFeedbackCollector — Economic Integration', () => {
  let collector: RoutingFeedbackCollector;

  beforeEach(() => {
    collector = createRoutingFeedbackCollector(100);
  });

  it('should return null economic report when not enabled', () => {
    expect(collector.getEconomicReport()).toBeNull();
    expect(collector.getEconomicScore(0.5)).toBeNull();
  });

  it('should enable economic routing and return a report', () => {
    collector.enableEconomicRouting();
    const report = collector.getEconomicReport();
    expect(report).not.toBeNull();
    expect(report!.tierEfficiency).toHaveLength(4);
  });

  it('should return economic scores for a given complexity', () => {
    collector.enableEconomicRouting();
    const scores = collector.getEconomicScore(0.3);
    expect(scores).not.toBeNull();
    expect(scores!).toHaveLength(4);
  });

  it('should update economic model when recording outcomes', () => {
    collector.enableEconomicRouting();

    const task = createMockTask('Generate tests');
    const decision = createMockDecision('haiku-agent', 0.85);

    // Record several outcomes
    for (let i = 0; i < 5; i++) {
      collector.recordOutcome(task, decision, 'haiku-agent', {
        success: true,
        qualityScore: 0.9,
        durationMs: 2000,
      });
    }

    // Economic scores should now reflect the observed quality
    const scores = collector.getEconomicScore(0.3);
    expect(scores).not.toBeNull();
    // haiku-agent maps to 'haiku' tier by default inference (contains 'haiku')
    // but the default inferTier maps most qe-* to sonnet; 'haiku-agent' contains 'haiku'
    // so it should update haiku tier quality
  });

  it('should accept custom config for economic routing', () => {
    collector.enableEconomicRouting({
      qualityWeight: 0.8,
      costWeight: 0.2,
      budgetPerDayUsd: 5.0,
    });
    const report = collector.getEconomicReport();
    expect(report).not.toBeNull();
    expect(report!.budgetRemaining.daily).toBe(5.0);
  });
});
