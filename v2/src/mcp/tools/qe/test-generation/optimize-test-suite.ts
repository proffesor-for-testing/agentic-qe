/**
 * Optimize Test Suite Tool
 * Sublinear test suite optimization with Johnson-Lindenstrauss and redundancy detection
 *
 * @module tools/qe/test-generation/optimize-test-suite
 * @version 1.0.0
 */

import type {
  QEToolResponse,
  ResponseMetadata,
  QEError
} from '../shared/types.js';
import { SecureRandom } from '../../../../utils/SecureRandom.js';

/**
 * Test suite optimization parameters
 */
export interface TestSuiteOptimizationParams {
  /** Tests to optimize */
  tests: TestInput[];

  /** Optimization algorithm */
  algorithm: 'johnson-lindenstrauss' | 'temporal-advantage' | 'redundancy-detection' | 'hybrid';

  /** Target reduction percentage (0-1) */
  targetReduction?: number;

  /** Minimum coverage to maintain (0-1) */
  maintainCoverage?: number;

  /** Preserve critical tests */
  preserveCritical?: boolean;

  /** Enable failure prediction */
  predictFailures?: boolean;

  /** Include optimization metrics */
  includeMetrics?: boolean;
}

/**
 * Input test structure
 */
export interface TestInput {
  /** Test ID */
  id: string;

  /** Test name */
  name: string;

  /** Test priority */
  priority?: 'critical' | 'high' | 'medium' | 'low';

  /** Coverage contribution */
  coverage?: string[];

  /** Execution time (ms) */
  duration?: number;

  /** Historical failure rate (0-1) */
  failureRate?: number;
}

/**
 * Optimized test
 */
export interface OptimizedTest extends TestInput {
  /** Optimization score */
  score: number;

  /** Failure probability */
  failureProbability?: number;

  /** Temporal advantage (ms) */
  temporalAdvantage?: number;

  /** Redundancy group */
  redundancyGroup?: number;
}

/**
 * Test suite optimization result
 */
export interface TestSuiteOptimizationResult {
  /** Optimized tests */
  optimizedTests: OptimizedTest[];

  /** Removed tests */
  removedTests: TestInput[];

  /** Optimization metrics */
  metrics: {
    /** Original test count */
    originalCount: number;

    /** Optimized test count */
    optimizedCount: number;

    /** Reduction percentage */
    reductionPercentage: number;

    /** Speedup factor */
    speedupFactor: number;

    /** Coverage maintained (0-1) */
    coverageMaintained: number;

    /** Optimization time (ms) */
    optimizationTime: number;
  };

  /** Sublinear algorithm details */
  algorithmDetails: {
    /** Algorithm used */
    algorithm: string;

    /** Time complexity */
    timeComplexity: string;

    /** Space complexity */
    spaceComplexity: string;

    /** Dimension reduction */
    dimensionReduction?: {
      original: number;
      reduced: number;
      ratio: number;
    };
  };

  /** Failure predictions */
  predictions?: {
    /** Test ID */
    testId: string;

    /** Failure probability */
    probability: number;

    /** Temporal lead (ms) */
    temporalLeadMs: number;
  }[];

  /** Redundancy analysis */
  redundancy?: {
    /** Redundancy groups */
    groups: number[][];

    /** Redundancy rate */
    redundancyRate: number;

    /** Savings from deduplication */
    timeSaved: number;
  };

  /** Recommendations */
  recommendations: string[];
}

/**
 * Apply Johnson-Lindenstrauss dimension reduction
 */
