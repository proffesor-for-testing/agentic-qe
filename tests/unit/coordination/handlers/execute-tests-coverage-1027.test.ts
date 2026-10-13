/**
 * #1027 review N5 — `execute-tests` (MCP test_execute_parallel) collects no
 * coverage on this path, so it must say so (null) instead of a hardcoded 0%.
 */
import { describe, it, expect, vi } from 'vitest';

const report = JSON.stringify({ numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, testResults: [{ assertionResults: [] }] });

vi.mock('child_process', async (importOriginal) => ({
  ...await importOriginal<object>(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: report, stderr: '', error: undefined, signal: null })),
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
});
