/**
 * Metric Collectors
 * ADR-024: Self-Optimization Engine
 *
 * Collectors for gathering performance metrics used in auto-tuning.
 */

import type {
  MetricCollector,
  MetricSample,
  MetricStats,
} from './types.js';

// ============================================================================
// Base Metric Collector
// ============================================================================

/**
 * Base class for metric collectors with common functionality
 */
export abstract class BaseMetricCollector implements MetricCollector {
  protected samples: MetricSample[] = [];
  protected maxSamples: number;

  constructor(
    public readonly id: string,
    public readonly metricName: string,
    maxSamples = 1000
  ) {
    this.maxSamples = maxSamples;
  }

  /**
   * Collect a new metric sample
   */
  abstract collect(): Promise<MetricSample>;

  /**
   * Add a sample to the history
   */
  protected addSample(sample: MetricSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * Get aggregated stats for a time period
   */
  async getStats(periodMs: number): Promise<MetricStats> {
    const now = Date.now();
    const periodStart = new Date(now - periodMs);
    const periodEnd = new Date(now);

    const relevantSamples = this.samples.filter(
      s => s.timestamp >= periodStart && s.timestamp <= periodEnd
    );

    if (relevantSamples.length === 0) {
      return this.createEmptyStats(periodStart, periodEnd);
    }

    const values = relevantSamples.map(s => s.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    // Calculate standard deviation
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / count;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // Calculate percentiles
    const median = this.percentile(values, 50);
    const p95 = this.percentile(values, 95);
    const p99 = this.percentile(values, 99);

    // Calculate trend
    const trend = this.calculateTrend(relevantSamples);

    return {
      name: this.metricName,
      count,
      min: values[0],
      max: values[count - 1],
      mean,
      median,
      stdDev,
      p95,
      p99,
      trend,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Calculate percentile value
   */
  protected percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
  }

  /**
   * Calculate trend from samples
   * Note: Base implementation assumes lower values are better (e.g., latency).
   * Override in subclasses where higher is better (e.g., accuracy, quality).
   */
  protected calculateTrend(samples: MetricSample[]): 'improving' | 'stable' | 'degrading' {
    if (samples.length < 10) return 'stable';

    // Split into first and second half
    const mid = Math.floor(samples.length / 2);
    const firstHalf = samples.slice(0, mid);
    const secondHalf = samples.slice(mid);

    const firstAvg = firstHalf.reduce((a, s) => a + s.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, s) => a + s.value, 0) / secondHalf.length;

    // Guard against division by zero
    if (firstAvg === 0) {
      // If starting from zero, any increase is degrading (for latency)
      if (secondAvg > 0) return 'degrading';
      return 'stable';
    }

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (changePercent > 5) return 'degrading'; // Higher latency = worse
    if (changePercent < -5) return 'improving'; // Lower latency = better
    return 'stable';
  }

  /**
   * Create empty stats when no samples exist
   */
  protected createEmptyStats(periodStart: Date, periodEnd: Date): MetricStats {
    return {
      name: this.metricName,
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      p95: 0,
      p99: 0,
      trend: 'stable',
      periodStart,
      periodEnd,
    };
  }

  /**
   * Clear all samples
   */
  clear(): void {
    this.samples = [];
  }

  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.samples.length;
  }

  /**
   * Export samples for persistence
   */
  exportSamples(): MetricSample[] {
    return [...this.samples];
  }

  /**
   * Import samples from persistence
   */
  importSamples(samples: MetricSample[]): void {
    this.samples = samples.slice(-this.maxSamples);
  }
}

// ============================================================================
// Specific Metric Collectors
// ============================================================================

/**
 * Search latency metric collector
 * Tracks HNSW search performance
 */
export class SearchLatencyCollector extends BaseMetricCollector {
  private pendingLatencies: number[] = [];

  constructor() {
    super('search-latency', 'search_latency_ms');
  }

  /**
   * Record a search latency
   */
  recordLatency(latencyMs: number): void {
    this.pendingLatencies.push(latencyMs);
  }

  async collect(): Promise<MetricSample> {
    // Average pending latencies or use 0 if none
    const value = this.pendingLatencies.length > 0
      ? this.pendingLatencies.reduce((a, b) => a + b, 0) / this.pendingLatencies.length
      : 0;

    const sample: MetricSample = {
      name: this.metricName,
      value,
      timestamp: new Date(),
      tags: { source: 'hnsw' },
    };

    this.addSample(sample);
    this.pendingLatencies = [];

    return sample;
  }
}

/**
 * Routing accuracy metric collector
 * Tracks how often routing recommendations lead to success
 */
export class RoutingAccuracyCollector extends BaseMetricCollector {
  private outcomes: Array<{ followed: boolean; success: boolean }> = [];

  constructor() {
    super('routing-accuracy', 'routing_accuracy');
  }

  /**
   * Record a routing outcome
   */
  recordOutcome(followedRecommendation: boolean, wasSuccessful: boolean): void {
    this.outcomes.push({ followed: followedRecommendation, success: wasSuccessful });
  }

  async collect(): Promise<MetricSample> {
    // Calculate accuracy: success rate when recommendation was followed
    const followed = this.outcomes.filter(o => o.followed);
    const value = followed.length > 0
      ? followed.filter(o => o.success).length / followed.length
      : 0;

    const sample: MetricSample = {
      name: this.metricName,
      value,
      timestamp: new Date(),
      tags: { outcomes: String(this.outcomes.length) },
    };

    this.addSample(sample);
    this.outcomes = [];

    return sample;
  }

