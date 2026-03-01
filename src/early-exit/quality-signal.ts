/**
 * Agentic QE v3 - Quality Signal Calculator
 * ADR-033: Lambda-stability decisions with speculative execution
 *
 * This module computes quality signals from layer results for early exit decisions.
 * The lambda value represents overall quality confidence on a 0-100 scale.
 */

import {
  LayerResult,
  QualitySignal,
  QualityFlags,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Boundary threshold for quality metrics (70%) */
const BOUNDARY_THRESHOLD = 70;

/** Margin around boundary for edge detection */
const BOUNDARY_MARGIN = 10;

/** Minimum issue value to be considered significant */
const ISSUE_SIGNIFICANCE_THRESHOLD = 0.1;

/** Weights for lambda components */
const LAMBDA_WEIGHTS = {
  passRate: 0.4,
  coverage: 0.35,
  stability: 0.25,
} as const;

/** Thresholds for critical conditions */
const CRITICAL_THRESHOLDS = {
  minPassRate: 0.5,
  minCoverage: 0.3,
  maxFlakyRatio: 0.3,
  coverageDropThreshold: 0.1,
} as const;

// ============================================================================
// Quality Signal Calculator
// ============================================================================

/**
 * Calculate quality signal from a layer result
 *
 * The quality signal includes:
 * - Lambda: Overall quality score (0-100) based on pass rate, coverage, and stability
 * - Boundary edges: Count of metrics near the 70% threshold
 * - Boundary concentration: How concentrated issues are
 * - Control flags for special conditions
 *
 * @param layerResult - Result from executing a test layer
 * @param previousSignal - Previous quality signal for delta calculation
 * @returns Quality signal for early exit decision
 */
export function calculateQualitySignal(
  layerResult: LayerResult,
  previousSignal?: QualitySignal
): QualitySignal {
  // Calculate component lambdas (0-100 scale)
  const passRateLambda = layerResult.passRate * 100;
  const coverageLambda = layerResult.coverage * 100;
  const stabilityLambda = (1 - layerResult.flakyRatio) * 100;

  // Calculate weighted lambda
  const weightedLambda =
    passRateLambda * LAMBDA_WEIGHTS.passRate +
    coverageLambda * LAMBDA_WEIGHTS.coverage +
    stabilityLambda * LAMBDA_WEIGHTS.stability;

  // Lambda is the minimum of weighted and component minimums
  // This ensures we don't have false confidence when one metric is very low
  const minComponent = Math.min(passRateLambda, coverageLambda, stabilityLambda);
  const lambda = Math.min(weightedLambda, minComponent * 1.2); // Allow slight boost if weighted is good

  // Get previous lambda for delta calculation
  const lambdaPrev = previousSignal?.lambda ?? layerResult.previousLambda ?? lambda;

  // Count metrics near the boundary threshold (70% +/- 10%)
  const boundaryEdges = countBoundaryEdges(passRateLambda, coverageLambda, stabilityLambda);

  // Calculate concentration of issues
  const boundaryConcentration = calculateBoundaryConcentration(layerResult);

  // Count quality partitions (distinct issue clusters)
  const partitionCount = countQualityPartitions(layerResult);

  // Determine control flags
  const flags = calculateFlags(layerResult, lambdaPrev, lambda);

  return {
    lambda: Math.round(lambda * 100) / 100, // Round to 2 decimal places
    lambdaPrev,
    boundaryEdges,
    boundaryConcentration,
    partitionCount,
    flags,
    timestamp: new Date(),
    sourceLayer: layerResult.layerIndex,
  };
}

/**
 * Count how many metrics are near the boundary threshold
 *
 * Metrics at the boundary (70% +/- 10%) indicate uncertainty
 * and suggest we should continue to deeper layers.
 */
function countBoundaryEdges(
  passRateLambda: number,
  coverageLambda: number,
  stabilityLambda: number
): number {
  let count = 0;
  const lowerBound = BOUNDARY_THRESHOLD - BOUNDARY_MARGIN;
  const upperBound = BOUNDARY_THRESHOLD + BOUNDARY_MARGIN;

  if (passRateLambda >= lowerBound && passRateLambda <= upperBound) {
    count++;
  }
  if (coverageLambda >= lowerBound && coverageLambda <= upperBound) {
    count++;
  }
  if (stabilityLambda >= lowerBound && stabilityLambda <= upperBound) {
    count++;
  }

  return count;
}

/**
 * Calculate the concentration of quality issues
 *
 * Higher concentration means issues are clustered together,
 * which might indicate a systemic problem requiring deeper investigation.
 *
 * @returns Concentration value between 0 and 1
 */
function calculateBoundaryConcentration(layerResult: LayerResult): number {
  // Identify significant issues (values > 10%)
  const issues: number[] = [];

  // Pass rate deficit
  const passRateDeficit = 1 - layerResult.passRate;
  if (passRateDeficit > ISSUE_SIGNIFICANCE_THRESHOLD) {
    issues.push(passRateDeficit);
  }

  // Coverage deficit
  const coverageDeficit = 1 - layerResult.coverage;
  if (coverageDeficit > ISSUE_SIGNIFICANCE_THRESHOLD) {
    issues.push(coverageDeficit);
  }

  // Flaky ratio (already an issue indicator)
  if (layerResult.flakyRatio > ISSUE_SIGNIFICANCE_THRESHOLD) {
    issues.push(layerResult.flakyRatio);
  }

  // No significant issues = no concentration
  if (issues.length === 0) {
    return 0;
  }

  // Calculate concentration as average of significant issues
  const sum = issues.reduce((a, b) => a + b, 0);
  const concentration = sum / issues.length;

  // Scale by number of issues to penalize multiple problem areas
  const scaledConcentration = concentration * (1 + (issues.length - 1) * 0.2);

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, scaledConcentration));
}

