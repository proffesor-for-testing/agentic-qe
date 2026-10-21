/**
 * #1170: a run's final outcome after its failed tests were retried.
 *
 * A test that failed and then passed on a retry is passed, and flaky: it
 * leaves `failed`/`failedTests`, its runner test case reads `passed` with
 * `flaky: true`, and the run counts it in `flaky`. A test whose retries all
 * failed, or whose retry matched no test, stays failed.
 */

import type { IRetryResult, IRunRetrySummary, ITestRunResult } from '../interfaces';

/**
 * Default retries of a failed test, shared by `aqe test execute` and MCP
 * `test_execute_parallel` so both surfaces rerun a failure the same number of
 * times (#1170).
 */
export const DEFAULT_TEST_RETRY_COUNT = 2;

/** Attach the retry outcome to `run` and move tests that passed on retry from failed to passed. */
export function applyRetryOutcome(run: ITestRunResult, retried: IRetryResult): void {
  const byId = new Map(run.failedTests.map(t => [t.testId, t]));
  const outcomes = retried.tests ?? [];
  const summary: IRunRetrySummary = {
    totalRetries: retried.retried,
    nowPassing: retried.nowPassing,
    stillFailing: retried.stillFailing,
    tests: outcomes.map(({ testId, ...outcome }) => ({
      name: byId.get(testId)?.testName ?? testId,
      file: byId.get(testId)?.file ?? '',
      ...outcome,
    })),
  };
  run.retries = summary;

  const passedOnRetry = new Set(outcomes.filter(o => o.passed && !o.unmatched).map(o => o.testId));
  const recovered = run.failedTests.filter(t => passedOnRetry.has(t.testId));
  if (recovered.length === 0) return;

  run.failedTests = run.failedTests.filter(t => !passedOnRetry.has(t.testId));
  run.failed = Math.max(0, run.failed - recovered.length);
  run.passed += recovered.length;
  run.flaky = (run.flaky ?? 0) + recovered.length;
  if (run.failed === 0 && run.status === 'failed') run.status = 'passed';

  if (run.testCases) {
    const pending = [...recovered];
    run.testCases = run.testCases.map(testCase => {
      if (testCase.status !== 'failed') return testCase;
      const index = pending.findIndex(t => t.testName === testCase.name && t.file === testCase.file);
      if (index < 0) return testCase;
      pending.splice(index, 1);
      return { ...testCase, status: 'passed', flaky: true };
    });
  }
}
