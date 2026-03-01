/**
 * A/B Benchmarking Framework for Governance Rule Optimization
 *
 * Builds on top of the Evolution Pipeline's variant testing to provide:
 * - Multiple metrics comparison (success_rate, latency, cost, quality_score)
 * - Proper statistical analysis (chi-square, t-test, Bonferroni correction)
 * - Effect size calculation (Cohen's d)
 * - Power analysis for sample size recommendations
 * - Automatic winner selection with configurable confidence levels
 *
 * @module governance/ab-benchmarking
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags } from './feature-flags.js';
import type { GovernanceFeatureFlags } from './feature-flags.js';
import {
  evolutionPipelineIntegration,
  type VariantTest,
} from './evolution-pipeline-integration.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Metric type for benchmarking
 */
export type MetricType = 'success_rate' | 'latency' | 'cost' | 'quality_score';

/**
 * Configuration for a benchmark metric
 */
export interface MetricConfig {
  /** Metric name identifier */
  name: string;
  /** Type of metric */
  type: MetricType;
  /** Weight for combined scoring (0-1) */
  weight: number;
  /** Whether higher values are better (true) or lower (false for latency/cost) */
  higherIsBetter: boolean;
}

/**
 * Configuration for a variant in the benchmark
 */
export interface VariantConfig {
  /** Unique identifier for the variant */
  id: string;
  /** Human-readable name */
  name: string;
  /** Rule configuration for this variant */
  rules: Record<string, unknown>;
}

/**
 * Configuration for creating a benchmark
 */
export interface BenchmarkConfig {
  /** Unique test identifier */
  testId: string;
  /** Variants to compare */
  variants: VariantConfig[];
  /** Metrics to track */
  metrics: MetricConfig[];
  /** Minimum samples per variant before analysis */
  minSampleSize: number;
  /** Confidence level for significance testing (e.g., 0.95 for 95%) */
  confidenceLevel: number;
  /** Maximum duration for the benchmark in milliseconds */
  maxDurationMs: number;
}

/**
 * Recorded metric data point
 */
export interface MetricDataPoint {
  value: number;
  timestamp: number;
}

/**
 * Variant metrics storage
 */
export interface VariantMetrics {
  variantId: string;
  successes: number;
  failures: number;
  metrics: Map<string, MetricDataPoint[]>;
}

/**
 * Benchmark state
 */
export interface Benchmark {
  config: BenchmarkConfig;
  status: 'pending' | 'running' | 'stopped' | 'completed';
  startTime: number | null;
  endTime: number | null;
  variantMetrics: Map<string, VariantMetrics>;
  winnerId: string | null;
}

/**
 * Statistical results for a metric comparison
 */
export interface MetricStatistics {
  metric: string;
  variantA: {
    mean: number;
    stdDev: number;
    sampleSize: number;
  };
  variantB: {
    mean: number;
    stdDev: number;
    sampleSize: number;
  };
  /** T-statistic for continuous metrics */
  tStatistic: number;
  /** P-value for significance */
  pValue: number;
  /** Effect size (Cohen's d) */
  effectSize: number;
  /** Effect size interpretation */
  effectSizeInterpretation: 'negligible' | 'small' | 'medium' | 'large';
  /** Is statistically significant at configured level */
  isSignificant: boolean;
}

/**
 * Statistical significance result for a benchmark
 */
export interface SignificanceResult {
  benchmarkId: string;
  confidenceLevel: number;
  /** Overall significance achieved */
  isSignificant: boolean;
  /** Chi-square test result for success rates */
  chiSquareTest: {
    statistic: number;
    pValue: number;
    degreesOfFreedom: number;
    isSignificant: boolean;
  } | null;
  /** Per-metric statistics */
  metricStatistics: MetricStatistics[];
  /** Bonferroni-corrected alpha */
  bonferroniAlpha: number;
  /** Power analysis */
  powerAnalysis: {
    currentPower: number;
    recommendedSampleSize: number;
    targetPower: number;
  };
}

/**
 * Comparison between two variants
 */
export interface ComparisonResult {
  benchmarkId: string;
  variantA: string;
  variantB: string;
  /** Overall winner based on weighted metrics */
  winner: string | null;
  /** Confidence in the result */
  confidence: number;
  /** Per-metric comparisons */
  metricComparisons: Array<{
    metric: string;
    variantAValue: number;
    variantBValue: number;
    winner: string | null;
    improvement: number;
    isSignificant: boolean;
  }>;
  /** Combined score for each variant */
  combinedScores: {
    variantA: number;
    variantB: number;
  };
}

/**
 * Winner result
 */
export interface WinnerResult {
  benchmarkId: string;
  winnerId: string;
  winnerName: string;
  confidence: number;
  combinedScore: number;
  significantMetrics: string[];
  recommendation: string;
}

/**
 * Suggestion for winner with explanation
 */
export interface SuggestionResult {
  benchmarkId: string;
  suggestedWinnerId: string | null;
  confidence: number;
  reasoning: string[];
  caveats: string[];
  readyToApply: boolean;
}

/**
 * Summary of a benchmark
 */