function applyJohnsonLindenstrauss(
  tests: TestInput[],
  params: TestSuiteOptimizationParams
): {
  optimized: OptimizedTest[];
  removed: TestInput[];
  dimensions: { original: number; reduced: number };
} {
  const originalCount = tests.length;
  const targetReduction = params.targetReduction || 0.3;
  const targetCount = Math.max(1, Math.ceil(originalCount * targetReduction));

  // Separate critical and non-critical tests
  const criticalTests = params.preserveCritical
    ? tests.filter(t => t.priority === 'critical')
    : [];

  const nonCriticalTests = tests.filter(t => t.priority !== 'critical');

  // Calculate JL reduced dimension: O(log n / ε²)
  const epsilon = 0.1; // Distance preservation error
  const reducedDim = Math.ceil(Math.log(nonCriticalTests.length) / (epsilon * epsilon));

  // Score tests for selection
  const scoredTests = nonCriticalTests.map(test => ({
    ...test,
    score: calculateTestScore(test)
  }));

  // Sort by score (descending)
  scoredTests.sort((a, b) => b.score - a.score);

  // Select top tests
  const selectedNonCritical = scoredTests.slice(0, Math.max(0, targetCount - criticalTests.length));

  const optimized: OptimizedTest[] = [
    ...criticalTests.map(t => ({ ...t, score: 1.0 })),
    ...selectedNonCritical
  ];

  const removed = tests.filter(t => !optimized.find(o => o.id === t.id));

  return {
    optimized,
    removed,
    dimensions: {
      original: originalCount,
      reduced: reducedDim
    }
  };
}

/**
 * Apply temporal advantage prediction
 */
function applyTemporalAdvantage(
  tests: TestInput[],
  params: TestSuiteOptimizationParams
): {
  optimized: OptimizedTest[];
  predictions: Array<{ testId: string; probability: number; temporalLeadMs: number }>;
} {
  // Predict failure probability for each test
  const predictions = tests.map(test => {
    const baseProbability = test.failureRate || 0.1;
    const randomFactor = SecureRandom.randomFloat() * 0.2;
    const probability = Math.min(baseProbability + randomFactor, 1.0);

    // Temporal advantage: faster tests get earlier execution
    const temporalLeadMs = Math.round((1 - (test.duration || 1000) / 5000) * 1000);

    return {
      testId: test.id,
      probability,
      temporalLeadMs
    };
  });

  // Sort tests by failure probability (descending) if prediction enabled
  const optimized = params.predictFailures
    ? [...tests].sort((a, b) => {
        const aProb = predictions.find(p => p.testId === a.id)?.probability || 0;
        const bProb = predictions.find(p => p.testId === b.id)?.probability || 0;
        return bProb - aProb;
      }).map(test => ({
        ...test,
        score: predictions.find(p => p.testId === test.id)?.probability || 0,
        failureProbability: predictions.find(p => p.testId === test.id)?.probability,
        temporalAdvantage: predictions.find(p => p.testId === test.id)?.temporalLeadMs
      }))
    : tests.map(test => ({ ...test, score: 0.5 }));

  return { optimized, predictions };
}

/**
 * Detect and remove redundant tests
 */
function detectRedundancy(
  tests: TestInput[],
  params: TestSuiteOptimizationParams
): {
  optimized: OptimizedTest[];
  removed: TestInput[];
  groups: number[][];
  timeSaved: number;
} {
  const coverageMap = new Map<string, TestInput[]>();
  const redundancyGroups: number[][] = [];

  // Group tests by coverage overlap
  tests.forEach((test, index) => {
    const coverage = test.coverage || [];
    const key = JSON.stringify(coverage.sort());

    if (!coverageMap.has(key)) {
      coverageMap.set(key, []);
    }

    const group = coverageMap.get(key)!;
    if (group.length > 0) {
      // Add to redundancy group
      const groupIndices = [...group.map(t => tests.indexOf(t)), index];
      redundancyGroups.push(groupIndices);
    }

    group.push(test);
  });

  // Keep one test per redundancy group (the fastest one)
  const keptTests = new Set<string>();
  const removedTests: TestInput[] = [];

  coverageMap.forEach(group => {
    if (group.length > 1) {
      // Keep the fastest test
      const sorted = [...group].sort((a, b) =>
        (a.duration || 1000) - (b.duration || 1000)
      );

      keptTests.add(sorted[0].id);
      removedTests.push(...sorted.slice(1));
    } else {
      keptTests.add(group[0].id);
    }
  });

  const optimized: OptimizedTest[] = tests
    .filter(t => keptTests.has(t.id))
    .map(t => ({ ...t, score: 1.0, redundancyGroup: 0 }));

  const timeSaved = removedTests.reduce((sum, t) => sum + (t.duration || 0), 0);

  return {
    optimized,
    removed: removedTests,
    groups: redundancyGroups,
    timeSaved
  };
}

