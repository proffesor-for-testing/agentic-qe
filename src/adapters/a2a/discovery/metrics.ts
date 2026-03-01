/**
 * A2A Discovery Metrics Collector
 *
 * Provides Prometheus-style metrics collection for agent discovery,
 * hot-reload, and health checking operations.
 *
 * @module adapters/a2a/discovery/metrics
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Labels for metric tagging
 */
export type MetricLabels = Record<string, string>;

/**
 * Discovery metrics interface
 */
export interface DiscoveryMetrics {
  /** Number of registered agents */
  readonly agentsRegistered: number;
  /** Agents by domain */
  readonly agentsByDomain: Map<string, number>;
  /** Registration event counts */
  readonly registrationEvents: {
    readonly add: number;
    readonly remove: number;
    readonly update: number;
  };
  /** Cache hit count */
  readonly cacheHits: number;
  /** Cache miss count */
  readonly cacheMisses: number;
  /** File watcher event count */
  readonly fileWatcherEvents: number;
}

/**
 * Internal metric entry
 */
interface MetricEntry {
  name: string;
  type: MetricType;
  help: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

/**
 * Histogram bucket
 */
interface HistogramBucket {
  le: number;
  count: number;
}

/**
 * Histogram metric data
 */
interface HistogramData {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorConfig {
  /** Prefix for all metric names */
  readonly prefix?: string;
  /** Default labels to add to all metrics */
  readonly defaultLabels?: MetricLabels;
  /** Enable timestamps in output */
  readonly includeTimestamps?: boolean;
  /** Histogram buckets for latency metrics */
  readonly histogramBuckets?: number[];
}

/**
 * Default configuration
 */
export const DEFAULT_METRICS_CONFIG: Required<MetricsCollectorConfig> = {
  prefix: 'aqe_discovery',
  defaultLabels: {},
  includeTimestamps: true,
  histogramBuckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
};

// ============================================================================
// Metrics Collector Class
// ============================================================================

/**
 * Metrics Collector
 *
 * Collects and exports Prometheus-style metrics for agent discovery operations.
 * Supports counters, gauges, and histograms with arbitrary labels.
 */
export class MetricsCollector {
  private readonly config: Required<MetricsCollectorConfig>;
  private readonly counters: Map<string, MetricEntry> = new Map();
  private readonly gauges: Map<string, MetricEntry> = new Map();
  private readonly histograms: Map<string, HistogramData> = new Map();
  private readonly metricHelp: Map<string, string> = new Map();

