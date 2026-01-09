/**
 * Feedback Loop Integrator
 * ADR-023: Quality Feedback Loop System
 *
 * Integrates all feedback components into a unified system.
 */

import type {
  TestOutcome,
  CoverageSession,
  QualityScore,
  FeedbackConfig,
  PatternTier,
} from './types.js';
import { DEFAULT_FEEDBACK_CONFIG } from './types.js';
import { TestOutcomeTracker, createTestOutcomeTracker } from './test-outcome-tracker.js';
import { CoverageLearner, createCoverageLearner } from './coverage-learner.js';
import { QualityScoreCalculator, createQualityScoreCalculator } from './quality-score-calculator.js';
import { PatternPromotionManager, createPatternPromotionManager } from './pattern-promotion.js';
import {
  RoutingFeedbackCollector,
  createRoutingFeedbackCollector,
} from '../routing/routing-feedback.js';
import type { RealQEReasoningBank } from '../learning/real-qe-reasoning-bank.js';

// ============================================================================
// Routing Outcome Types (simplified for feedback integration)
// ============================================================================

/**
 * Simplified routing outcome for feedback recording
 */
export interface RoutingOutcomeInput {
  taskId: string;
  taskDescription: string;
  recommendedAgent: string;
  usedAgent: string;
  followedRecommendation: boolean;
  success: boolean;
  qualityScore: number;
  durationMs: number;
  timestamp: Date;
  error?: string;
}

// ============================================================================
// Feedback Loop Statistics
// ============================================================================

/**
 * Comprehensive feedback loop statistics
 */
export interface FeedbackLoopStats {
  testOutcomes: {
    total: number;
    passRate: number;
    avgQuality: number;
    flakyCount: number;
  };
  coverage: {
    totalSessions: number;
    successfulSessions: number;
    avgImprovement: number;
    strategiesLearned: number;
  };
  patterns: {
    promoted: number;
    demoted: number;
    tracked: number;
  };
  quality: {
    currentTrend: 'improving' | 'stable' | 'declining';
    avgRecentScore: number;
  };
  routing: {
    totalOutcomes: number;
    recommendationFollowRate: number;
    successRateWhenFollowed: number;
    successRateWhenOverridden: number;
  };
  integrationStatus: {
    reasoningBankConnected: boolean;
  };
}

/**
 * Routing analysis results
 */
export interface RoutingAnalysis {
  totalOutcomes: number;
  recommendationFollowRate: number;
  successRateWhenFollowed: number;
  successRateWhenOverridden: number;
  confidenceCorrelation: number;
  recommendations: string[];
}

// ============================================================================
// Quality Feedback Loop
// ============================================================================

/**
 * Unified feedback loop that coordinates all feedback components
 */
export class QualityFeedbackLoop {
  readonly outcomeTracker: TestOutcomeTracker;
  readonly coverageLearner: CoverageLearner;
  readonly qualityCalculator: QualityScoreCalculator;
  readonly promotionManager: PatternPromotionManager;
  readonly routingFeedback: RoutingFeedbackCollector;

  private reasoningBank: RealQEReasoningBank | null = null;
  private config: FeedbackConfig;

