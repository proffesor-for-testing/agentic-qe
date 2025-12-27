/**
 * Real-time Performance Monitoring
 * Streams performance metrics with live updates and alerting
 */

import { EventEmitter } from 'events';
import { SecureRandom } from '../../../utils/SecureRandom.js';

export interface PerformanceMonitorRealtimeParams {
  targets: string[];
  interval?: number;
  duration?: number;
  thresholds?: {
    latency?: number;
    cpu?: number;
    memory?: number;
    errorRate?: number;
  };
  alerting?: boolean;
  streaming?: boolean;
}

export interface RealtimeMetrics {
  timestamp: number;
  target: string;
  latency: number;
  throughput: number;
  cpu: number;
  memory: number;
  errorRate: number;
  activeConnections: number;
}

export interface Alert {
  level: 'info' | 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

export interface PerformanceMonitorRealtimeResult {
  monitoringId: string;
  status: 'active' | 'stopped';
  metrics: RealtimeMetrics[];
  alerts: Alert[];
  summary: {
    startTime: number;
    duration: number;
    dataPoints: number;
    alertsTriggered: number;
  };
  trends?: {
    target: string;
    metric: string;
    trend: 'improving' | 'stable' | 'degrading';
    changeRate: number;
  }[];
}

/**
 * Monitor performance in real-time with streaming updates
 * @deprecated Use performance_analyze_bottlenecks or performance_run_benchmark instead (Issue #115)
 */
export async function performanceMonitorRealtime(
  params: PerformanceMonitorRealtimeParams
): Promise<PerformanceMonitorRealtimeResult> {
  // DEPRECATION WARNING: This handler is deprecated in favor of Phase 3 domain tools
  console.warn('[DEPRECATED] performance_monitor_realtime is deprecated. Use performance_analyze_bottlenecks or performance_run_benchmark instead (Issue #115)');

  const {
    targets,
    interval = 1000,
    duration = 60000,
    thresholds = {
      latency: 500,
      cpu: 80,
      memory: 1000,
      errorRate: 0.01
    },
    alerting = true,
    streaming = true
  } = params;

  const monitoringId = `monitor-${Date.now()}`;
  const startTime = Date.now();
  const metrics: RealtimeMetrics[] = [];
  const alerts: Alert[] = [];

  // Create event emitter for streaming
  const emitter = new EventEmitter();

  // Start monitoring loop
  const monitoringPromise = monitorPerformance(
    monitoringId,
    targets,
    interval,
    duration,
    thresholds,
    alerting,
    metrics,
    alerts,
    emitter
  );

  // Setup streaming if enabled
  if (streaming) {
    setupStreaming(emitter);
  }

  // Wait for monitoring to complete
  await monitoringPromise;

  // Analyze trends
  const trends = analyzeTrends(metrics);

  return {
    monitoringId,
    status: 'stopped',
    metrics,
    alerts,
    summary: {
      startTime,
      duration: Date.now() - startTime,
      dataPoints: metrics.length,
      alertsTriggered: alerts.length
    },
    trends
  };
}

async function monitorPerformance(
  monitoringId: string,
  targets: string[],
  interval: number,
  duration: number,
  thresholds: any,
  alerting: boolean,
  metrics: RealtimeMetrics[],
  alerts: Alert[],
  emitter: EventEmitter
): Promise<void> {
  const endTime = Date.now() + duration;

  while (Date.now() < endTime) {
    for (const target of targets) {
      const metric = await collectRealtimeMetrics(target);
      metrics.push(metric);

      // Emit metric for streaming
      emitter.emit('metric', metric);

      // Check thresholds and generate alerts
      if (alerting) {
        const newAlerts = checkThresholds(metric, thresholds);
        alerts.push(...newAlerts);

        newAlerts.forEach(alert => {
          emitter.emit('alert', alert);
        });
      }
    }

    // Wait for next interval
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  emitter.emit('complete', { monitoringId });
}

async function collectRealtimeMetrics(target: string): Promise<RealtimeMetrics> {
  // Simulate real-time metric collection
  return {
    timestamp: Date.now(),
    target,
    latency: SecureRandom.randomFloat() * 200 + 50, // 50-250ms
    throughput: SecureRandom.randomFloat() * 500 + 200, // 200-700 req/s
    cpu: SecureRandom.randomFloat() * 60 + 20, // 20-80%
    memory: SecureRandom.randomFloat() * 400 + 100, // 100-500 MB
    errorRate: SecureRandom.randomFloat() * 0.02, // 0-2%
    activeConnections: Math.floor(SecureRandom.randomFloat() * 100) + 10 // 10-110
  };
}

function checkThresholds(metric: RealtimeMetrics, thresholds: any): Alert[] {
  const alerts: Alert[] = [];

  // Check latency
  if (thresholds.latency && metric.latency > thresholds.latency) {
    alerts.push({
      level: metric.latency > thresholds.latency * 1.5 ? 'critical' : 'warning',
      metric: 'latency',
      value: metric.latency,
      threshold: thresholds.latency,
      message: `Latency exceeded threshold: ${metric.latency.toFixed(2)}ms > ${thresholds.latency}ms`,
      timestamp: metric.timestamp
    });
  }

  // Check CPU
  if (thresholds.cpu && metric.cpu > thresholds.cpu) {
    alerts.push({
      level: metric.cpu > thresholds.cpu * 1.2 ? 'critical' : 'warning',
      metric: 'cpu',
      value: metric.cpu,
      threshold: thresholds.cpu,
      message: `CPU usage exceeded threshold: ${metric.cpu.toFixed(2)}% > ${thresholds.cpu}%`,
      timestamp: metric.timestamp
    });
  }

  // Check memory
  if (thresholds.memory && metric.memory > thresholds.memory) {
    alerts.push({
      level: metric.memory > thresholds.memory * 1.3 ? 'critical' : 'warning',
      metric: 'memory',
      value: metric.memory,
      threshold: thresholds.memory,
      message: `Memory usage exceeded threshold: ${metric.memory.toFixed(2)}MB > ${thresholds.memory}MB`,
      timestamp: metric.timestamp
    });
  }

  // Check error rate
  if (thresholds.errorRate && metric.errorRate > thresholds.errorRate) {
    alerts.push({
      level: 'critical',
      metric: 'errorRate',
      value: metric.errorRate,
      threshold: thresholds.errorRate,
      message: `Error rate exceeded threshold: ${(metric.errorRate * 100).toFixed(2)}% > ${(thresholds.errorRate * 100).toFixed(2)}%`,
      timestamp: metric.timestamp
    });
  }

  return alerts;
}

function setupStreaming(emitter: EventEmitter): void {
  emitter.on('metric', (metric: RealtimeMetrics) => {
    // In real implementation, this would stream to a monitoring dashboard
    console.log(`[STREAM] ${metric.target}: latency=${metric.latency.toFixed(2)}ms, cpu=${metric.cpu.toFixed(2)}%`);
  });

  emitter.on('alert', (alert: Alert) => {
    console.log(`[ALERT ${alert.level.toUpperCase()}] ${alert.message}`);
  });

  emitter.on('complete', (data: any) => {
    console.log(`[STREAM] Monitoring ${data.monitoringId} completed`);
  });
}

function analyzeTrends(
  metrics: RealtimeMetrics[]
): PerformanceMonitorRealtimeResult['trends'] {
  if (metrics.length < 10) {
    return [];
  }

  const targets = [...new Set(metrics.map(m => m.target))];
  const trends: any[] = [];

  targets.forEach(target => {
    const targetMetrics = metrics.filter(m => m.target === target);

    ['latency', 'cpu', 'memory', 'errorRate'].forEach(metricName => {
      const trend = calculateTrend(targetMetrics, metricName as keyof RealtimeMetrics);
      trends.push({
        target,
        metric: metricName,
        trend: trend.direction,
        changeRate: trend.changeRate
      });
    });
  });

  return trends;
}

function calculateTrend(
  metrics: RealtimeMetrics[],
  metricName: keyof RealtimeMetrics
): { direction: 'improving' | 'stable' | 'degrading'; changeRate: number } {
  const values = metrics.map(m => m[metricName] as number);

  // Simple linear regression to detect trend
  const n = values.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const changeRate = Math.abs(slope);

  let direction: 'improving' | 'stable' | 'degrading';

  // For most metrics, negative slope is good (except throughput)
  if (metricName === 'throughput') {
    direction = slope > 0.1 ? 'improving' : slope < -0.1 ? 'degrading' : 'stable';
  } else {
    direction = slope < -0.1 ? 'improving' : slope > 0.1 ? 'degrading' : 'stable';
  }

  return { direction, changeRate };
}
