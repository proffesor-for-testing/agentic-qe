/**
 * Quality Trends Command
 * Show quality metrics trends over time
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';

export interface TrendsOptions {
  database: Database;
  timeRange?: string;
}

export interface TrendsResult {
  success: boolean;
  metrics: MetricTrend[];
  timeRange: string;
  trends: Record<string, TrendDirection>;
  significantChanges: SignificantChange[];
}

interface MetricTrend {
  name: string;
  values: TimeSeriesPoint[];
  average: number;
  trend: TrendDirection;
}

interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

enum TrendDirection {
  IMPROVING = 'improving',
  DECLINING = 'declining',
  STABLE = 'stable'
}

interface SignificantChange {
  metric: string;
  change: number;
  significance: number;
  timestamp: string;
}

export async function trends(options: TrendsOptions): Promise<TrendsResult> {
  const logger = Logger.getInstance();
  const timeRange = options.timeRange || '30d';

  try {
    // Calculate time window
    const timeWindow = parseTimeRange(timeRange);
    const startTime = new Date(Date.now() - timeWindow);

    // Fetch metrics from database
    const metricsData = await options.database.all(`
      SELECT metric_name, metric_value, timestamp
      FROM metrics
      WHERE timestamp > ?
      ORDER BY metric_name, timestamp
    `, [startTime.toISOString()]);

    // Group by metric name
    const metricGroups: Record<string, TimeSeriesPoint[]> = {};

    for (const row of metricsData) {
      if (!metricGroups[row.metric_name]) {
        metricGroups[row.metric_name] = [];
      }

      metricGroups[row.metric_name].push({
        timestamp: row.timestamp,
        value: row.metric_value
      });
    }

    // Calculate trends
    const metrics: MetricTrend[] = [];
    const trendDirections: Record<string, TrendDirection> = {};

    for (const [name, values] of Object.entries(metricGroups)) {
      const average = values.reduce((sum, point) => sum + point.value, 0) / values.length;
      const trend = calculateTrend(values);

      metrics.push({
        name,
        values,
        average: parseFloat(average.toFixed(2)),
        trend
      });

      trendDirections[name] = trend;
    }

    // Identify significant changes
    const significantChanges = identifySignificantChanges(metrics);

    logger.info(`Analyzed ${metrics.length} metrics over ${timeRange}`);

    return {
      success: true,
      metrics,
      timeRange,
      trends: trendDirections,
      significantChanges
    };

  } catch (error) {
    logger.error('Failed to analyze trends:', error);
    throw error;
  }
}

function parseTimeRange(range: string): number {
  const value = parseInt(range);
  const unit = range.slice(-1);

  switch (unit) {
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 30 * 24 * 60 * 60 * 1000; // Default 30 days
  }
}

function calculateTrend(values: TimeSeriesPoint[]): TrendDirection {
  if (values.length < 2) return TrendDirection.STABLE;

  // Calculate linear regression slope
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  values.forEach((point, i) => {
    sumX += i;
    sumY += point.value;
    sumXY += i * point.value;
    sumX2 += i * i;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Threshold for significance
  const avgValue = sumY / n;
  const threshold = avgValue * 0.05; // 5% change

  if (Math.abs(slope) < threshold) return TrendDirection.STABLE;
  return slope > 0 ? TrendDirection.IMPROVING : TrendDirection.DECLINING;
}

function identifySignificantChanges(metrics: MetricTrend[]): SignificantChange[] {
  const changes: SignificantChange[] = [];

  for (const metric of metrics) {
    if (metric.values.length < 2) continue;

    // Check for significant jumps
    for (let i = 1; i < metric.values.length; i++) {
      const prev = metric.values[i - 1].value;
      const current = metric.values[i].value;
      const change = ((current - prev) / prev) * 100;

      if (Math.abs(change) > 20) { // 20% change is significant
        changes.push({
          metric: metric.name,
          change: parseFloat(change.toFixed(2)),
          significance: Math.min(Math.abs(change) / 100, 1),
          timestamp: metric.values[i].timestamp
        });
      }
    }
  }

  return changes.sort((a, b) => b.significance - a.significance).slice(0, 10);
}
