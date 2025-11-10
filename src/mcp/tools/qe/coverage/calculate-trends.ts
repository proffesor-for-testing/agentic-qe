/**
 * Coverage Trend Analysis
 * Historical coverage analysis with trend visualization and regression detection
 *
 * @module coverage-tools/calculate-trends
 */

import { SecureRandom } from '../../../../utils/SecureRandom.js';

export interface CoverageSnapshot {
  timestamp: string;
  overallCoverage: number;
  fileCoverage: Record<string, number>;
  branchCoverage: number;
  lineCoverage: number;
  functionCoverage: number;
  metadata?: {
    commit?: string;
    branch?: string;
    author?: string;
  };
}

export interface TrendCalculationParams {
  snapshots: CoverageSnapshot[];
  timeframe?: '7d' | '30d' | '90d' | 'all';
  includeVisualization?: boolean;
  detectRegressions?: boolean;
  regressionThreshold?: number; // Percentage drop to consider regression
}

export interface CoverageTrend {
  metric: 'overall' | 'branch' | 'line' | 'function';
  direction: 'increasing' | 'decreasing' | 'stable';
  changeRate: number; // Percentage change per day
  current: number;
  previous: number;
  percentageChange: number;
}

export interface Regression {
  timestamp: string;
  metric: 'overall' | 'branch' | 'line' | 'function';
  previousValue: number;
  currentValue: number;
  drop: number;
  affectedFiles: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface VisualizationData {
  labels: string[]; // Timestamps
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
  }>;
}

export interface TrendAnalysisResult {
  trends: CoverageTrend[];
  regressions: Regression[];
  summary: {
    overallTrend: 'improving' | 'declining' | 'stable';
    averageCoverage: number;
    coverageRange: {
      min: number;
      max: number;
    };
    volatility: number; // Standard deviation
  };
  visualization?: VisualizationData;
  recommendations: string[];
  timestamp: string;
}

/**
 * Filter snapshots by timeframe
 */
function filterByTimeframe(
  snapshots: CoverageSnapshot[],
  timeframe: '7d' | '30d' | '90d' | 'all'
): CoverageSnapshot[] {
  if (timeframe === 'all') {
    return snapshots;
  }

  const days = parseInt(timeframe.replace('d', ''));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return snapshots.filter(s => new Date(s.timestamp) >= cutoffDate);
}

/**
 * Calculate trend for a specific metric
 */
function calculateMetricTrend(
  values: number[],
  timestamps: Date[],
  metricName: 'overall' | 'branch' | 'line' | 'function'
): CoverageTrend {
  if (values.length < 2) {
    return {
      metric: metricName,
      direction: 'stable',
      changeRate: 0,
      current: values[0] || 0,
      previous: values[0] || 0,
      percentageChange: 0
    };
  }

  const current = values[values.length - 1];
  const previous = values[0];
  const percentageChange = ((current - previous) / previous) * 100;

  // Calculate change rate per day
  const timeDiffMs = timestamps[timestamps.length - 1].getTime() - timestamps[0].getTime();
  const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
  const changeRate = timeDiffDays > 0 ? percentageChange / timeDiffDays : 0;

  // Determine direction
  let direction: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(changeRate) < 0.1) {
    direction = 'stable';
  } else if (changeRate > 0) {
    direction = 'increasing';
  } else {
    direction = 'decreasing';
  }

  return {
    metric: metricName,
    direction,
    changeRate,
    current,
    previous,
    percentageChange
  };
}

/**
 * Detect coverage regressions
 */
function detectRegressions(
  snapshots: CoverageSnapshot[],
  threshold: number
): Regression[] {
  const regressions: Regression[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    // Check overall coverage
    const overallDrop = prev.overallCoverage - curr.overallCoverage;
    if (overallDrop > threshold) {
      // Find affected files
      const affectedFiles: string[] = [];
      for (const file in prev.fileCoverage) {
        if (curr.fileCoverage[file] < prev.fileCoverage[file]) {
          affectedFiles.push(file);
        }
      }

      const severity = overallDrop >= threshold * 3 ? 'critical'
        : overallDrop >= threshold * 2 ? 'high'
        : overallDrop >= threshold * 1.5 ? 'medium'
        : 'low';

      regressions.push({
        timestamp: curr.timestamp,
        metric: 'overall',
        previousValue: prev.overallCoverage,
        currentValue: curr.overallCoverage,
        drop: overallDrop,
        affectedFiles,
        severity
      });
    }

    // Check branch coverage
    if (prev.branchCoverage && curr.branchCoverage) {
      const branchDrop = prev.branchCoverage - curr.branchCoverage;
      if (branchDrop > threshold) {
        regressions.push({
          timestamp: curr.timestamp,
          metric: 'branch',
          previousValue: prev.branchCoverage,
          currentValue: curr.branchCoverage,
          drop: branchDrop,
          affectedFiles: [],
          severity: branchDrop >= threshold * 2 ? 'high' : 'medium'
        });
      }
    }
  }

  return regressions;
}