  constructor(config: Partial<FeedbackConfig> = {}) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };

    // Initialize components
    this.outcomeTracker = createTestOutcomeTracker(this.config);
    this.coverageLearner = createCoverageLearner(this.config);
    this.qualityCalculator = createQualityScoreCalculator(this.config.qualityWeights);
    this.promotionManager = createPatternPromotionManager(this.config);
    this.routingFeedback = createRoutingFeedbackCollector(this.config.maxOutcomesInMemory);
  }

  /**
   * Connect to ReasoningBank for pattern storage and updates
   */
  connectReasoningBank(bank: RealQEReasoningBank): void {
    this.reasoningBank = bank;

    // Connect all components
    this.outcomeTracker.connectReasoningBank(bank);
    this.coverageLearner.connectReasoningBank(bank);
    this.promotionManager.connectReasoningBank(bank);
  }

  /**
   * Record a test outcome and process through the feedback loop
   */
  async recordTestOutcome(outcome: TestOutcome): Promise<{
    qualityScore: QualityScore;
    patternUpdate?: {
      action: 'promoted' | 'demoted' | 'unchanged';
      tier?: PatternTier;
    };
  }> {
    // 1. Track the outcome
    await this.outcomeTracker.track(outcome);

    // 2. Calculate quality score
    const qualityScore = this.qualityCalculator.calculateFromOutcome(outcome);

    // 3. Check for pattern promotion/demotion if pattern was used
    let patternUpdate: { action: 'promoted' | 'demoted' | 'unchanged'; tier?: PatternTier } | undefined;

    if (outcome.patternId && this.reasoningBank) {
      const searchResult = await this.reasoningBank.searchQEPatterns(outcome.patternId, { limit: 1 });
      if (searchResult.success && searchResult.value.length > 0) {
        const pattern = searchResult.value[0].pattern;
        const metrics = this.outcomeTracker.getPatternMetrics(outcome.patternId);

        if (metrics) {
          const result = await this.promotionManager.processPatternChange(pattern, {
            patternId: outcome.patternId,
            successCount: metrics.successCount,
            failureCount: metrics.failureCount,
            successRate: metrics.successRate,
            qualityScore: metrics.avgQuality,
            ageDays: this.calculateAgeDays(pattern.createdAt),
            recentSuccessRate: this.calculateRecentSuccessRate(outcome.patternId),
            recentFailureCount: this.calculateRecentFailures(outcome.patternId),
          });

          patternUpdate = {
            action: result.action,
            tier: result.event ? ('toTier' in result.event ? result.event.toTier : undefined) : undefined,
          };
        }
      }
    }

    return { qualityScore, patternUpdate };
  }

  /**
   * Record a coverage session and learn from it
   */
  async recordCoverageSession(session: CoverageSession): Promise<{
    improvement: number;
    strategyLearned: boolean;
    strategyId?: string;
  }> {
    const strategy = await this.coverageLearner.learnFromSession(session);

    const improvement = (
      session.afterCoverage.lines - session.beforeCoverage.lines +
      session.afterCoverage.branches - session.beforeCoverage.branches +
      session.afterCoverage.functions - session.beforeCoverage.functions
    ) / 3;

    return {
      improvement,
      strategyLearned: strategy !== null,
      strategyId: strategy?.id,
    };
  }

  /**
   * Get recommended coverage strategy for a file
   */
  getRecommendedCoverageStrategy(filePath: string) {
    return this.coverageLearner.getRecommendedStrategy(filePath);
  }

  /**
   * Get quality recommendations based on recent outcomes
   */
  getQualityRecommendations(): string[] {
    const recentOutcomes = this.outcomeTracker.getRecentOutcomes(50);
    if (recentOutcomes.length === 0) {
      return ['No test outcomes recorded yet. Start tracking test results to get recommendations.'];
    }

    const aggregateScore = this.qualityCalculator.calculateAggregate(recentOutcomes);
    return this.qualityCalculator.getRecommendations(aggregateScore);
  }

  /**
   * Record a routing outcome (ADR-022 integration)
   */
  async recordRoutingOutcome(input: RoutingOutcomeInput): Promise<void> {
    // Create a minimal QETask for the routing feedback collector
    const task = {
      id: input.taskId,
      description: input.taskDescription,
      complexity: 'medium' as const,
      domains: ['test-generation' as const],
      context: {},
    };

    // Create a minimal routing decision
    const decision = {
      recommended: input.recommendedAgent,
      confidence: 0.8, // Default confidence since we don't have full decision context
      reasoning: 'Recorded from feedback',
      alternatives: [],
    };

    // Record through the routing feedback collector
    this.routingFeedback.recordOutcome(task, decision, input.usedAgent, {
      success: input.success,
      qualityScore: input.qualityScore,
      durationMs: input.durationMs,
      error: input.error,
    });
  }

  /**
   * Get routing analysis and recommendations
   */
  getRoutingAnalysis(): RoutingAnalysis {
    const accuracy = this.routingFeedback.analyzeRoutingAccuracy();
    const recommendations = this.routingFeedback.getImprovementRecommendations();

    return {
      totalOutcomes: accuracy.totalOutcomes,
      recommendationFollowRate: 1 - accuracy.overrideRate,
      successRateWhenFollowed: accuracy.recommendationSuccessRate,
      successRateWhenOverridden: accuracy.overrideSuccessRate,
      confidenceCorrelation: accuracy.confidenceCorrelation,
      recommendations,
    };
  }

  /**
   * Calculate pattern age in days
   */
  private calculateAgeDays(createdAt: Date): number {
    return (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Calculate recent success rate for a pattern
   */
  private calculateRecentSuccessRate(patternId: string): number {
    const outcomes = this.outcomeTracker.exportOutcomes()
      .filter(o => o.patternId === patternId)
      .slice(-10);

    if (outcomes.length === 0) return 0;

    const successes = outcomes.filter(o => o.passed && !o.flaky).length;
    return successes / outcomes.length;
  }

  /**
   * Calculate recent failures for a pattern
   */
  private calculateRecentFailures(patternId: string): number {
    const outcomes = this.outcomeTracker.exportOutcomes()
      .filter(o => o.patternId === patternId)
      .slice(-10);

    return outcomes.filter(o => !o.passed || o.flaky).length;
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): FeedbackLoopStats {
    const outcomeStats = this.outcomeTracker.getStats();
    const coverageStats = this.coverageLearner.getSessionStats();
    const promotionStats = this.promotionManager.getStats();
    const qualityStats = this.qualityCalculator.getStats();
    const trackerStats = this.outcomeTracker.getTrackerStats();
    const routingAccuracy = this.routingFeedback.analyzeRoutingAccuracy();

    return {
      testOutcomes: {
        total: outcomeStats.totalTests,
        passRate: outcomeStats.passRate,
        avgQuality: outcomeStats.avgMaintainability,
        flakyCount: outcomeStats.flakyTests,
      },
      coverage: {
        totalSessions: coverageStats.totalSessions,
        successfulSessions: coverageStats.successfulSessions,
        avgImprovement: coverageStats.avgImprovement,
        strategiesLearned: coverageStats.strategiesLearned,
      },
      patterns: {
        promoted: promotionStats.totalPromotions,
        demoted: promotionStats.totalDemotions,
        tracked: trackerStats.patternsTracked,
      },
      quality: {
        currentTrend: qualityStats.currentTrend,
        avgRecentScore: qualityStats.avgRecentScore,
      },
      routing: {
        totalOutcomes: routingAccuracy.totalOutcomes,
        recommendationFollowRate: 1 - routingAccuracy.overrideRate,
        successRateWhenFollowed: routingAccuracy.recommendationSuccessRate,
        successRateWhenOverridden: routingAccuracy.overrideSuccessRate,
      },
      integrationStatus: {
        reasoningBankConnected: this.reasoningBank !== null,
      },
    };
  }

  /**
   * Export all data for persistence
   */
  exportData(): {
    outcomes: TestOutcome[];
    sessions: CoverageSession[];
    strategies: ReturnType<typeof this.coverageLearner.exportStrategies>;
    promotionHistory: ReturnType<typeof this.promotionManager.exportHistory>;
    routingOutcomes: ReturnType<typeof this.routingFeedback.exportOutcomes>;
  } {
    return {
      outcomes: this.outcomeTracker.exportOutcomes(),
      sessions: this.coverageLearner.exportSessions(),
      strategies: this.coverageLearner.exportStrategies(),
      promotionHistory: this.promotionManager.exportHistory(),
      routingOutcomes: this.routingFeedback.exportOutcomes(),
    };
  }

  /**
   * Import data from persistence
   */
  importData(data: {
    outcomes?: TestOutcome[];
    sessions?: CoverageSession[];
    strategies?: ReturnType<typeof this.coverageLearner.exportStrategies>;
    promotionHistory?: ReturnType<typeof this.promotionManager.exportHistory>;
    routingOutcomes?: ReturnType<typeof this.routingFeedback.exportOutcomes>;
  }): void {
    if (data.outcomes) {
      this.outcomeTracker.importOutcomes(data.outcomes);
    }
    if (data.sessions) {
      this.coverageLearner.importSessions(data.sessions);
    }
    if (data.strategies) {
      this.coverageLearner.importStrategies(data.strategies);
    }
    if (data.promotionHistory) {
      this.promotionManager.importHistory(data.promotionHistory);
    }
    if (data.routingOutcomes) {
      this.routingFeedback.importOutcomes(data.routingOutcomes);
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.outcomeTracker.clear();
    this.coverageLearner.clear();
    this.qualityCalculator.clearHistory();
    this.promotionManager.clearHistory();
    this.routingFeedback.clear();
  }
}

/**
 * Create a new quality feedback loop
 */
export function createQualityFeedbackLoop(
  config?: Partial<FeedbackConfig>
): QualityFeedbackLoop {
  return new QualityFeedbackLoop(config);
}
