/**
 * LearningMetrics - Collect and track learning effectiveness metrics
 *
 * Aggregates metrics from patterns, dreams, transfers, and experiences
 * to measure the learning system's effectiveness.
 *
 * Part of the Nightly-Learner Phase 3 implementation.
 *
 * @version 1.0.0
 * @module src/learning/metrics/LearningMetrics
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';

export interface LearningMetricsData {
  // Discovery metrics
  patternsDiscoveredTotal: number;
  patternsDiscoveredToday: number;
  discoveryRate: number; // patterns/hour

  // Quality metrics
  patternAccuracy: number; // 0-1
  insightActionability: number; // 0-1
  falsePositiveRate: number; // 0-1

  // Transfer metrics
  transferSuccessRate: number; // 0-1
  adoptionRate: number; // % of transferred patterns used
  negativeTransferCount: number;

  // Impact metrics
  taskTimeReduction: number; // % improvement
  coverageImprovement: number; // % improvement
  bugDetectionImprovement: number; // % improvement

  // System health
  sleepCycleCompletionRate: number;
  avgCycleDuration: number;
  errorRate: number;

  // Timestamps
  calculatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

export interface MetricsSummary {
  metrics: LearningMetricsData;
  breakdown: {
    discovery: DiscoveryBreakdown;
    quality: QualityBreakdown;
    transfer: TransferBreakdown;
    impact: ImpactBreakdown;
    system: SystemHealthBreakdown;
  };
  trends: {
    discoveryTrend: number; // -1 to 1 (negative = declining, positive = improving)
    qualityTrend: number;
    transferTrend: number;
    impactTrend: number;
  };
}

export interface DiscoveryBreakdown {
  totalPatterns: number;
  todayPatterns: number;
  weekPatterns: number;
  monthPatterns: number;
  avgPatternsPerDay: number;
  avgPatternsPerCycle: number;
}

export interface QualityBreakdown {
  highConfidencePatterns: number; // confidence >= 0.8
  mediumConfidencePatterns: number; // 0.5 <= confidence < 0.8
  lowConfidencePatterns: number; // confidence < 0.5
  avgConfidence: number;
  insightsApplied: number;
  insightsPending: number;
  insightsRejected: number;
}

export interface TransferBreakdown {
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  avgCompatibilityScore: number;
  transfersByAgentPair: Map<string, { success: number; fail: number }>;
  patternsUsedPostTransfer: number;
}

export interface ImpactBreakdown {
  tasksWithPatterns: number;
  tasksWithoutPatterns: number;
  avgTaskTimeWithPatterns: number;
  avgTaskTimeWithoutPatterns: number;
  timeReductionMs: number;
  coverageBefore: number;
  coverageAfter: number;
  bugsDetectedBefore: number;
  bugsDetectedAfter: number;
}

export interface SystemHealthBreakdown {
  totalCycles: number;
  completedCycles: number;
  failedCycles: number;
  interruptedCycles: number;
  avgCycleDurationMs: number;
  minCycleDurationMs: number;
  maxCycleDurationMs: number;
  totalErrors: number;
  errorsByType: Map<string, number>;
}

export interface MetricsConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * LearningMetrics collects and analyzes learning system effectiveness
 *
 * @example
 * ```typescript
 * const metrics = new LearningMetrics();
 *
 * // Get current metrics
 * const current = await metrics.getCurrentMetrics();
 * console.log(`Discovery rate: ${current.discoveryRate} patterns/hour`);
 * console.log(`Transfer success: ${(current.transferSuccessRate * 100).toFixed(1)}%`);
 *
 * // Get comprehensive summary with breakdown
 * const summary = await metrics.getMetricsSummary();
 * console.log(`Quality trend: ${summary.trends.qualityTrend > 0 ? 'improving' : 'declining'}`);
 * ```
 */
export class LearningMetrics {
  private config: Required<MetricsConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;

  constructor(config?: MetricsConfig) {
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
  }

