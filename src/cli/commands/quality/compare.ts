/**
 * Quality Compare Command
 * Compare quality metrics between two points
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';

export interface CompareOptions {
  database: Database;
  baseline: string;
  current: string;
}

export interface CompareResult {
  success: boolean;
  comparison: Comparison;
  deltas: MetricDelta[];
  regressions: MetricDelta[];
  improvements: MetricDelta[];
}

interface Comparison {
  baseline: string;
  current: string;
  totalMetrics: number;
  improved: number;
  regressed: number;
  stable: number;
}

interface MetricDelta {
  metric: string;
  baselineValue: number;
  currentValue: number;
  delta: number;
  percentChange: number;
  status: 'improved' | 'regressed' | 'stable';
}

/**
 * Database row for metric queries
 */
interface MetricRow {
  metric_name: string;
  metric_value: number;
  avg_value?: number;
}

export async function compare(options: CompareOptions): Promise<CompareResult> {
  const logger = Logger.getInstance();

  try {
    // Fetch baseline metrics
    const baselineMetrics = await fetchMetricsForVersion(options.database, options.baseline);

    // Fetch current metrics
    const currentMetrics = await fetchMetricsForVersion(options.database, options.current);

    // Calculate deltas
    const deltas: MetricDelta[] = [];
    const metricNames = new Set([
      ...Object.keys(baselineMetrics),
      ...Object.keys(currentMetrics)
    ]);

    for (const metricName of metricNames) {
      const baselineValue = baselineMetrics[metricName] || 0;
      const currentValue = currentMetrics[metricName] || 0;
      const delta = currentValue - baselineValue;
      const percentChange = baselineValue !== 0
        ? (delta / baselineValue) * 100
        : 0;

      let status: 'improved' | 'regressed' | 'stable';
      if (Math.abs(percentChange) < 5) {
        status = 'stable';
      } else if (isImprovement(metricName, delta)) {
        status = 'improved';
      } else {
        status = 'regressed';
      }

      deltas.push({
        metric: metricName,
        baselineValue: parseFloat(baselineValue.toFixed(2)),
        currentValue: parseFloat(currentValue.toFixed(2)),
        delta: parseFloat(delta.toFixed(2)),
        percentChange: parseFloat(percentChange.toFixed(2)),
        status
      });
    }

    // Categorize changes
    const improvements = deltas.filter(d => d.status === 'improved');
    const regressions = deltas.filter(d => d.status === 'regressed');
    const stable = deltas.filter(d => d.status === 'stable');

    const comparison: Comparison = {
      baseline: options.baseline,
      current: options.current,
      totalMetrics: deltas.length,
      improved: improvements.length,
      regressed: regressions.length,
      stable: stable.length
    };

    logger.info(`Compared ${deltas.length} metrics: ${improvements.length} improved, ${regressions.length} regressed`);

    return {
      success: true,
      comparison,
      deltas,
      regressions,
      improvements
    };

  } catch (error) {
    logger.error('Failed to compare quality:', error);
    throw error;
  }
}

async function fetchMetricsForVersion(
  database: Database,
  version: string
): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};

  try {
    // Fetch metrics tagged with this version
    const rows = await database.all<MetricRow>(`
      SELECT metric_name, AVG(metric_value) as avg_value
      FROM metrics
      WHERE tags LIKE ?
      GROUP BY metric_name
    `, [`%${version}%`]);

    for (const row of rows) {
      metrics[row.metric_name] = row.avg_value ?? 0;
    }

    // If no tagged metrics found, use most recent
    if (Object.keys(metrics).length === 0) {
      const recentRows = await database.all<MetricRow>(`
        SELECT metric_name, metric_value
        FROM metrics
        WHERE timestamp > datetime('now', '-7 days')
        GROUP BY metric_name
        HAVING MAX(timestamp)
      `);

      for (const row of recentRows) {
        metrics[row.metric_name] = row.metric_value;
      }
    }
  } catch (error) {
    // Return empty metrics on error
  }

  return metrics;
}

function isImprovement(metricName: string, delta: number): boolean {
  // Metrics where higher is better
  const higherIsBetter = [
    'coverage',
    'pass_rate',
    'reliability',
    'availability',
    'performance_score'
  ];

  // Metrics where lower is better
  const lowerIsBetter = [
    'error_rate',
    'failure_rate',
    'response_time',
    'latency',
    'defect_density'
  ];

  for (const metric of higherIsBetter) {
    if (metricName.toLowerCase().includes(metric)) {
      return delta > 0;
    }
  }

  for (const metric of lowerIsBetter) {
    if (metricName.toLowerCase().includes(metric)) {
      return delta < 0;
    }
  }

  // Default: assume higher is better
  return delta > 0;
}
