/**
 * MetricsAggregator - Unified Metrics Collection and Analysis
 *
 * Collects metrics from all swarm components, provides trend analysis,
 * anomaly detection, and performance recommendations.
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger.js';

/**
 * Metric source components
 */
export type MetricSource =
  | 'swarm'
  | 'optimizer'
  | 'orchestrator'
  | 'scheduler'
  | 'memory'
  | 'transport'
  | 'recovery'
  | 'agent';

/**
 * Metric types
 */
export type MetricType =
  | 'counter'
  | 'gauge'
  | 'histogram'
  | 'summary';

/**
 * Individual metric point
 */
export interface MetricPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  source: MetricSource;
  description: string;
  unit?: string;
  labels?: string[];
}

/**
 * Metric with history
 */
export interface Metric extends MetricDefinition {
  points: MetricPoint[];
  current: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
}

/**
 * Aggregated metrics snapshot
 */
export interface MetricsSnapshot {
  timestamp: Date;
  metrics: Record<string, Metric>;
  sources: Record<MetricSource, Record<string, number>>;
  summary: MetricsSummary;
}

/**
 * Metrics summary
 */
export interface MetricsSummary {
  totalMetrics: number;
  activeMetrics: number;
  totalDataPoints: number;
  oldestDataPoint: Date;
  newestDataPoint: Date;
  uptimeSeconds: number;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  metricName: string;
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  changeRate: number; // per second
  percentChange: number;
  confidence: number;
  forecast: number; // predicted value
  anomalyScore: number; // 0-1, higher = more anomalous
}

/**
 * Anomaly detection result
 */
export interface Anomaly {
  timestamp: Date;
  metricName: string;
  value: number;
  expectedRange: { min: number; max: number };
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

/**
 * Performance recommendation
 */
export interface Recommendation {
  timestamp: Date;
  category: 'optimization' | 'scaling' | 'configuration' | 'alert';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  metrics: string[];
  suggestedAction: string;
}

/**
 * Aggregator configuration
 */
export interface MetricsAggregatorConfig {
  /** Maximum history points per metric */
  maxHistoryPoints: number;
  /** Retention period in milliseconds */
  retentionPeriod: number;
  /** Aggregation interval in milliseconds */
  aggregationInterval: number;
  /** Enable anomaly detection */
  enableAnomalyDetection: boolean;
  /** Anomaly detection sensitivity (0-1) */
  anomalySensitivity: number;
  /** Enable trend analysis */
  enableTrendAnalysis: boolean;
  /** Trend window in milliseconds */
  trendWindow: number;
  /** Enable recommendations */
  enableRecommendations: boolean;
}

/**
 * Metrics Aggregator Implementation
 */
export class MetricsAggregator extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: MetricsAggregatorConfig;

  private metrics: Map<string, Metric> = new Map();
  private definitions: Map<string, MetricDefinition> = new Map();
  private anomalies: Anomaly[] = [];
  private recommendations: Recommendation[] = [];
  private startTime: Date = new Date();

  private aggregationTimer?: NodeJS.Timeout;

  constructor(config?: Partial<MetricsAggregatorConfig>) {
    super();

    this.logger = Logger.getInstance();
    this.config = {
      maxHistoryPoints: 1000,
      retentionPeriod: 86400000, // 24 hours
      aggregationInterval: 60000, // 1 minute
      enableAnomalyDetection: true,
      anomalySensitivity: 0.7,
      enableTrendAnalysis: true,
      trendWindow: 300000, // 5 minutes
      enableRecommendations: true,
      ...config,
    };

    this.initializeDefaultMetrics();
  }

  /**
   * Start the aggregator
   */
  start(): void {
    this.aggregationTimer = setInterval(() => {
      this.aggregate();
    }, this.config.aggregationInterval);

    this.emit('started');
    this.logger.info('MetricsAggregator started');
  }

