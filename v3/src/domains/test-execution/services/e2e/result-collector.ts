/**
 * Agentic QE v3 - Result Collector
 *
 * Collects, aggregates, and creates test results from step executions.
 * Handles result creation for passed, failed, skipped, and error states.
 *
 * @module test-execution/services/e2e/result-collector
 */

import type { ScreenshotResult, AccessibilityResult } from '../../../../integrations/vibium';
import type {
  E2EStepResult,
  E2ETestCase,
  E2ETestResult,
  E2ETestSuiteResult,
} from '../../types';

// ============================================================================
// Result Collector Class
// ============================================================================

/**
 * Result Collector
 *
 * Handles the creation and aggregation of test results.
 */
export class ResultCollector {
  /**
   * Create a skipped test result
   */
  createSkippedResult(testCase: E2ETestCase, startedAt: Date): E2ETestResult {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      success: true,
      status: 'skipped',
      stepResults: [],
      totalDurationMs: 0,
      startedAt,
      completedAt: new Date(),
    };
  }

  /**
   * Create an error test result
   */
  createErrorResult(
    testCase: E2ETestCase,
    startedAt: Date,
    errorMessage: string,
    stepResults: E2EStepResult[] = []
  ): E2ETestResult {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      success: false,
      status: 'error',
      stepResults,
      totalDurationMs: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
      errorSummary: {
        failedStep: stepResults.length > 0 ? stepResults[stepResults.length - 1].stepId : 'setup',
        errorMessage,
      },
    };
  }

  /**
   * Create test result from step results
   */
  createResult(
    testCase: E2ETestCase,
    startedAt: Date,
    stepResults: E2EStepResult[],
    screenshots: ScreenshotResult[],
    accessibilityResults: AccessibilityResult[]
  ): E2ETestResult {
    const completedAt = new Date();
    const hasRequiredFailure = stepResults.some(
      (r) =>
        !r.success &&
        testCase.steps.find((s) => s.id === r.stepId)?.required &&
        !testCase.steps.find((s) => s.id === r.stepId)?.continueOnFailure
    );

    const status: E2ETestResult['status'] = hasRequiredFailure ? 'failed' : 'passed';

    const failedStep = stepResults.find((r) => !r.success);

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      success: status === 'passed',
      status,
      stepResults,
      totalDurationMs: completedAt.getTime() - startedAt.getTime(),
      screenshots: screenshots.length > 0 ? screenshots : undefined,
      accessibilityResults: accessibilityResults.length > 0 ? accessibilityResults : undefined,
      startedAt,
      completedAt,
      browserInfo: testCase.viewport
        ? {
            browserType: 'chromium',
            viewport: testCase.viewport,
            userAgent: testCase.browserContext?.userAgent ?? '',
          }
        : undefined,
      errorSummary: failedStep
        ? {
            failedStep: failedStep.stepId,
            errorMessage: failedStep.error?.message ?? 'Unknown error',
            errorCode: failedStep.error?.code,
            screenshot: failedStep.error?.failureScreenshot,
          }
        : undefined,
    };
  }

  /**
   * Check if any results have failures
   */
  hasFailure(results: E2EStepResult[]): boolean {
    return results.some((r) => !r.success);
  }

  /**
   * Calculate summary statistics from test results
   */
  calculateSummary(results: E2ETestResult[]): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  } {
    return {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed' || r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };
  }

  /**
   * Create suite result from test results
   */
  createSuiteResult(
    suiteId: string,
    suiteName: string,
    testResults: E2ETestResult[],
    startedAt: Date
  ): E2ETestSuiteResult {
    const completedAt = new Date();
    const summary = this.calculateSummary(testResults);

    return {
      suiteId,
      suiteName,
      success: summary.failed === 0,
      testResults,
      summary: {
        ...summary,
        totalDurationMs: completedAt.getTime() - startedAt.getTime(),
      },
      startedAt,
      completedAt,
    };
  }
}

/**
 * Create result collector instance
 */
export function createResultCollector(): ResultCollector {
  return new ResultCollector();
}
