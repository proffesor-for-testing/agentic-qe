/**
 * Analyze Test Quality Tool
 * Comprehensive test quality analysis with metrics and recommendations
 *
 * @module tools/qe/test-generation/analyze-test-quality
 * @version 1.0.0
 */

import type {
  QEToolResponse,
  ResponseMetadata,
  QEError,
  TestFramework,
  TestPattern
} from '../shared/types.js';
import { SecureRandom } from '../../../../utils/SecureRandom.js';

/**
 * Test quality analysis parameters
 */
export interface TestQualityAnalysisParams {
  /** Tests to analyze */
  tests: TestQualityInput[];

  /** Framework being used */
  framework: TestFramework;

  /** Include detailed analysis */
  detailedAnalysis?: boolean;

  /** Check for anti-patterns */
  checkAntiPatterns?: boolean;

  /** Analyze maintainability */
  analyzeMaintainability?: boolean;

  /** Coverage data */
  coverageData?: {
    lineCoverage: number;
    branchCoverage: number;
    functionCoverage: number;
  };
}

/**
 * Test quality input
 */
export interface TestQualityInput {
  /** Test ID */
  id: string;

  /** Test name */
  name: string;

  /** Test code */
  code: string;

  /** Test type */
  type: 'unit' | 'integration' | 'e2e';

  /** Execution time (ms) */
  duration?: number;

  /** Pass/fail status */
  status?: 'passed' | 'failed' | 'skipped';

  /** Number of assertions */
  assertions?: number;
}

/**
 * Test quality analysis result
 */
export interface TestQualityAnalysisResult {
  /** Overall quality score (0-100) */
  overallQuality: number;

  /** Quality metrics */
  metrics: {
    /** Test coverage score (0-100) */
    coverage: number;

    /** Assertion quality score (0-100) */
    assertionQuality: number;

    /** Test independence score (0-100) */
    independence: number;

    /** Readability score (0-100) */
    readability: number;

    /** Maintainability score (0-100) */
    maintainability: number;

    /** Performance score (0-100) */
    performance: number;
  };

  /** Test patterns detected */
  patterns: {
    /** Pattern name */
    pattern: TestPattern;

    /** Usage count */
    count: number;

    /** Percentage of tests */
    percentage: number;
  }[];

  /** Anti-patterns detected */
  antiPatterns: {
    /** Anti-pattern type */
    type: string;

    /** Severity */
    severity: 'critical' | 'high' | 'medium' | 'low';

    /** Affected tests */
    affectedTests: string[];

    /** Description */
    description: string;

    /** Recommendation */
    recommendation: string;
  }[];

  /** Maintainability issues */
  maintainability?: {
    /** Issue type */
    type: string;

    /** Affected tests */
    affectedTests: string[];

    /** Impact score (0-100) */
    impact: number;

    /** Recommendation */
    recommendation: string;
  }[];

  /** Detailed test analysis */
  detailedAnalysis?: {
    /** Test ID */
    testId: string;

    /** Individual scores */
    scores: {
      readability: number;
      assertions: number;
      independence: number;
      performance: number;
    };

    /** Issues */
    issues: string[];

    /** Suggestions */
    suggestions: string[];
  }[];

  /** Summary statistics */
  summary: {
    /** Total tests analyzed */
    totalTests: number;

    /** Passed tests */
    passedTests: number;

    /** Failed tests */
    failedTests: number;

    /** Average duration (ms) */
    averageDuration: number;

    /** Total assertions */
    totalAssertions: number;

    /** Tests with issues */
    testsWithIssues: number;
  };

  /** Recommendations */
  recommendations: string[];
}

/**
 * Analyze test pattern usage
 */
function analyzePatterns(tests: TestQualityInput[]): {
  pattern: TestPattern;
  count: number;
  percentage: number;
}[] {
  const patternCounts = new Map<TestPattern, number>();

  tests.forEach(test => {
    const patterns = detectPatternInTest(test);
    patterns.forEach(pattern => {
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    });
  });

  return Array.from(patternCounts.entries()).map(([pattern, count]) => ({
    pattern,
    count,
    percentage: (count / tests.length) * 100
  }));
}

/**
 * Detect pattern in test code
 */