  constructor(config: MetricsCollectorConfig = {}) {
    this.config = {
      ...DEFAULT_METRICS_CONFIG,
      ...config,
    };

    // Register default metrics
    this.registerDefaultMetrics();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Increment a counter
   */
  increment(metric: string, labels: MetricLabels = {}, value = 1): void {
    const key = this.buildKey(metric, labels);
    const fullName = this.buildFullName(metric);
    const mergedLabels = this.mergeLabels(labels);

    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
      existing.timestamp = Date.now();
    } else {
      this.counters.set(key, {
        name: fullName,
        type: 'counter',
        help: this.metricHelp.get(metric) ?? `Counter for ${metric}`,
        value,
        labels: mergedLabels,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Set a gauge value
   */
  gauge(metric: string, value: number, labels: MetricLabels = {}): void {
    const key = this.buildKey(metric, labels);
    const fullName = this.buildFullName(metric);
    const mergedLabels = this.mergeLabels(labels);

    this.gauges.set(key, {
      name: fullName,
      type: 'gauge',
      help: this.metricHelp.get(metric) ?? `Gauge for ${metric}`,
      value,
      labels: mergedLabels,
      timestamp: Date.now(),
    });
  }

  /**
   * Observe a histogram value
   */
  observe(metric: string, value: number, labels: MetricLabels = {}): void {
    const key = this.buildKey(metric, labels);

    let histogram = this.histograms.get(key);
    if (!histogram) {
      histogram = {
        buckets: this.config.histogramBuckets.map((le) => ({ le, count: 0 })),
        sum: 0,
        count: 0,
      };
      this.histograms.set(key, histogram);
    }

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
    histogram.sum += value;
    histogram.count++;
  }

  /**
   * Get the current value of a counter
   */
  getCounter(metric: string, labels: MetricLabels = {}): number {
    const key = this.buildKey(metric, labels);
    return this.counters.get(key)?.value ?? 0;
  }

  /**
   * Get the current value of a gauge
   */
  getGauge(metric: string, labels: MetricLabels = {}): number {
    const key = this.buildKey(metric, labels);
    return this.gauges.get(key)?.value ?? 0;
  }

  /**
   * Get histogram data
   */
  getHistogram(metric: string, labels: MetricLabels = {}): HistogramData | null {
    const key = this.buildKey(metric, labels);
    return this.histograms.get(key) ?? null;
  }

  /**
   * Register a metric with help text
   */
  register(metric: string, help: string): void {
    this.metricHelp.set(metric, help);
  }

  /**
   * Get all metrics in Prometheus exposition format
   */
  getMetrics(): string {
    const lines: string[] = [];

    // Output counters
    const countersByName = this.groupByName(this.counters);
    for (const [name, entries] of countersByName) {
      const help = entries[0]?.help ?? '';
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const entry of entries) {
        lines.push(this.formatMetricLine(entry));
      }
    }

    // Output gauges
    const gaugesByName = this.groupByName(this.gauges);
    for (const [name, entries] of gaugesByName) {
      const help = entries[0]?.help ?? '';
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const entry of entries) {
        lines.push(this.formatMetricLine(entry));
      }
    }

    // Output histograms
    for (const [key, histogram] of this.histograms) {
      const [metric] = key.split('{');
      const fullName = this.buildFullName(metric);
      const help = this.metricHelp.get(metric) ?? `Histogram for ${metric}`;

      lines.push(`# HELP ${fullName} ${help}`);
      lines.push(`# TYPE ${fullName} histogram`);

      for (const bucket of histogram.buckets) {
        lines.push(`${fullName}_bucket{le="${bucket.le}"} ${bucket.count}`);
      }
      lines.push(`${fullName}_bucket{le="+Inf"} ${histogram.count}`);
      lines.push(`${fullName}_sum ${histogram.sum}`);
      lines.push(`${fullName}_count ${histogram.count}`);
    }

    return lines.join('\n');
  }

  /**
   * Get discovery-specific metrics summary
   */
  getDiscoveryMetrics(): DiscoveryMetrics {
    const agentsByDomain = new Map<string, number>();

    // Extract domain counts from gauges
    for (const [key, entry] of this.gauges) {
      if (key.includes('agents_by_domain')) {
        const domain = entry.labels.domain ?? 'unknown';
        agentsByDomain.set(domain, entry.value);
      }
    }

    return {
      agentsRegistered: this.getGauge('agents.registered'),
      agentsByDomain,
      registrationEvents: {
        add: this.getCounter('registration.add'),
        remove: this.getCounter('registration.remove'),
        update: this.getCounter('registration.update'),
      },
      cacheHits: this.getCounter('cache.hits'),
      cacheMisses: this.getCounter('cache.misses'),
      fileWatcherEvents: this.getCounter('file-watcher.events'),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.registerDefaultMetrics();
  }

  /**
   * Reset a specific counter
   */
  resetCounter(metric: string, labels: MetricLabels = {}): void {
    const key = this.buildKey(metric, labels);
    this.counters.delete(key);
  }

  /**
   * Reset a specific gauge
   */
  resetGauge(metric: string, labels: MetricLabels = {}): void {
    const key = this.buildKey(metric, labels);
    this.gauges.delete(key);
  }

  /**
   * Get the number of registered metrics
   */
  getMetricCount(): { counters: number; gauges: number; histograms: number } {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Register default metrics
   */
  private registerDefaultMetrics(): void {
    this.register('agents.registered', 'Total number of registered agents');
    this.register('agents_by_domain', 'Number of agents per domain');
    this.register('registration.add', 'Number of agent registrations');
    this.register('registration.remove', 'Number of agent removals');
    this.register('registration.update', 'Number of agent updates');
    this.register('cache.hits', 'Number of cache hits');
    this.register('cache.misses', 'Number of cache misses');
    this.register('file-watcher.events', 'Number of file watcher events');
    this.register('hot-reload.start', 'Number of hot reload service starts');
    this.register('hot-reload.stop', 'Number of hot reload service stops');
    this.register('hot-reload.file-event', 'Number of file events processed');
    this.register('hot-reload.card-added', 'Number of agent cards added');
    this.register('hot-reload.card-updated', 'Number of agent cards updated');
    this.register('hot-reload.card-removed', 'Number of agent cards removed');
    this.register('hot-reload.platform-card-updated', 'Number of platform card updates');
    this.register('hot-reload.cache-invalidation', 'Number of cache invalidations');
    this.register('hot-reload.failures', 'Number of hot reload failures');
    this.register('hot-reload.errors', 'Number of hot reload errors');
    this.register('hot-reload.last-duration-ms', 'Duration of last hot reload in milliseconds');
    this.register('health.checks', 'Number of health checks performed');
    this.register('health.checks.success', 'Number of successful health checks');
    this.register('health.checks.failure', 'Number of failed health checks');
    this.register('health.latency', 'Health check latency in seconds');
  }

  /**
   * Build a unique key for a metric with labels
   */
  private buildKey(metric: string, labels: MetricLabels): string {
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return sortedLabels ? `${metric}{${sortedLabels}}` : metric;
  }

  /**
   * Build the full metric name with prefix
   */
  private buildFullName(metric: string): string {
    const sanitized = metric.replace(/[^a-zA-Z0-9_]/g, '_');
    return `${this.config.prefix}_${sanitized}`;
  }

  /**
   * Merge labels with defaults
   */
  private mergeLabels(labels: MetricLabels): MetricLabels {
    return {
      ...this.config.defaultLabels,
      ...labels,
    };
  }

  /**
   * Group metrics by name
   */
  private groupByName(metrics: Map<string, MetricEntry>): Map<string, MetricEntry[]> {
    const grouped = new Map<string, MetricEntry[]>();

    for (const entry of metrics.values()) {
      const existing = grouped.get(entry.name);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(entry.name, [entry]);
      }
    }

    return grouped;
  }

  /**
   * Format a metric line in Prometheus format
   */
  private formatMetricLine(entry: MetricEntry): string {
    const labelParts = Object.entries(entry.labels)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    const labels = labelParts ? `{${labelParts}}` : '';
    const timestamp = this.config.includeTimestamps ? ` ${entry.timestamp}` : '';

    return `${entry.name}${labels} ${entry.value}${timestamp}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Metrics Collector instance
 *
 * @param config - Collector configuration
 * @returns Metrics collector instance
 *
 * @example
 * ```typescript
 * const metrics = createMetricsCollector({
 *   prefix: 'aqe_discovery',
 *   defaultLabels: { environment: 'production' },
 * });
 *
 * // Increment counter
 * metrics.increment('registration.add', { domain: 'test-generation' });
 *
 * // Set gauge
 * metrics.gauge('agents.registered', 68);
 *
 * // Observe histogram
 * metrics.observe('health.latency', 0.125);
 *
 * // Get Prometheus format output
 * const output = metrics.getMetrics();
 * ```
 */
export function createMetricsCollector(config: MetricsCollectorConfig = {}): MetricsCollector {
  return new MetricsCollector(config);
}

// ============================================================================
// Singleton for Global Metrics
// ============================================================================

let globalMetrics: MetricsCollector | null = null;

/**
 * Get or create the global metrics collector
 */
export function getGlobalMetrics(): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = createMetricsCollector();
  }
  return globalMetrics;
}

/**
 * Reset the global metrics collector
 */
export function resetGlobalMetrics(): void {
  if (globalMetrics) {
    globalMetrics.reset();
  }
}
