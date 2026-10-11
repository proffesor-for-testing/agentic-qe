/**
 * Issue #909 review: a Jest *directory* target must select the files under it,
 * not just a path equal to the directory, and must not match sibling
 * directories that share its prefix (`app` vs `app-other`).
 *
 * The native test runs the real Jest CLI when AQE_JEST_BIN points at it
 * (e.g. node_modules/jest/bin/jest.js); Jest is not a dependency of this repo.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { jestExactPathPattern } from '../../../src/shared/test-runner-args.js';
import { TestExecutorService } from '../../../src/domains/test-execution/services/test-executor.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-909-jestdir-')));
  fixtures.push(dir);
  mkdirSync(join(dir, 'app', 'nested'), { recursive: true });
  mkdirSync(join(dir, 'app-other'));
  const t = (name: string) => `test(${JSON.stringify(name)}, () => {});\n`;
  writeFileSync(join(dir, 'app', 'one.test.js'), t('app one'));
  writeFileSync(join(dir, 'app', 'nested', 'two.test.js'), t('app nested two'));
  writeFileSync(join(dir, 'app-other', 'decoy.test.js'), t('DECOY'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', private: true, jest: { testMatch: ['**/*.test.js'] } }));
  return dir;
}

describe('Jest directory targets (#909 review)', () => {
  it('matches files under an existing directory but not a prefix sibling', () => {
    const dir = project();
    const re = new RegExp(jestExactPathPattern('app', dir));
    expect(re.test(join(dir, 'app', 'one.test.js'))).toBe(true);
    expect(re.test(join(dir, 'app', 'nested', 'two.test.js'))).toBe(true);
    expect(re.test(join(dir, 'app-other', 'decoy.test.js'))).toBe(false);
    expect(re.test(join(dir, 'appx.test.js'))).toBe(false);
  });

  it('treats a trailing slash the same as the bare directory', () => {
    const dir = project();
    expect(jestExactPathPattern('app/', dir)).toBe(jestExactPathPattern('app', dir));
  });

  it('keeps files exact, and treats a missing extensionless path as a directory', () => {
    const dir = project();
    const file = new RegExp(jestExactPathPattern('app/one.test.js', dir));
    expect(file.test(join(dir, 'app', 'one.test.js'))).toBe(true);
    expect(file.test(join(dir, 'app', 'one.test.jsx'))).toBe(false);
    const missingDir = new RegExp(jestExactPathPattern('later', dir));
    expect(missingDir.test(join(dir, 'later', 'a.test.js'))).toBe(true);
    expect(missingDir.test(join(dir, 'later-other', 'a.test.js'))).toBe(false);
  });

  const jestBin = process.env.AQE_JEST_BIN;
  it.skipIf(!jestBin)('runs exactly the directory\'s tests with the real Jest CLI (AQE_JEST_BIN)', () => {
    const dir = project();
    const executor = new TestExecutorService({ memory: {} as never });
    const prev = process.cwd();
    process.chdir(dir);
    let args: string[];
    try {
      const command = (executor as unknown as {
        buildTestCommand(files: string[], framework: string): { args: string[]; coverageDirectory: string };
      }).buildTestCommand(['app'], 'jest');
      rmSync(command.coverageDirectory, { recursive: true, force: true });
      args = command.args.slice(1).filter(a => !a.startsWith('--coverageDirectory'));
    } finally {
      process.chdir(prev);
    }
    const run = spawnSync(process.execPath, [jestBin!, ...args], { cwd: dir, encoding: 'utf8', timeout: 60000 });
    expect(run.status, run.stderr).toBe(0);
    const report = JSON.parse(run.stdout) as { testResults: { name: string }[] };
    const ran = report.testResults.map(r => r.name.slice(dir.length + 1)).sort();
    expect(ran).toEqual(['app/nested/two.test.js', 'app/one.test.js']);
  });
});
