/**
 * PerformanceTracker - Phase 2 (Milestone 2.2)
 *
 * Tracks agent performance metrics over time and calculates improvement rates.
 * Target: 20% performance improvement over 30 days.
 */

import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { PerformanceMetrics, ImprovementData } from './types';

/**
 * Performance snapshot for tracking
 */
interface PerformanceSnapshot {
  timestamp: Date;
  metrics: PerformanceMetrics;
}

/**
 * PerformanceTracker - Track and analyze agent performance over time
 */
export class PerformanceTracker {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly agentId: string;
  private snapshots: PerformanceSnapshot[];
  private baselineMetrics?: PerformanceMetrics;

  // Target metrics
  private readonly TARGET_IMPROVEMENT = 0.20; // 20%
  private readonly TARGET_PERIOD_DAYS = 30;

  constructor(agentId: string, memoryStore: SwarmMemoryManager) {
    this.logger = Logger.getInstance();
    this.agentId = agentId;
    this.memoryStore = memoryStore;
    this.snapshots = [];
  }

  /**
   * Initialize the performance tracker
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing PerformanceTracker for agent ${this.agentId}`);

    // Load previous snapshots
    await this.loadSnapshots();

    // Set baseline if not exists
    if (!this.baselineMetrics && this.snapshots.length > 0) {
      this.baselineMetrics = this.snapshots[0].metrics;
    }

    this.logger.info('PerformanceTracker initialized successfully');
  }

  /**
   * Record current performance snapshot
   */
  async recordSnapshot(metrics: Omit<PerformanceMetrics, 'agentId' | 'period'>): Promise<void> {
    const now = new Date();

    const snapshot: PerformanceSnapshot = {
      timestamp: now,
      metrics: {
        agentId: this.agentId,
        period: {
          start: this.getLastSnapshotTime() || now,
          end: now
        },
        ...metrics
      }
    };

    this.snapshots.push(snapshot);

    // Set baseline if first snapshot
    if (!this.baselineMetrics) {
      this.baselineMetrics = snapshot.metrics;
      await this.storeBaseline(this.baselineMetrics);
    }

    // Store snapshot
    await this.storeSnapshot(snapshot);

    // Prune old snapshots (keep 90 days)
    await this.pruneOldSnapshots(90);

    this.logger.debug(`Recorded performance snapshot for agent ${this.agentId}`);
  }