function detectPatternInTest(test: TestQualityInput): TestPattern[] {
  const patterns: TestPattern[] = [];
  const code = test.code.toLowerCase();

  if (code.includes('arrange') || code.includes('act') || code.includes('assert')) {
    patterns.push('arrange-act-assert');
  }

  if (code.includes('given') || code.includes('when') || code.includes('then')) {
    patterns.push('given-when-then');
  }

  if (code.includes('builder') || code.includes('withbuilder')) {
    patterns.push('builder');
  }

  if (code.includes('mother') || code.includes('fixture')) {
    patterns.push('object-mother');
  }

  // Default to four-phase if no pattern detected
  if (patterns.length === 0) {
    patterns.push('four-phase-test');
  }

  return patterns;
}

/**
 * Detect anti-patterns
 */
function detectAntiPatterns(tests: TestQualityInput[]): Array<{
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedTests: string[];
  description: string;
  recommendation: string;
}> {
  const antiPatterns: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    affectedTests: string[];
    description: string;
    recommendation: string;
  }> = [];

  // Detect missing assertions
  const noAssertions = tests.filter(t => !t.assertions || t.assertions === 0);
  if (noAssertions.length > 0) {
    antiPatterns.push({
      type: 'missing-assertions',
      severity: 'critical',
      affectedTests: noAssertions.map(t => t.id),
      description: 'Tests without assertions provide no validation',
      recommendation: 'Add expect() or assert() statements to validate behavior'
    });
  }

  // Detect overly long tests (>100 lines)
  const longTests = tests.filter(t => t.code.split('\n').length > 100);
  if (longTests.length > 0) {
    antiPatterns.push({
      type: 'overly-long-test',
      severity: 'medium',
      affectedTests: longTests.map(t => t.id),
      description: 'Tests longer than 100 lines are hard to maintain',
      recommendation: 'Break into smaller, focused tests'
    });
  }

  // Detect slow tests (>5s)
  const slowTests = tests.filter(t => t.duration && t.duration > 5000);
  if (slowTests.length > 0) {
    antiPatterns.push({
      type: 'slow-test',
      severity: 'high',
      affectedTests: slowTests.map(t => t.id),
      description: 'Tests taking >5s slow down development',
      recommendation: 'Use mocks/stubs or optimize setup/teardown'
    });
  }

  // Detect multiple assertions (>10)
  const manyAssertions = tests.filter(t => t.assertions && t.assertions > 10);
  if (manyAssertions.length > 0) {
    antiPatterns.push({
      type: 'too-many-assertions',
      severity: 'low',
      affectedTests: manyAssertions.map(t => t.id),
      description: 'Tests with >10 assertions test too many things',
      recommendation: 'Split into multiple focused tests'
    });
  }

  // Detect unclear test names
  const unclearNames = tests.filter(t =>
    t.name.length < 10 || !t.name.includes('_') && !t.name.includes(' ')
  );
  if (unclearNames.length > 0) {
    antiPatterns.push({
      type: 'unclear-test-name',
      severity: 'medium',
      affectedTests: unclearNames.map(t => t.id),
      description: 'Test names should clearly describe what is being tested',
      recommendation: 'Use descriptive names like "test_user_registration_with_valid_email"'
    });
  }

  return antiPatterns;
}

/**
 * Analyze maintainability
 */
function analyzeMaintainability(tests: TestQualityInput[]): Array<{
  type: string;
  affectedTests: string[];
  impact: number;
  recommendation: string;
}> {
  const issues: Array<{
    type: string;
    affectedTests: string[];
    impact: number;
    recommendation: string;
  }> = [];

  // Check for test duplication
  const duplicateCode = findDuplicateCode(tests);
  if (duplicateCode.length > 0) {
    issues.push({
      type: 'code-duplication',
      affectedTests: duplicateCode,
      impact: 70,
      recommendation: 'Extract common setup into helper functions or beforeEach hooks'
    });
  }

  // Check for magic numbers
  const magicNumbers = tests.filter(t => containsMagicNumbers(t.code));
  if (magicNumbers.length > 0) {
    issues.push({
      type: 'magic-numbers',
      affectedTests: magicNumbers.map(t => t.id),
      impact: 40,
      recommendation: 'Replace magic numbers with named constants'
    });
  }

  // Check for deep nesting
  const deepNesting = tests.filter(t => hasDeepNesting(t.code));
  if (deepNesting.length > 0) {
    issues.push({
      type: 'deep-nesting',
      affectedTests: deepNesting.map(t => t.id),
      impact: 60,
      recommendation: 'Reduce nesting by extracting helper functions'
    });
  }

  return issues;
}

/**
 * Find duplicate code patterns
 */