export interface BenchmarkSummary {
  benchmarkId: string;
  status: Benchmark['status'];
  variantCount: number;
  totalSamples: number;
  startTime: number | null;
  duration: number | null;
  winnerId: string | null;
  confidenceLevel: number;
}

/**
 * Full benchmark results
 */
export interface BenchmarkResults {
  benchmark: BenchmarkSummary;
  variants: Array<{
    id: string;
    name: string;
    successRate: number;
    sampleSize: number;
    metrics: Record<string, { mean: number; stdDev: number }>;
  }>;
  significance: SignificanceResult | null;
  winner: WinnerResult | null;
}

// ============================================================================
// Feature Flag Helpers
// ============================================================================

/**
 * Check if A/B benchmarking is enabled
 */
export function isABBenchmarkingEnabled(): boolean {
  const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
    abBenchmarking?: { enabled: boolean };
  };

  if (!flags.global.enableAllGates) return false;
  return flags.abBenchmarking?.enabled ?? false;
}

/**
 * Get A/B benchmarking flags with defaults
 */
function getABBenchmarkingFlags(): {
  enabled: boolean;
  defaultConfidenceLevel: number;
  defaultMinSampleSize: number;
  autoApplyWinners: boolean;
  maxConcurrentBenchmarks: number;
} {
  const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
    abBenchmarking?: {
      enabled: boolean;
      defaultConfidenceLevel: number;
      defaultMinSampleSize: number;
      autoApplyWinners: boolean;
      maxConcurrentBenchmarks: number;
    };
  };

  return flags.abBenchmarking ?? {
    enabled: false,
    defaultConfidenceLevel: 0.95,
    defaultMinSampleSize: 100,
    autoApplyWinners: false,
    maxConcurrentBenchmarks: 5,
  };
}

// ============================================================================
// Statistical Functions
// ============================================================================

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map(v => Math.pow(v - m, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Calculate pooled standard deviation for two samples
 */
function pooledStdDev(
  n1: number,
  s1: number,
  n2: number,
  s2: number
): number {
  if (n1 + n2 <= 2) return 0;
  return Math.sqrt(
    ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2)
  );
}

/**
 * Calculate Cohen's d effect size
 */
function cohensD(
  mean1: number,
  mean2: number,
  pooledSD: number
): { value: number; interpretation: 'negligible' | 'small' | 'medium' | 'large' } {
  if (pooledSD === 0) {
    return { value: 0, interpretation: 'negligible' };
  }

  const d = Math.abs(mean1 - mean2) / pooledSD;

  let interpretation: 'negligible' | 'small' | 'medium' | 'large';
  if (d < 0.2) {
    interpretation = 'negligible';
  } else if (d < 0.5) {
    interpretation = 'small';
  } else if (d < 0.8) {
    interpretation = 'medium';
  } else {
    interpretation = 'large';
  }

  return { value: d, interpretation };
}

/**
 * Calculate t-statistic for two independent samples
 * Welch's t-test (does not assume equal variances)
 */
function welchTTest(
  mean1: number,
  sd1: number,
  n1: number,
  mean2: number,
  sd2: number,
  n2: number
): { tStatistic: number; degreesOfFreedom: number; pValue: number } {
  if (n1 < 2 || n2 < 2) {
    return { tStatistic: 0, degreesOfFreedom: 0, pValue: 1 };
  }

  const se1 = (sd1 * sd1) / n1;
  const se2 = (sd2 * sd2) / n2;
  const se = Math.sqrt(se1 + se2);

  if (se === 0) {
    return { tStatistic: 0, degreesOfFreedom: n1 + n2 - 2, pValue: 1 };
  }

  const tStatistic = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom
  const df =
    Math.pow(se1 + se2, 2) /
    (Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1));

  // Approximate p-value using normal distribution for large df
  // For more accurate p-values, we'd need a t-distribution implementation
  const pValue = approximateTwoTailedPValue(Math.abs(tStatistic), df);

  return { tStatistic, degreesOfFreedom: df, pValue };
}

/**
 * Approximate two-tailed p-value from t-distribution
 * Uses normal approximation for simplicity (accurate for df > 30)
 */
function approximateTwoTailedPValue(tStat: number, df: number): number {
  // For small df, use a rough approximation
  // For large df, t-distribution approaches normal
  if (df <= 0) return 1;

  // Using normal CDF approximation
  const z = tStat * Math.sqrt(df / (df + tStat * tStat));
  const p = 1 - normalCDF(Math.abs(z));
  return 2 * p; // Two-tailed
}

/**
 * Normal CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Chi-square test for independence (success rates)
 */