  /**
   * Stop the aggregator
   */
  stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }
    this.emit('stopped');
    this.logger.info('MetricsAggregator stopped');
  }

  /**
   * Register a metric definition
   */
  registerMetric(definition: MetricDefinition): void {
    this.definitions.set(definition.name, definition);

    if (!this.metrics.has(definition.name)) {
      this.metrics.set(definition.name, {
        ...definition,
        points: [],
        current: 0,
        min: Infinity,
        max: -Infinity,
        avg: 0,
        sum: 0,
        count: 0,
      });
    }
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, labels?: Record<string, string>): void {
    let metric = this.metrics.get(name);

    if (!metric) {
      // Auto-register if not exists
      const definition: MetricDefinition = {
        name,
        type: 'gauge',
        source: 'swarm',
        description: `Auto-registered metric: ${name}`,
      };
      this.registerMetric(definition);
      metric = this.metrics.get(name)!;
    }

    const point: MetricPoint = {
      timestamp: new Date(),
      value,
      labels,
    };

    metric.points.push(point);
    metric.current = value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.sum += value;
    metric.count++;
    metric.avg = metric.sum / metric.count;

    // Prune old points
    this.pruneMetricHistory(metric);

    // Check for anomalies
    if (this.config.enableAnomalyDetection) {
      this.checkForAnomaly(metric, point);
    }

    this.emit('metric:recorded', { name, value, labels });
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, delta: number = 1, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    const currentValue = metric?.current || 0;
    this.record(name, currentValue + delta, labels);
  }

  /**
   * Get current metric value
   */
  get(name: string): number | undefined {
    return this.metrics.get(name)?.current;
  }

  /**
   * Get metric with full history
   */
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, Metric> {
    return new Map(this.metrics);
  }

  /**
   * Get metrics by source
   */
  getMetricsBySource(source: MetricSource): Map<string, Metric> {
    const filtered = new Map<string, Metric>();
    for (const [name, metric] of this.metrics) {
      if (metric.source === source) {
        filtered.set(name, metric);
      }
    }
    return filtered;
  }

  /**
   * Get metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const metrics: Record<string, Metric> = {};
    const sources: Record<MetricSource, Record<string, number>> = {
      swarm: {},
      optimizer: {},
      orchestrator: {},
      scheduler: {},
      memory: {},
      transport: {},
      recovery: {},
      agent: {},
    };

    let totalDataPoints = 0;
    let oldestPoint = new Date();
    let newestPoint = new Date(0);
    let activeMetrics = 0;

    for (const [name, metric] of this.metrics) {
      metrics[name] = metric;
      sources[metric.source][name] = metric.current;
      totalDataPoints += metric.points.length;

      if (metric.points.length > 0) {
        activeMetrics++;
        const first = metric.points[0].timestamp;
        const last = metric.points[metric.points.length - 1].timestamp;

        if (first < oldestPoint) oldestPoint = first;
        if (last > newestPoint) newestPoint = last;
      }
    }

    return {
      timestamp: new Date(),
      metrics,
      sources,
      summary: {
        totalMetrics: this.metrics.size,
        activeMetrics,
        totalDataPoints,
        oldestDataPoint: oldestPoint,
        newestDataPoint: newestPoint,
        uptimeSeconds: (Date.now() - this.startTime.getTime()) / 1000,
      },
    };
  }

  /**
   * Analyze trend for a metric
   */
  analyzeTrend(metricName: string): TrendAnalysis | null {
    const metric = this.metrics.get(metricName);
    if (!metric || metric.points.length < 3) return null;

    const windowStart = Date.now() - this.config.trendWindow;
    const recentPoints = metric.points.filter(p => p.timestamp.getTime() > windowStart);

    if (recentPoints.length < 3) return null;

    // Calculate linear regression
    const n = recentPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const baseTime = recentPoints[0].timestamp.getTime();

    for (let i = 0; i < n; i++) {
      const x = (recentPoints[i].timestamp.getTime() - baseTime) / 1000; // seconds
      const y = recentPoints[i].value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    let ssTotal = 0, ssResidual = 0;

    for (let i = 0; i < n; i++) {
      const x = (recentPoints[i].timestamp.getTime() - baseTime) / 1000;
      const y = recentPoints[i].value;
      const predicted = slope * x + intercept;
      ssTotal += Math.pow(y - yMean, 2);
      ssResidual += Math.pow(y - predicted, 2);
    }

    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

    // Determine direction
    let direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    const threshold = Math.abs(yMean * 0.01); // 1% of mean

    if (Math.abs(slope) < threshold) {
      direction = rSquared < 0.5 ? 'volatile' : 'stable';
    } else {
      direction = slope > 0 ? 'increasing' : 'decreasing';
    }

    // Calculate percent change
    const firstValue = recentPoints[0].value;
    const lastValue = recentPoints[n - 1].value;
    const percentChange = firstValue !== 0
      ? ((lastValue - firstValue) / firstValue) * 100
      : 0;

    // Forecast next value
    const futureX = (Date.now() - baseTime) / 1000 + 60; // 1 minute ahead
    const forecast = slope * futureX + intercept;

    // Calculate anomaly score
    const stdDev = this.calculateStdDev(recentPoints.map(p => p.value));
    const anomalyScore = stdDev > 0
      ? Math.min(1, Math.abs(lastValue - yMean) / (3 * stdDev))
      : 0;

    return {
      metricName,
      direction,
      changeRate: slope,
      percentChange,
      confidence: rSquared,
      forecast,
      anomalyScore,
    };
  }

  /**
   * Get detected anomalies
   */
  getAnomalies(limit?: number): Anomaly[] {
    const sorted = [...this.anomalies].reverse();
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get recommendations
   */
  getRecommendations(limit?: number): Recommendation[] {
    const sorted = [...this.recommendations].reverse();
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Generate recommendations based on current metrics
   */
  generateRecommendations(): Recommendation[] {
    if (!this.config.enableRecommendations) return [];

    const newRecommendations: Recommendation[] = [];

    // Check for high error rates
    const errorRate = this.get('swarm.error_rate');
    if (errorRate !== undefined && errorRate > 0.1) {
      newRecommendations.push({
        timestamp: new Date(),
        category: 'alert',
        priority: errorRate > 0.3 ? 'critical' : 'high',
        title: 'High Error Rate Detected',
        description: `Error rate is ${(errorRate * 100).toFixed(1)}%, exceeding threshold`,
        metrics: ['swarm.error_rate'],
        suggestedAction: 'Review recent errors and consider enabling circuit breakers',
      });
    }

    // Check for queue pressure
    const queueDepth = this.get('scheduler.queue_depth');
    const queueCapacity = this.get('scheduler.queue_capacity') || 1000;
    if (queueDepth !== undefined && queueDepth / queueCapacity > 0.8) {
      newRecommendations.push({
        timestamp: new Date(),
        category: 'scaling',
        priority: 'high',
        title: 'High Queue Pressure',
        description: `Queue is at ${((queueDepth / queueCapacity) * 100).toFixed(1)}% capacity`,
        metrics: ['scheduler.queue_depth', 'scheduler.queue_capacity'],
        suggestedAction: 'Consider scaling up agents or reducing task intake',
      });
    }

    // Check for memory usage
    const memoryUsage = this.get('memory.usage_bytes');
    if (memoryUsage !== undefined && memoryUsage > 1000000000) { // 1GB
      newRecommendations.push({
        timestamp: new Date(),
        category: 'optimization',
        priority: 'medium',
        title: 'High Memory Usage',
        description: `Memory usage is ${(memoryUsage / 1000000000).toFixed(2)}GB`,
        metrics: ['memory.usage_bytes'],
        suggestedAction: 'Consider clearing caches or optimizing memory allocation',
      });
    }

    // Store and emit
    for (const rec of newRecommendations) {
      this.recommendations.push(rec);
      this.emit('recommendation', rec);
    }

    // Keep only recent recommendations
    if (this.recommendations.length > 100) {
      this.recommendations = this.recommendations.slice(-100);
    }

    return newRecommendations;
  }

  /**
   * Initialize default metric definitions
   */
  private initializeDefaultMetrics(): void {
    const defaults: MetricDefinition[] = [
      { name: 'swarm.active_agents', type: 'gauge', source: 'swarm', description: 'Number of active agents' },
      { name: 'swarm.total_tasks', type: 'counter', source: 'swarm', description: 'Total tasks processed' },
      { name: 'swarm.completed_tasks', type: 'counter', source: 'swarm', description: 'Completed tasks' },
      { name: 'swarm.failed_tasks', type: 'counter', source: 'swarm', description: 'Failed tasks' },
      { name: 'swarm.error_rate', type: 'gauge', source: 'swarm', description: 'Error rate (0-1)' },
      { name: 'swarm.throughput', type: 'gauge', source: 'swarm', description: 'Tasks per second', unit: 'tps' },
      { name: 'scheduler.queue_depth', type: 'gauge', source: 'scheduler', description: 'Current queue depth' },
      { name: 'scheduler.queue_capacity', type: 'gauge', source: 'scheduler', description: 'Queue capacity' },
      { name: 'scheduler.wait_time_avg', type: 'gauge', source: 'scheduler', description: 'Average wait time', unit: 'ms' },
      { name: 'memory.usage_bytes', type: 'gauge', source: 'memory', description: 'Memory usage', unit: 'bytes' },
      { name: 'memory.backend_health', type: 'gauge', source: 'memory', description: 'Backend health (0-1)' },
      { name: 'recovery.circuit_breakers_open', type: 'gauge', source: 'recovery', description: 'Open circuit breakers' },
      { name: 'recovery.total_recoveries', type: 'counter', source: 'recovery', description: 'Total recovery attempts' },
      { name: 'transport.latency_p95', type: 'gauge', source: 'transport', description: 'P95 latency', unit: 'ms' },
      { name: 'optimizer.recommendations', type: 'counter', source: 'optimizer', description: 'Optimization recommendations' },
    ];

    for (const def of defaults) {
      this.registerMetric(def);
    }
  }

  /**
   * Prune old metric history
   */
  private pruneMetricHistory(metric: Metric): void {
    const cutoff = Date.now() - this.config.retentionPeriod;

    // Remove old points
    metric.points = metric.points.filter(p => p.timestamp.getTime() > cutoff);

    // Limit to max history points
    if (metric.points.length > this.config.maxHistoryPoints) {
      metric.points = metric.points.slice(-this.config.maxHistoryPoints);
    }
  }

  /**
   * Check for anomaly in metric
   */
  private checkForAnomaly(metric: Metric, point: MetricPoint): void {
    if (metric.points.length < 10) return;

    const values = metric.points.slice(-100).map(p => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = this.calculateStdDev(values);

    // Z-score threshold based on sensitivity
    const threshold = 3 * (1 - this.config.anomalySensitivity + 0.3);
    const zScore = stdDev > 0 ? Math.abs(point.value - mean) / stdDev : 0;

    if (zScore > threshold) {
      const severity = zScore > 4 ? 'critical' : zScore > 3.5 ? 'high' : zScore > 3 ? 'medium' : 'low';

      const anomaly: Anomaly = {
        timestamp: point.timestamp,
        metricName: metric.name,
        value: point.value,
        expectedRange: {
          min: mean - (2 * stdDev),
          max: mean + (2 * stdDev),
        },
        severity,
        description: `Value ${point.value.toFixed(2)} is ${zScore.toFixed(1)} standard deviations from mean`,
      };

      this.anomalies.push(anomaly);

      // Keep only recent anomalies
      if (this.anomalies.length > 1000) {
        this.anomalies = this.anomalies.slice(-1000);
      }

      this.emit('anomaly', anomaly);
    }
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Aggregate metrics (called periodically)
   */
  private aggregate(): void {
    // Prune all metrics
    for (const metric of this.metrics.values()) {
      this.pruneMetricHistory(metric);
    }

    // Generate trend analysis for key metrics
    if (this.config.enableTrendAnalysis) {
      for (const name of ['swarm.error_rate', 'swarm.throughput', 'scheduler.queue_depth']) {
        const trend = this.analyzeTrend(name);
        if (trend) {
          this.emit('trend', trend);
        }
      }
    }

    // Generate recommendations
    if (this.config.enableRecommendations) {
      this.generateRecommendations();
    }

    this.emit('aggregation:complete', {
      timestamp: new Date(),
      metricsCount: this.metrics.size,
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.metrics.clear();
    this.definitions.clear();
    this.anomalies = [];
    this.recommendations = [];
  }
}

/**
 * Default aggregator instance
 */
let defaultAggregator: MetricsAggregator | null = null;

/**
 * Get default aggregator
 */
export function getMetricsAggregator(
  config?: Partial<MetricsAggregatorConfig>
): MetricsAggregator {
  if (!defaultAggregator) {
    defaultAggregator = new MetricsAggregator(config);
  }
  return defaultAggregator;
}

/**
 * Reset default aggregator (for testing)
 */
export function resetMetricsAggregator(): void {
  if (defaultAggregator) {
    defaultAggregator.destroy();
    defaultAggregator = null;
  }
}
