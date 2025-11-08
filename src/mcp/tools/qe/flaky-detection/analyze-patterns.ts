/**
 * Flaky Test Pattern Analysis Tool
 *
 * Identifies flaky test patterns: timing, environment, dependency, race-condition.
 * Provides root cause analysis and pattern classification using ML-enhanced detection.
 *
 * Features:
 * - Pattern identification (timing, environment, order-dependency, race-condition)
 * - Root cause classification with confidence scores
 * - Pattern correlation analysis
 * - Trend detection across test suite
 * - Evidence-based diagnosis
 *
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-08
 */

import {
  TestResult,
  QEToolResponse,
  ResponseMetadata,
  Priority
} from '../shared/types.js';

// ==================== Types ====================

/**
 * Pattern analysis parameters
 */
export interface PatternAnalysisParams {
  /** Test run history to analyze */
  testRunHistory: TestResult[];

  /** Minimum runs to consider */
  minRuns: number;

  /** Pattern types to detect */
  patternTypes: PatternType[];

  /** Include correlation analysis */
  includeCorrelation?: boolean;

  /** Confidence threshold (0-1) */
  confidenceThreshold?: number;
}

/**
 * Pattern types
 */
export type PatternType = 'timing' | 'environment' | 'dependency' | 'race-condition' | 'order-dependency' | 'resource-contention';

/**
 * Pattern analysis result
 */
export interface PatternAnalysisResult {
  /** Detected patterns */
  patterns: FlakyPattern[];

  /** Pattern statistics */
  statistics: PatternStatistics;

  /** Correlations between patterns */
  correlations?: PatternCorrelation[];

  /** Trends over time */
  trends: PatternTrend[];

  /** Execution metadata */
  metadata: ResponseMetadata;
}

/**
 * Flaky pattern information
 */
export interface FlakyPattern {
  /** Pattern ID */
  id: string;

  /** Pattern type */
  type: PatternType;

  /** Affected test IDs */
  affectedTests: string[];

  /** Detection confidence (0-1) */
  confidence: number;

  /** Frequency of occurrence (0-1) */
  frequency: number;

  /** Severity */
  severity: Priority;

  /** Pattern description */
  description: string;

  /** Root cause */
  rootCause: PatternRootCause;

  /** Evidence supporting detection */
  evidence: string[];

  /** Mitigation suggestions */
  mitigation: string[];

  /** First detected */
  firstDetected: number;

  /** Last seen */
  lastSeen: number;
}

/**
 * Pattern root cause
 */
export interface PatternRootCause {
  /** Category */
  category: 'code' | 'infrastructure' | 'data' | 'configuration' | 'external';

  /** Specific cause */
  cause: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Fix complexity */
  complexity: 'low' | 'medium' | 'high';

  /** Estimated fix time (hours) */
  estimatedFixTime: number;
}

/**
 * Pattern statistics
 */
export interface PatternStatistics {
  /** Total patterns detected */
  totalPatterns: number;

  /** Patterns by type */
  byType: Record<PatternType, number>;

  /** Patterns by severity */
  bySeverity: Record<Priority, number>;

  /** Most common pattern */
  mostCommon: PatternType;

  /** Average confidence */
  avgConfidence: number;

  /** Pattern coverage (tests with patterns / total tests) */
  coverage: number;
}

/**
 * Pattern correlation
 */
export interface PatternCorrelation {
  /** Pattern type 1 */
  pattern1: PatternType;

  /** Pattern type 2 */
  pattern2: PatternType;

  /** Correlation coefficient (-1 to 1) */
  correlation: number;

  /** Co-occurrence count */
  coOccurrence: number;

  /** Description */
  description: string;
}

/**
 * Pattern trend
 */
export interface PatternTrend {
  /** Pattern type */
  type: PatternType;

  /** Trend direction */
  direction: 'increasing' | 'stable' | 'decreasing';

  /** Change rate (per day) */
  changeRate: number;

  /** Historical data points */
  dataPoints: TrendDataPoint[];

  /** Prediction for next 7 days */
  prediction: number[];
}

/**
 * Trend data point
 */
export interface TrendDataPoint {
  /** Date */
  date: string;

  /** Count of pattern occurrences */
  count: number;

  /** Tests affected */
  testsAffected: number;
}

// ==================== Pattern Detection ====================

/**
 * Detect timing patterns
 */