/**
 * Calculate volatility (standard deviation)
 */
function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Generate visualization data
 */
function generateVisualization(snapshots: CoverageSnapshot[]): VisualizationData {
  const labels = snapshots.map(s => new Date(s.timestamp).toISOString().split('T')[0]);

  const datasets = [
    {
      label: 'Overall Coverage',
      data: snapshots.map(s => s.overallCoverage * 100),
      color: '#4CAF50'
    },
    {
      label: 'Branch Coverage',
      data: snapshots.map(s => (s.branchCoverage || 0) * 100),
      color: '#2196F3'
    },
    {
      label: 'Line Coverage',
      data: snapshots.map(s => (s.lineCoverage || 0) * 100),
      color: '#FF9800'
    },
    {
      label: 'Function Coverage',
      data: snapshots.map(s => (s.functionCoverage || 0) * 100),
      color: '#9C27B0'
    }
  ];

  return { labels, datasets };
}

/**
 * Calculate coverage trends over time
 * Supports 7d, 30d, 90d historical analysis with regression detection
 */
export async function calculateTrends(
  params: TrendCalculationParams
): Promise<TrendAnalysisResult> {
  const {
    snapshots,
    timeframe = '30d',
    includeVisualization = true,
    detectRegressions: doDetectRegressions = true,
    regressionThreshold = 5 // 5% drop threshold
  } = params;

  // Filter by timeframe
  const filteredSnapshots = filterByTimeframe(snapshots, timeframe);

  if (filteredSnapshots.length === 0) {
    throw new Error('No coverage snapshots available for the specified timeframe');
  }

  // Sort by timestamp
  const sortedSnapshots = filteredSnapshots.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const timestamps = sortedSnapshots.map(s => new Date(s.timestamp));

  // Calculate trends for each metric
  const trends: CoverageTrend[] = [
    calculateMetricTrend(
      sortedSnapshots.map(s => s.overallCoverage),
      timestamps,
      'overall'
    ),
    calculateMetricTrend(
      sortedSnapshots.map(s => s.branchCoverage || 0),
      timestamps,
      'branch'
    ),
    calculateMetricTrend(
      sortedSnapshots.map(s => s.lineCoverage || 0),
      timestamps,
      'line'
    ),
    calculateMetricTrend(
      sortedSnapshots.map(s => s.functionCoverage || 0),
      timestamps,
      'function'
    )
  ];

  // Detect regressions
  const regressions = doDetectRegressions
    ? detectRegressions(sortedSnapshots, regressionThreshold / 100)
    : [];

  // Calculate summary statistics
  const overallValues = sortedSnapshots.map(s => s.overallCoverage);
  const averageCoverage = overallValues.reduce((sum, val) => sum + val, 0) / overallValues.length;
  const minCoverage = Math.min(...overallValues);
  const maxCoverage = Math.max(...overallValues);
  const volatility = calculateVolatility(overallValues);

  // Determine overall trend
  const overallTrend = trends.find(t => t.metric === 'overall');
  const overallDirection = overallTrend
    ? overallTrend.direction === 'increasing' ? 'improving'
      : overallTrend.direction === 'decreasing' ? 'declining'
      : 'stable'
    : 'stable';

  // Generate visualization data
  const visualization = includeVisualization
    ? generateVisualization(sortedSnapshots)
    : undefined;

  // Generate recommendations
  const recommendations: string[] = [];

  if (overallDirection === 'declining') {
    recommendations.push(`Coverage is declining at ${Math.abs(overallTrend?.changeRate || 0).toFixed(2)}% per day - investigate recent changes`);
  } else if (overallDirection === 'improving') {
    recommendations.push(`Coverage is improving! Maintain this momentum (+${(overallTrend?.changeRate || 0).toFixed(2)}% per day)`);
  }

  if (regressions.length > 0) {
    const criticalRegressions = regressions.filter(r => r.severity === 'critical');
    if (criticalRegressions.length > 0) {
      recommendations.push(`${criticalRegressions.length} critical coverage regression(s) detected - immediate action required`);
    } else {
      recommendations.push(`${regressions.length} coverage regression(s) detected`);
    }
  }

  if (volatility > 0.1) {
    recommendations.push(`High coverage volatility detected (${(volatility * 100).toFixed(1)}%) - consider stabilizing test suite`);
  }

  if (averageCoverage < 0.8) {
    recommendations.push(`Average coverage (${(averageCoverage * 100).toFixed(1)}%) is below 80% target`);
  }

  const branchTrend = trends.find(t => t.metric === 'branch');
  if (branchTrend && branchTrend.current < 0.7) {
    recommendations.push(`Branch coverage (${(branchTrend.current * 100).toFixed(1)}%) needs improvement - focus on conditional logic`);
  }

  return {
    trends,
    regressions,
    summary: {
      overallTrend: overallDirection,
      averageCoverage,
      coverageRange: {
        min: minCoverage,
        max: maxCoverage
      },
      volatility
    },
    visualization,
    recommendations,
    timestamp: new Date().toISOString()
  };
}
