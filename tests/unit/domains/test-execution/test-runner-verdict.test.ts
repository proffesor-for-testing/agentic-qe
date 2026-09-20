import { describe, expect, it } from 'vitest';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { TestRunnerExecutionError } from '../../../../src/shared/test-runner-verdict.js';
import type { Result } from '../../../../src/shared/types/index.js';

const executor = new TestExecutorService({ memory: {} as never });
function parse(framework: string, output: unknown, exitCode: number | null, suffix = '') {
  return (executor as unknown as {
    parseTestOutput(stdout: string, stderr: string, file: string, framework: string, code: number | null):
      Result<{ total: number; passed: number; failed: number; skipped: number }, Error>;
  }).parseTestOutput(typeof output === 'string' ? output : JSON.stringify(output) + suffix,
    'runner diagnostic', 'fixture.test.js', framework, exitCode);
}
const passedSuite = { status: 'passed', assertionResults: [{ status: 'passed' }] };
const failedSuite = { status: 'failed', assertionResults: [{ status: 'failed', failureMessages: ['Assertion failed'] }] };

describe('Test runner report verdicts', () => {
  it.each(['vitest', 'jest'])('retains ordinary %s assertion failures', framework => {
    const suite = framework === 'jest' ? { ...failedSuite, message: 'AssertionError: expected 4 to be 5' } : failedSuite;
    // Vitest counts nested describe suites separately from its per-file results.
    const result = parse(framework, { success: false, numFailedTestSuites: framework === 'vitest' ? 3 : 1, testResults: [suite] }, 1);
    expect(result).toMatchObject({ success: true, value: { passed: 0, failed: 1 } });
  });

  it.each(['vitest', 'jest'])('rejects %s suite errors even alongside failed assertions', framework => {
    const result = parse(framework, { success: false, numFailedTestSuites: 2, testResults: [failedSuite,
      { status: 'failed', message: 'Missing dependency', assertionResults: [] }] }, 1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TestRunnerExecutionError);
      expect(result.error.message).toContain('Missing dependency');
    }
  });

  it.each(['vitest', 'jest'])('rejects %s nonzero exits even when JSON declares success', framework => {
    expect(parse(framework, { success: true, numFailedTestSuites: 0, testResults: [passedSuite] }, 1).success).toBe(false);
  });

  it.each(['vitest', 'jest'])('rejects empty %s reports on exit zero', framework => {
    expect(parse(framework, { success: true, testResults: [] }, 0).success).toBe(false);
  });

  it('does not rescue a rejected JSON verdict through text fallback', () => {
    const result = parse('vitest', { success: false, testResults: [passedSuite] }, 0, '\nTests 1 passed');
    expect(result.success).toBe(false);
  });

  it.each([1, null])('rejects a passing text summary after exit %s', exitCode => {
    expect(parse('vitest', 'Tests 1 passed', exitCode).success).toBe(false);
  });

  it('preserves successful Mocha receipts and assertion failures, but not runner errors', () => {
    expect(parse('mocha', { stats: { passes: 1, failures: 0 } }, 0))
      .toMatchObject({ success: true, value: { passed: 1, failed: 0 } });
    expect(parse('mocha', { stats: { passes: 0, failures: 1 }, failures: [{ title: 'fails' }] }, 1))
      .toMatchObject({ success: true, value: { passed: 0, failed: 1 } });
    expect(parse('mocha', { stats: { passes: 1, failures: 0 } }, 1).success).toBe(false);
    expect(parse('mocha', { stats: { passes: 0, failures: 0 } }, 0).success).toBe(false);
  });
});