function findDuplicateCode(tests: TestQualityInput[]): string[] {
  const duplicates: string[] = [];
  const codeMap = new Map<string, string[]>();

  tests.forEach(test => {
    // Extract setup code (first 5 lines)
    const setupCode = test.code.split('\n').slice(0, 5).join('\n');

    if (!codeMap.has(setupCode)) {
      codeMap.set(setupCode, []);
    }

    codeMap.get(setupCode)!.push(test.id);
  });

  codeMap.forEach((testIds, code) => {
    if (testIds.length > 3 && code.trim().length > 50) {
      duplicates.push(...testIds);
    }
  });

  return Array.from(new Set(duplicates));
}

/**
 * Check if code contains magic numbers
 */
function containsMagicNumbers(code: string): boolean {
  const numberRegex = /\b\d{2,}\b/g;
  const matches = code.match(numberRegex) || [];
  return matches.length > 3;
}

/**
 * Check if code has deep nesting
 */
function hasDeepNesting(code: string): boolean {
  const lines = code.split('\n');
  let maxIndent = 0;

  lines.forEach(line => {
    const indent = line.search(/\S/);
    if (indent > maxIndent) maxIndent = indent;
  });

  return maxIndent > 16; // More than 4 levels (4 spaces per level)
}

/**
 * Perform detailed test analysis
 */
function performDetailedAnalysis(tests: TestQualityInput[]): Array<{
  testId: string;
  scores: {
    readability: number;
    assertions: number;
    independence: number;
    performance: number;
  };
  issues: string[];
  suggestions: string[];
}> {
  return tests.map(test => {
    const scores = {
      readability: calculateReadability(test),
      assertions: calculateAssertionQuality(test),
      independence: calculateIndependence(test),
      performance: calculatePerformance(test)
    };

    const issues: string[] = [];
    const suggestions: string[] = [];

    if (scores.readability < 60) {
      issues.push('Low readability score');
      suggestions.push('Improve test structure and naming');
    }

    if (scores.assertions < 50) {
      issues.push('Insufficient or poor assertions');
      suggestions.push('Add more specific assertions');
    }

    if (scores.independence < 70) {
      issues.push('Test may depend on other tests');
      suggestions.push('Ensure test can run in isolation');
    }

    if (scores.performance < 60) {
      issues.push('Test execution is slow');
      suggestions.push('Optimize setup or use mocks');
    }

    return {
      testId: test.id,
      scores,
      issues,
      suggestions
    };
  });
}

/**
 * Calculate readability score
 */
