/**
 * Agentic QE v3 - Heartbeat Scheduler Worker
 * Imp-10: Token-Free Heartbeat Scheduling
 *
 * Lightweight background worker performing SQL-only maintenance
 * every 30 minutes with ZERO LLM token usage:
 * - Pattern promotion checks
 * - Stale pattern detection
 * - Confidence decay application
 * - Experience buffer monitoring
 * - Daily Markdown log entries
 */

import { BaseWorker } from '../base-worker.js';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces.js';
import {
  PatternLifecycleManager,
  createPatternLifecycleManager,
  type PatternLifecycleStats,
} from '../../learning/pattern-lifecycle.js';
import { getUnifiedMemory } from '../../kernel/unified-memory.js';
import { DailyLogger } from '../../learning/daily-log.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG: WorkerConfig = {
  id: 'heartbeat-scheduler',
  name: 'Heartbeat Scheduler',
  description:
    'Token-free maintenance: pattern promotion, stale detection, experience buffer monitoring',
  intervalMs: 30 * 60 * 1000, // 30 minutes
  priority: 'normal',
  targetDomains: ['learning-optimization'],
  enabled: true,
  timeoutMs: 60000, // 1 minute max (SQL only, should be fast)
  retryCount: 1,
  retryDelayMs: 5000,
};

// ============================================================================
// Worker Implementation
// ============================================================================

export class HeartbeatSchedulerWorker extends BaseWorker {
  private lifecycleManager: PatternLifecycleManager | null = null;
  private dailyLogger: DailyLogger;
  private lastRunTimestamp: number = 0;

  constructor() {
    super(CONFIG);
    this.dailyLogger = new DailyLogger();
  }

  /**
   * Initialize or retrieve the PatternLifecycleManager.
   * Returns null when unified memory is unavailable (graceful degradation).
   */
  private async getLifecycleManager(): Promise<PatternLifecycleManager | null> {
    if (this.lifecycleManager) {
      return this.lifecycleManager;
    }

    try {
      const unifiedMemory = getUnifiedMemory();
      await unifiedMemory.initialize();
      const db = unifiedMemory.getDatabase();
      this.lifecycleManager = createPatternLifecycleManager(db, {
        promotionRewardThreshold: 0.7,
        promotionMinOccurrences: 2,
        promotionMinSuccessRate: 0.7,
        deprecationFailureThreshold: 3,
        staleDaysThreshold: 30,
        confidenceDecayRate: 0.01,
        minActiveConfidence: 0.3,
      });
      return this.lifecycleManager;
    } catch {
      return null;
    }
  }

