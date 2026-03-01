/**
 * Agentic QE v3 - Lambda Calculator for Coherence-Gated Quality Gates
 * ADR-030: Calculates quality lambda (minimum cut) from metrics
 *
 * Lambda represents the "minimum cut" between acceptable and unacceptable quality states.
 * Based on ruvector-mincut-gated-transformer's coherence calculation patterns.
 */

import {
  QualityLambda,
  QualityDimensions,
  QualityMetricsInput,
  QualityLambdaFlags,
  CoherenceGatePolicy,
  DEFAULT_COHERENCE_GATE_POLICY,
} from './types';

/**
 * Configuration for lambda calculation
 */
export interface LambdaCalculatorConfig {
  /** Policy settings for thresholds */
  policy: CoherenceGatePolicy;

  /** Dimension weights (default: equal weights) */
  dimensionWeights?: Partial<Record<keyof QualityDimensions, number>>;

  /** Critical dimensions that cannot be below threshold */
  criticalDimensions?: (keyof QualityDimensions)[];
}

/**
 * Default dimension weights
 */
const DEFAULT_DIMENSION_WEIGHTS: Record<keyof QualityDimensions, number> = {
  coverage: 1.0,
  passRate: 1.5,       // Test pass rate is critical
  security: 2.0,       // Security is highest priority
  performance: 1.0,
  maintainability: 0.8,
  reliability: 1.2,
  technicalDebt: 0.6,
  duplication: 0.5,
};

/**
 * Default critical dimensions
 */
const DEFAULT_CRITICAL_DIMENSIONS: (keyof QualityDimensions)[] = [
  'passRate',
  'security',
];

/**
 * Calculator for quality lambda (minimum cut) values
 */
export class LambdaCalculator {
  private readonly policy: CoherenceGatePolicy;
  private readonly weights: Record<keyof QualityDimensions, number>;
  private readonly criticalDimensions: Set<keyof QualityDimensions>;

  constructor(config: Partial<LambdaCalculatorConfig> = {}) {
    this.policy = { ...DEFAULT_COHERENCE_GATE_POLICY, ...config.policy };
    this.weights = { ...DEFAULT_DIMENSION_WEIGHTS, ...config.dimensionWeights };
    this.criticalDimensions = new Set(
      config.criticalDimensions || DEFAULT_CRITICAL_DIMENSIONS
    );
  }

  /**
   * Calculate quality lambda from raw metrics
   */
  calculate(metrics: QualityMetricsInput): QualityLambda {
    // Step 1: Normalize all metrics to 0-1 scale
    const dimensions = this.normalizeMetrics(metrics);

    // Step 2: Calculate lambda (minimum cut)
    const lambda = this.calculateMinimumCut(dimensions);

    // Step 3: Count boundary edges (dimensions near threshold)
    const boundaryEdges = this.countBoundaryEdges(dimensions);

    // Step 4: Calculate boundary concentration (Q15 fixed-point)
    const boundaryConcentrationQ15 = this.calculateBoundaryConcentration(dimensions);

    // Step 5: Calculate flags
    const flags = this.calculateFlags(lambda, metrics.previousLambda);

    // Step 6: Return complete lambda object
    return {
      lambda,
      lambdaPrev: metrics.previousLambda ?? lambda,
      boundaryEdges,
      boundaryConcentrationQ15,
      partitionCount: 0, // Will be set by partition detector
      flags,
      calculatedAt: new Date(),
      dimensions,
    };
  }

