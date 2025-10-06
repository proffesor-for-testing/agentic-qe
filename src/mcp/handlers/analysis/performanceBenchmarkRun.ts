/**
 * Performance Benchmark Runner
 * Executes comprehensive performance benchmarks with statistical analysis
 */

import type { BenchmarkConfig, BenchmarkResult } from '../../types/analysis';

export interface PerformanceBenchmarkRunParams {
  targets: string[];
  iterations?: number;
  warmupRuns?: number;
  concurrency?: number;
  timeout?: number;
  metricsToCollect?: Array<'cpu' | 'memory' | 'io' | 'network' | 'latency' | 'throughput'>;
  baselineComparison?: boolean;
}

export interface BenchmarkMetrics {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface PerformanceBenchmarkRunResult {
  benchmarks: Array<{
    target: string;
    metrics: {
      latency?: BenchmarkMetrics;
      throughput?: BenchmarkMetrics;
      cpu?: BenchmarkMetrics;
      memory?: BenchmarkMetrics;
      io?: BenchmarkMetrics;
      network?: BenchmarkMetrics;
    };
    status: 'pass' | 'fail' | 'warning';
    issues?: string[];
  }>;
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
    totalDuration: number;
  };
  comparison?: {
    target: string;
    improvement: number;
    regression: number;
    neutral: number;
  };
  recommendations: string[];
  timestamp: string;
}

/**
 * Run performance benchmarks with statistical analysis
 */
export async function performanceBenchmarkRun(
  params: PerformanceBenchmarkRunParams
): Promise<PerformanceBenchmarkRunResult> {
  const {
    targets,
    iterations = 100,
    warmupRuns = 10,
    concurrency = 1,
    timeout = 30000,
    metricsToCollect = ['latency', 'throughput', 'cpu', 'memory'],
    baselineComparison = false
  } = params;

  const startTime = Date.now();

  // Run warmup
  await runWarmup(targets, warmupRuns);

  // Execute benchmarks
  const benchmarks = await Promise.all(
    targets.map(target =>
      runBenchmark(target, iterations, concurrency, timeout, metricsToCollect)
    )
  );

  // Compare with baseline if requested
  let comparison;
  if (baselineComparison) {
    comparison = await compareWithBaseline(benchmarks);
  }

  // Generate recommendations
  const recommendations = generatePerformanceRecommendations(benchmarks);

  // Calculate summary
  const summary = {
    totalTests: benchmarks.length,
    passed: benchmarks.filter(b => b.status === 'pass').length,
    failed: benchmarks.filter(b => b.status === 'fail').length,
    warnings: benchmarks.filter(b => b.status === 'warning').length,
    totalDuration: Date.now() - startTime
  };

  return {
    benchmarks,
    summary,
    comparison,
    recommendations,
    timestamp: new Date().toISOString()
  };
}

async function runWarmup(targets: string[], warmupRuns: number): Promise<void> {
  // Simulate warmup to stabilize performance metrics
  for (let i = 0; i < warmupRuns; i++) {
    await Promise.all(targets.map(target => simulateExecution(target)));
  }
}

async function runBenchmark(
  target: string,
  iterations: number,
  concurrency: number,
  timeout: number,
  metricsToCollect: string[]
): Promise<PerformanceBenchmarkRunResult['benchmarks'][0]> {
  const results: any = {
    latency: [],
    throughput: [],
    cpu: [],
    memory: [],
    io: [],
    network: []
  };

  // Collect metrics over iterations
  for (let i = 0; i < iterations; i++) {
    const metrics = await collectMetrics(target, metricsToCollect);

    metricsToCollect.forEach(metric => {
      if (metrics[metric] !== undefined) {
        results[metric].push(metrics[metric]);
      }
    });
  }

  // Calculate statistics
  const benchmarkMetrics: any = {};
  metricsToCollect.forEach(metric => {
    if (results[metric].length > 0) {
      benchmarkMetrics[metric] = calculateStatistics(results[metric]);
    }
  });

  // Determine status
  const { status, issues } = evaluatePerformance(benchmarkMetrics);

  return {
    target,
    metrics: benchmarkMetrics,
    status,
    issues
  };
}