  protected override calculateTrend(samples: MetricSample[]): 'improving' | 'stable' | 'degrading' {
    // For accuracy, higher is better, so invert the logic
    if (samples.length < 10) return 'stable';

    const mid = Math.floor(samples.length / 2);
    const firstHalf = samples.slice(0, mid);
    const secondHalf = samples.slice(mid);

    const firstAvg = firstHalf.reduce((a, s) => a + s.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, s) => a + s.value, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

    if (changePercent > 5) return 'improving';
    if (changePercent < -5) return 'degrading';
    return 'stable';
  }
}

/**
 * Pattern quality metric collector
 * Tracks quality scores of patterns over time
 */
export class PatternQualityCollector extends BaseMetricCollector {
  private qualityScores: number[] = [];

  constructor() {
    super('pattern-quality', 'pattern_quality_score');
  }

  /**
   * Record a pattern quality score
   */
  recordQuality(score: number): void {
    this.qualityScores.push(score);
  }

  async collect(): Promise<MetricSample> {
    const value = this.qualityScores.length > 0
      ? this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length
      : 0;

    const sample: MetricSample = {
      name: this.metricName,
      value,
      timestamp: new Date(),
      tags: { patterns: String(this.qualityScores.length) },
    };

    this.addSample(sample);
    this.qualityScores = [];

    return sample;
  }

  protected override calculateTrend(samples: MetricSample[]): 'improving' | 'stable' | 'degrading' {
    // For quality, higher is better
    if (samples.length < 10) return 'stable';

    const mid = Math.floor(samples.length / 2);
    const firstHalf = samples.slice(0, mid);
    const secondHalf = samples.slice(mid);

    const firstAvg = firstHalf.reduce((a, s) => a + s.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, s) => a + s.value, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

    if (changePercent > 5) return 'improving';
    if (changePercent < -5) return 'degrading';
    return 'stable';
  }
}

/**
 * Test maintainability metric collector
 * Tracks maintainability scores of generated tests
 */
export class TestMaintainabilityCollector extends BaseMetricCollector {
  private maintainabilityScores: number[] = [];

  constructor() {
    super('test-maintainability', 'test_maintainability');
  }

  /**
   * Record a test maintainability score
   */
  recordMaintainability(score: number): void {
    this.maintainabilityScores.push(score);
  }

  async collect(): Promise<MetricSample> {
    const value = this.maintainabilityScores.length > 0
      ? this.maintainabilityScores.reduce((a, b) => a + b, 0) / this.maintainabilityScores.length
      : 0;

    const sample: MetricSample = {
      name: this.metricName,
      value,
      timestamp: new Date(),
      tags: { tests: String(this.maintainabilityScores.length) },
    };

    this.addSample(sample);
    this.maintainabilityScores = [];

    return sample;
  }

  protected override calculateTrend(samples: MetricSample[]): 'improving' | 'stable' | 'degrading' {
    // For maintainability, higher is better
    if (samples.length < 10) return 'stable';

    const mid = Math.floor(samples.length / 2);
    const firstHalf = samples.slice(0, mid);
    const secondHalf = samples.slice(mid);

    const firstAvg = firstHalf.reduce((a, s) => a + s.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, s) => a + s.value, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

    if (changePercent > 5) return 'improving';
    if (changePercent < -5) return 'degrading';
    return 'stable';
  }
}

// ============================================================================
// Metric Collector Registry
// ============================================================================

/**
 * Registry of all metric collectors
 */
export class MetricCollectorRegistry {
  private collectors: Map<string, MetricCollector> = new Map();

  /**
   * Register a collector
   */
  register(collector: MetricCollector): void {
    this.collectors.set(collector.metricName, collector);
  }

  /**
   * Get a collector by metric name
   */
  get(metricName: string): MetricCollector | undefined {
    return this.collectors.get(metricName);
  }

  /**
   * Get all collectors
   */
  getAll(): MetricCollector[] {
    return Array.from(this.collectors.values());
  }

  /**
   * Collect all metrics
   */
  async collectAll(): Promise<MetricSample[]> {
    const samples: MetricSample[] = [];
    for (const collector of this.collectors.values()) {
      try {
        const sample = await collector.collect();
        samples.push(sample);
      } catch (error) {
        console.error(`Failed to collect metric ${collector.metricName}:`, error);
      }
    }
    return samples;
  }

  /**
   * Get stats for all metrics
   */
  async getAllStats(periodMs: number): Promise<Map<string, MetricStats>> {
    const stats = new Map<string, MetricStats>();
    for (const collector of this.collectors.values()) {
      try {
        const stat = await collector.getStats(periodMs);
        stats.set(collector.metricName, stat);
      } catch (error) {
        console.error(`Failed to get stats for ${collector.metricName}:`, error);
      }
    }
    return stats;
  }
}

/**
 * Create default metric collector registry with all AQE collectors
 */
export function createDefaultCollectorRegistry(): MetricCollectorRegistry {
  const registry = new MetricCollectorRegistry();

  registry.register(new SearchLatencyCollector());
  registry.register(new RoutingAccuracyCollector());
  registry.register(new PatternQualityCollector());
  registry.register(new TestMaintainabilityCollector());

  return registry;
}