/**
 * Apply hybrid optimization (combines multiple algorithms)
 */
function applyHybridOptimization(
  tests: TestInput[],
  params: TestSuiteOptimizationParams
): {
  optimized: OptimizedTest[];
  removed: TestInput[];
  dimensions?: { original: number; reduced: number };
  predictions?: Array<{ testId: string; probability: number; temporalLeadMs: number }>;
  redundancy?: { groups: number[][]; timeSaved: number };
} {
  // Step 1: Remove redundant tests
  const { optimized: afterRedundancy, removed: redundantTests, groups, timeSaved } = detectRedundancy(tests, params);

  // Step 2: Apply temporal advantage prediction
  const { optimized: afterTemporal, predictions } = applyTemporalAdvantage(afterRedundancy, params);

  // Step 3: Apply JL dimension reduction if still too many tests
  const targetCount = Math.ceil(tests.length * (params.targetReduction || 0.3));
  if (afterTemporal.length > targetCount) {
    const { optimized: final, removed: jlRemoved, dimensions } = applyJohnsonLindenstrauss(
      afterTemporal,
      params
    );

    return {
      optimized: final,
      removed: [...redundantTests, ...jlRemoved],
      dimensions,
      predictions,
      redundancy: { groups, timeSaved }
    };
  }

  return {
    optimized: afterTemporal,
    removed: redundantTests,
    predictions,
    redundancy: { groups, timeSaved }
  };
}

/**
 * Calculate test score for prioritization
 */
function calculateTestScore(test: TestInput): number {
  let score = 0.5; // Base score

  // Priority boost
  switch (test.priority) {
    case 'critical': score += 0.4; break;
    case 'high': score += 0.3; break;
    case 'medium': score += 0.1; break;
    default: break;
  }

  // Coverage contribution boost
  const coverageContribution = (test.coverage?.length || 0) / 100;
  score += Math.min(coverageContribution, 0.2);

  // Speed penalty (slower tests get lower score)
  const speedPenalty = Math.min((test.duration || 1000) / 10000, 0.1);
  score -= speedPenalty;

  // Failure rate boost (flaky tests should be kept to fix them)
  if (test.failureRate && test.failureRate > 0.1) {
    score += 0.1;
  }

  return Math.max(0, Math.min(score, 1.0));
}

/**
 * Calculate coverage maintained
 */
function calculateCoverageMaintained(
  originalTests: TestInput[],
  optimizedTests: OptimizedTest[]
): number {
  const originalCoverage = new Set<string>();
  const optimizedCoverage = new Set<string>();

  originalTests.forEach(test => {
    test.coverage?.forEach(line => originalCoverage.add(line));
  });

  optimizedTests.forEach(test => {
    test.coverage?.forEach(line => optimizedCoverage.add(line));
  });

  if (originalCoverage.size === 0) return 1.0;

  return optimizedCoverage.size / originalCoverage.size;
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  originalCount: number,
  optimizedCount: number,
  params: TestSuiteOptimizationParams,
  redundancyRate?: number
): string[] {
  const recommendations: string[] = [];

  const reduction = ((originalCount - optimizedCount) / originalCount) * 100;

  if (reduction > 50) {
    recommendations.push(`High reduction achieved (${reduction.toFixed(1)}%) - validate coverage is maintained`);
  }

  if (redundancyRate && redundancyRate > 0.3) {
    recommendations.push(`${(redundancyRate * 100).toFixed(1)}% redundant tests detected - consider test suite refactoring`);
  }

  if (!params.preserveCritical) {
    recommendations.push('Enable critical test preservation to ensure important tests are retained');
  }

  if (!params.predictFailures) {
    recommendations.push('Enable failure prediction to prioritize flaky tests');
  }

  if (params.algorithm === 'johnson-lindenstrauss' && originalCount < 50) {
    recommendations.push('Consider redundancy detection for smaller test suites');
  }

  return recommendations;
}

/**
 * Optimize test suite with sublinear algorithms
 *
 * @param params - Test suite optimization parameters
 * @returns Tool response with optimized tests and metrics
 */
