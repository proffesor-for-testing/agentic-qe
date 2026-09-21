import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const wrapper = resolve(import.meta.dirname, '../../../scripts/ci-vitest-run.sh');
// The wrapper is used by Ubuntu CI. Stock macOS and Windows do not ship all
// of its shell tools; qualify those local runs without letting Linux CI skip.
const timeoutVersion = spawnSync('timeout', ['--version'], { encoding: 'utf8' });
const shellToolsAvailable = existsSync('/bin/bash') && timeoutVersion.status === 0
  && timeoutVersion.stdout.includes('GNU coreutils');
if (process.platform === 'linux' && !shellToolsAvailable) {
  throw new Error('CI Vitest wrapper tests require /bin/bash and GNU timeout on Linux; this CI prerequisite must not be skipped.');
}
const skipReason = !shellToolsAvailable ? ' (requires Bash and GNU timeout on this platform)' : '';
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function runRunner(exitCode: number, options: { hang?: boolean; summary?: boolean } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'aqe-ci-verdict-'));
  fixtures.push(fixture);
  const argsPath = join(fixture, 'args.txt');
  writeFileSync(join(fixture, 'npx'), `#!/bin/sh
printf '%s\n' "$@" > "$AQE_TEST_ARGS"
if [ "$AQE_TEST_SUMMARY" = 'true' ]; then
  printf ' Test Files  1 passed (1)\n      Tests  18 passed (18)\n'
fi
if [ "$AQE_TEST_HANG" = 'true' ]; then
  exec sleep 15
fi
if [ "$AQE_TEST_EXIT" != '0' ]; then
  printf 'Unhandled Error: coverage report generation failed\n' >&2
fi
exit "$AQE_TEST_EXIT"
`, { mode: 0o755 });

  const result = spawnSync('/bin/bash', [wrapper, 'tests/fixture with spaces.test.ts', '--coverage'], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 8000,
    env: {
      ...process.env,
      PATH: `${fixture}:${process.env.PATH}`,
      TMPDIR: fixture,
      AQE_PROJECT_ROOT: fixture,
      AQE_TEST_ARGS: argsPath,
      AQE_TEST_EXIT: String(exitCode),
      AQE_TEST_SUMMARY: String(options.summary ?? true),
      AQE_TEST_HANG: String(options.hang ?? false),
      CI_VITEST_TIMEOUT: '5',
    },
  });
  return { ...result, args: readFileSync(argsPath, 'utf8').trim().split('\n') };
}

describe.skipIf(process.platform !== 'linux' && !shellToolsAvailable)(`CI Vitest runner exit status${skipReason}`, () => {
  it('passes a successful runner and forwards arguments without splitting', () => {
    const result = runRunner(0);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('18 passed');
    expect(result.args).toEqual(['vitest', 'run', 'tests/fixture with spaces.test.ts', '--coverage']);
  });

  it.each([1, 2, 124, 137, 143, 255])('preserves exit %i after a passing test summary', (code) => {
    const result = runRunner(code);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(code);
    expect(result.stdout + result.stderr).toContain('coverage report generation failed');
    expect(result.stdout + result.stderr).not.toContain('Treating as success');
  });

  it('preserves failures before the test summary', () => {
    expect(runRunner(1, { summary: false }).status).toBe(1);
  });

  it('fails an actual timeout even after all tests report passing', () => {
    const result = runRunner(0, { hang: true });
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('18 passed');
    expect(result.status).toBe(124);
  });
});
