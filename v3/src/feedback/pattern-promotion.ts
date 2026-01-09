/**
 * Pattern Promotion Manager
 * ADR-023: Quality Feedback Loop System
 *
 * Manages pattern lifecycle through promotion and demotion tiers.
 */

import type {
  PatternTier,
  PromotionCriteria,
  PatternPromotionEvent,
  PatternDemotionEvent,
  FeedbackConfig,
} from './types.js';
import { DEFAULT_PROMOTION_CRITERIA, DEFAULT_FEEDBACK_CONFIG } from './types.js';
import type { RealQEReasoningBank } from '../learning/real-qe-reasoning-bank.js';
import type { QEPattern } from '../learning/qe-patterns.js';

// ============================================================================
// Pattern Metrics Interface
// ============================================================================

/**
 * Pattern metrics for promotion evaluation
 */
export interface PatternMetrics {
  patternId: string;
  successCount: number;
  failureCount: number;
  successRate: number;
  qualityScore: number;
  ageDays: number;
  recentSuccessRate: number;
  recentFailureCount: number;
}

// ============================================================================
// Pattern Promotion Manager
// ============================================================================

/**
 * Manages pattern promotion and demotion
 */
export class PatternPromotionManager {
  private criteria: Record<PatternTier, PromotionCriteria>;
  private promotionHistory: PatternPromotionEvent[] = [];
  private demotionHistory: PatternDemotionEvent[] = [];
  private reasoningBank: RealQEReasoningBank | null = null;
  private config: FeedbackConfig;

