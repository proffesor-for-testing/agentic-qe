import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

function parse(stdout: string, targetFile: string, cwd: string) {
  const memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
  const handler = new RetryHandlerService(memory as never, { testRunner: 'vitest', cwd, testTimeout: 10000 });
  return (handler as unknown as {
    parseTestResult(code: number, out: string, err: string, target?: string): { passed: boolean };
  }).parseTestResult(0, stdout, '', targetFile);
}

const report = (name: string) => JSON.stringify({
  success: true, numFailedTests: 0, numFailedTestSuites: 0, numPassedTests: 1,
  testResults: [{ name, assertionResults: [{ status: 'passed' }] }],
});

describe('retry evidence for a symlinked target path', () => {
  it('clears the failure when the runner reports the real path of a target given through a symlink', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-retry-symlink-')));
    fixtures.push(root);
    const real = join(root, 'real');
    mkdirSync(real);
    writeFileSync(join(real, 'a.test.ts'), '');
    symlinkSync(real, join(root, 'link'));

    const viaLink = join(root, 'link', 'a.test.ts');
    const reported = join(real, 'a.test.ts');
    expect(parse(report(reported), viaLink, root).passed).toBe(true);
  });

  it('still refuses a pass reported for a different file', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-retry-symlink-')));
    fixtures.push(root);
    writeFileSync(join(root, 'a.test.ts'), '');
    writeFileSync(join(root, 'b.test.ts'), '');
    expect(parse(report(join(root, 'b.test.ts')), join(root, 'a.test.ts'), root).passed).toBe(false);
  });
});