/**
 * Count quality partitions in the results
 *
 * Partitions represent distinct clusters of quality issues.
 * More partitions suggest more investigation is needed.
 */
export function countQualityPartitions(layerResult: LayerResult): number {
  let partitions = 0;

  // Count distinct issue categories
  if (layerResult.passRate < 0.9) {
    partitions++; // Test failure partition
  }
  if (layerResult.coverage < 0.7) {
    partitions++; // Coverage partition
  }
  if (layerResult.flakyRatio > 0.05) {
    partitions++; // Flakiness partition
  }

  // Additional partitions from test result analysis
  if (layerResult.testResults) {
    const failedCategories = new Set<string>();
    for (const test of layerResult.testResults) {
      if (test.status === 'failed' && test.error) {
        // Categorize by error type
        if (test.error.includes('timeout')) {
          failedCategories.add('timeout');
        } else if (test.error.includes('assertion')) {
          failedCategories.add('assertion');
        } else if (test.error.includes('network')) {
          failedCategories.add('network');
        } else if (test.error.includes('memory')) {
          failedCategories.add('memory');
        } else {
          failedCategories.add('other');
        }
      }
    }
    partitions += Math.min(failedCategories.size, 3); // Cap at 3 additional partitions
  }

  return Math.min(partitions, 10); // Cap total partitions
}

/**
 * Calculate control flags for special conditions
 */
function calculateFlags(
  layerResult: LayerResult,
  previousLambda: number,
  currentLambda: number
): number {
  let flags = QualityFlags.NONE;

  // Critical failure: pass rate below 50%
  if (layerResult.passRate < CRITICAL_THRESHOLDS.minPassRate) {
    flags |= QualityFlags.CRITICAL_FAILURE;
    flags |= QualityFlags.FORCE_CONTINUE;
  }

  // Coverage regression: significant drop from previous
  const lambdaDrop = previousLambda - currentLambda;
  if (lambdaDrop > CRITICAL_THRESHOLDS.coverageDropThreshold * 100) {
    flags |= QualityFlags.COVERAGE_REGRESSION;
    flags |= QualityFlags.FORCE_CONTINUE;
  }

  // High flaky rate
  if (layerResult.flakyRatio > CRITICAL_THRESHOLDS.maxFlakyRatio) {
    flags |= QualityFlags.HIGH_FLAKY_RATE;
  }

  // Very low coverage
  if (layerResult.coverage < CRITICAL_THRESHOLDS.minCoverage) {
    flags |= QualityFlags.FORCE_CONTINUE;
  }

  return flags;
}

