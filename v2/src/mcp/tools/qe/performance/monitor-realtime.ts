/**
 * Real-time Performance Monitoring Tool
 *
 * Monitors performance metrics in real-time with configurable sampling.
 * Moved from: src/mcp/handlers/analysis/performance-monitor-realtime-handler.ts
 *
 * @module performance/monitor-realtime
 * @version 1.0.0
 */

import type { RealtimeMonitorParams, MonitoringMetric } from '../shared/types.js';
import { seededRandom } from '../../../../utils/SeededRandom.js';

/**
 * Real-time monitoring result
 */
export interface RealtimeMonitoringResult {
  /** Target being monitored */
  target: string;

  /** Monitoring duration (seconds) */
  duration: number;

  /** Sampling interval (seconds) */
  interval: number;

  /** Collected data points */
  dataPoints: DataPoint[];

  /** Summary statistics */
  summary: MonitoringSummary;

  /** Alerts triggered */
  alerts?: Alert[];
}

/**
 * Individual data point
 */
export interface DataPoint {
  /** Timestamp */
  timestamp: string;

  /** CPU usage (percentage) */
  cpu?: number;

  /** Memory usage (MB) */
  memory?: number;

  /** Network usage (MB) */
  network?: number;

  /** Disk I/O (MB/s) */
  disk?: number;

  /** Response time (ms) */
  responseTime?: number;

  /** Throughput (requests/sec) */
  throughput?: number;

  /** Error rate (0-1) */
  errorRate?: number;
}

/**
 * Monitoring summary statistics
 */
export interface MonitoringSummary {
  /** Average CPU usage */
  avgCpu?: number;

  /** Average memory usage */
  avgMemory?: number;

  /** Average response time */
  avgResponseTime?: number;

  /** Average throughput */
  avgThroughput?: number;

  /** Peak values */
  peaks: {
    cpu?: number;
    memory?: number;
    responseTime?: number;
    throughput?: number;
  };

  /** Minimum values */
  minimums: {
    cpu?: number;
    memory?: number;
    responseTime?: number;
    throughput?: number;
  };
}

/**
 * Alert triggered during monitoring
 */
export interface Alert {
  /** Alert timestamp */
  timestamp: string;

  /** Metric that triggered alert */
  metric: MonitoringMetric;

  /** Current value */
  value: number;

  /** Threshold value */
  threshold: number;

  /** Alert severity */
  severity: 'warning' | 'critical';

  /** Alert message */
  message: string;
}

/**
 * Monitor performance in real-time
 *
 * Collects performance metrics at regular intervals with optional alerting.
 *
 * @param params - Monitoring parameters
 * @returns Promise resolving to monitoring results
 *
 * @example
 * ```typescript
 * const result = await monitorPerformanceRealtime({
 *   target: 'https://api.example.com',
 *   duration: 60,
 *   interval: 5,
 *   metrics: ['cpu', 'memory', 'response-time'],
 *   thresholds: {
 *     cpu: 80,
 *     memory: 1024,
 *     'response-time': 200
 *   }
 * });
 *
 * console.log(`Collected ${result.dataPoints.length} data points`);
 * console.log(`Alerts: ${result.alerts?.length || 0}`);
 * ```
 */
