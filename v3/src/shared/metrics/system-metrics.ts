/**
 * Agentic QE v3 - System Metrics Collector
 * Collects real system metrics for chaos engineering and performance testing
 */

import * as os from 'os';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SystemMetrics {
  timestamp: Date;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  process: ProcessMetrics;
}

export interface CpuMetrics {
  usage: number; // 0-100 percentage
  loadAverage: number[];
  cores: number;
}

export interface MemoryMetrics {
  usage: number; // 0-100 percentage
  total: number; // bytes
  free: number; // bytes
  used: number; // bytes
}

export interface ProcessMetrics {
  cpuUsage: number; // 0-100 percentage
  memoryUsage: number; // 0-100 percentage
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  rss: number; // bytes
  uptime: number; // seconds
}

export interface MetricSample {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface HttpMetrics {
  responseTimeMs: number;
  statusCode: number;
  success: boolean;
}

// ============================================================================
// System Metrics Collector
// ============================================================================

export class SystemMetricsCollector {
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuTime: number = 0;
  private metricHistory: Map<string, MetricSample[]> = new Map();
  private readonly maxHistorySize: number;

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Collect current system metrics
   */
  collectSystemMetrics(): SystemMetrics {
    const cpuMetrics = this.collectCpuMetrics();
    const memoryMetrics = this.collectMemoryMetrics();
    const processMetrics = this.collectProcessMetrics();

    const metrics: SystemMetrics = {
      timestamp: new Date(),
      cpu: cpuMetrics,
      memory: memoryMetrics,
      process: processMetrics,
    };

    // Store in history
    this.recordMetric('cpu_usage', cpuMetrics.usage);
    this.recordMetric('memory_usage', memoryMetrics.usage);
    this.recordMetric('process_cpu_usage', processMetrics.cpuUsage);
    this.recordMetric('process_memory_usage', processMetrics.memoryUsage);

    return metrics;
  }

  /**
   * Collect CPU metrics
   */
  private collectCpuMetrics(): CpuMetrics {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Calculate CPU usage from all cores
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    const usage = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0;

    return {
      usage: Math.round(usage * 100) / 100,
      loadAverage,
      cores: cpus.length,
    };
  }

  /**
   * Collect memory metrics
   */
  private collectMemoryMetrics(): MemoryMetrics {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usage = (used / total) * 100;

    return {
      usage: Math.round(usage * 100) / 100,
      total,
      free,
      used,
    };
  }

  /**
   * Collect process-specific metrics
   */
  private collectProcessMetrics(): ProcessMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage ?? undefined);

    // Calculate CPU percentage
    const now = Date.now();
    const elapsedMs = this.lastCpuTime > 0 ? now - this.lastCpuTime : 1000;
    const elapsedUs = elapsedMs * 1000;