function chiSquareTest(
  variants: Array<{ successes: number; failures: number }>
): { statistic: number; pValue: number; degreesOfFreedom: number } {
  const n = variants.length;
  if (n < 2) {
    return { statistic: 0, pValue: 1, degreesOfFreedom: 0 };
  }

  const totalSuccesses = variants.reduce((sum, v) => sum + v.successes, 0);
  const totalFailures = variants.reduce((sum, v) => sum + v.failures, 0);
  const total = totalSuccesses + totalFailures;

  if (total === 0) {
    return { statistic: 0, pValue: 1, degreesOfFreedom: n - 1 };
  }

  const expectedSuccessRate = totalSuccesses / total;
  let chiSquare = 0;

  for (const variant of variants) {
    const observed = variant.successes + variant.failures;
    if (observed === 0) continue;

    const expectedSuccesses = observed * expectedSuccessRate;
    const expectedFailures = observed * (1 - expectedSuccessRate);

    if (expectedSuccesses > 0) {
      chiSquare += Math.pow(variant.successes - expectedSuccesses, 2) / expectedSuccesses;
    }
    if (expectedFailures > 0) {
      chiSquare += Math.pow(variant.failures - expectedFailures, 2) / expectedFailures;
    }
  }

  const df = n - 1;
  const pValue = chiSquarePValue(chiSquare, df);

  return { statistic: chiSquare, pValue, degreesOfFreedom: df };
}

/**
 * Approximate chi-square p-value
 * Uses Wilson-Hilferty transformation
 */
function chiSquarePValue(chiSquare: number, df: number): number {
  if (df <= 0 || chiSquare < 0) return 1;

  // Wilson-Hilferty transformation to normal
  const h = 2 / (9 * df);
  const z = Math.pow(chiSquare / df, 1 / 3) - (1 - h);
  const normalizedZ = z / Math.sqrt(h);

  return 1 - normalCDF(normalizedZ);
}

/**
 * Calculate statistical power
 * Simplified power calculation for two-sample test
 */
function calculatePower(
  effectSize: number,
  n1: number,
  n2: number,
  alpha: number
): number {
  if (n1 < 2 || n2 < 2) return 0;

  // Non-centrality parameter
  const harmonicN = (2 * n1 * n2) / (n1 + n2);
  const ncp = effectSize * Math.sqrt(harmonicN / 2);

  // Critical value for alpha
  const zAlpha = normalQuantile(1 - alpha / 2);

  // Power calculation
  const power = 1 - normalCDF(zAlpha - ncp) + normalCDF(-zAlpha - ncp);

  return Math.max(0, Math.min(1, power));
}

/**
 * Calculate recommended sample size for target power
 */
function recommendedSampleSize(
  effectSize: number,
  alpha: number,
  targetPower: number
): number {
  if (effectSize <= 0) return 1000; // Can't detect zero effect

  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(targetPower);

  // Per-group sample size
  const n = 2 * Math.pow((zAlpha + zBeta) / effectSize, 2);

  return Math.ceil(n);
}

/**
 * Normal distribution quantile (inverse CDF)
 * Approximation using rational function
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation for normal quantile
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

// ============================================================================
// A/B Benchmarking Framework Implementation
// ============================================================================

/**
 * A/B Benchmarking Framework for governance rule optimization
 *
 * @example
 * ```typescript
 * const framework = new ABBenchmarkingFramework();
 * await framework.initialize();
 *
 * // Create benchmark
 * const benchmarkId = framework.createBenchmark({
 *   testId: 'rule-optimization-1',
 *   variants: [
 *     { id: 'control', name: 'Current Rules', rules: currentRules },
 *     { id: 'treatment', name: 'New Rules', rules: newRules },
 *   ],
 *   metrics: [
 *     { name: 'success_rate', type: 'success_rate', weight: 0.5, higherIsBetter: true },
 *     { name: 'latency', type: 'latency', weight: 0.3, higherIsBetter: false },
 *     { name: 'quality', type: 'quality_score', weight: 0.2, higherIsBetter: true },
 *   ],
 *   minSampleSize: 100,
 *   confidenceLevel: 0.95,
 *   maxDurationMs: 24 * 60 * 60 * 1000,
 * });
 *
 * framework.startBenchmark(benchmarkId);
 *
 * // Record outcomes
 * framework.recordOutcome(benchmarkId, 'control', true, { latency: 150, quality: 0.85 });
 * framework.recordOutcome(benchmarkId, 'treatment', true, { latency: 120, quality: 0.90 });
 *
 * // Get results
 * const results = framework.getBenchmarkResults(benchmarkId);
 * const winner = framework.getWinner(benchmarkId);
 * ```
 */
export class ABBenchmarkingFramework {
  private benchmarks: Map<string, Benchmark> = new Map();
  private initialized = false;