  /**
   * Calculate current improvement rate vs baseline
   */
  async calculateImprovement(): Promise<ImprovementData> {
    if (!this.baselineMetrics || this.snapshots.length === 0) {
      throw new Error('No baseline or snapshots available');
    }

    const currentMetrics = this.getCurrentMetrics();
    const daysElapsed = this.getDaysElapsed();

    // Calculate composite performance score
    const baselineScore = this.calculatePerformanceScore(this.baselineMetrics);
    const currentScore = this.calculatePerformanceScore(currentMetrics);

    const improvementRate = ((currentScore - baselineScore) / baselineScore) * 100;
    const targetAchieved = improvementRate >= (this.TARGET_IMPROVEMENT * 100);

    const improvement: ImprovementData = {
      agentId: this.agentId,
      baseline: this.baselineMetrics,
      current: currentMetrics,
      improvementRate,
      daysElapsed,
      targetAchieved
    };

    // Store improvement data
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/improvement`,
      improvement,
      { partition: 'learning' }
    );

    return improvement;
  }

  /**
   * Get improvement trend over time
   */
  async getImprovementTrend(days: number = 30): Promise<{
    timeline: { date: Date; improvementRate: number }[];
    currentRate: number;
    projected30Day: number;
  }> {
    if (!this.baselineMetrics) {
      throw new Error('No baseline available');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentSnapshots = this.snapshots.filter(
      s => s.timestamp >= cutoffDate
    );

    const baselineScore = this.calculatePerformanceScore(this.baselineMetrics);

    const timeline = recentSnapshots.map(snapshot => ({
      date: snapshot.timestamp,
      improvementRate: ((this.calculatePerformanceScore(snapshot.metrics) - baselineScore) / baselineScore) * 100
    }));

    const currentRate = timeline.length > 0 ? timeline[timeline.length - 1].improvementRate : 0;

    // Project 30-day improvement based on current trend
    const projected30Day = this.projectImprovement(timeline, 30);

    return {
      timeline,
      currentRate,
      projected30Day
    };
  }

  /**
   * Get performance metrics for a specific time period
   */
  async getMetricsForPeriod(startDate: Date, endDate: Date): Promise<PerformanceMetrics> {
    const periodSnapshots = this.snapshots.filter(
      s => s.timestamp >= startDate && s.timestamp <= endDate
    );

    if (periodSnapshots.length === 0) {
      throw new Error('No snapshots found for the specified period');
    }

    // Aggregate metrics
    const aggregated = this.aggregateMetrics(periodSnapshots.map(s => s.metrics));

    return {
      agentId: this.agentId,
      period: { start: startDate, end: endDate },
      metrics: aggregated.metrics,
      trends: this.calculateTrends(periodSnapshots)
    };
  }

  /**
   * Generate performance report
   */
  async generateReport(): Promise<{
    summary: string;
    improvement: ImprovementData;
    trends: PerformanceMetrics['trends'];
    recommendations: string[];
  }> {
    const improvement = await this.calculateImprovement();
    const currentMetrics = this.getCurrentMetrics();

    const summary = this.generateSummary(improvement);
    const recommendations = this.generateRecommendations(improvement, currentMetrics);

    return {
      summary,
      improvement,
      trends: currentMetrics.trends,
      recommendations
    };
  }

  /**
   * Calculate composite performance score
   */
  private calculatePerformanceScore(metrics: PerformanceMetrics): number {
    const weights = {
      successRate: 0.30,
      userSatisfaction: 0.25,
      executionTime: 0.20,
      errorRate: 0.15,
      resourceEfficiency: 0.10
    };

    // Normalize execution time (lower is better)
    const normalizedTime = Math.max(0, 1 - (metrics.metrics.averageExecutionTime / 60000)); // 1 min baseline

    // Normalize error rate (lower is better)
    const normalizedErrorRate = Math.max(0, 1 - metrics.metrics.errorRate);

    const score =
      metrics.metrics.successRate * weights.successRate +
      metrics.metrics.userSatisfaction * weights.userSatisfaction +
      normalizedTime * weights.executionTime +
      normalizedErrorRate * weights.errorRate +
      metrics.metrics.resourceEfficiency * weights.resourceEfficiency;

    return score;
  }

  /**
   * Aggregate metrics from multiple snapshots
   */
  private aggregateMetrics(metricsList: PerformanceMetrics[]): PerformanceMetrics {
    const count = metricsList.length;

    const aggregated = {
      tasksCompleted: metricsList.reduce((sum, m) => sum + m.metrics.tasksCompleted, 0),
      successRate: metricsList.reduce((sum, m) => sum + m.metrics.successRate, 0) / count,
      averageExecutionTime: metricsList.reduce((sum, m) => sum + m.metrics.averageExecutionTime, 0) / count,
      errorRate: metricsList.reduce((sum, m) => sum + m.metrics.errorRate, 0) / count,
      userSatisfaction: metricsList.reduce((sum, m) => sum + m.metrics.userSatisfaction, 0) / count,
      resourceEfficiency: metricsList.reduce((sum, m) => sum + m.metrics.resourceEfficiency, 0) / count
    };

    return {
      agentId: this.agentId,
      period: {
        start: metricsList[0].period.start,
        end: metricsList[metricsList.length - 1].period.end
      },
      metrics: aggregated,
      trends: []
    };
  }

  /**
   * Calculate trends from snapshots
   */
  private calculateTrends(snapshots: PerformanceSnapshot[]): PerformanceMetrics['trends'] {
    if (snapshots.length < 2) {
      return [];
    }

    const first = snapshots[0].metrics.metrics;
    const last = snapshots[snapshots.length - 1].metrics.metrics;

    const calculateTrend = (metric: string, firstValue: number, lastValue: number) => {
      const change = lastValue - firstValue;
      const changeRate = (change / firstValue) * 100;

      return {
        metric,
        direction: (change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'stable') as 'up' | 'down' | 'stable',
        changeRate
      };
    };

    return [
      calculateTrend('successRate', first.successRate, last.successRate),
      calculateTrend('averageExecutionTime', first.averageExecutionTime, last.averageExecutionTime),
      calculateTrend('errorRate', first.errorRate, last.errorRate),
      calculateTrend('userSatisfaction', first.userSatisfaction, last.userSatisfaction),
      calculateTrend('resourceEfficiency', first.resourceEfficiency, last.resourceEfficiency)
    ];
  }

  /**
   * Project future improvement based on current trend
   */
  private projectImprovement(
    timeline: { date: Date; improvementRate: number }[],
    days: number
  ): number {
    if (timeline.length < 2) {
      return 0;
    }

    // Calculate linear regression
    const n = timeline.length;
    const x = timeline.map((_, i) => i); // days index
    const y = timeline.map(t => t.improvementRate);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Project to target days
    const projectedValue = slope * days + intercept;

    return projectedValue;
  }

  /**
   * Generate summary text
   */
  private generateSummary(improvement: ImprovementData): string {
    const { improvementRate, daysElapsed, targetAchieved } = improvement;

    let summary = `Agent ${this.agentId} performance: `;

    if (targetAchieved) {
      summary += `✓ Target achieved! ${improvementRate.toFixed(1)}% improvement over ${daysElapsed} days.`;
    } else {
      summary += `${improvementRate.toFixed(1)}% improvement over ${daysElapsed} days. `;
      const remaining = (this.TARGET_IMPROVEMENT * 100) - improvementRate;
      summary += `${remaining.toFixed(1)}% improvement needed to reach 20% target.`;
    }

    return summary;
  }

  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(
    improvement: ImprovementData,
    currentMetrics: PerformanceMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Check success rate
    if (currentMetrics.metrics.successRate < 0.9) {
      recommendations.push('Focus on improving task success rate through better error handling and retry strategies');
    }

    // Check execution time
    if (currentMetrics.metrics.averageExecutionTime > 30000) {
      recommendations.push('Optimize execution time by enabling parallel processing and caching');
    }

    // Check error rate
    if (currentMetrics.metrics.errorRate > 0.1) {
      recommendations.push('Reduce error rate by implementing more robust validation and edge case handling');
    }

    // Check user satisfaction
    if (currentMetrics.metrics.userSatisfaction < 0.8) {
      recommendations.push('Improve user satisfaction by enhancing output quality and documentation');
    }

    // Check improvement rate
    if (improvement.improvementRate < 10 && improvement.daysElapsed > 15) {
      recommendations.push('Consider adjusting learning rate or exploring different strategies');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is excellent! Continue current strategies and maintain quality.');
    }

    return recommendations;
  }

  /**
   * Get current metrics (most recent snapshot)
   */
  private getCurrentMetrics(): PerformanceMetrics {
    if (this.snapshots.length === 0) {
      throw new Error('No snapshots available');
    }
    return this.snapshots[this.snapshots.length - 1].metrics;
  }

  /**
   * Get days elapsed since baseline
   */
  private getDaysElapsed(): number {
    if (!this.baselineMetrics) {
      return 0;
    }

    const now = new Date();
    const baseline = this.baselineMetrics.period.start;
    const diff = now.getTime() - baseline.getTime();
    return diff / (1000 * 60 * 60 * 24); // convert to days
  }

  /**
   * Get last snapshot timestamp
   */
  private getLastSnapshotTime(): Date | null {
    if (this.snapshots.length === 0) {
      return null;
    }
    return this.snapshots[this.snapshots.length - 1].timestamp;
  }

  /**
   * Store snapshot in memory
   */
  private async storeSnapshot(snapshot: PerformanceSnapshot): Promise<void> {
    const key = `phase2/learning/${this.agentId}/snapshots/${snapshot.timestamp.getTime()}`;
    await this.memoryStore.store(key, snapshot, { partition: 'learning' });
  }

  /**
   * Store baseline metrics
   */
  private async storeBaseline(baseline: PerformanceMetrics): Promise<void> {
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/baseline`,
      baseline,
      { partition: 'learning' }
    );
  }

  /**
   * Deserialize PerformanceMetrics from stored data
   * JSON serialization converts Date objects to ISO strings, so we need to convert them back
   */
  private deserializeMetrics(data: unknown): PerformanceMetrics {
    const metrics = data as PerformanceMetrics;
    return {
      ...metrics,
      period: {
        start: new Date(metrics.period.start),
        end: new Date(metrics.period.end)
      }
    };
  }

  /**
   * Deserialize PerformanceSnapshot from stored data
   */
  private deserializeSnapshot(data: unknown): PerformanceSnapshot {
    const snapshot = data as PerformanceSnapshot;
    return {
      timestamp: new Date(snapshot.timestamp),
      metrics: this.deserializeMetrics(snapshot.metrics)
    };
  }

  /**
   * Load snapshots from memory
   */
  private async loadSnapshots(): Promise<void> {
    try {
      // Load baseline
      const baseline = await this.memoryStore.retrieve(
        `phase2/learning/${this.agentId}/baseline`,
        { partition: 'learning' }
      );
      if (baseline) {
        this.baselineMetrics = this.deserializeMetrics(baseline);
      }

      // Load snapshots (query pattern)
      const snapshotEntries = await this.memoryStore.query(
        `phase2/learning/${this.agentId}/snapshots/%`,
        { partition: 'learning' }
      );

      this.snapshots = snapshotEntries
        .map(entry => this.deserializeSnapshot(entry.value))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      this.logger.info(`Loaded ${this.snapshots.length} performance snapshots`);
    } catch (error) {
      this.logger.warn('No previous performance data found, starting fresh');
    }
  }

  /**
   * Prune old snapshots
   */
  private async pruneOldSnapshots(keepDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter(s => s.timestamp >= cutoffDate);
    const after = this.snapshots.length;

    if (before > after) {
      this.logger.info(`Pruned ${before - after} old snapshots`);
    }
  }

  /**
   * Get total snapshots count
   */
  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  /**
   * Get baseline metrics
   */
  getBaseline(): PerformanceMetrics | undefined {
    return this.baselineMetrics;
  }
}