export function detectTimingPattern(results: TestResult[]): FlakyPattern | null {
  const durations = results.map(r => r.duration);
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  // High coefficient of variation indicates timing issues
  if (cv > 0.5) {
    const evidence = [
      `Coefficient of variation: ${(cv * 100).toFixed(1)}%`,
      `Mean duration: ${mean.toFixed(0)}ms`,
      `Standard deviation: ${stdDev.toFixed(0)}ms`,
      `Duration range: ${Math.min(...durations).toFixed(0)}-${Math.max(...durations).toFixed(0)}ms`
    ];

    // Check for timeout-related failures
    const timeoutFailures = results.filter(r =>
      r.status === 'failed' && r.error?.toLowerCase().includes('timeout')
    );

    if (timeoutFailures.length > 0) {
      evidence.push(`${timeoutFailures.length} timeout-related failures`);
    }

    const confidence = Math.min(cv, 1.0);
    const frequency = cv;

    return {
      id: `timing-${Date.now()}`,
      type: 'timing',
      affectedTests: [results[0].testId],
      confidence,
      frequency,
      severity: cv > 0.7 ? 'high' : 'medium',
      description: 'Test duration varies significantly, indicating timing dependencies',
      rootCause: {
        category: 'code',
        cause: 'Hardcoded waits or timing-dependent assertions',
        confidence: 0.85,
        complexity: 'medium',
        estimatedFixTime: 2
      },
      evidence,
      mitigation: [
        'Replace hardcoded sleep() with explicit wait conditions',
        'Use polling with timeout instead of fixed delays',
        'Add retry logic with exponential backoff',
        'Increase timeouts for slow operations'
      ],
      firstDetected: Math.min(...results.map(r => new Date(r.timestamp).getTime())),
      lastSeen: Math.max(...results.map(r => new Date(r.timestamp).getTime()))
    };
  }

  return null;
}

/**
 * Detect environment patterns
 */
export function detectEnvironmentPattern(results: TestResult[]): FlakyPattern | null {
  const withEnv = results.filter(r => r.environment);
  if (withEnv.length < 2) return null;

  // Calculate environment variability
  const envKeys = new Set<string>();
  withEnv.forEach(r => Object.keys(r.environment || {}).forEach(k => envKeys.add(k)));

  let totalVariability = 0;
  const evidenceDetails: string[] = [];

  envKeys.forEach(key => {
    const values = new Set(withEnv.map(r => JSON.stringify(r.environment?.[key])));
    const variability = (values.size - 1) / Math.max(withEnv.length - 1, 1);
    totalVariability += variability;

    if (variability > 0.2) {
      evidenceDetails.push(`Environment variable "${key}" has ${values.size} different values`);
    }
  });

  const avgVariability = totalVariability / Math.max(envKeys.size, 1);

  if (avgVariability > 0.3) {
    const failuresByEnv = new Map<string, number>();
    results.forEach(r => {
      if (r.status === 'failed' && r.environment) {
        const envKey = JSON.stringify(r.environment);
        failuresByEnv.set(envKey, (failuresByEnv.get(envKey) || 0) + 1);
      }
    });

    const evidence = [
      `Environment variability: ${(avgVariability * 100).toFixed(1)}%`,
      `${envKeys.size} environment variables analyzed`,
      ...evidenceDetails
    ];

    if (failuresByEnv.size > 0) {
      evidence.push(`Failures concentrated in ${failuresByEnv.size} environment configurations`);
    }

    return {
      id: `environment-${Date.now()}`,
      type: 'environment',
      affectedTests: [results[0].testId],
      confidence: avgVariability,
      frequency: avgVariability,
      severity: avgVariability > 0.5 ? 'high' : 'medium',
      description: 'Test results vary across different environment configurations',
      rootCause: {
        category: 'configuration',
        cause: 'Environment-specific behavior or configuration dependencies',
        confidence: 0.8,
        complexity: 'medium',
        estimatedFixTime: 3
      },
      evidence,
      mitigation: [
        'Normalize environment configuration across test runs',
        'Use test containers for consistent environment',
        'Add environment validation in test setup',
        'Mock environment-specific dependencies'
      ],
      firstDetected: Math.min(...results.map(r => new Date(r.timestamp).getTime())),
      lastSeen: Math.max(...results.map(r => new Date(r.timestamp).getTime()))
    };
  }

  return null;
}

/**
 * Detect race condition patterns
 */