  /**
   * Query pending experience count from the database.
   * Returns 0 if table or query fails.
   */
  private getPendingExperienceCount(): number {
    try {
      const unifiedMemory = getUnifiedMemory();
      const db = unifiedMemory.getDatabase();
      const row = db
        .prepare(
          `SELECT COUNT(*) as pending FROM qe_pattern_usage WHERE created_at > datetime('now', '-1 day')`
        )
        .get() as { pending: number } | undefined;
      return row?.pending ?? 0;
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // Core Execution
  // ============================================================================

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Heartbeat scheduler running (token-free maintenance)');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    const lifecycleManager = await this.getLifecycleManager();

    // Graceful degradation: no database available
    if (!lifecycleManager) {
      context.logger.warn(
        'Unified memory unavailable — returning zero-metric heartbeat'
      );
      return this.createResult(
        Date.now() - startTime,
        {
          itemsAnalyzed: 0,
          issuesFound: 0,
          healthScore: 50,
          trend: 'stable',
          domainMetrics: {
            promoted: 0,
            deprecated: 0,
            decayed: 0,
            stalePatterns: 0,
            pendingExperiences: 0,
            avgConfidence: 0,
            avgSuccessRate: 0,
          },
        },
        [],
        []
      );
    }

    // --- 1. Pattern Promotion ---
    let promoted = 0;
    let promotionChecked = 0;
    try {
      const promotionResult = lifecycleManager.promoteEligiblePatterns();
      promoted = promotionResult.promoted;
      promotionChecked = promotionResult.checked;

      if (promoted > 0) {
        findings.push({
          type: 'heartbeat-promotion',
          severity: 'info',
          domain: 'learning-optimization',
          title: 'Patterns Promoted',
          description: `${promoted} of ${promotionChecked} short-term patterns promoted to long-term`,
        });
      }
    } catch (error) {
      context.logger.warn('Pattern promotion failed', {
        error: toErrorMessage(error),
      });
    }

    // --- 2. Stale Pattern Detection ---
    let deprecated = 0;
    let deprecationChecked = 0;
    try {
      const deprecationResult = lifecycleManager.deprecateStalePatterns();
      deprecated = deprecationResult.deprecated;
      deprecationChecked = deprecationResult.checked;

      if (deprecated > 0) {
        findings.push({
          type: 'heartbeat-deprecation',
          severity: 'low',
          domain: 'learning-optimization',
          title: 'Stale Patterns Deprecated',
          description: `${deprecated} of ${deprecationChecked} patterns deprecated (stale, failed, or low confidence)`,
        });
      }
    } catch (error) {
      context.logger.warn('Stale pattern detection failed', {
        error: toErrorMessage(error),
      });
    }

    // --- 3. Confidence Decay ---
    let decayed = 0;
    try {
      const daysSinceLastRun =
        this.lastRunTimestamp > 0
          ? (Date.now() - this.lastRunTimestamp) / (1000 * 60 * 60 * 24)
          : 1;

      const decayResult = lifecycleManager.applyConfidenceDecay(
        Math.min(daysSinceLastRun, 7)
      );
      decayed = decayResult.decayed;
    } catch (error) {
      context.logger.warn('Confidence decay failed', {
        error: toErrorMessage(error),
      });
    }

    // --- 4. Experience Buffer Status ---
    const pendingExperiences = this.getPendingExperienceCount();

    // --- 5. Pattern Health Summary ---
    let stats: PatternLifecycleStats = {
      totalPatterns: 0,
      activePatterns: 0,
      deprecatedPatterns: 0,
      promotedPatterns: 0,
      shortTermPatterns: 0,
      longTermPatterns: 0,
      avgConfidence: 0,
      avgSuccessRate: 0,
      patternsNearDeprecation: 0,
    };
    try {
      stats = lifecycleManager.getStats();
    } catch (error) {
      context.logger.warn('Stats retrieval failed', {
        error: toErrorMessage(error),
      });
    }

    // --- 6. Daily Log Entry ---
    try {
      this.dailyLogger.log({
        timestamp: new Date(),
        type: 'pattern-promoted',
        summary:
          `Heartbeat: ${promoted} promoted, ${deprecated} deprecated, ` +
          `${decayed} decayed, ${pendingExperiences} pending exp, ` +
          `${stats.activePatterns} active patterns (avg conf: ${stats.avgConfidence.toFixed(2)})`,
        details: {
          promoted,
          deprecated,
          decayed,
          pendingExperiences,
          totalPatterns: stats.totalPatterns,
          activePatterns: stats.activePatterns,
          avgConfidence: stats.avgConfidence,
          avgSuccessRate: stats.avgSuccessRate,
        },
      });
      this.dailyLogger.flush();
    } catch (error) {
      context.logger.warn('Daily log write failed', {
        error: toErrorMessage(error),
      });
    }

    // Update last run timestamp for next decay calculation
    this.lastRunTimestamp = Date.now();

    // --- Recommendations ---
    if (
      stats.activePatterns > 0 &&
      stats.patternsNearDeprecation / stats.activePatterns > 0.5
    ) {
      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Review At-Risk Patterns',
        description: `${stats.patternsNearDeprecation} of ${stats.activePatterns} active patterns are near deprecation. Manual review recommended.`,
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: false,
      });
    }

    // --- Health Score Calculation ---
    const healthScore = this.calculateHealthScore(stats, promoted, deprecated);

    // --- Trend ---
    const trend = this.determineTrend(
      promoted,
      deprecated,
      stats.activePatterns
    );

    const totalChecked = Math.max(promotionChecked, deprecationChecked);
    const issuesFound =
      promoted + deprecated + stats.patternsNearDeprecation;

    context.logger.info('Heartbeat complete', {
      promoted,
      deprecated,
      decayed,
      pendingExperiences,
      healthScore,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: totalChecked,
        issuesFound,
        healthScore,
        trend,
        domainMetrics: {
          promoted,
          deprecated,
          decayed,
          stalePatterns: stats.patternsNearDeprecation,
          pendingExperiences,
          avgConfidence: Number(stats.avgConfidence.toFixed(3)),
          avgSuccessRate: Number(stats.avgSuccessRate.toFixed(3)),
        },
      },
      findings,
      recommendations
    );
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Calculate a 0-100 health score from lifecycle stats.
   *
   * - Base: 70
   * - Bonus for promotions (active learning)
   * - Penalty for high deprecation rate
   * - Penalty for low average confidence
   */
  private calculateHealthScore(
    stats: PatternLifecycleStats,
    promoted: number,
    deprecated: number
  ): number {
    let score = 70;

    // Promotion bonus (max +15)
    score += Math.min(15, promoted * 5);

    // Confidence bonus/penalty (max +/-15)
    if (stats.avgConfidence > 0) {
      score += Math.round((stats.avgConfidence - 0.5) * 30);
    }

    // Deprecation penalty
    if (stats.activePatterns > 0) {
      const deprecationRate = deprecated / stats.activePatterns;
      score -= Math.round(deprecationRate * 20);
    }

    // Near-deprecation penalty
    if (stats.activePatterns > 0) {
      const atRiskRate =
        stats.patternsNearDeprecation / stats.activePatterns;
      if (atRiskRate > 0.5) {
        score -= 10;
      }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Determine the trend direction.
   */
  private determineTrend(
    promoted: number,
    deprecated: number,
    activePatterns: number
  ): 'improving' | 'stable' | 'degrading' {
    if (activePatterns === 0) return 'stable';

    if (promoted > deprecated) return 'improving';
    if (deprecated > promoted && deprecated / activePatterns > 0.1)
      return 'degrading';
    return 'stable';
  }
}