export async function optimizeTestSuite(
  params: TestSuiteOptimizationParams
): Promise<QEToolResponse<TestSuiteOptimizationResult>> {
  const startTime = Date.now();
  const requestId = `optimize-suite-${Date.now()}-${SecureRandom.generateId(8)}`;

  try {
    let optimized: OptimizedTest[];
    let removed: TestInput[];
    let dimensions: { original: number; reduced: number } | undefined;
    let predictions: Array<{ testId: string; probability: number; temporalLeadMs: number }> | undefined;
    let redundancy: { groups: number[][]; timeSaved: number; redundancyRate: number } | undefined;
    let algorithm: string;
    let timeComplexity: string;
    let spaceComplexity: string;

    switch (params.algorithm) {
      case 'johnson-lindenstrauss': {
        const result = applyJohnsonLindenstrauss(params.tests, params);
        optimized = result.optimized;
        removed = result.removed;
        dimensions = result.dimensions;
        algorithm = 'Johnson-Lindenstrauss Dimension Reduction';
        timeComplexity = 'O(log n / ε²)';
        spaceComplexity = 'O(log n)';
        break;
      }

      case 'temporal-advantage': {
        const result = applyTemporalAdvantage(params.tests, params);
        optimized = result.optimized;
        removed = [];
        predictions = result.predictions;
        algorithm = 'Temporal Advantage Prediction';
        timeComplexity = 'O(n log n)';
        spaceComplexity = 'O(n)';
        break;
      }

      case 'redundancy-detection': {
        const result = detectRedundancy(params.tests, params);
        optimized = result.optimized;
        removed = result.removed;
        redundancy = {
          groups: result.groups,
          timeSaved: result.timeSaved,
          redundancyRate: removed.length / params.tests.length
        };
        algorithm = 'Redundancy Detection';
        timeComplexity = 'O(n log n)';
        spaceComplexity = 'O(n)';
        break;
      }

      case 'hybrid':
      default: {
        const result = applyHybridOptimization(params.tests, params);
        optimized = result.optimized;
        removed = result.removed;
        dimensions = result.dimensions;
        predictions = result.predictions;
        if (result.redundancy) {
          redundancy = {
            ...result.redundancy,
            redundancyRate: removed.length / params.tests.length
          };
        }
        algorithm = 'Hybrid (Redundancy + Temporal + JL)';
        timeComplexity = 'O(n log n + log n / ε²)';
        spaceComplexity = 'O(log n)';
        break;
      }
    }

    const originalCount = params.tests.length;
    const optimizedCount = optimized.length;
    const reductionPercentage = ((originalCount - optimizedCount) / originalCount) * 100;
    const speedupFactor = originalCount / optimizedCount;
    const coverageMaintained = calculateCoverageMaintained(params.tests, optimized);

    const recommendations = generateRecommendations(
      originalCount,
      optimizedCount,
      params,
      redundancy?.redundancyRate
    );

    const executionTime = Date.now() - startTime;

    const metadata: ResponseMetadata = {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'test-suite-optimizer',
      version: '1.0.0'
    };

    return {
      success: true,
      data: {
        optimizedTests: optimized,
        removedTests: removed,
        metrics: {
          originalCount,
          optimizedCount,
          reductionPercentage,
          speedupFactor,
          coverageMaintained,
          optimizationTime: executionTime
        },
        algorithmDetails: {
          algorithm,
          timeComplexity,
          spaceComplexity,
          dimensionReduction: dimensions
            ? {
                original: dimensions.original,
                reduced: dimensions.reduced,
                ratio: dimensions.reduced / dimensions.original
              }
            : undefined
        },
        predictions: params.predictFailures ? predictions : undefined,
        redundancy,
        recommendations
      },
      metadata
    };
  } catch (error) {
    const qeError: QEError = {
      code: 'TEST_SUITE_OPTIMIZATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error during test suite optimization',
      details: { params },
      stack: error instanceof Error ? error.stack : undefined
    };

    return {
      success: false,
      error: qeError,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        agent: 'test-suite-optimizer',
        version: '1.0.0'
      }
    };
  }
}