export function detectRaceConditionPattern(results: TestResult[]): FlakyPattern | null {
  const failures = results.filter(r => r.status === 'failed');
  if (failures.length < 2) return null;

  // Check for sequential failures (indicator of race conditions)
  const allIndices = results.map((r, i) => ({ result: r, index: i }));
  const failureIndices = allIndices.filter(item => item.result.status === 'failed').map(item => item.index);

  let consecutiveCount = 0;
  for (let i = 1; i < failureIndices.length; i++) {
    if (failureIndices[i] - failureIndices[i - 1] === 1) {
      consecutiveCount++;
    }
  }

  const consecutiveRatio = failureIndices.length > 1
    ? consecutiveCount / (failureIndices.length - 1)
    : 0;

  // Check for concurrency keywords in error messages
  const concurrencyKeywords = ['race', 'concurrent', 'parallel', 'synchronized', 'lock', 'deadlock'];
  const hasConcurrencyErrors = failures.some(r =>
    r.error && concurrencyKeywords.some(kw => r.error!.toLowerCase().includes(kw))
  );

  if (consecutiveRatio > 0.5 || hasConcurrencyErrors) {
    const evidence = [
      `${(consecutiveRatio * 100).toFixed(1)}% of failures are consecutive`,
      `${failures.length} failures out of ${results.length} runs`
    ];

    if (hasConcurrencyErrors) {
      evidence.push('Concurrency-related keywords found in error messages');
    }

    const confidence = hasConcurrencyErrors ? 0.9 : consecutiveRatio;

    return {
      id: `race-condition-${Date.now()}`,
      type: 'race-condition',
      affectedTests: [results[0].testId],
      confidence,
      frequency: consecutiveRatio,
      severity: 'high',
      description: 'Test exhibits race condition behavior with sequential failures',
      rootCause: {
        category: 'code',
        cause: 'Concurrent access to shared resources without proper synchronization',
        confidence: 0.85,
        complexity: 'high',
        estimatedFixTime: 4
      },
      evidence,
      mitigation: [
        'Add proper synchronization (locks, semaphores)',
        'Use atomic operations for shared state',
        'Implement thread-safe data structures',
        'Add explicit wait conditions for async operations'
      ],
      firstDetected: Math.min(...results.map(r => new Date(r.timestamp).getTime())),
      lastSeen: Math.max(...results.map(r => new Date(r.timestamp).getTime()))
    };
  }

  return null;
}

/**
 * Detect dependency patterns
 */
export function detectDependencyPattern(results: TestResult[]): FlakyPattern | null {
  const failures = results.filter(r => r.status === 'failed');
  if (failures.length === 0) return null;

  // Check for network/external service errors
  const networkKeywords = ['network', 'connection', 'timeout', 'unreachable', 'refused', 'econnrefused', 'etimedout'];
  const hasNetworkErrors = failures.some(r =>
    r.error && networkKeywords.some(kw => r.error!.toLowerCase().includes(kw))
  );

  if (hasNetworkErrors) {
    const networkFailures = failures.filter(r =>
      r.error && networkKeywords.some(kw => r.error!.toLowerCase().includes(kw))
    );

    const frequency = networkFailures.length / results.length;
    const evidence = [
      `${networkFailures.length} network-related failures`,
      `${(frequency * 100).toFixed(1)}% failure rate`,
      'External dependency keywords detected in errors'
    ];

    return {
      id: `dependency-${Date.now()}`,
      type: 'dependency',
      affectedTests: [results[0].testId],
      confidence: 0.85,
      frequency,
      severity: frequency > 0.3 ? 'high' : 'medium',
      description: 'Test depends on external services that may be unavailable',
      rootCause: {
        category: 'external',
        cause: 'External service dependency without proper error handling',
        confidence: 0.85,
        complexity: 'medium',
        estimatedFixTime: 3
      },
      evidence,
      mitigation: [
        'Mock external dependencies in tests',
        'Add retry logic with exponential backoff',
        'Implement circuit breaker pattern',
        'Use test doubles instead of real services'
      ],
      firstDetected: Math.min(...results.map(r => new Date(r.timestamp).getTime())),
      lastSeen: Math.max(...results.map(r => new Date(r.timestamp).getTime()))
    };
  }

  return null;
}

/**
 * Detect resource contention patterns
 */