  /**
   * Normalize raw metrics to 0-1 scale dimensions
   */
  normalizeMetrics(metrics: QualityMetricsInput): QualityDimensions {
    // Coverage: Direct percentage to 0-1
    const coverage = Math.min(Math.max(metrics.lineCoverage / 100, 0), 1);

    // Pass rate: Direct percentage to 0-1
    const passRate = Math.min(Math.max(metrics.testPassRate / 100, 0), 1);

    // Security: Inverse of vulnerability count, capped at 5 critical vulns
    // 0 vulns = 1.0, 5+ critical vulns = 0.0
    const criticalImpact = Math.min(metrics.criticalVulns / 5, 1);
    const highImpact = Math.min((metrics.highVulns || 0) / 10, 0.3);
    const mediumImpact = Math.min((metrics.mediumVulns || 0) / 20, 0.1);
    const security = Math.max(1 - criticalImpact - highImpact - mediumImpact, 0);

    // Performance: Ratio of target to actual P95 latency, capped at 1
    const performance = metrics.targetLatency > 0
      ? Math.min(metrics.targetLatency / Math.max(metrics.p95Latency, 1), 1)
      : 1;

    // Maintainability: Direct index to 0-1
    const maintainability = Math.min(Math.max(metrics.maintainabilityIndex / 100, 0), 1);

    // Reliability: Inverse of flaky test ratio
    const reliability = 1 - (metrics.flakyTestRatio || 0);

    // Technical debt: Inverse ratio of debt to max acceptable
    let technicalDebt: number | undefined;
    if (metrics.technicalDebtHours !== undefined && metrics.maxAcceptableDebtHours) {
      technicalDebt = Math.max(
        1 - metrics.technicalDebtHours / metrics.maxAcceptableDebtHours,
        0
      );
    }

    // Duplication: Inverse of duplication percentage (capped at 20%)
    let duplication: number | undefined;
    if (metrics.duplicationPercent !== undefined) {
      duplication = Math.max(1 - metrics.duplicationPercent / 20, 0);
    }

    return {
      coverage,
      passRate,
      security,
      performance,
      maintainability,
      reliability,
      technicalDebt,
      duplication,
    };
  }

  /**
   * Calculate the minimum cut (lambda) from dimensions
   * This is the weakest quality dimension, representing the "minimum cut" in the quality graph
   */
  calculateMinimumCut(dimensions: QualityDimensions): number {
    // Get all defined dimension values
    const values: number[] = [];
    const entries = Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][];

    for (const [key, value] of entries) {
      if (value !== undefined) {
        // Apply weight to the dimension
        const weight = this.weights[key] || 1.0;

        // For critical dimensions, don't apply weight reduction
        if (this.criticalDimensions.has(key)) {
          values.push(value);
        } else {
          // Non-critical dimensions have weighted contribution
          // Higher weight means more impact on lambda
          values.push(value * (2 - weight) / 2 + value / 2);
        }
      }
    }

    if (values.length === 0) {
      return 0;
    }

    // Lambda is the minimum value (minimum cut)
    const minValue = Math.min(...values);

