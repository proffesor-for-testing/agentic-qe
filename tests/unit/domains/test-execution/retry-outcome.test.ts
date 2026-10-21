/**
 * #1170: a test that fails and then passes on a retry counts as passed and
 * flaky in the run's own counts, matching what `retries` reports.
 */

import { describe, expect, it } from 'vitest';
import { applyRetryOutcome } from '../../../../src/domains/test-execution/services/retry-outcome';
import type { ITestRunResult } from '../../../../src/domains/test-execution/interfaces';

function runWithTwoFailures(): ITestRunResult {
  return {
    runId: 'run-1',
    status: 'failed',
    total: 4,
    passed: 2,
    failed: 2,
    skipped: 0,
    duration: 10,
    failedTests: [
      { testId: 'f1', testName: 'outer suite inner fails once then passes', file: '/p/tests/flaky.test.ts', error: 'expected 1 to be 2', duration: 1 },
      { testId: 'f2', testName: 'math multiplies numbers', file: '/p/tests/math.test.ts', error: 'expected 6 to be 7', duration: 1 },
    ],
    testCases: [
      { name: 'outer suite inner fails once then passes', file: '/p/tests/flaky.test.ts', status: 'failed', failureMessage: 'expected 1 to be 2' },
      { name: 'math adds numbers', file: '/p/tests/math.test.ts', status: 'passed' },
      { name: 'math adds zero', file: '/p/tests/math.test.ts', status: 'passed' },
      { name: 'math multiplies numbers', file: '/p/tests/math.test.ts', status: 'failed', failureMessage: 'expected 6 to be 7' },
    ],
  };
}

describe('applyRetryOutcome (#1170)', () => {
  it('counts a test that passed on a retry as passed and flaky', () => {
    const run = runWithTwoFailures();

    applyRetryOutcome(run, {
      originalFailed: 2, retried: 3, nowPassing: 1, stillFailing: 1, flakyDetected: ['f1'],
      tests: [{ testId: 'f1', attempts: 1, passed: true }, { testId: 'f2', attempts: 2, passed: false }],
    });

    expect(run).toMatchObject({ passed: 3, failed: 1, flaky: 1, status: 'failed' });
    expect(run.failedTests.map(t => t.testId)).toEqual(['f2']);
    expect(run.testCases![0]).toMatchObject({ status: 'passed', flaky: true });
    expect(run.testCases![3]).toMatchObject({ status: 'failed' });
    expect(run.testCases![3].flaky).toBeUndefined();
    expect(run.retries).toMatchObject({ totalRetries: 3, nowPassing: 1, stillFailing: 1 });
    expect(run.retries!.tests[0]).toMatchObject({ name: 'outer suite inner fails once then passes', passed: true });
  });

  it('passes the run when every failure passed on a retry', () => {
    const run = runWithTwoFailures();

    applyRetryOutcome(run, {
      originalFailed: 2, retried: 2, nowPassing: 2, stillFailing: 0, flakyDetected: ['f1', 'f2'],
      tests: [{ testId: 'f1', attempts: 1, passed: true }, { testId: 'f2', attempts: 1, passed: true }],
    });

    expect(run).toMatchObject({ passed: 4, failed: 0, flaky: 2, status: 'passed', failedTests: [] });
  });

  it('leaves counts unchanged when no retry passed or a retry matched no test', () => {
    const run = runWithTwoFailures();

    applyRetryOutcome(run, {
      originalFailed: 2, retried: 2, nowPassing: 0, stillFailing: 2, flakyDetected: [],
      tests: [{ testId: 'f1', attempts: 0, passed: true, unmatched: true }, { testId: 'f2', attempts: 2, passed: false }],
    });

    expect(run).toMatchObject({ passed: 2, failed: 2, status: 'failed' });
    expect(run.flaky).toBeUndefined();
    expect(run.testCases!.filter(c => c.status === 'failed')).toHaveLength(2);
  });
});