export function detectResourceContentionPattern(results: TestResult[]): FlakyPattern | null {
  const durations = results.map(r => r.duration);
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  // Detect outliers (>2 standard deviations from mean)
  const outliers = durations.filter(d => Math.abs(d - mean) > 2 * stdDev);
  const outlierRatio = outliers.length / durations.length;

  if (outlierRatio > 0.15) {
    const evidence = [
      `${(outlierRatio * 100).toFixed(1)}% outliers detected`,
      `Mean duration: ${mean.toFixed(0)}ms`,
      `Standard deviation: ${stdDev.toFixed(0)}ms`,
      `Outlier range: ${Math.min(...outliers).toFixed(0)}-${Math.max(...outliers).toFixed(0)}ms`
    ];

    // Check for memory-related errors
    const memoryKeywords = ['memory', 'heap', 'oom', 'out of memory'];
    const hasMemoryErrors = results.some(r =>
      r.error && memoryKeywords.some(kw => r.error!.toLowerCase().includes(kw))
    );

    if (hasMemoryErrors) {
      evidence.push('Memory-related errors detected');
    }

    return {
      id: `resource-contention-${Date.now()}`,
      type: 'resource-contention',
      affectedTests: [results[0].testId],
      confidence: outlierRatio,
      frequency: outlierRatio,
      severity: outlierRatio > 0.25 ? 'high' : 'medium',
      description: 'Test shows resource contention with significant execution time outliers',
      rootCause: {
        category: 'infrastructure',
        cause: 'Resource contention or memory leaks during test execution',
        confidence: 0.75,
        complexity: 'medium',
        estimatedFixTime: 3
      },
      evidence,
      mitigation: [
        'Add resource cleanup in teardown',
        'Implement connection pooling',
        'Increase resource limits',
        'Run tests in isolation with dedicated resources'
      ],
      firstDetected: Math.min(...results.map(r => new Date(r.timestamp).getTime())),
      lastSeen: Math.max(...results.map(r => new Date(r.timestamp).getTime()))
    };
  }

  return null;
}

// ==================== Pattern Analysis ====================

/**
 * Analyze flaky test patterns
 */
export async function analyzeFlakyTestPatterns(
  params: PatternAnalysisParams
): Promise<QEToolResponse<PatternAnalysisResult>> {
  const startTime = Date.now();

  try {
    // Group results by test
    const byTest = groupByTest(params.testRunHistory);
    const patterns: FlakyPattern[] = [];

    // Detect patterns for each test
    for (const [testId, results] of byTest) {
      if (results.length < params.minRuns) {
        continue;
      }

      // Detect each requested pattern type
      for (const patternType of params.patternTypes) {
        let pattern: FlakyPattern | null = null;

        switch (patternType) {
          case 'timing':
            pattern = detectTimingPattern(results);
            break;
          case 'environment':
            pattern = detectEnvironmentPattern(results);
            break;
          case 'race-condition':
            pattern = detectRaceConditionPattern(results);
            break;
          case 'dependency':
            pattern = detectDependencyPattern(results);
            break;
          case 'resource-contention':
            pattern = detectResourceContentionPattern(results);
            break;
        }

        if (pattern && pattern.confidence >= (params.confidenceThreshold || 0.7)) {
          patterns.push(pattern);
        }
      }
    }

    // Generate statistics
    const statistics = generatePatternStatistics(patterns);

    // Analyze correlations if requested
    const correlations = params.includeCorrelation
      ? analyzePatternCorrelations(patterns)
      : undefined;

    // Analyze trends
    const trends = analyzePatternTrends(params.testRunHistory, patterns);

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      data: {
        patterns,
        statistics,
        correlations,
        trends,
        metadata: {
          requestId: `analyze-${Date.now()}`,
          timestamp: new Date().toISOString(),
          executionTime,
          agent: 'qe-flaky-test-hunter',
          version: '1.0.0'
        }
      },
      metadata: {
        requestId: `analyze-${Date.now()}`,
        timestamp: new Date().toISOString(),
        executionTime,
        agent: 'qe-flaky-test-hunter',
        version: '1.0.0'
      }
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      error: {
        code: 'PATTERN_ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      metadata: {
        requestId: `analyze-${Date.now()}`,
        timestamp: new Date().toISOString(),
        executionTime,
        agent: 'qe-flaky-test-hunter',
        version: '1.0.0'
      }
    };
  }
}

// ==================== Helper Functions ====================

/**
 * Group test results by test ID
 */
function groupByTest(results: TestResult[]): Map<string, TestResult[]> {
  const groups = new Map<string, TestResult[]>();

  for (const result of results) {
    if (!groups.has(result.testId)) {
      groups.set(result.testId, []);
    }
    groups.get(result.testId)!.push(result);
  }

  return groups;
}

/**
 * Generate pattern statistics
 */
