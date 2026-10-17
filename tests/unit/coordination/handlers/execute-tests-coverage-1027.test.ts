/**
 * #1027 review N5 — `execute-tests` (MCP test_execute_parallel) collects no
 * coverage on this path, so it must say so (null) instead of a hardcoded 0%.
 */
import { describe, it, expect, vi } from 'vitest';

const report = JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, testResults: [{ assertionResults: [] }] });

vi.mock('../../../../src/shared/test-runner-process.js', () => ({
  runTestRunnerProcess: vi.fn(async () => ({ status: 0, stdout: report, stderr: '', error: undefined, signal: null })),
}));
vi.mock('../../../../src/shared/vitest-json-report.js', () => ({
  createVitestJsonReport: () => ({ args: [], read: (stdout: string) => stdout, cleanup: () => {} }),
}));

import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
// Load order as in production (domain-handlers → configs) to resolve the module cycle.
import '../../../../src/mcp/handlers/domain-handlers';
import { testExecuteConfig } from '../../../../src/mcp/handlers/domain-handler-configs';

describe('#1027 N5 — test execution reports unmeasured coverage as null', () => {
  it('the execute-tests handler returns coverage: null, not 0', async () => {
    const handlers = new Map<string, (task: unknown) => Promise<{ success: boolean; value?: Record<string, unknown> }>>();
    registerTestExecutionHandlers({
      registerHandler: (type: string, h: never) => { handlers.set(type, h); },
    } as never);

    const result = await handlers.get('execute-tests')!({ payload: { testFiles: ['tests/a.test.ts'], parallel: true } });

    expect(result.success).toBe(true);
    expect(result.value).toMatchObject({ total: 2, passed: 2, coverage: null });
  });

  it('the MCP result keeps null (and a real figure when one is measured)', () => {
    const map = (data: Record<string, unknown>) =>
      testExecuteConfig.mapToResult('t', { total: 2, passed: 2, failed: 0, ...data }, 10, [], {} as never);
    expect(map({ coverage: null }).coverage).toBeNull();
    expect(map({}).coverage).toBeNull();
    expect(map({ coverage: 71.5 }).coverage).toBe(71.5);
  });

  it('preserves an explicit zero retry count before dispatch to the domain', () => {
    expect(testExecuteConfig.mapToPayload({ testFiles: ['tests/a.test.ts'], retryCount: 0 } as never, undefined).retryCount).toBe(0);
    expect(testExecuteConfig.mapToPayload({ testFiles: ['tests/a.test.ts'] } as never, undefined).retryCount).toBe(3);
  });

  it('caller-owned execution delegates once to the evidence-recording domain API', async () => {
    const runTests = vi.fn(async () => ({ success: true, value: { runId: 'measured-run', total: 2, passed: 1, failed: 1, coverage: { line: 71.5 } } }));
    const handlers = new Map<string, (task: unknown) => Promise<any>>();
    registerTestExecutionHandlers({
      registerHandler: (type: string, handler: never) => { handlers.set(type, handler); },
      getTestExecutionAPI: async () => ({ runTests }),
    } as never);
    const result = await handlers.get('execute-tests')!({ executionOwner: 'caller', payload: { testFiles: ['tests/a.test.ts'], parallel: true, timeout: 5000, parallelism: 2, retryCount: 2 } });
    expect(runTests).toHaveBeenCalledExactlyOnceWith({ testFiles: ['tests/a.test.ts'], parallel: true, timeout: 5000, workers: 2, retryCount: 2 });
    expect(result).toMatchObject({ success: true, value: { runId: 'measured-run', failed: 1, coverage: 71.5 } });
  });

  it('does not fall back to an unrecorded run when the domain is unavailable', async () => {
    const handlers = new Map<string, (task: unknown) => Promise<any>>();
    registerTestExecutionHandlers({ registerHandler: (type: string, handler: never) => { handlers.set(type, handler); } } as never);
    const result = await handlers.get('execute-tests')!({ executionOwner: 'caller', payload: { testFiles: ['tests/a.test.ts'] } });
    expect(result.success).toBe(false);
    expect(result.error.message).toContain('Test-execution domain is unavailable');
  });
});
