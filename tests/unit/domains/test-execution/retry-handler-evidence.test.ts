import { describe, expect, it } from 'vitest';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';

const handler = new RetryHandlerService({} as never) as unknown as {
  parseTestResult(code: number, output: string, stderr: string): { passed: boolean; error?: string };
};
const parse = handler.parseTestResult.bind(handler);

describe('retry passed-test evidence', () => {
  it.each(['vitest', 'jest', 'mocha'])('requires at least one passing %s test', runner => {
    const report = (passed: number | undefined) => JSON.stringify(runner === 'mocha'
      ? { stats: { passes: passed, failures: 0 }, failures: [] }
      : { success: true, numPassedTests: passed, numFailedTests: 0, numFailedTestSuites: 0,
          ...(runner === 'vitest' ? { testResults: [] } : {}) });
    for (const count of [undefined, 0, -1]) {
      expect(parse(0, report(count), '').passed).toBe(false);
      expect(parse(0, report(count), '').error).toContain('did not report any passing tests');
    }
    expect(parse(0, report(1), '').passed).toBe(true);
    expect(parse(1, report(1), 'runner crashed').passed).toBe(false);
  });

  it.each(['', 'Tests passed', '{"testResults":'])('does not clear a failure on exit zero with unreadable evidence: %s', output => {
    expect(parse(0, output, '').passed).toBe(false);
    expect(parse(0, output, '').error).toContain('did not report any passing tests');
  });
});
