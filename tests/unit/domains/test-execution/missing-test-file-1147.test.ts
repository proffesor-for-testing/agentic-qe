/**
 * #1147 (2nd comment): a `testFiles` path that does not exist was reported as
 * a failed test, so it counted as a measured failure. It is the caller's
 * input: the run fails with a CallerInputError and reports no test result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { isCallerInputError } from '../../../../src/shared/error-utils.js';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1147-')));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fx', devDependencies: { vitest: '*' } }));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function executor(): TestExecutorService {
  const memory = { set: async () => undefined, get: async () => undefined };
  return new TestExecutorService({ memory: memory as never }, { enableLLMAnalysis: false });
}

describe('#1147 a missing test file is caller input, not a failed test', () => {
  it('execute returns a CallerInputError and no run result', async () => {
    const missing = join(root, 'tests', 'missing.test.ts');

    const result = await executor().execute({ testFiles: [missing], framework: 'vitest', projectRoot: root });

    expect(result.success).toBe(false);
    expect(!result.success && isCallerInputError(result.error)).toBe(true);
    expect(!result.success && result.error.message).toBe(`Test file not found: ${missing}`);
  });

  it('executeParallel returns a CallerInputError and no run result', async () => {
    const missing = join(root, 'tests', 'missing.test.ts');

    const result = await executor().executeParallel({
      testFiles: [missing], framework: 'vitest', workers: 1, projectRoot: root,
    });

    expect(result.success).toBe(false);
    expect(!result.success && isCallerInputError(result.error)).toBe(true);
  });

  it('fails the whole request when one of several files is missing, before any runner starts', async () => {
    const present = join(root, 'tests', 'present.test.ts');
    const missing = join(root, 'tests', 'missing.test.ts');
    mkdirSync(join(root, 'tests'));
    writeFileSync(present, '');
    const service = executor();
    const spawnRunner = vi.spyOn(service as unknown as { spawnTestRunner: () => unknown }, 'spawnTestRunner');

    const result = await service.executeParallel({
      testFiles: [present, missing], framework: 'vitest', workers: 1, projectRoot: root,
    });

    expect(!result.success && result.error.message).toBe(`Test file not found: ${missing}`);
    expect(spawnRunner).toHaveBeenCalledTimes(1);
    expect(await spawnRunner.mock.results[0].value).toMatchObject({ success: false });
  });
});