/**
 * Calculate lambda stability between two signals
 *
 * Stability is the inverse of the relative change in lambda.
 * High stability (close to 1) indicates consistent quality signals.
 *
 * @param current - Current quality signal
 * @param previous - Previous quality signal
 * @returns Stability value between 0 and 1
 */
export function calculateLambdaStability(
  current: QualitySignal,
  previous?: QualitySignal
): number {
  if (!previous || previous.lambda === 0) {
    // First signal or zero previous - assume moderate stability
    return 0.75;
  }

  const delta = Math.abs(current.lambda - previous.lambda);
  const relativeChange = delta / previous.lambda;

  // Stability is inverse of relative change, clamped to [0, 1]
  const stability = 1 - Math.min(1, relativeChange);

  return Math.round(stability * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Calculate combined confidence from quality signal
 *
 * Confidence combines lambda strength, stability, and boundary dispersion.
 *
 * @param signal - Quality signal
 * @param stability - Lambda stability value
 * @returns Confidence value between 0 and 1
 */
export function calculateConfidence(
  signal: QualitySignal,
  stability: number
): number {
  // Lambda strength (normalized to 0-1)
  const lambdaStrength = signal.lambda / 100;

  // Boundary dispersion (inverse of concentration)
  const boundaryDispersion = 1 - signal.boundaryConcentration;

  // Boundary edge penalty (more edges = less confidence)
  const edgePenalty = 1 - (signal.boundaryEdges * 0.1);

  // Weighted combination
  const confidence =
    lambdaStrength * 0.35 +
    stability * 0.35 +
    boundaryDispersion * 0.15 +
    edgePenalty * 0.15;

  // Apply flag penalties
  let flagPenalty = 0;
  if (signal.flags & QualityFlags.CRITICAL_FAILURE) {
    flagPenalty += 0.3;
  }
  if (signal.flags & QualityFlags.COVERAGE_REGRESSION) {
    flagPenalty += 0.2;
  }
  if (signal.flags & QualityFlags.HIGH_FLAKY_RATE) {
    flagPenalty += 0.1;
  }

  const finalConfidence = Math.max(0, confidence - flagPenalty);

  return Math.round(finalConfidence * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Create a quality signal from basic metrics
 *
 * Utility function for creating signals without full layer results.
 */
export function createQualitySignal(
  passRate: number,
  coverage: number,
  flakyRatio: number,
  previousLambda?: number,
  layerIndex = 0
): QualitySignal {
  const layerResult: LayerResult = {
    layerIndex,
    layerType: 'unit',
    passRate,
    coverage,
    flakyRatio,
    previousLambda,
    totalTests: 100,
    passedTests: Math.round(passRate * 100),
    failedTests: Math.round((1 - passRate) * 100),
    skippedTests: 0,
    duration: 1000,
  };

  return calculateQualitySignal(layerResult);
}

/**
 * Check if quality signal indicates stable exit conditions
 */
export function isStableForExit(
  signal: QualitySignal,
  minLambda: number,
  minStability: number
): boolean {
  // Check for force continue flags
  if (signal.flags & QualityFlags.FORCE_CONTINUE) {
    return false;
  }

  // Check lambda threshold
  if (signal.lambda < minLambda) {
    return false;
  }

  // Calculate stability
  const stability = calculateLambdaStability(signal);
  if (stability < minStability) {
    return false;
  }

  return true;
}