    // CPU usage is in microseconds
    const totalCpuUs = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpuUs / elapsedUs) * 100;

    // Update last values
    this.lastCpuUsage = cpuUsage;
    this.lastCpuTime = now;

    // Calculate memory percentage
    const totalMem = os.totalmem();
    const memPercent = (memUsage.rss / totalMem) * 100;

    return {
      cpuUsage: Math.min(100, Math.round(cpuPercent * 100) / 100),
      memoryUsage: Math.round(memPercent * 100) / 100,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      uptime: process.uptime(),
    };
  }

  /**
   * Get a specific metric value by name
   */
  getMetricValue(metricName: string): number {
    const metrics = this.collectSystemMetrics();

    switch (metricName) {
      case 'cpu_usage':
        return metrics.cpu.usage;
      case 'memory_usage':
        return metrics.memory.usage;
      case 'process_cpu_usage':
        return metrics.process.cpuUsage;
      case 'process_memory_usage':
        return metrics.process.memoryUsage;
      case 'heap_used':
        return metrics.process.heapUsed;
      case 'heap_total':
        return metrics.process.heapTotal;
      case 'rss':
        return metrics.process.rss;
      case 'load_average_1m':
        return metrics.cpu.loadAverage[0];
      case 'load_average_5m':
        return metrics.cpu.loadAverage[1];
      case 'load_average_15m':
        return metrics.cpu.loadAverage[2];
      default:
        // For unknown metrics, return from history or 0
        const history = this.metricHistory.get(metricName);
        return history && history.length > 0
          ? history[history.length - 1].value
          : 0;
    }
  }

  /**
   * Get metric suitable for chaos engineering context
   */
  getChaosMetricValue(metric: string): number {
    // Map chaos metric names to system metrics
    const metricMap: Record<string, () => number> = {
      'response_time_ms': () => this.getResponseTimeEstimate(),
      'error_rate': () => this.getErrorRateEstimate(),
      'throughput': () => this.getThroughputEstimate(),
      'cpu_usage': () => this.collectSystemMetrics().cpu.usage,
      'memory_usage': () => this.collectSystemMetrics().memory.usage,
      'latency_p50': () => this.getLatencyPercentile(50),
      'latency_p95': () => this.getLatencyPercentile(95),
      'latency_p99': () => this.getLatencyPercentile(99),
    };

    const getter = metricMap[metric];
    if (getter) {
      return getter();
    }

    // Try to get from stored metrics
    return this.getMetricValue(metric);
  }

  /**
   * Record a metric sample
   */
  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    const sample: MetricSample = {
      name,
      value,
      timestamp: new Date(),
      labels,
    };

    const history = this.metricHistory.get(name) || [];
    history.push(sample);

    // Trim history to max size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.metricHistory.set(name, history);
  }

  /**
   * Record HTTP response metrics
   */
  recordHttpMetrics(metrics: HttpMetrics): void {
    this.recordMetric('response_time_ms', metrics.responseTimeMs);
    this.recordMetric('http_status', metrics.statusCode);
    this.recordMetric('http_success', metrics.success ? 1 : 0);
  }

  /**
   * Get metric history
   */
  getMetricHistory(name: string, limit?: number): MetricSample[] {
    const history = this.metricHistory.get(name) || [];
    if (limit && history.length > limit) {
      return history.slice(-limit);
    }
    return [...history];
  }

  /**
   * Calculate average of a metric over recent samples
   */
  getMetricAverage(name: string, sampleCount: number = 10): number {
    const history = this.getMetricHistory(name, sampleCount);
    if (history.length === 0) return 0;

    const sum = history.reduce((acc, sample) => acc + sample.value, 0);
    return sum / history.length;
  }

  /**
   * Estimate response time based on system load
   */
  private getResponseTimeEstimate(): number {
    const cpu = this.collectSystemMetrics().cpu;
    // Base response time + load-based increase
    const baseTime = 50;
    const loadFactor = 1 + (cpu.usage / 100);
    return Math.round(baseTime * loadFactor);
  }

  /**
   * Estimate error rate based on recorded errors
   */
  private getErrorRateEstimate(): number {
    const successHistory = this.getMetricHistory('http_success', 100);
    if (successHistory.length === 0) return 0;

    const errorCount = successHistory.filter(s => s.value === 0).length;
    return errorCount / successHistory.length;
  }

  /**
   * Estimate throughput based on recorded requests
   */
  private getThroughputEstimate(): number {
    const history = this.getMetricHistory('response_time_ms', 100);
    if (history.length < 2) return 1000;

    // Calculate requests per second based on timestamps
    const oldest = history[0].timestamp.getTime();
    const newest = history[history.length - 1].timestamp.getTime();
    const durationSec = (newest - oldest) / 1000;

    if (durationSec <= 0) return 1000;
    return Math.round(history.length / durationSec);
  }

  /**
   * Get latency percentile estimate
   */
  private getLatencyPercentile(percentile: number): number {
    const history = this.getMetricHistory('response_time_ms', 1000);
    if (history.length === 0) return 50;

    const sorted = history.map(s => s.value).sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  /**
   * Clear metric history
   */
  clearHistory(): void {
    this.metricHistory.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultCollector: SystemMetricsCollector | null = null;

export function getSystemMetricsCollector(): SystemMetricsCollector {
  if (!defaultCollector) {
    defaultCollector = new SystemMetricsCollector();
  }
  return defaultCollector;
}