  /**
   * Initialize the benchmarking framework
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure evolution pipeline is initialized
    await evolutionPipelineIntegration.initialize();

    this.initialized = true;
    this.logEvent('initialize', 'A/B Benchmarking Framework initialized');
  }

  // ============================================================================
  // Benchmark Management
  // ============================================================================

  /**
   * Create a new benchmark
   */
  createBenchmark(config: BenchmarkConfig): string {
    if (!isABBenchmarkingEnabled()) {
      return `${config.testId}-disabled`;
    }

    const flags = getABBenchmarkingFlags();

    // Check concurrent benchmark limit
    const activeBenchmarks = this.getActiveBenchmarks();
    if (activeBenchmarks.length >= flags.maxConcurrentBenchmarks) {
      throw new Error(
        `Maximum concurrent benchmarks (${flags.maxConcurrentBenchmarks}) reached. ` +
          'Stop an existing benchmark before creating a new one.'
      );
    }

    // Validate config
    if (config.variants.length < 2) {
      throw new Error('Benchmark requires at least 2 variants');
    }

    if (config.metrics.length === 0) {
      throw new Error('Benchmark requires at least 1 metric');
    }

    // Validate weights sum to approximately 1
    const totalWeight = config.metrics.reduce((sum, m) => sum + m.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      throw new Error(`Metric weights must sum to 1.0, got ${totalWeight}`);
    }

    // Initialize benchmark
    const benchmark: Benchmark = {
      config,
      status: 'pending',
      startTime: null,
      endTime: null,
      variantMetrics: new Map(),
      winnerId: null,
    };

    // Initialize variant metrics
    for (const variant of config.variants) {
      benchmark.variantMetrics.set(variant.id, {
        variantId: variant.id,
        successes: 0,
        failures: 0,
        metrics: new Map(),
      });

      // Initialize metrics storage
      for (const metric of config.metrics) {
        benchmark.variantMetrics.get(variant.id)!.metrics.set(metric.name, []);
      }
    }

    this.benchmarks.set(config.testId, benchmark);

    // Register with Evolution Pipeline for integration
    evolutionPipelineIntegration.registerVariantTest(
      config.testId,
      config.variants.map(v => v.id)
    );

    this.logEvent('benchmark_created', `Benchmark ${config.testId} created with ${config.variants.length} variants`);

    return config.testId;
  }

  /**
   * Start a benchmark
   */
  startBenchmark(benchmarkId: string): void {
    if (!isABBenchmarkingEnabled()) return;

    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    if (benchmark.status === 'running') {
      return; // Already running
    }

    if (benchmark.status === 'completed') {
      throw new Error(`Benchmark ${benchmarkId} is already completed`);
    }

    benchmark.status = 'running';
    benchmark.startTime = Date.now();

    this.logEvent('benchmark_started', `Benchmark ${benchmarkId} started`);
  }

  /**
   * Stop a benchmark
   */
  stopBenchmark(benchmarkId: string): void {
    if (!isABBenchmarkingEnabled()) return;

    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    if (benchmark.status !== 'running') {
      return; // Not running
    }

    benchmark.status = 'stopped';
    benchmark.endTime = Date.now();

    // Complete the Evolution Pipeline test
    evolutionPipelineIntegration.completeVariantTest(benchmarkId);

    this.logEvent('benchmark_stopped', `Benchmark ${benchmarkId} stopped`);
  }

  // ============================================================================
  // Recording
  // ============================================================================

  /**
   * Record a single metric value
   */
  recordMetric(
    benchmarkId: string,
    variantId: string,
    metric: string,
    value: number
  ): void {
    if (!isABBenchmarkingEnabled()) return;

    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      this.logEvent('record_error', `Benchmark ${benchmarkId} not found`);
      return;
    }

    if (benchmark.status !== 'running') {
      this.logEvent('record_error', `Benchmark ${benchmarkId} is not running`);
      return;
    }

    const variantMetrics = benchmark.variantMetrics.get(variantId);
    if (!variantMetrics) {
      this.logEvent('record_error', `Variant ${variantId} not found in benchmark ${benchmarkId}`);
      return;
    }

    const metricData = variantMetrics.metrics.get(metric);
    if (!metricData) {
      this.logEvent('record_error', `Metric ${metric} not configured for benchmark ${benchmarkId}`);
      return;
    }

    metricData.push({
      value,
      timestamp: Date.now(),
    });