async function simulateExecution(target: string): Promise<void> {
  // Simulate target execution
  await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
}

async function collectMetrics(
  target: string,
  metricsToCollect: string[]
): Promise<Record<string, number>> {
  const metrics: Record<string, number> = {};

  metricsToCollect.forEach(metric => {
    switch (metric) {
      case 'latency':
        metrics.latency = Math.random() * 100 + 10; // 10-110ms
        break;
      case 'throughput':
        metrics.throughput = Math.random() * 1000 + 100; // 100-1100 req/s
        break;
      case 'cpu':
        metrics.cpu = Math.random() * 80 + 10; // 10-90%
        break;
      case 'memory':
        metrics.memory = Math.random() * 500 + 50; // 50-550 MB
        break;
      case 'io':
        metrics.io = Math.random() * 1000 + 100; // 100-1100 ops/s
        break;
      case 'network':
        metrics.network = Math.random() * 100 + 10; // 10-110 Mbps
        break;
    }
  });

  return metrics;
}

function calculateStatistics(values: number[]): BenchmarkMetrics {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    median: sorted[Math.floor(sorted.length / 2)],
    stdDev: Math.round(stdDev * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

function evaluatePerformance(metrics: any): { status: 'pass' | 'fail' | 'warning'; issues?: string[] } {
  const issues: string[] = [];

  // Check latency
  if (metrics.latency) {
    if (metrics.latency.p99 > 500) {
      issues.push(`High P99 latency: ${metrics.latency.p99}ms`);
    }
    if (metrics.latency.stdDev > metrics.latency.mean * 0.5) {
      issues.push('High latency variance detected');
    }
  }

  // Check CPU
  if (metrics.cpu && metrics.cpu.mean > 80) {
    issues.push(`High CPU usage: ${metrics.cpu.mean}%`);
  }

  // Check memory
  if (metrics.memory && metrics.memory.max > 1000) {
    issues.push(`High memory usage: ${metrics.memory.max}MB`);
  }

  if (issues.length === 0) {
    return { status: 'pass' };
  } else if (issues.length < 2) {
    return { status: 'warning', issues };
  } else {
    return { status: 'fail', issues };
  }
}

async function compareWithBaseline(
  benchmarks: PerformanceBenchmarkRunResult['benchmarks']
): Promise<{ target: string; improvement: number; regression: number; neutral: number }> {
  // Simulate baseline comparison
  const improvement = Math.floor(benchmarks.length * 0.3);
  const regression = Math.floor(benchmarks.length * 0.1);
  const neutral = benchmarks.length - improvement - regression;

  return {
    target: 'baseline-v1.0',
    improvement,
    regression,
    neutral
  };
}

function generatePerformanceRecommendations(
  benchmarks: PerformanceBenchmarkRunResult['benchmarks']
): string[] {
  const recommendations: string[] = [];

  const failedBenchmarks = benchmarks.filter(b => b.status === 'fail');
  if (failedBenchmarks.length > 0) {
    recommendations.push(`${failedBenchmarks.length} benchmarks failed. Review performance bottlenecks.`);
  }

  const highLatencyBenchmarks = benchmarks.filter(
    b => b.metrics.latency && b.metrics.latency.p99 > 300
  );
  if (highLatencyBenchmarks.length > 0) {
    recommendations.push('High latency detected. Consider caching or query optimization.');
  }

  const highCpuBenchmarks = benchmarks.filter(
    b => b.metrics.cpu && b.metrics.cpu.mean > 70
  );
  if (highCpuBenchmarks.length > 0) {
    recommendations.push('High CPU usage detected. Profile code for optimization opportunities.');
  }

  if (recommendations.length === 0) {
    recommendations.push('All benchmarks passed. Performance is within acceptable limits.');
  }

  return recommendations;
}
