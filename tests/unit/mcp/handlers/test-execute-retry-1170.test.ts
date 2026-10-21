/**
 * #1170 — test_execute_parallel retries as often as `aqe test execute`, and a
 * test that passed on a retry is reported as passed and flaky, not failed.
 */
import { describe, expect, it } from 'vitest';
// Load order as in production (domain-handlers → configs) to resolve the module cycle.
import '../../../../src/mcp/handlers/domain-handlers';
import { testExecuteConfig } from '../../../../src/mcp/handlers/domain-handler-configs';
import { DEFAULT_TEST_RETRY_COUNT } from '../../../../src/domains/test-execution/services/retry-outcome';

describe('#1170 test_execute_parallel retries', () => {
  it('defaults retryCount to the shared CLI/MCP default', () => {
    const payload = testExecuteConfig.mapToPayload({ testFiles: ['tests/a.test.ts'] }, undefined as never);
    expect(payload.retryCount).toBe(DEFAULT_TEST_RETRY_COUNT);
  });

  it('keeps an explicit retryCount, including 0', () => {
    expect(testExecuteConfig.mapToPayload({ testFiles: ['a'], retryCount: 0 }, undefined as never).retryCount).toBe(0);
    expect(testExecuteConfig.mapToPayload({ testFiles: ['a'], retryCount: 4 }, undefined as never).retryCount).toBe(4);
  });

  it('reports the flaky count and the final pass rate', () => {
    const result = testExecuteConfig.mapToResult('t', {
      total: 4, passed: 3, failed: 1, skipped: 0, flaky: 1,
      testCases: [
        { name: 'outer suite inner fails once then passes', file: '/p/f.test.ts', status: 'passed', flaky: true },
        { name: 'a', file: '/p/m.test.ts', status: 'passed' },
        { name: 'b', file: '/p/m.test.ts', status: 'passed' },
        { name: 'c', file: '/p/m.test.ts', status: 'failed' },
      ],
      retries: { totalRetries: 3, nowPassing: 1, stillFailing: 1, tests: [] },
    }, 40, [], {} as never);

    expect(result).toMatchObject({ passed: 3, failed: 1, flaky: 1 });
    expect(result.summary).toMatchObject({ totalTests: 4, passRate: 75, flaky: 1 });
    expect(result.results![0]).toMatchObject({ status: 'passed', flaky: true });
  });

  it('omits flaky when no test passed on a retry', () => {
    const result = testExecuteConfig.mapToResult('t', { total: 2, passed: 1, failed: 1, skipped: 0 }, 40, [], {} as never);
    expect(result).not.toHaveProperty('flaky');
    expect(result.summary).not.toHaveProperty('flaky');
  });
});