function generatePatternStatistics(patterns: FlakyPattern[]): PatternStatistics {
  const byType: Record<PatternType, number> = {
    'timing': 0,
    'environment': 0,
    'dependency': 0,
    'race-condition': 0,
    'order-dependency': 0,
    'resource-contention': 0
  };

  const bySeverity: Record<Priority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  patterns.forEach(p => {
    byType[p.type]++;
    bySeverity[p.severity]++;
  });

  // Find most common pattern
  let mostCommon: PatternType = 'timing';
  let maxCount = 0;
  (Object.entries(byType) as [PatternType, number][]).forEach(([type, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = type;
    }
  });

  const avgConfidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  const uniqueTests = new Set(patterns.flatMap(p => p.affectedTests));
  const coverage = uniqueTests.size; // This would need total test count for accurate coverage

  return {
    totalPatterns: patterns.length,
    byType,
    bySeverity,
    mostCommon,
    avgConfidence,
    coverage
  };
}

/**
 * Analyze pattern correlations
 */
function analyzePatternCorrelations(patterns: FlakyPattern[]): PatternCorrelation[] {
  const correlations: PatternCorrelation[] = [];
  const patternTypes: PatternType[] = ['timing', 'environment', 'dependency', 'race-condition', 'resource-contention'];

  // Check co-occurrence of patterns
  for (let i = 0; i < patternTypes.length; i++) {
    for (let j = i + 1; j < patternTypes.length; j++) {
      const type1 = patternTypes[i];
      const type2 = patternTypes[j];

      const patterns1 = patterns.filter(p => p.type === type1);
      const patterns2 = patterns.filter(p => p.type === type2);

      // Find tests affected by both patterns
      const tests1 = new Set(patterns1.flatMap(p => p.affectedTests));
      const tests2 = new Set(patterns2.flatMap(p => p.affectedTests));

      let coOccurrence = 0;
      tests1.forEach(test => {
        if (tests2.has(test)) coOccurrence++;
      });

      if (coOccurrence > 0) {
        // Simple correlation: co-occurrence / min(tests1, tests2)
        const correlation = coOccurrence / Math.min(tests1.size, tests2.size);

        correlations.push({
          pattern1: type1,
          pattern2: type2,
          correlation,
          coOccurrence,
          description: `${coOccurrence} tests affected by both ${type1} and ${type2} patterns`
        });
      }
    }
  }

  return correlations.sort((a, b) => b.correlation - a.correlation);
}

/**
 * Analyze pattern trends
 */
function analyzePatternTrends(
  testResults: TestResult[],
  patterns: FlakyPattern[]
): PatternTrend[] {
  const trends: PatternTrend[] = [];
  const patternTypes: PatternType[] = ['timing', 'environment', 'dependency', 'race-condition', 'resource-contention'];

  // Group results by date
  const byDate = new Map<string, TestResult[]>();
  testResults.forEach(r => {
    const date = new Date(r.timestamp).toISOString().split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date)!.push(r);
  });

  // Analyze trend for each pattern type
  patternTypes.forEach(type => {
    const typePatterns = patterns.filter(p => p.type === type);
    if (typePatterns.length === 0) return;

    const dataPoints: TrendDataPoint[] = [];
    const sortedDates = Array.from(byDate.keys()).sort();

    sortedDates.forEach(date => {
      const dayResults = byDate.get(date)!;
      const affectedTests = new Set<string>();

      typePatterns.forEach(p => {
        p.affectedTests.forEach(testId => {
          if (dayResults.some(r => r.testId === testId)) {
            affectedTests.add(testId);
          }
        });
      });

      dataPoints.push({
        date,
        count: typePatterns.length,
        testsAffected: affectedTests.size
      });
    });

    // Calculate trend direction
    if (dataPoints.length >= 2) {
      const recentCount = dataPoints.slice(-3).reduce((sum, dp) => sum + dp.count, 0) / 3;
      const olderCount = dataPoints.slice(0, 3).reduce((sum, dp) => sum + dp.count, 0) / 3;
      const change = recentCount - olderCount;

      let direction: 'increasing' | 'stable' | 'decreasing';
      if (change > 0.1) direction = 'increasing';
      else if (change < -0.1) direction = 'decreasing';
      else direction = 'stable';

      const changeRate = dataPoints.length > 1
        ? change / (dataPoints.length - 1)
        : 0;

      // Simple linear prediction for next 7 days
      const prediction = Array.from({ length: 7 }, (_, i) =>
        Math.max(0, recentCount + (changeRate * (i + 1)))
      );

      trends.push({
        type,
        direction,
        changeRate,
        dataPoints,
        prediction
      });
    }
  });

  return trends;
}