  constructor(config: Partial<FeedbackConfig> = {}) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
    this.criteria = { ...DEFAULT_PROMOTION_CRITERIA };
  }

  /**
   * Connect to ReasoningBank
   */
  connectReasoningBank(bank: RealQEReasoningBank): void {
    this.reasoningBank = bank;
  }

  /**
   * Evaluate if a pattern should be promoted
   */
  evaluatePromotion(pattern: QEPattern, metrics: PatternMetrics): PatternPromotionEvent | null {
    const currentTier = pattern.tier as PatternTier;
    const nextTier = this.getNextTier(currentTier);

    if (!nextTier) {
      // Already at highest tier
      return null;
    }

    const targetCriteria = this.criteria[nextTier];
    if (this.meetsPromotionCriteria(metrics, targetCriteria)) {
      const event: PatternPromotionEvent = {
        patternId: pattern.id!,
        fromTier: currentTier,
        toTier: nextTier,
        reason: this.generatePromotionReason(metrics, targetCriteria),
        metrics: {
          successCount: metrics.successCount,
          successRate: metrics.successRate,
          qualityScore: metrics.qualityScore,
          ageDays: metrics.ageDays,
        },
        timestamp: new Date(),
      };

      this.promotionHistory.push(event);
      return event;
    }

    return null;
  }

  /**
   * Evaluate if a pattern should be demoted
   */
  evaluateDemotion(pattern: QEPattern, metrics: PatternMetrics): PatternDemotionEvent | null {
    if (!this.config.autoDemote) return null;

    const currentTier = pattern.tier as PatternTier;
    if (currentTier === 'short-term') {
      // Already at lowest tier
      return null;
    }

    // Demotion criteria: recent poor performance
    const shouldDemote =
      metrics.recentSuccessRate < 0.4 ||
      metrics.recentFailureCount >= 5 ||
      metrics.qualityScore < 0.3;

    if (shouldDemote) {
      const previousTier = this.getPreviousTier(currentTier);
      if (!previousTier) return null;

      const event: PatternDemotionEvent = {
        patternId: pattern.id!,
        fromTier: currentTier,
        toTier: previousTier,
        reason: this.generateDemotionReason(metrics),
        metrics: {
          recentSuccessRate: metrics.recentSuccessRate,
          recentQualityScore: metrics.qualityScore,
          failureCount: metrics.recentFailureCount,
        },
        timestamp: new Date(),
      };

      this.demotionHistory.push(event);
      return event;
    }

    return null;
  }

  /**
   * Process promotion or demotion
   */
  async processPatternChange(pattern: QEPattern, metrics: PatternMetrics): Promise<{
    action: 'promoted' | 'demoted' | 'unchanged';
    event?: PatternPromotionEvent | PatternDemotionEvent;
  }> {
    // First check for demotion (takes priority)
    const demotionEvent = this.evaluateDemotion(pattern, metrics);
    if (demotionEvent) {
      if (this.reasoningBank) {
        await this.reasoningBank.demotePattern(pattern.id!);
      }
      return { action: 'demoted', event: demotionEvent };
    }

    // Then check for promotion
    const promotionEvent = this.evaluatePromotion(pattern, metrics);
    if (promotionEvent) {
      if (this.reasoningBank) {
        await this.reasoningBank.promotePattern(pattern.id!);
      }
      return { action: 'promoted', event: promotionEvent };
    }

    return { action: 'unchanged' };
  }

  /**
   * Check if metrics meet promotion criteria
   */
  private meetsPromotionCriteria(metrics: PatternMetrics, criteria: PromotionCriteria): boolean {
    return (
      metrics.successCount >= criteria.minSuccessCount &&
      metrics.successRate >= criteria.minSuccessRate &&
      metrics.qualityScore >= criteria.minQualityScore &&
      metrics.ageDays >= criteria.minAgeDays
    );
  }

  /**
   * Get next tier for promotion
   */
  private getNextTier(currentTier: PatternTier): PatternTier | null {
    const tierOrder: PatternTier[] = ['short-term', 'working', 'long-term', 'permanent'];
    const currentIndex = tierOrder.indexOf(currentTier);
    if (currentIndex < tierOrder.length - 1) {
      return tierOrder[currentIndex + 1];
    }
    return null;
  }

  /**
   * Get previous tier for demotion
   */
  private getPreviousTier(currentTier: PatternTier): PatternTier | null {
    const tierOrder: PatternTier[] = ['short-term', 'working', 'long-term', 'permanent'];
    const currentIndex = tierOrder.indexOf(currentTier);
    if (currentIndex > 0) {
      return tierOrder[currentIndex - 1];
    }
    return null;
  }

  /**
   * Generate promotion reason
   */
  private generatePromotionReason(metrics: PatternMetrics, criteria: PromotionCriteria): string {
    const reasons: string[] = [];

    if (metrics.successCount >= criteria.minSuccessCount) {
      reasons.push(`${metrics.successCount} successful uses (>=${criteria.minSuccessCount})`);
    }
    if (metrics.successRate >= criteria.minSuccessRate) {
      reasons.push(`${(metrics.successRate * 100).toFixed(0)}% success rate (>=${criteria.minSuccessRate * 100}%)`);
    }
    if (metrics.qualityScore >= criteria.minQualityScore) {
      reasons.push(`${(metrics.qualityScore * 100).toFixed(0)}% quality score (>=${criteria.minQualityScore * 100}%)`);
    }

    return `Pattern promoted: ${reasons.join(', ')}`;
  }

  /**
   * Generate demotion reason
   */
  private generateDemotionReason(metrics: PatternMetrics): string {
    const reasons: string[] = [];

    if (metrics.recentSuccessRate < 0.4) {
      reasons.push(`low recent success rate (${(metrics.recentSuccessRate * 100).toFixed(0)}%)`);
    }
    if (metrics.recentFailureCount >= 5) {
      reasons.push(`${metrics.recentFailureCount} recent failures`);
    }
    if (metrics.qualityScore < 0.3) {
      reasons.push(`low quality score (${(metrics.qualityScore * 100).toFixed(0)}%)`);
    }

    return `Pattern demoted: ${reasons.join(', ')}`;
  }

  /**
   * Update promotion criteria
   */
  updateCriteria(tier: PatternTier, criteria: Partial<PromotionCriteria>): void {
    this.criteria[tier] = { ...this.criteria[tier], ...criteria };
  }

  /**
   * Get promotion criteria for a tier
   */
  getCriteria(tier: PatternTier): PromotionCriteria {
    return { ...this.criteria[tier] };
  }

  /**
   * Get all criteria
   */
  getAllCriteria(): Record<PatternTier, PromotionCriteria> {
    return { ...this.criteria };
  }

  /**
   * Get promotion history
   */
  getPromotionHistory(limit = 100): PatternPromotionEvent[] {
    return this.promotionHistory.slice(-limit);
  }

  /**
   * Get demotion history
   */
  getDemotionHistory(limit = 100): PatternDemotionEvent[] {
    return this.demotionHistory.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPromotions: number;
    totalDemotions: number;
    promotionsByTier: Record<PatternTier, number>;
    demotionsByTier: Record<PatternTier, number>;
    recentPromotions: number;
    recentDemotions: number;
  } {
    // Count promotions by target tier
    const promotionsByTier: Record<PatternTier, number> = {
      'short-term': 0,
      'working': 0,
      'long-term': 0,
      'permanent': 0,
    };
    for (const event of this.promotionHistory) {
      promotionsByTier[event.toTier]++;
    }

    // Count demotions by target tier
    const demotionsByTier: Record<PatternTier, number> = {
      'short-term': 0,
      'working': 0,
      'long-term': 0,
      'permanent': 0,
    };
    for (const event of this.demotionHistory) {
      demotionsByTier[event.toTier]++;
    }

    // Recent (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentPromotions = this.promotionHistory.filter(
      e => e.timestamp.getTime() > sevenDaysAgo
    ).length;
    const recentDemotions = this.demotionHistory.filter(
      e => e.timestamp.getTime() > sevenDaysAgo
    ).length;

    return {
      totalPromotions: this.promotionHistory.length,
      totalDemotions: this.demotionHistory.length,
      promotionsByTier,
      demotionsByTier,
      recentPromotions,
      recentDemotions,
    };
  }

  /**
   * Export history for persistence
   */
  exportHistory(): {
    promotions: PatternPromotionEvent[];
    demotions: PatternDemotionEvent[];
  } {
    return {
      promotions: [...this.promotionHistory],
      demotions: [...this.demotionHistory],
    };
  }

  /**
   * Import history from persistence
   */
  importHistory(history: {
    promotions?: PatternPromotionEvent[];
    demotions?: PatternDemotionEvent[];
  }): void {
    if (history.promotions) {
      this.promotionHistory.push(...history.promotions);
    }
    if (history.demotions) {
      this.demotionHistory.push(...history.demotions);
    }
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.promotionHistory = [];
    this.demotionHistory = [];
  }
}

/**
 * Create a new pattern promotion manager
 */
export function createPatternPromotionManager(
  config?: Partial<FeedbackConfig>
): PatternPromotionManager {
  return new PatternPromotionManager(config);
}