    // Check for max duration
    this.checkBenchmarkCompletion(benchmark);
  }

  /**
   * Record an outcome with multiple metrics
   */
  recordOutcome(
    benchmarkId: string,
    variantId: string,
    success: boolean,
    metrics?: Record<string, number>
  ): void {
    if (!isABBenchmarkingEnabled()) return;

    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      this.logEvent('record_error', `Benchmark ${benchmarkId} not found`);
      return;
    }

    if (benchmark.status !== 'running') {
      this.logEvent('record_error', `Benchmark ${benchmarkId} is not running`);
      return;
    }

    const variantMetrics = benchmark.variantMetrics.get(variantId);
    if (!variantMetrics) {
      this.logEvent('record_error', `Variant ${variantId} not found in benchmark ${benchmarkId}`);
      return;
    }

    // Record success/failure
    if (success) {
      variantMetrics.successes++;
    } else {
      variantMetrics.failures++;
    }

    // Record additional metrics
    if (metrics) {
      for (const [metricName, value] of Object.entries(metrics)) {
        const metricData = variantMetrics.metrics.get(metricName);
        if (metricData) {
          metricData.push({
            value,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Also record in Evolution Pipeline
    evolutionPipelineIntegration.recordVariantOutcome(
      benchmarkId,
      variantId,
      success
    );

    // Check for auto-completion
    this.checkBenchmarkCompletion(benchmark);
  }

  // ============================================================================
  // Analysis
  // ============================================================================

  /**
   * Get full benchmark results
   */
  getBenchmarkResults(benchmarkId: string): BenchmarkResults {
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    const summary = this.createBenchmarkSummary(benchmarkId, benchmark);
    const variants = this.getVariantResults(benchmark);
    const significance = this.hasEnoughSamples(benchmark)
      ? this.calculateStatisticalSignificance(benchmarkId)
      : null;
    const winner = this.getWinner(benchmarkId);

    return {
      benchmark: summary,
      variants,
      significance,
      winner,
    };
  }

  /**
   * Calculate statistical significance for a benchmark
   */
  calculateStatisticalSignificance(benchmarkId: string): SignificanceResult {
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    const { config, variantMetrics } = benchmark;
    const alpha = 1 - config.confidenceLevel;

    // Bonferroni correction for multiple comparisons
    const numComparisons = config.metrics.length;
    const bonferroniAlpha = alpha / numComparisons;

    // Chi-square test for success rates
    const variants = Array.from(variantMetrics.values()).map(v => ({
      successes: v.successes,
      failures: v.failures,
    }));
    const chiSquareResult = chiSquareTest(variants);

    // Per-metric statistics (pairwise comparisons between first two variants)
    const metricStatistics: MetricStatistics[] = [];
    const variantIds = Array.from(variantMetrics.keys());

    if (variantIds.length >= 2) {
      const v1 = variantMetrics.get(variantIds[0])!;
      const v2 = variantMetrics.get(variantIds[1])!;

      for (const metricConfig of config.metrics) {
        const values1 = (v1.metrics.get(metricConfig.name) || []).map(d => d.value);
        const values2 = (v2.metrics.get(metricConfig.name) || []).map(d => d.value);

        if (values1.length >= 2 && values2.length >= 2) {
          const mean1 = mean(values1);
          const mean2 = mean(values2);
          const sd1 = stdDev(values1);
          const sd2 = stdDev(values2);
          const n1 = values1.length;
          const n2 = values2.length;

          const tTest = welchTTest(mean1, sd1, n1, mean2, sd2, n2);
          const psd = pooledStdDev(n1, sd1, n2, sd2);
          const effect = cohensD(mean1, mean2, psd);

          metricStatistics.push({
            metric: metricConfig.name,
            variantA: { mean: mean1, stdDev: sd1, sampleSize: n1 },
            variantB: { mean: mean2, stdDev: sd2, sampleSize: n2 },
            tStatistic: tTest.tStatistic,
            pValue: tTest.pValue,
            effectSize: effect.value,
            effectSizeInterpretation: effect.interpretation,
            isSignificant: tTest.pValue < bonferroniAlpha,
          });
        }
      }
    }

    // Power analysis
    const allSamples = Array.from(variantMetrics.values());
    const avgSampleSize = mean(allSamples.map(v => v.successes + v.failures));
    const avgEffectSize =
      metricStatistics.length > 0
        ? mean(metricStatistics.map(m => m.effectSize))
        : 0.5; // Medium effect as default

    const currentPower = calculatePower(
      avgEffectSize,
      avgSampleSize,
      avgSampleSize,
      alpha
    );
    const recSampleSize = recommendedSampleSize(avgEffectSize, alpha, 0.8);

    // Overall significance
    const isSignificant =
      chiSquareResult.pValue < alpha ||
      metricStatistics.some(m => m.isSignificant);

    return {
      benchmarkId,
      confidenceLevel: config.confidenceLevel,
      isSignificant,
      chiSquareTest: {
        statistic: chiSquareResult.statistic,
        pValue: chiSquareResult.pValue,
        degreesOfFreedom: chiSquareResult.degreesOfFreedom,
        isSignificant: chiSquareResult.pValue < alpha,
      },
      metricStatistics,
      bonferroniAlpha,
      powerAnalysis: {
        currentPower,
        recommendedSampleSize: recSampleSize,
        targetPower: 0.8,
      },
    };
  }

  /**
   * Get the winner of a benchmark
   */
  getWinner(benchmarkId: string): WinnerResult | null {
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      return null;
    }

    if (!this.hasEnoughSamples(benchmark)) {
      return null;
    }

    const scores = this.calculateCombinedScores(benchmark);
    if (scores.length === 0) {
      return null;
    }

    // Sort by combined score (descending)
    scores.sort((a, b) => b.score - a.score);
    const winner = scores[0];

    // Calculate confidence based on significance and score gap
    const significance = this.calculateStatisticalSignificance(benchmarkId);
    const scoreGap = scores.length > 1 ? winner.score - scores[1].score : winner.score;
    const confidence = significance.isSignificant
      ? Math.min(0.99, 0.5 + scoreGap * 0.5 + (significance.powerAnalysis.currentPower * 0.25))
      : Math.min(0.5, scoreGap * 0.5);

    const significantMetrics = significance.metricStatistics
      .filter(m => m.isSignificant)
      .map(m => m.metric);

    const variantConfig = benchmark.config.variants.find(v => v.id === winner.variantId);

    return {
      benchmarkId,
      winnerId: winner.variantId,
      winnerName: variantConfig?.name || winner.variantId,
      confidence,
      combinedScore: winner.score,
      significantMetrics,
      recommendation: this.generateWinnerRecommendation(winner, confidence, significantMetrics),
    };
  }

  /**
   * Compare two specific variants
   */
  compareVariants(
    benchmarkId: string,
    variantA: string,
    variantB: string
  ): ComparisonResult {
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    const metricsA = benchmark.variantMetrics.get(variantA);
    const metricsB = benchmark.variantMetrics.get(variantB);

    if (!metricsA || !metricsB) {
      throw new Error(`Variant not found: ${!metricsA ? variantA : variantB}`);
    }

    const { config } = benchmark;
    const alpha = 1 - config.confidenceLevel;
    const metricComparisons: ComparisonResult['metricComparisons'] = [];

    let scoreA = 0;
    let scoreB = 0;

    for (const metricConfig of config.metrics) {
      const valuesA = (metricsA.metrics.get(metricConfig.name) || []).map(d => d.value);
      const valuesB = (metricsB.metrics.get(metricConfig.name) || []).map(d => d.value);

      const meanA = valuesA.length > 0 ? mean(valuesA) : 0;
      const meanB = valuesB.length > 0 ? mean(valuesB) : 0;

      let isSignificant = false;
      if (valuesA.length >= 2 && valuesB.length >= 2) {
        const tTest = welchTTest(
          meanA,
          stdDev(valuesA),
          valuesA.length,
          meanB,
          stdDev(valuesB),
          valuesB.length
        );
        isSignificant = tTest.pValue < alpha;
      }

      // Determine winner for this metric
      let winner: string | null = null;
      let improvement = 0;

      if (meanA !== meanB) {
        if (metricConfig.higherIsBetter) {
          winner = meanA > meanB ? variantA : variantB;
          improvement = Math.abs(meanA - meanB) / Math.max(meanA, meanB, 0.001);
        } else {
          winner = meanA < meanB ? variantA : variantB;
          improvement = Math.abs(meanA - meanB) / Math.max(meanA, meanB, 0.001);
        }
      }

      metricComparisons.push({
        metric: metricConfig.name,
        variantAValue: meanA,
        variantBValue: meanB,
        winner,
        improvement,
        isSignificant,
      });

      // Calculate normalized scores
      const normalizedA = this.normalizeMetric(meanA, metricConfig);
      const normalizedB = this.normalizeMetric(meanB, metricConfig);
      scoreA += normalizedA * metricConfig.weight;
      scoreB += normalizedB * metricConfig.weight;
    }

    // Add success rate comparison
    const successRateA = this.getSuccessRate(metricsA);
    const successRateB = this.getSuccessRate(metricsB);

    const overallWinner = scoreA > scoreB ? variantA : scoreB > scoreA ? variantB : null;
    const confidence =
      Math.abs(scoreA - scoreB) / Math.max(scoreA, scoreB, 0.001);

    return {
      benchmarkId,
      variantA,
      variantB,
      winner: overallWinner,
      confidence: Math.min(1, confidence),
      metricComparisons,
      combinedScores: {
        variantA: scoreA,
        variantB: scoreB,
      },
    };
  }

  // ============================================================================
  // Auto-optimization
  // ============================================================================

  /**
   * Suggest a winner with explanation
   */
  suggestWinner(benchmarkId: string): SuggestionResult {
    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    const reasoning: string[] = [];
    const caveats: string[] = [];
    let readyToApply = false;
    let suggestedWinnerId: string | null = null;

    // Check sample size
    const { config, variantMetrics } = benchmark;
    const samples = Array.from(variantMetrics.values()).map(v => v.successes + v.failures);
    const minSamples = Math.min(...samples);

    if (minSamples < config.minSampleSize) {
      caveats.push(
        `Insufficient samples: ${minSamples} < ${config.minSampleSize} required`
      );
    } else {
      reasoning.push(`Sample size requirement met: ${minSamples} >= ${config.minSampleSize}`);
    }

    // Get significance
    const significance = this.hasEnoughSamples(benchmark)
      ? this.calculateStatisticalSignificance(benchmarkId)
      : null;

    if (significance) {
      if (significance.isSignificant) {
        reasoning.push('Statistical significance achieved');
      } else {
        caveats.push(
          `Not yet statistically significant at ${config.confidenceLevel * 100}% confidence`
        );
      }

      if (significance.powerAnalysis.currentPower < 0.8) {
        caveats.push(
          `Low statistical power (${(significance.powerAnalysis.currentPower * 100).toFixed(1)}%). ` +
            `Recommend ${significance.powerAnalysis.recommendedSampleSize} samples per variant.`
        );
      }
    }

    // Get winner
    const winner = this.getWinner(benchmarkId);
    if (winner) {
      suggestedWinnerId = winner.winnerId;
      reasoning.push(`Winner: ${winner.winnerName} (score: ${winner.combinedScore.toFixed(3)})`);

      if (winner.significantMetrics.length > 0) {
        reasoning.push(`Significant improvements in: ${winner.significantMetrics.join(', ')}`);
      }

      if (winner.confidence >= 0.95) {
        readyToApply = true;
        reasoning.push('High confidence - ready to apply');
      } else if (winner.confidence >= 0.8 && significance?.isSignificant) {
        readyToApply = true;
        reasoning.push('Good confidence with statistical significance - ready to apply');
      } else {
        caveats.push(
          `Confidence (${(winner.confidence * 100).toFixed(1)}%) below recommended threshold`
        );
      }
    } else {
      caveats.push('No clear winner determined');
    }

    return {
      benchmarkId,
      suggestedWinnerId,
      confidence: winner?.confidence ?? 0,
      reasoning,
      caveats,
      readyToApply,
    };
  }

  /**
   * Apply the winning variant
   */
  applyWinner(benchmarkId: string): void {
    if (!isABBenchmarkingEnabled()) return;

    const benchmark = this.benchmarks.get(benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark ${benchmarkId} not found`);
    }

    const winner = this.getWinner(benchmarkId);
    if (!winner) {
      throw new Error(`No winner determined for benchmark ${benchmarkId}`);
    }

    // Mark benchmark as completed
    benchmark.status = 'completed';
    benchmark.endTime = Date.now();
    benchmark.winnerId = winner.winnerId;

    // Promote winner in Evolution Pipeline
    evolutionPipelineIntegration.promoteRule(
      winner.winnerId,
      `Won A/B benchmark ${benchmarkId} with ${(winner.confidence * 100).toFixed(1)}% confidence`
    );

    // Complete the variant test
    evolutionPipelineIntegration.completeVariantTest(benchmarkId);

    this.logEvent(
      'winner_applied',
      `Applied winner ${winner.winnerId} for benchmark ${benchmarkId}`
    );
  }

  // ============================================================================
  // Status and History
  // ============================================================================

  /**
   * Get all active benchmarks
   */
  getActiveBenchmarks(): BenchmarkSummary[] {
    return Array.from(this.benchmarks.entries())
      .filter(([_, b]) => b.status === 'running' || b.status === 'pending')
      .map(([id, b]) => this.createBenchmarkSummary(id, b));
  }

  /**
   * Get benchmark history
   */
  getBenchmarkHistory(): BenchmarkSummary[] {
    return Array.from(this.benchmarks.entries())
      .map(([id, b]) => this.createBenchmarkSummary(id, b))
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  /**
   * Reset the framework state
   */
  reset(): void {
    this.benchmarks.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Check if benchmark has enough samples
   */
  private hasEnoughSamples(benchmark: Benchmark): boolean {
    const { config, variantMetrics } = benchmark;
    for (const metrics of Array.from(variantMetrics.values())) {
      const totalSamples = metrics.successes + metrics.failures;
      if (totalSamples < config.minSampleSize) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if benchmark should auto-complete
   */
  private checkBenchmarkCompletion(benchmark: Benchmark): void {
    const { config } = benchmark;

    // Check max duration
    if (
      benchmark.startTime &&
      Date.now() - benchmark.startTime > config.maxDurationMs
    ) {
      benchmark.status = 'completed';
      benchmark.endTime = Date.now();
      this.logEvent(
        'benchmark_auto_completed',
        `Benchmark ${config.testId} auto-completed due to max duration`
      );
      return;
    }

    // Check if significance achieved with enough samples
    if (this.hasEnoughSamples(benchmark)) {
      const flags = getABBenchmarkingFlags();
      if (flags.autoApplyWinners) {
        const suggestion = this.suggestWinner(config.testId);
        if (suggestion.readyToApply) {
          this.applyWinner(config.testId);
        }
      }
    }
  }

  /**
   * Create benchmark summary
   */
  private createBenchmarkSummary(
    benchmarkId: string,
    benchmark: Benchmark
  ): BenchmarkSummary {
    const totalSamples = Array.from(benchmark.variantMetrics.values()).reduce(
      (sum, v) => sum + v.successes + v.failures,
      0
    );

    return {
      benchmarkId,
      status: benchmark.status,
      variantCount: benchmark.config.variants.length,
      totalSamples,
      startTime: benchmark.startTime,
      duration:
        benchmark.startTime && benchmark.endTime
          ? benchmark.endTime - benchmark.startTime
          : benchmark.startTime
          ? Date.now() - benchmark.startTime
          : null,
      winnerId: benchmark.winnerId,
      confidenceLevel: benchmark.config.confidenceLevel,
    };
  }

  /**
   * Get variant results
   */
  private getVariantResults(
    benchmark: Benchmark
  ): BenchmarkResults['variants'] {
    return benchmark.config.variants.map(variantConfig => {
      const metrics = benchmark.variantMetrics.get(variantConfig.id)!;
      const sampleSize = metrics.successes + metrics.failures;
      const successRate = sampleSize > 0 ? metrics.successes / sampleSize : 0;

      const metricResults: Record<string, { mean: number; stdDev: number }> = {};
      for (const [name, dataPoints] of Array.from(metrics.metrics.entries())) {
        const values = dataPoints.map(d => d.value);
        metricResults[name] = {
          mean: values.length > 0 ? mean(values) : 0,
          stdDev: values.length > 1 ? stdDev(values) : 0,
        };
      }

      return {
        id: variantConfig.id,
        name: variantConfig.name,
        successRate,
        sampleSize,
        metrics: metricResults,
      };
    });
  }

  /**
   * Calculate combined scores for all variants
   */
  private calculateCombinedScores(
    benchmark: Benchmark
  ): Array<{ variantId: string; score: number }> {
    const { config, variantMetrics } = benchmark;
    const scores: Array<{ variantId: string; score: number }> = [];

    for (const [variantId, metrics] of Array.from(variantMetrics.entries())) {
      let score = 0;

      for (const metricConfig of config.metrics) {
        const dataPoints = metrics.metrics.get(metricConfig.name) || [];
        const values = dataPoints.map(d => d.value);
        const metricMean = values.length > 0 ? mean(values) : 0;

        const normalized = this.normalizeMetric(metricMean, metricConfig);
        score += normalized * metricConfig.weight;
      }

      // Add success rate contribution (if not already in metrics)
      const hasSuccessRateMetric = config.metrics.some(
        m => m.type === 'success_rate'
      );
      if (!hasSuccessRateMetric) {
        const successRate = this.getSuccessRate(metrics);
        score += successRate * 0.5; // Give success rate 50% implicit weight
      }

      scores.push({ variantId, score });
    }

    return scores;
  }

  /**
   * Normalize a metric value to 0-1 scale
   */
  private normalizeMetric(value: number, config: MetricConfig): number {
    // For this implementation, we'll use simple normalization
    // In production, you might want to use benchmark-specific min/max values
    switch (config.type) {
      case 'success_rate':
        return value; // Already 0-1
      case 'latency':
        // Lower is better, normalize to 0-1 where 0ms = 1, 10000ms = 0
        return config.higherIsBetter
          ? Math.min(1, value / 10000)
          : Math.max(0, 1 - value / 10000);
      case 'cost':
        // Lower is better, normalize to 0-1 where $0 = 1, $100 = 0
        return config.higherIsBetter
          ? Math.min(1, value / 100)
          : Math.max(0, 1 - value / 100);
      case 'quality_score':
        return Math.min(1, Math.max(0, value)); // Assume already 0-1
      default:
        return value;
    }
  }

  /**
   * Get success rate from variant metrics
   */
  private getSuccessRate(metrics: VariantMetrics): number {
    const total = metrics.successes + metrics.failures;
    return total > 0 ? metrics.successes / total : 0;
  }

  /**
   * Generate winner recommendation text
   */
  private generateWinnerRecommendation(
    winner: { variantId: string; score: number },
    confidence: number,
    significantMetrics: string[]
  ): string {
    if (confidence >= 0.95) {
      return `Strongly recommend applying ${winner.variantId}. ` +
        `High confidence (${(confidence * 100).toFixed(1)}%) with significant improvements ` +
        `in: ${significantMetrics.length > 0 ? significantMetrics.join(', ') : 'overall performance'}.`;
    } else if (confidence >= 0.8) {
      return `Recommend applying ${winner.variantId}. ` +
        `Good confidence (${(confidence * 100).toFixed(1)}%). ` +
        `Consider collecting more samples for higher confidence.`;
    } else if (confidence >= 0.6) {
      return `${winner.variantId} shows promise with moderate confidence ` +
        `(${(confidence * 100).toFixed(1)}%). ` +
        `Recommend collecting more samples before applying.`;
    } else {
      return `Results are inconclusive. ${winner.variantId} is currently leading but ` +
        `confidence (${(confidence * 100).toFixed(1)}%) is low. Continue collecting data.`;
    }
  }

  /**
   * Log benchmarking event
   */
  private logEvent(eventType: string, message: string): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.info(`[ABBenchmarking] ${eventType}:`, {
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of the A/B Benchmarking Framework
 */
export const abBenchmarkingFramework = new ABBenchmarkingFramework();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a benchmark configuration with sensible defaults
 */
export function createBenchmarkConfig(
  testId: string,
  variants: VariantConfig[],
  options: Partial<Omit<BenchmarkConfig, 'testId' | 'variants'>> = {}
): BenchmarkConfig {
  const flags = getABBenchmarkingFlags();

  return {
    testId,
    variants,
    metrics: options.metrics || [
      { name: 'success_rate', type: 'success_rate', weight: 0.5, higherIsBetter: true },
      { name: 'latency', type: 'latency', weight: 0.3, higherIsBetter: false },
      { name: 'quality', type: 'quality_score', weight: 0.2, higherIsBetter: true },
    ],
    minSampleSize: options.minSampleSize ?? flags.defaultMinSampleSize,
    confidenceLevel: options.confidenceLevel ?? flags.defaultConfidenceLevel,
    maxDurationMs: options.maxDurationMs ?? 24 * 60 * 60 * 1000, // 24 hours default
  };
}

/**
 * Convenience function to run a quick A/B test
 */
export async function runQuickBenchmark(
  testId: string,
  controlRules: Record<string, unknown>,
  treatmentRules: Record<string, unknown>,
  options: {
    minSampleSize?: number;
    confidenceLevel?: number;
    maxDurationMs?: number;
  } = {}
): Promise<string> {
  await abBenchmarkingFramework.initialize();

  const config = createBenchmarkConfig(
    testId,
    [
      { id: 'control', name: 'Control', rules: controlRules },
      { id: 'treatment', name: 'Treatment', rules: treatmentRules },
    ],
    options
  );

  const benchmarkId = abBenchmarkingFramework.createBenchmark(config);
  abBenchmarkingFramework.startBenchmark(benchmarkId);

  return benchmarkId;
}
