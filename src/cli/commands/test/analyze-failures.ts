/**
 * Test Analyze Failures Command
 * Analyze test failure patterns and suggest fixes
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';

export interface AnalyzeFailuresOptions {
  testResults: TestResults;
  database: Database;
}

interface TestResults {
  failures: TestFailure[];
}

interface TestFailure {
  test: string;
  error: string;
  timestamp: number;
}

export interface AnalyzeFailuresResult {
  success: boolean;
  patterns: FailurePattern[];
  byErrorType: Record<string, number>;
  recurring: RecurringFailure[];
  suggestions: string[];
}

interface FailurePattern {
  errorType: string;
  count: number;
  tests: string[];
  confidence: number;
}

interface RecurringFailure {
  test: string;
  occurrences: number;
  timespan: number;
  pattern: string;
}

export async function analyzeFailures(options: AnalyzeFailuresOptions): Promise<AnalyzeFailuresResult> {
  const logger = Logger.getInstance();

  try {
    const failures = options.testResults.failures;

    // Group by error type
    const byErrorType: Record<string, number> = {};
    const errorToTests: Record<string, string[]> = {};

    for (const failure of failures) {
      const errorType = extractErrorType(failure.error);
      byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;

      if (!errorToTests[errorType]) {
        errorToTests[errorType] = [];
      }
      errorToTests[errorType].push(failure.test);
    }

    // Identify patterns
    const patterns: FailurePattern[] = Object.entries(byErrorType).map(([errorType, count]) => {
      const tests = errorToTests[errorType];
      const confidence = Math.min(count / failures.length, 1);

      return {
        errorType,
        count,
        tests,
        confidence: parseFloat(confidence.toFixed(2))
      };
    }).sort((a, b) => b.count - a.count);

    // Find recurring failures
    const testOccurrences: Record<string, TestFailure[]> = {};
    for (const failure of failures) {
      if (!testOccurrences[failure.test]) {
        testOccurrences[failure.test] = [];
      }
      testOccurrences[failure.test].push(failure);
    }

    const recurring: RecurringFailure[] = [];
    for (const [test, occurrences] of Object.entries(testOccurrences)) {
      if (occurrences.length >= 2) {
        const timestamps = occurrences.map(o => o.timestamp).sort();
        const timespan = timestamps[timestamps.length - 1] - timestamps[0];
        const pattern = detectPattern(occurrences);

        recurring.push({
          test,
          occurrences: occurrences.length,
          timespan,
          pattern
        });
      }
    }

    // Generate suggestions
    const suggestions: string[] = [];

    for (const pattern of patterns) {
      if (pattern.errorType.includes('Timeout')) {
        suggestions.push(`Consider increasing timeout values for ${pattern.count} timeout-related failures`);
      } else if (pattern.errorType.includes('Assertion')) {
        suggestions.push(`Review assertion logic in ${pattern.count} tests - possible test data issues`);
      } else if (pattern.errorType.includes('Connection')) {
        suggestions.push(`Check network stability and service availability for ${pattern.count} connection errors`);
      } else if (pattern.errorType.includes('null') || pattern.errorType.includes('undefined')) {
        suggestions.push(`Add null checks and improve error handling for ${pattern.count} null/undefined errors`);
      }
    }

    if (recurring.length > 0) {
      suggestions.push(`${recurring.length} tests are failing repeatedly - prioritize fixing these flaky tests`);
    }

    logger.info(`Analyzed ${failures.length} failures: ${patterns.length} patterns, ${recurring.length} recurring`);

    return {
      success: true,
      patterns,
      byErrorType,
      recurring,
      suggestions
    };

  } catch (error) {
    logger.error('Failed to analyze failures:', error);
    throw error;
  }
}

function extractErrorType(error: string): string {
  // Extract error type from error message
  if (error.includes('Timeout')) return 'Timeout';
  if (error.includes('Assertion')) return 'Assertion';
  if (error.includes('Connection')) return 'Connection';
  if (error.includes('null') || error.includes('undefined')) return 'NullReference';
  if (error.includes('Network')) return 'Network';
  if (error.includes('Permission')) return 'Permission';
  return 'Other';
}

function detectPattern(occurrences: TestFailure[]): string {
  if (occurrences.length < 2) return 'single';
  if (occurrences.length >= 3) return 'chronic';
  return 'intermittent';
}