  /**
   * Get current learning metrics
   */
  async getCurrentMetrics(periodHours: number = 24): Promise<LearningMetricsData> {
    const now = Date.now();
    const periodStart = now - periodHours * 60 * 60 * 1000;

    // Discovery metrics
    const discovery = this.calculateDiscoveryMetrics(periodStart, now);

    // Quality metrics
    const quality = this.calculateQualityMetrics();

    // Transfer metrics
    const transfer = this.calculateTransferMetrics();

    // Impact metrics
    const impact = this.calculateImpactMetrics(periodStart, now);

    // System health
    const health = this.calculateSystemHealthMetrics(periodStart, now);

    const metrics: LearningMetricsData = {
      // Discovery
      patternsDiscoveredTotal: discovery.total,
      patternsDiscoveredToday: discovery.today,
      discoveryRate: discovery.rate,

      // Quality
      patternAccuracy: quality.accuracy,
      insightActionability: quality.actionability,
      falsePositiveRate: quality.falsePositiveRate,

      // Transfer
      transferSuccessRate: transfer.successRate,
      adoptionRate: transfer.adoptionRate,
      negativeTransferCount: transfer.negativeTransfers,

      // Impact
      taskTimeReduction: impact.timeReduction,
      coverageImprovement: impact.coverageImprovement,
      bugDetectionImprovement: impact.bugDetectionImprovement,

      // System health
      sleepCycleCompletionRate: health.completionRate,
      avgCycleDuration: health.avgDuration,
      errorRate: health.errorRate,

      // Metadata
      calculatedAt: new Date(),
      periodStart: new Date(periodStart),
      periodEnd: new Date(now),
    };

    return metrics;
  }

  /**
   * Get comprehensive metrics summary with breakdown
   */
  async getMetricsSummary(periodHours: number = 24): Promise<MetricsSummary> {
    const now = Date.now();
    const periodStart = now - periodHours * 60 * 60 * 1000;

    const metrics = await this.getCurrentMetrics(periodHours);

    const breakdown = {
      discovery: this.getDiscoveryBreakdown(periodStart, now),
      quality: this.getQualityBreakdown(),
      transfer: this.getTransferBreakdown(),
      impact: this.getImpactBreakdown(periodStart, now),
      system: this.getSystemHealthBreakdown(periodStart, now),
    };

    const trends = this.calculateTrends(periodStart, now);

    return {
      metrics,
      breakdown,
      trends,
    };
  }