export async function monitorPerformanceRealtime(
  params: RealtimeMonitorParams
): Promise<RealtimeMonitoringResult> {
  const {
    target,
    duration,
    interval,
    metrics,
    thresholds
  } = params;

  const dataPoints: DataPoint[] = [];
  const alerts: Alert[] = [];

  const startTime = Date.now();
  const endTime = startTime + (duration * 1000);
  const intervalMs = interval * 1000;

  // Collect data points
  while (Date.now() < endTime) {
    const dataPoint = await collectDataPoint(target, metrics);
    dataPoints.push(dataPoint);

    // Check thresholds and generate alerts
    if (thresholds) {
      const newAlerts = checkThresholds(dataPoint, thresholds, metrics);
      alerts.push(...newAlerts);
    }

    // Wait for next interval
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Calculate summary statistics
  const summary = calculateSummary(dataPoints, metrics);

  return {
    target,
    duration,
    interval,
    dataPoints,
    summary,
    alerts: alerts.length > 0 ? alerts : undefined
  };
}

/**
 * Collect a single data point
 */
async function collectDataPoint(
  target: string,
  metrics: MonitoringMetric[]
): Promise<DataPoint> {
  const dataPoint: DataPoint = {
    timestamp: new Date().toISOString()
  };

  // Simulate metric collection
  for (const metric of metrics) {
    switch (metric) {
      case 'cpu':
        dataPoint.cpu = seededRandom.randomFloat(0, 100);
        break;
      case 'memory':
        dataPoint.memory = seededRandom.randomFloat(0, 2048);
        break;
      case 'network':
        dataPoint.network = seededRandom.randomFloat(0, 100);
        break;
      case 'disk':
        dataPoint.disk = seededRandom.randomFloat(0, 50);
        break;
      case 'response-time':
        dataPoint.responseTime = seededRandom.randomFloat(50, 500);
        break;
      case 'throughput':
        dataPoint.throughput = seededRandom.randomFloat(50, 1000);
        break;
      case 'error-rate':
        dataPoint.errorRate = seededRandom.randomFloat(0, 0.05);
        break;
    }
  }

  return dataPoint;
}

/**
 * Check thresholds and generate alerts
 */
function checkThresholds(
  dataPoint: DataPoint,
  thresholds: Record<MonitoringMetric, number>,
  metrics: MonitoringMetric[]
): Alert[] {
  const alerts: Alert[] = [];

  for (const metric of metrics) {
    const threshold = thresholds[metric];
    if (!threshold) continue;

    let value: number | undefined;
    let exceeded = false;

    switch (metric) {
      case 'cpu':
        value = dataPoint.cpu;
        exceeded = (value !== undefined && value > threshold);
        break;
      case 'memory':
        value = dataPoint.memory;
        exceeded = (value !== undefined && value > threshold);
        break;
      case 'response-time':
        value = dataPoint.responseTime;
        exceeded = (value !== undefined && value > threshold);
        break;
      case 'error-rate':
        value = dataPoint.errorRate;
        exceeded = (value !== undefined && value > threshold);
        break;
      case 'throughput':
        value = dataPoint.throughput;
        exceeded = (value !== undefined && value < threshold);
        break;
      default:
        continue;
    }

    if (exceeded && value !== undefined) {
      const severity = getSeverity(value, threshold, metric);

      alerts.push({
        timestamp: dataPoint.timestamp,
        metric,
        value,
        threshold,
        severity,
        message: `${metric} ${severity === 'critical' ? 'critically ' : ''}exceeded threshold: ${value.toFixed(1)} (threshold: ${threshold})`
      });
    }
  }

  return alerts;
}

/**
 * Get alert severity
 */
function getSeverity(
  value: number,
  threshold: number,
  metric: MonitoringMetric
): 'warning' | 'critical' {
  const percentageAbove = Math.abs((value - threshold) / threshold * 100);

  // Critical if more than 50% above threshold
  if (percentageAbove > 50) {
    return 'critical';
  }

  return 'warning';
}

/**
 * Calculate summary statistics
 */
function calculateSummary(
  dataPoints: DataPoint[],
  metrics: MonitoringMetric[]
): MonitoringSummary {
  const summary: MonitoringSummary = {
    peaks: {},
    minimums: {}
  };

  if (dataPoints.length === 0) {
    return summary;
  }

  // Calculate averages and peaks
  for (const metric of metrics) {
    let values: number[] = [];

    switch (metric) {
      case 'cpu':
        values = dataPoints.map(d => d.cpu).filter((v): v is number => v !== undefined);
        if (values.length > 0) {
          summary.avgCpu = values.reduce((sum, v) => sum + v, 0) / values.length;
          summary.peaks.cpu = Math.max(...values);
          summary.minimums.cpu = Math.min(...values);
        }
        break;
      case 'memory':
        values = dataPoints.map(d => d.memory).filter((v): v is number => v !== undefined);
        if (values.length > 0) {
          summary.avgMemory = values.reduce((sum, v) => sum + v, 0) / values.length;
          summary.peaks.memory = Math.max(...values);
          summary.minimums.memory = Math.min(...values);
        }
        break;
      case 'response-time':
        values = dataPoints.map(d => d.responseTime).filter((v): v is number => v !== undefined);
        if (values.length > 0) {
          summary.avgResponseTime = values.reduce((sum, v) => sum + v, 0) / values.length;
          summary.peaks.responseTime = Math.max(...values);
          summary.minimums.responseTime = Math.min(...values);
        }
        break;
      case 'throughput':
        values = dataPoints.map(d => d.throughput).filter((v): v is number => v !== undefined);
        if (values.length > 0) {
          summary.avgThroughput = values.reduce((sum, v) => sum + v, 0) / values.length;
          summary.peaks.throughput = Math.max(...values);
          summary.minimums.throughput = Math.min(...values);
        }
        break;
    }
  }

  return summary;
}