    // Scale to 0-100
    return Math.round(minValue * 100);
  }

  /**
   * Count dimensions that are at the boundary (near threshold, unstable)
   */
  countBoundaryEdges(dimensions: QualityDimensions): number {
    const threshold = this.policy.boundaryThreshold;
    const tolerance = this.policy.boundaryTolerance;
    let boundaryCount = 0;

    const entries = Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][];

    for (const [, value] of entries) {
      if (value !== undefined) {
        // A dimension is at the boundary if it's within tolerance of the threshold
        if (value >= threshold - tolerance && value < threshold + tolerance) {
          boundaryCount++;
        }
      }
    }

    return boundaryCount;
  }

  /**
   * Calculate boundary concentration in Q15 fixed-point format (0-32767)
   * Higher values indicate more concentrated instability
   */
  calculateBoundaryConcentration(dimensions: QualityDimensions): number {
    const threshold = this.policy.boundaryThreshold;

    // Get all dimensions below threshold
    const belowThreshold: number[] = [];
    const entries = Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][];

    for (const [, value] of entries) {
      if (value !== undefined && value < threshold) {
        belowThreshold.push(value);
      }
    }

    if (belowThreshold.length === 0) {
      // No dimensions below threshold = maximum stability
      return 32767;
    }

    // Calculate average of below-threshold dimensions
    const avgBelowThreshold = belowThreshold.reduce((a, b) => a + b, 0) / belowThreshold.length;

    // Convert to Q15 (0-32767)
    // Lower values in below-threshold = lower Q15 = more concerning
    return Math.round(avgBelowThreshold * 32767);
  }

  /**
   * Calculate control flags based on lambda and trend
   */
  calculateFlags(lambda: number, previousLambda?: number): QualityLambdaFlags {
    let flags = QualityLambdaFlags.NONE;

    // Check if this is first evaluation
    if (previousLambda === undefined) {
      flags |= QualityLambdaFlags.FIRST_EVALUATION;
      return flags;
    }

    // Calculate trend
    const delta = lambda - previousLambda;
    const deltaRatio = previousLambda > 0 ? Math.abs(delta) / previousLambda : 0;

    // Set trend flags
    if (delta > 0 && deltaRatio > 0.05) {
      flags |= QualityLambdaFlags.TRENDING_UP;
    } else if (delta < 0 && deltaRatio > 0.05) {
      flags |= QualityLambdaFlags.TRENDING_DOWN;
    }

    return flags;
  }

  /**
   * Calculate the drop ratio in Q15 format (0-32767)
   * Used by gate controller to detect rapid quality degradation
   */
  calculateDropRatioQ15(lambda: QualityLambda): number {
    if (lambda.lambdaPrev === 0 || lambda.lambdaPrev === lambda.lambda) {
      return 0;
    }

    const drop = lambda.lambdaPrev - lambda.lambda;
    if (drop <= 0) {
      return 0; // No drop (improved or stayed same)
    }

    const dropRatio = drop / lambda.lambdaPrev;
    return Math.round(dropRatio * 32767);
  }

  /**
   * Get weighted dimension score for a specific dimension
   */
  getWeightedScore(dimension: keyof QualityDimensions, value: number): number {
    const weight = this.weights[dimension] || 1.0;
    return value * weight;
  }

  /**
   * Check if a dimension is critical
   */
  isCriticalDimension(dimension: keyof QualityDimensions): boolean {
    return this.criticalDimensions.has(dimension);
  }

  /**
   * Get all dimensions below a specific threshold
   */
  getDimensionsBelowThreshold(
    dimensions: QualityDimensions,
    threshold?: number
  ): Array<{ dimension: keyof QualityDimensions; value: number; deficit: number }> {
    const thresh = threshold ?? this.policy.boundaryThreshold;
    const below: Array<{ dimension: keyof QualityDimensions; value: number; deficit: number }> = [];

    const entries = Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][];

    for (const [key, value] of entries) {
      if (value !== undefined && value < thresh) {
        below.push({
          dimension: key,
          value,
          deficit: thresh - value,
        });
      }
    }

    // Sort by deficit (largest first)
    return below.sort((a, b) => b.deficit - a.deficit);
  }

  /**
   * Calculate a summary of dimension health
   */
  getDimensionSummary(dimensions: QualityDimensions): {
    healthy: number;
    warning: number;
    critical: number;
    total: number;
  } {
    const thresh = this.policy.boundaryThreshold;
    const criticalThresh = thresh - this.policy.boundaryTolerance;

    let healthy = 0;
    let warning = 0;
    let critical = 0;
    let total = 0;

    const entries = Object.entries(dimensions) as [keyof QualityDimensions, number | undefined][];

    for (const [, value] of entries) {
      if (value !== undefined) {
        total++;
        if (value >= thresh) {
          healthy++;
        } else if (value >= criticalThresh) {
          warning++;
        } else {
          critical++;
        }
      }
    }

    return { healthy, warning, critical, total };
  }
}

/**
 * Factory function to create a lambda calculator with default settings
 */
export function createLambdaCalculator(
  config?: Partial<LambdaCalculatorConfig>
): LambdaCalculator {
  return new LambdaCalculator(config);
}

/**
 * Convenience function to calculate lambda from metrics
 */
export function calculateQualityLambda(
  metrics: QualityMetricsInput,
  config?: Partial<LambdaCalculatorConfig>
): QualityLambda {
  const calculator = createLambdaCalculator(config);
  return calculator.calculate(metrics);
}