  /**
   * Calculate discovery metrics
   */
  private calculateDiscoveryMetrics(periodStart: number, periodEnd: number): {
    total: number;
    today: number;
    rate: number;
  } {
    try {
      // Total patterns ever discovered
      const totalRow = this.db.prepare(`
        SELECT COUNT(*) as count FROM patterns
      `).get() as any;

      // Patterns discovered today (last 24 hours)
      const dayStart = periodEnd - 24 * 60 * 60 * 1000;
      const todayRow = this.db.prepare(`
        SELECT COUNT(*) as count FROM patterns
        WHERE created_at >= ?
      `).get(dayStart) as any;

      // Patterns in period
      const periodRow = this.db.prepare(`
        SELECT COUNT(*) as count FROM patterns
        WHERE created_at >= ? AND created_at <= ?
      `).get(periodStart, periodEnd) as any;

      const periodHours = (periodEnd - periodStart) / (1000 * 60 * 60);
      const rate = periodHours > 0 ? periodRow.count / periodHours : 0;

      return {
        total: totalRow?.count || 0,
        today: todayRow?.count || 0,
        rate,
      };
    } catch (error) {
      if (this.config.debug) {
        this.logger.debug('[LearningMetrics] Discovery metrics calculation error', { error });
      }
      return { total: 0, today: 0, rate: 0 };
    }
  }

  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(): {
    accuracy: number;
    actionability: number;
    falsePositiveRate: number;
  } {
    try {
      // Pattern accuracy (avg confidence)
      const confidenceRow = this.db.prepare(`
        SELECT AVG(confidence) as avg FROM patterns
        WHERE confidence IS NOT NULL
      `).get() as any;

      // Insight actionability (insights applied / total insights)
      const insightsRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied
        FROM dream_insights
      `).get() as any;

      const actionability = insightsRow?.total > 0
        ? (insightsRow.applied || 0) / insightsRow.total
        : 0.5; // Default to neutral

      // False positive rate (low confidence patterns / total)
      const falsePositiveRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN confidence < 0.5 THEN 1 ELSE 0 END) as low_confidence
        FROM patterns
        WHERE confidence IS NOT NULL
      `).get() as any;

      const falsePositiveRate = falsePositiveRow?.total > 0
        ? (falsePositiveRow.low_confidence || 0) / falsePositiveRow.total
        : 0;

      return {
        accuracy: confidenceRow?.avg || 0.7,
        actionability,
        falsePositiveRate,
      };
    } catch (error) {
      if (this.config.debug) {
        this.logger.debug('[LearningMetrics] Quality metrics calculation error', { error });
      }
      return { accuracy: 0.7, actionability: 0.5, falsePositiveRate: 0 };
    }
  }

  /**
   * Calculate transfer metrics
   */
  private calculateTransferMetrics(): {
    successRate: number;
    adoptionRate: number;
    negativeTransfers: number;
  } {
    try {
      // Transfer success rate from registry
      const transferRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' AND validation_passed = 1 THEN 1 ELSE 0 END) as successful
        FROM transfer_registry
      `).get() as any;

      const successRate = transferRow?.total > 0
        ? (transferRow.successful || 0) / transferRow.total
        : 0;

      // Adoption rate (transferred patterns that were actually used)
      // We look for patterns in captured_experiences that were transferred
      const adoptionRow = this.db.prepare(`
        SELECT
          COUNT(DISTINCT tr.pattern_id) as transferred,
          COUNT(DISTINCT ce.id) as used
        FROM transfer_registry tr
        LEFT JOIN captured_experiences ce ON
          JSON_EXTRACT(ce.context, '$.patterns_used') LIKE '%' || tr.pattern_id || '%'
        WHERE tr.status = 'active'
      `).get() as any;

      const adoptionRate = adoptionRow?.transferred > 0
        ? (adoptionRow.used || 0) / adoptionRow.transferred
        : 0;

      // Negative transfers (patterns transferred but led to failures)
      const negativeRow = this.db.prepare(`
        SELECT COUNT(DISTINCT tr.id) as count
        FROM transfer_registry tr
        JOIN captured_experiences ce ON
          JSON_EXTRACT(ce.context, '$.patterns_used') LIKE '%' || tr.pattern_id || '%'
        WHERE tr.status = 'active'
          AND JSON_EXTRACT(ce.execution, '$.success') = 0
      `).get() as any;

      return {
        successRate,
        adoptionRate,
        negativeTransfers: negativeRow?.count || 0,
      };
    } catch (error) {
      if (this.config.debug) {
        this.logger.debug('[LearningMetrics] Transfer metrics calculation error', { error });
      }
      return { successRate: 0, adoptionRate: 0, negativeTransfers: 0 };
    }
  }

  /**
   * Calculate impact metrics
   */
  private calculateImpactMetrics(periodStart: number, periodEnd: number): {
    timeReduction: number;
    coverageImprovement: number;
    bugDetectionImprovement: number;
  } {
    try {
      // Task time reduction (compare executions with/without patterns)
      const timeRow = this.db.prepare(`
        SELECT
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) > 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as with_patterns,
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) = 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as without_patterns
        FROM captured_experiences
        WHERE created_at >= ? AND created_at <= ?
          AND JSON_EXTRACT(execution, '$.success') = 1
      `).get(periodStart, periodEnd) as any;

      const timeReduction = (timeRow?.without_patterns && timeRow?.with_patterns)
        ? ((timeRow.without_patterns - timeRow.with_patterns) / timeRow.without_patterns) * 100
        : 0;

      // Coverage improvement (would need coverage data - placeholder calculation)
      const coverageRow = this.db.prepare(`
        SELECT
          AVG(CASE WHEN created_at < ? THEN JSON_EXTRACT(outcome, '$.coverage') END) as before,
          AVG(CASE WHEN created_at >= ? THEN JSON_EXTRACT(outcome, '$.coverage') END) as after
        FROM captured_experiences
        WHERE JSON_EXTRACT(outcome, '$.coverage') IS NOT NULL
      `).get(periodStart, periodStart) as any;

      const coverageImprovement = (coverageRow?.before && coverageRow?.after)
        ? ((coverageRow.after - coverageRow.before) / coverageRow.before) * 100
        : 0;

      // Bug detection improvement (issues found before/after pattern adoption)
      const bugRow = this.db.prepare(`
        SELECT
          SUM(CASE WHEN created_at < ? THEN JSON_EXTRACT(outcome, '$.bugs_found') END) as before,
          SUM(CASE WHEN created_at >= ? THEN JSON_EXTRACT(outcome, '$.bugs_found') END) as after
        FROM captured_experiences
        WHERE JSON_EXTRACT(outcome, '$.bugs_found') IS NOT NULL
      `).get(periodStart, periodStart) as any;

      const bugDetectionImprovement = (bugRow?.before && bugRow?.after && bugRow.before > 0)
        ? ((bugRow.after - bugRow.before) / bugRow.before) * 100
        : 0;

      return {
        timeReduction,
        coverageImprovement,
        bugDetectionImprovement,
      };
    } catch (error) {
      if (this.config.debug) {
        this.logger.debug('[LearningMetrics] Impact metrics calculation error', { error });
      }
      return { timeReduction: 0, coverageImprovement: 0, bugDetectionImprovement: 0 };
    }
  }

  /**
   * Calculate system health metrics
   */
  private calculateSystemHealthMetrics(periodStart: number, periodEnd: number): {
    completionRate: number;
    avgDuration: number;
    errorRate: number;
  } {
    try {
      // Sleep cycle completion rate
      const cycleRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM dream_cycles
        WHERE start_time >= ? AND start_time <= ?
      `).get(periodStart, periodEnd) as any;

      const completionRate = cycleRow?.total > 0
        ? (cycleRow.completed || 0) / cycleRow.total
        : 0;

      // Average cycle duration
      const durationRow = this.db.prepare(`
        SELECT AVG(duration) as avg
        FROM dream_cycles
        WHERE status = 'completed'
          AND start_time >= ? AND start_time <= ?
      `).get(periodStart, periodEnd) as any;

      // Error rate (failed executions / total executions)
      const errorRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN JSON_EXTRACT(execution, '$.success') = 0 THEN 1 ELSE 0 END) as errors
        FROM captured_experiences
        WHERE created_at >= ? AND created_at <= ?
      `).get(periodStart, periodEnd) as any;

      const errorRate = errorRow?.total > 0
        ? (errorRow.errors || 0) / errorRow.total
        : 0;

      return {
        completionRate,
        avgDuration: durationRow?.avg || 0,
        errorRate,
      };
    } catch (error) {
      if (this.config.debug) {
        this.logger.debug('[LearningMetrics] System health metrics calculation error', { error });
      }
      return { completionRate: 0, avgDuration: 0, errorRate: 0 };
    }
  }

  /**
   * Get detailed discovery breakdown
   */
  private getDiscoveryBreakdown(periodStart: number, periodEnd: number): DiscoveryBreakdown {
    try {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

      const totalRow = this.db.prepare(`SELECT COUNT(*) as count FROM patterns`).get() as any;
      const todayRow = this.db.prepare(`SELECT COUNT(*) as count FROM patterns WHERE created_at >= ?`).get(dayAgo) as any;
      const weekRow = this.db.prepare(`SELECT COUNT(*) as count FROM patterns WHERE created_at >= ?`).get(weekAgo) as any;
      const monthRow = this.db.prepare(`SELECT COUNT(*) as count FROM patterns WHERE created_at >= ?`).get(monthAgo) as any;

      const avgPerDay = (monthRow?.count || 0) / 30;

      // Average patterns per dream cycle
      const cycleRow = this.db.prepare(`
        SELECT AVG(insights_generated) as avg
        FROM dream_cycles
        WHERE status = 'completed'
      `).get() as any;

      return {
        totalPatterns: totalRow?.count || 0,
        todayPatterns: todayRow?.count || 0,
        weekPatterns: weekRow?.count || 0,
        monthPatterns: monthRow?.count || 0,
        avgPatternsPerDay: avgPerDay,
        avgPatternsPerCycle: cycleRow?.avg || 0,
      };
    } catch (error) {
      return {
        totalPatterns: 0,
        todayPatterns: 0,
        weekPatterns: 0,
        monthPatterns: 0,
        avgPatternsPerDay: 0,
        avgPatternsPerCycle: 0,
      };
    }
  }

  /**
   * Get detailed quality breakdown
   */
  private getQualityBreakdown(): QualityBreakdown {
    try {
      const confidenceRow = this.db.prepare(`
        SELECT
          SUM(CASE WHEN confidence >= 0.8 THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN confidence >= 0.5 AND confidence < 0.8 THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN confidence < 0.5 THEN 1 ELSE 0 END) as low,
          AVG(confidence) as avg
        FROM patterns
        WHERE confidence IS NOT NULL
      `).get() as any;

      const insightRow = this.db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM dream_insights
      `).get() as any;

      return {
        highConfidencePatterns: confidenceRow?.high || 0,
        mediumConfidencePatterns: confidenceRow?.medium || 0,
        lowConfidencePatterns: confidenceRow?.low || 0,
        avgConfidence: confidenceRow?.avg || 0.7,
        insightsApplied: insightRow?.applied || 0,
        insightsPending: insightRow?.pending || 0,
        insightsRejected: insightRow?.rejected || 0,
      };
    } catch (error) {
      return {
        highConfidencePatterns: 0,
        mediumConfidencePatterns: 0,
        lowConfidencePatterns: 0,
        avgConfidence: 0.7,
        insightsApplied: 0,
        insightsPending: 0,
        insightsRejected: 0,
      };
    }
  }

  /**
   * Get detailed transfer breakdown
   */
  private getTransferBreakdown(): TransferBreakdown {
    try {
      const transferRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as successful,
          AVG(compatibility_score) as avg_score
        FROM transfer_registry
      `).get() as any;

      const pairRows = this.db.prepare(`
        SELECT
          source_agent,
          target_agent,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) as fail
        FROM transfer_registry
        GROUP BY source_agent, target_agent
      `).all() as any[];

      const transfersByAgentPair = new Map<string, { success: number; fail: number }>();
      for (const row of pairRows) {
        const key = `${row.source_agent}->${row.target_agent}`;
        transfersByAgentPair.set(key, {
          success: row.success || 0,
          fail: row.fail || 0,
        });
      }

      // Count patterns used post-transfer
      const usageRow = this.db.prepare(`
        SELECT COUNT(DISTINCT pattern_id) as count
        FROM transfer_registry tr
        WHERE EXISTS (
          SELECT 1 FROM captured_experiences ce
          WHERE JSON_EXTRACT(ce.context, '$.patterns_used') LIKE '%' || tr.pattern_id || '%'
        )
      `).get() as any;

      return {
        totalTransfers: transferRow?.total || 0,
        successfulTransfers: transferRow?.successful || 0,
        failedTransfers: (transferRow?.total || 0) - (transferRow?.successful || 0),
        avgCompatibilityScore: transferRow?.avg_score || 0,
        transfersByAgentPair,
        patternsUsedPostTransfer: usageRow?.count || 0,
      };
    } catch (error) {
      return {
        totalTransfers: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
        avgCompatibilityScore: 0,
        transfersByAgentPair: new Map(),
        patternsUsedPostTransfer: 0,
      };
    }
  }

  /**
   * Get detailed impact breakdown
   */
  private getImpactBreakdown(periodStart: number, periodEnd: number): ImpactBreakdown {
    try {
      const taskRow = this.db.prepare(`
        SELECT
          SUM(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) > 0 THEN 1 ELSE 0 END) as with_patterns,
          SUM(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) = 0 THEN 1 ELSE 0 END) as without_patterns,
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) > 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as time_with,
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) = 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as time_without
        FROM captured_experiences
        WHERE created_at >= ? AND created_at <= ?
      `).get(periodStart, periodEnd) as any;

      const coverageRow = this.db.prepare(`
        SELECT
          AVG(CASE WHEN created_at < ? THEN JSON_EXTRACT(outcome, '$.coverage') END) as before,
          AVG(CASE WHEN created_at >= ? THEN JSON_EXTRACT(outcome, '$.coverage') END) as after
        FROM captured_experiences
        WHERE JSON_EXTRACT(outcome, '$.coverage') IS NOT NULL
      `).get(periodStart, periodStart) as any;

      const bugRow = this.db.prepare(`
        SELECT
          SUM(CASE WHEN created_at < ? THEN JSON_EXTRACT(outcome, '$.bugs_found') END) as before,
          SUM(CASE WHEN created_at >= ? THEN JSON_EXTRACT(outcome, '$.bugs_found') END) as after
        FROM captured_experiences
        WHERE JSON_EXTRACT(outcome, '$.bugs_found') IS NOT NULL
      `).get(periodStart, periodStart) as any;

      const timeReductionMs = (taskRow?.time_without && taskRow?.time_with)
        ? taskRow.time_without - taskRow.time_with
        : 0;

      return {
        tasksWithPatterns: taskRow?.with_patterns || 0,
        tasksWithoutPatterns: taskRow?.without_patterns || 0,
        avgTaskTimeWithPatterns: taskRow?.time_with || 0,
        avgTaskTimeWithoutPatterns: taskRow?.time_without || 0,
        timeReductionMs,
        coverageBefore: coverageRow?.before || 0,
        coverageAfter: coverageRow?.after || 0,
        bugsDetectedBefore: bugRow?.before || 0,
        bugsDetectedAfter: bugRow?.after || 0,
      };
    } catch (error) {
      return {
        tasksWithPatterns: 0,
        tasksWithoutPatterns: 0,
        avgTaskTimeWithPatterns: 0,
        avgTaskTimeWithoutPatterns: 0,
        timeReductionMs: 0,
        coverageBefore: 0,
        coverageAfter: 0,
        bugsDetectedBefore: 0,
        bugsDetectedAfter: 0,
      };
    }
  }

  /**
   * Get detailed system health breakdown
   */
  private getSystemHealthBreakdown(periodStart: number, periodEnd: number): SystemHealthBreakdown {
    try {
      const cycleRow = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'interrupted' THEN 1 ELSE 0 END) as interrupted,
          AVG(duration) as avg_duration,
          MIN(duration) as min_duration,
          MAX(duration) as max_duration
        FROM dream_cycles
        WHERE start_time >= ? AND start_time <= ?
      `).get(periodStart, periodEnd) as any;

      const errorRow = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM captured_experiences
        WHERE created_at >= ? AND created_at <= ?
          AND JSON_EXTRACT(execution, '$.success') = 0
      `).get(periodStart, periodEnd) as any;

      // Group errors by type
      const errorTypeRows = this.db.prepare(`
        SELECT
          JSON_EXTRACT(context, '$.errors_encountered[0]') as error_type,
          COUNT(*) as count
        FROM captured_experiences
        WHERE created_at >= ? AND created_at <= ?
          AND JSON_EXTRACT(execution, '$.success') = 0
        GROUP BY error_type
      `).all(periodStart, periodEnd) as any[];

      const errorsByType = new Map<string, number>();
      for (const row of errorTypeRows) {
        if (row.error_type) {
          errorsByType.set(row.error_type, row.count || 0);
        }
      }

      return {
        totalCycles: cycleRow?.total || 0,
        completedCycles: cycleRow?.completed || 0,
        failedCycles: cycleRow?.failed || 0,
        interruptedCycles: cycleRow?.interrupted || 0,
        avgCycleDurationMs: cycleRow?.avg_duration || 0,
        minCycleDurationMs: cycleRow?.min_duration || 0,
        maxCycleDurationMs: cycleRow?.max_duration || 0,
        totalErrors: errorRow?.count || 0,
        errorsByType,
      };
    } catch (error) {
      return {
        totalCycles: 0,
        completedCycles: 0,
        failedCycles: 0,
        interruptedCycles: 0,
        avgCycleDurationMs: 0,
        minCycleDurationMs: 0,
        maxCycleDurationMs: 0,
        totalErrors: 0,
        errorsByType: new Map(),
      };
    }
  }

  /**
   * Calculate trends over time
   */
  private calculateTrends(periodStart: number, periodEnd: number): {
    discoveryTrend: number;
    qualityTrend: number;
    transferTrend: number;
    impactTrend: number;
  } {
    try {
      const periodDuration = periodEnd - periodStart;
      const midpoint = periodStart + periodDuration / 2;

      // Discovery trend (compare first half vs second half)
      const discoveryFirstHalf = this.db.prepare(`
        SELECT COUNT(*) as count FROM patterns
        WHERE created_at >= ? AND created_at < ?
      `).get(periodStart, midpoint) as any;

      const discoverySecondHalf = this.db.prepare(`
        SELECT COUNT(*) as count FROM patterns
        WHERE created_at >= ? AND created_at <= ?
      `).get(midpoint, periodEnd) as any;

      const discoveryTrend = (discoveryFirstHalf?.count || 0) > 0
        ? ((discoverySecondHalf?.count || 0) - (discoveryFirstHalf?.count || 0)) / (discoveryFirstHalf.count || 1)
        : 0;

      // Quality trend (compare average confidence)
      const qualityFirstHalf = this.db.prepare(`
        SELECT AVG(confidence) as avg FROM patterns
        WHERE created_at >= ? AND created_at < ?
      `).get(periodStart, midpoint) as any;

      const qualitySecondHalf = this.db.prepare(`
        SELECT AVG(confidence) as avg FROM patterns
        WHERE created_at >= ? AND created_at <= ?
      `).get(midpoint, periodEnd) as any;

      const qualityTrend = (qualityFirstHalf?.avg || 0) > 0
        ? ((qualitySecondHalf?.avg || 0) - (qualityFirstHalf?.avg || 0)) / (qualityFirstHalf.avg || 1)
        : 0;

      // Transfer trend (compare success rates)
      const transferFirstHalf = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as successful
        FROM transfer_registry
        WHERE transferred_at >= ? AND transferred_at < ?
      `).get(periodStart, midpoint) as any;

      const transferSecondHalf = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as successful
        FROM transfer_registry
        WHERE transferred_at >= ? AND transferred_at <= ?
      `).get(midpoint, periodEnd) as any;

      const transferRateFirst = (transferFirstHalf?.total || 0) > 0
        ? (transferFirstHalf.successful || 0) / transferFirstHalf.total
        : 0;

      const transferRateSecond = (transferSecondHalf?.total || 0) > 0
        ? (transferSecondHalf.successful || 0) / transferSecondHalf.total
        : 0;

      const transferTrend = transferRateFirst > 0
        ? (transferRateSecond - transferRateFirst) / transferRateFirst
        : 0;

      // Impact trend (compare task time reduction)
      const impactFirstHalf = this.db.prepare(`
        SELECT
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) > 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as with_patterns,
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) = 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as without_patterns
        FROM captured_experiences
        WHERE created_at >= ? AND created_at < ?
      `).get(periodStart, midpoint) as any;

      const impactSecondHalf = this.db.prepare(`
        SELECT
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) > 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as with_patterns,
          AVG(CASE WHEN JSON_ARRAY_LENGTH(JSON_EXTRACT(context, '$.patterns_used')) = 0
            THEN JSON_EXTRACT(execution, '$.duration') END) as without_patterns
        FROM captured_experiences
        WHERE created_at >= ? AND created_at <= ?
      `).get(midpoint, periodEnd) as any;

      const reductionFirst = (impactFirstHalf?.without_patterns && impactFirstHalf?.with_patterns)
        ? (impactFirstHalf.without_patterns - impactFirstHalf.with_patterns) / impactFirstHalf.without_patterns
        : 0;

      const reductionSecond = (impactSecondHalf?.without_patterns && impactSecondHalf?.with_patterns)
        ? (impactSecondHalf.without_patterns - impactSecondHalf.with_patterns) / impactSecondHalf.without_patterns
        : 0;

      const impactTrend = reductionFirst > 0
        ? (reductionSecond - reductionFirst) / reductionFirst
        : 0;

      // Normalize trends to -1 to 1 range
      const normalize = (value: number) => Math.max(-1, Math.min(1, value));

      return {
        discoveryTrend: normalize(discoveryTrend),
        qualityTrend: normalize(qualityTrend),
        transferTrend: normalize(transferTrend),
        impactTrend: normalize(impactTrend),
      };
    } catch (error) {
      if (this.config.debug) {
        this.logger.debug('[LearningMetrics] Trend calculation error', { error });
      }
      return {
        discoveryTrend: 0,
        qualityTrend: 0,
        transferTrend: 0,
        impactTrend: 0,
      };
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default LearningMetrics;
