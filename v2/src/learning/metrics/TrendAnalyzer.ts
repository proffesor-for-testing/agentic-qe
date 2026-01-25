/**
 * TrendAnalyzer - Phase 3 Trend Analysis
 *
 * Analyzes metric trends over time and provides forecasting.
 * Detects improving, stable, or declining trends.
 */

import { Logger } from '../../utils/Logger';
import { MetricValue, MetricsCollector, AggregatedMetrics } from './MetricsCollector';

/**
 * Trend direction
 */
export enum TrendDirection {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining'
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  metric: string;
  direction: TrendDirection;
  changePercentage: number;
  forecast: number;
  confidence: number;
  dataPoints: number;
}

/**
 * Time period for trend analysis
 */
export enum TrendPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

/**
 * TrendAnalyzer - Analyzes metric trends
 */
export class TrendAnalyzer {
  private readonly logger: Logger;
  private readonly metricsCollector: MetricsCollector;

  constructor(metricsCollector: MetricsCollector) {
    this.logger = Logger.getInstance();
    this.metricsCollector = metricsCollector;
  }

  /**
   * Analyze trend for a specific metric
   */
  async analyzeTrend(metricName: string, days: number = 30): Promise<TrendAnalysis> {
    const history = await this.metricsCollector.getMetricHistory(metricName, days);

    if (history.length < 2) {
      return {
        metric: metricName,
        direction: TrendDirection.STABLE,
        changePercentage: 0,
        forecast: 0,
        confidence: 0,
        dataPoints: history.length
      };
    }

    // Calculate trend using linear regression
    const { slope, intercept } = this.linearRegression(history);

    // Determine direction
    const direction = this.determineTrendDirection(slope, history);

    // Calculate change percentage
    const firstValue = history[0].value;
    const lastValue = history[history.length - 1].value;
    const changePercentage = firstValue !== 0
      ? ((lastValue - firstValue) / firstValue) * 100
      : 0;

    // Forecast next value
    const forecast = slope * history.length + intercept;

    // Calculate confidence based on R²
    const confidence = this.calculateConfidence(history, slope, intercept);

    return {
      metric: metricName,
      direction,
      changePercentage,
      forecast,
      confidence,
      dataPoints: history.length
    };
  }

  /**
   * Analyze all key metrics
   */
  async analyzeAllTrends(period: TrendPeriod = TrendPeriod.WEEKLY): Promise<TrendAnalysis[]> {
    const days = this.periodToDays(period);
    const metricNames = [
      'patternsDiscovered',
      'discoveryRate',
      'avgAccuracy',
      'avgActionability',
      'transferSuccessRate',
      'avgTimeReduction',
      'avgCoverageImprovement',
      'cycleCompletionRate',
      'errorRate'
    ];

    const trends = await Promise.all(
      metricNames.map(name => this.analyzeTrend(name, days))
    );

    return trends;
  }

  /**
   * Get trend summary for all categories
   */
  async getTrendSummary(metrics: AggregatedMetrics): Promise<{
    discovery: TrendDirection;
    quality: TrendDirection;
    transfer: TrendDirection;
    impact: TrendDirection;
    system: TrendDirection;
  }> {
    // Analyze trends for each category
    const discoveryTrend = await this.analyzeTrend('discoveryRate', 30);
    const qualityTrend = await this.analyzeTrend('avgAccuracy', 30);
    const transferTrend = await this.analyzeTrend('transferSuccessRate', 30);
    const impactTrend = await this.analyzeTrend('avgTimeReduction', 30);
    const systemTrend = await this.analyzeTrend('cycleCompletionRate', 30);

    return {
      discovery: discoveryTrend.direction,
      quality: qualityTrend.direction,
      transfer: transferTrend.direction,
      impact: impactTrend.direction,
      system: systemTrend.direction
    };
  }

  /**
   * Linear regression for trend analysis
   */
  private linearRegression(history: MetricValue[]): { slope: number; intercept: number } {
    const n = history.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = history.map(h => h.value);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Determine trend direction from slope
   */
  private determineTrendDirection(slope: number, history: MetricValue[]): TrendDirection {
    const avgValue = history.reduce((sum, h) => sum + h.value, 0) / history.length;
    const threshold = Math.abs(avgValue) * 0.05; // 5% threshold

    if (Math.abs(slope) < threshold) {
      return TrendDirection.STABLE;
    }

    return slope > 0 ? TrendDirection.IMPROVING : TrendDirection.DECLINING;
  }

  /**
   * Calculate confidence using R² (coefficient of determination)
   */
  private calculateConfidence(history: MetricValue[], slope: number, intercept: number): number {
    const n = history.length;
    const y = history.map(h => h.value);
    const yMean = y.reduce((a, b) => a + b, 0) / n;

    // Calculate R²
    let ssRes = 0; // Sum of squares of residuals
    let ssTot = 0; // Total sum of squares

    y.forEach((yi, i) => {
      const yPred = slope * i + intercept;
      ssRes += Math.pow(yi - yPred, 2);
      ssTot += Math.pow(yi - yMean, 2);
    });

    const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

    // Adjust for sample size
    const adjustedConfidence = rSquared * Math.min(n / 30, 1);

    return Math.max(0, Math.min(1, adjustedConfidence));
  }

  /**
   * Convert period to days
   */
  private periodToDays(period: TrendPeriod): number {
    switch (period) {
      case TrendPeriod.DAILY:
        return 1;
      case TrendPeriod.WEEKLY:
        return 7;
      case TrendPeriod.MONTHLY:
        return 30;
      default:
        return 7;
    }
  }

  /**
   * Get visual indicator for trend
   */
  static getTrendIndicator(direction: TrendDirection): string {
    switch (direction) {
      case TrendDirection.IMPROVING:
        return '↑';
      case TrendDirection.STABLE:
        return '→';
      case TrendDirection.DECLINING:
        return '↓';
    }
  }

  /**
   * Generate sparkline from metric history
   */
  static generateSparkline(values: number[], width: number = 10): string {
    if (values.length === 0) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) return '▂'.repeat(width);

    const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const step = Math.ceil(values.length / width);

    let sparkline = '';
    for (let i = 0; i < values.length; i += step) {
      const value = values[i];
      const normalized = (value - min) / range;
      const barIndex = Math.min(Math.floor(normalized * bars.length), bars.length - 1);
      sparkline += bars[barIndex];
    }

    return sparkline;
  }
}
