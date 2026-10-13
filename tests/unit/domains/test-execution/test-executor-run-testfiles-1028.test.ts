/**
 * Issue #1028 N1 — the stored test-run record names the test files it ran, so
 * the regression monitor compares per-test duration only between runs of the
 * same test set (wall time over a different set is mostly runner overhead).
 */
import { describe, it, expect, vi } from 'vitest';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';

type Internals = {
  storeResults(runId: string, result: Record<string, unknown>, testFiles?: readonly string[]): Promise<void>;
};

function service() {
  const store = new Map<string, unknown>();
  const memory = {
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    get: vi.fn(async (key: string) => store.get(key)),
  };
  const executor = new TestExecutorService({ memory: memory as never }, { enableLLMAnalysis: false });
  return { store, internals: executor as unknown as Internals };
}

const run = { runId: 'r1', status: 'passed', total: 2, passed: 2, failed: 0, skipped: 0, duration: 5, failedTests: [] };

describe('#1028 N1 — TestExecutorService records the run\'s test files', () => {
  it('stores the sorted, de-duplicated test files with the run record', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run, ['tests/b.test.ts', 'tests/a.test.ts', 'tests/b.test.ts']);

    expect(store.get('test-run:r1')).toMatchObject({ runId: 'r1', testFiles: ['tests/a.test.ts', 'tests/b.test.ts'] });
  });

  it('stores no testFiles field when the files are unknown', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run);

    expect(store.get('test-run:r1')).not.toHaveProperty('testFiles');
  });
});