function calculateReadability(test: TestQualityInput): number {
  let score = 100;

  // Penalty for long lines
  const lines = test.code.split('\n');
  const longLines = lines.filter(line => line.length > 120).length;
  score -= longLines * 5;

  // Penalty for unclear naming
  if (test.name.length < 10) score -= 20;

  // Bonus for comments
  const comments = (test.code.match(/\/\//g) || []).length;
  score += Math.min(comments * 5, 20);

  return Math.max(0, Math.min(score, 100));
}

/**
 * Calculate assertion quality score
 */
function calculateAssertionQuality(test: TestQualityInput): number {
  const assertionCount = test.assertions || 0;

  if (assertionCount === 0) return 0;
  if (assertionCount > 10) return 60; // Too many

  // Optimal: 1-5 assertions
  if (assertionCount >= 1 && assertionCount <= 5) return 100;
  if (assertionCount <= 8) return 80;

  return 70;
}

/**
 * Calculate independence score
 */
function calculateIndependence(test: TestQualityInput): number {
  let score = 100;

  // Check for shared state indicators
  if (test.code.includes('global') || test.code.includes('window.')) score -= 30;
  if (test.code.includes('beforeAll') && !test.code.includes('afterAll')) score -= 20;

  return Math.max(0, score);
}

/**
 * Calculate performance score
 */
function calculatePerformance(test: TestQualityInput): number {
  const duration = test.duration || 100;

  if (duration < 100) return 100;
  if (duration < 500) return 90;
  if (duration < 1000) return 75;
  if (duration < 3000) return 50;
  if (duration < 5000) return 30;

  return 10;
}

/**
 * Calculate overall quality metrics
 */
function calculateQualityMetrics(
  tests: TestQualityInput[],
  coverageData?: { lineCoverage: number; branchCoverage: number; functionCoverage: number }
): {
  coverage: number;
  assertionQuality: number;
  independence: number;
  readability: number;
  maintainability: number;
  performance: number;
} {
  const coverage = coverageData
    ? (coverageData.lineCoverage + coverageData.branchCoverage + coverageData.functionCoverage) / 3
    : 80;

  const assertionQuality = tests.reduce((sum, t) => sum + calculateAssertionQuality(t), 0) / tests.length;
  const independence = tests.reduce((sum, t) => sum + calculateIndependence(t), 0) / tests.length;
  const readability = tests.reduce((sum, t) => sum + calculateReadability(t), 0) / tests.length;
  const performance = tests.reduce((sum, t) => sum + calculatePerformance(t), 0) / tests.length;

  // Maintainability is inverse of issues
  const maintainability = 100 - (findDuplicateCode(tests).length / tests.length * 50);

  return {
    coverage,
    assertionQuality,
    independence,
    readability,
    maintainability,
    performance
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  metrics: any,
  antiPatterns: any[],
  maintainability?: any[]
): string[] {
  const recommendations: string[] = [];

  if (metrics.coverage < 80) {
    recommendations.push(`Increase test coverage from ${metrics.coverage.toFixed(1)}% to at least 80%`);
  }

  if (metrics.assertionQuality < 70) {
    recommendations.push('Improve assertion quality - add more specific and meaningful assertions');
  }

  if (metrics.independence < 70) {
    recommendations.push('Reduce test interdependence - ensure tests can run in isolation');
  }

  if (metrics.readability < 70) {
    recommendations.push('Improve test readability - use descriptive names and clear structure');
  }

  if (metrics.performance < 60) {
    recommendations.push('Optimize test performance - use mocks and avoid unnecessary setup');
  }

  if (antiPatterns.length > 0) {
    recommendations.push(`Fix ${antiPatterns.length} anti-patterns detected in tests`);
  }

  if (maintainability && maintainability.length > 0) {
    recommendations.push(`Address ${maintainability.length} maintainability issues`);
  }

  return recommendations;
}

/**
 * Analyze test quality
 *
 * @param params - Test quality analysis parameters
 * @returns Tool response with quality metrics and recommendations
 */
export async function analyzeTestQuality(
  params: TestQualityAnalysisParams
): Promise<QEToolResponse<TestQualityAnalysisResult>> {
  const startTime = Date.now();
  const requestId = `test-quality-${Date.now()}-${SecureRandom.generateId(8)}`;

  try {
    // Analyze patterns
    const patterns = analyzePatterns(params.tests);

    // Detect anti-patterns if requested
    const antiPatterns = params.checkAntiPatterns
      ? detectAntiPatterns(params.tests)
      : [];

    // Analyze maintainability if requested
    const maintainability = params.analyzeMaintainability
      ? analyzeMaintainability(params.tests)
      : undefined;

    // Perform detailed analysis if requested
    const detailedAnalysis = params.detailedAnalysis
      ? performDetailedAnalysis(params.tests)
      : undefined;

    // Calculate quality metrics
    const metrics = calculateQualityMetrics(params.tests, params.coverageData);

    // Calculate overall quality score
    const overallQuality =
      (metrics.coverage +
       metrics.assertionQuality +
       metrics.independence +
       metrics.readability +
       metrics.maintainability +
       metrics.performance) / 6;

    // Calculate summary statistics
    const summary = {
      totalTests: params.tests.length,
      passedTests: params.tests.filter(t => t.status === 'passed').length,
      failedTests: params.tests.filter(t => t.status === 'failed').length,
      averageDuration:
        params.tests.reduce((sum, t) => sum + (t.duration || 0), 0) / params.tests.length,
      totalAssertions: params.tests.reduce((sum, t) => sum + (t.assertions || 0), 0),
      testsWithIssues: detailedAnalysis
        ? detailedAnalysis.filter(a => a.issues.length > 0).length
        : 0
    };

    // Generate recommendations
    const recommendations = generateRecommendations(metrics, antiPatterns, maintainability);

    const executionTime = Date.now() - startTime;

    const metadata: ResponseMetadata = {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'test-quality-analyzer',
      version: '1.0.0'
    };

    return {
      success: true,
      data: {
        overallQuality,
        metrics,
        patterns,
        antiPatterns,
        maintainability,
        detailedAnalysis,
        summary,
        recommendations
      },
      metadata
    };
  } catch (error) {
    const qeError: QEError = {
      code: 'TEST_QUALITY_ANALYSIS_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error during test quality analysis',
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
        agent: 'test-quality-analyzer',
        version: '1.0.0'
      }
    };
  }
}
