/**
 * #1238: once the brain kernel is too large for the native RVF writer, the
 * export fails the same way on every turn. The Stop-hook helper must try once,
 * record why, and skip the following turns with that reason, until the wait
 * expires or a newer aqe.rvf shows that an export has succeeded since.
 *
 * Covers both the shipped helper and the inline copy `aqe init` generates when
 * the shipped file cannot be found.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { HooksPhase } from '../../../src/init/phases/07-hooks.js';

const REPO_ROOT = resolve(__dirname, '../../..');
const SHIPPED = resolve(REPO_ROOT, '.claude/helpers/brain-checkpoint.cjs');
const TOO_LARGE =
  'RVF_KERNEL_TOO_LARGE: the brain kernel needs at least 241.3 MB, over the 128.0 MB limit of the native RVF writer.';

type Variant = { name: string; install: (dest: string) => void };

const variants: Variant[] = [
  { name: 'shipped helper', install: (dest) => copyFileSync(SHIPPED, dest) },
  {
    name: 'generated helper',
    install: (dest) => writeFileSync(
      dest,
      (new HooksPhase() as unknown as { generateBrainCheckpointScript(): string }).generateBrainCheckpointScript(),
    ),
  },
];

let tmp: string;
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

/** Project with the helper and a fake `aqe` that counts its runs. */
function project(variant: Variant, behaviour: 'too-large' | 'ok') {
  tmp = mkdtempSync(join(tmpdir(), 'aqe-1238-hook-'));
  const proj = join(tmp, 'proj');
  mkdirSync(join(proj, '.claude', 'helpers'), { recursive: true });
  mkdirSync(join(proj, '.agentic-qe'));
  writeFileSync(join(proj, '.agentic-qe', 'memory.db'), ''); // placeholder in a tmp dir only
  const helper = join(proj, '.claude', 'helpers', 'brain-checkpoint.cjs');
  variant.install(helper);

  const runs = join(tmp, 'runs.log');
  const fakeAqe = join(tmp, 'aqe');
  writeFileSync(fakeAqe, behaviour === 'too-large'
    ? `#!/bin/sh\necho run >> "${runs}"\necho "  Brain export failed: ${TOO_LARGE}" >&2\nexit 1\n`
    : `#!/bin/sh\necho run >> "${runs}"\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && out=$2; shift; done\n`
      + 'printf RVF > "$out"; echo "Patterns: 3"\n');
  chmodSync(fakeAqe, 0o755);

  const run = (cmd: 'export' | 'verify', env: Record<string, string> = {}) => JSON.parse(execFileSync(
    process.execPath, [helper, cmd, '--json'],
    { env: { PATH: process.env.PATH ?? '', AQE_HOOK_BIN: fakeAqe, ...env }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  ));
  const runCount = () => (existsSync(runs) ? readFileSync(runs, 'utf-8').split('\n').filter(Boolean).length : 0);
  return { proj, run, runCount, skipPath: join(proj, '.agentic-qe', 'brain-checkpoint.skip.json') };
}

describe.skipIf(process.platform === 'win32').each(variants)('brain-checkpoint $name (#1238)', (variant) => {
  it('should_skipLaterTurnsWithTheReason_when_exportWasTooLarge', () => {
    const { run, runCount } = project(variant, 'too-large');

    const first = run('export');
    const second = run('export');

    expect(first).toMatchObject({ exported: false, tooLarge: true, reason: expect.stringContaining('RVF_KERNEL_TOO_LARGE') });
    expect(second).toMatchObject({ exported: false, skipped: true, reason: first.reason, retryAfter: first.retryAfter });
    expect(runCount()).toBe(1);
  });

  it('should_tryAgain_when_theWaitHasExpired', () => {
    const { run, runCount } = project(variant, 'too-large');

    run('export', { AQE_BRAIN_CHECKPOINT_RETRY_HOURS: '0' });
    run('export', { AQE_BRAIN_CHECKPOINT_RETRY_HOURS: '0' });

    expect(runCount()).toBe(2);
  });

  it('should_exportAgain_when_aNewerAqeRvfShowsAnExportSucceeded', () => {
    const { proj, run, runCount, skipPath } = project(variant, 'ok');
    const at = new Date(Date.now() - 60_000);
    writeFileSync(skipPath, JSON.stringify({
      reason: TOO_LARGE, at: at.toISOString(), retryAfter: new Date(at.getTime() + 6 * 3_600_000).toISOString(),
    }));
    writeFileSync(join(proj, '.agentic-qe', 'aqe.rvf'), 'manual export');
    utimesSync(join(proj, '.agentic-qe', 'aqe.rvf'), new Date(), new Date());

    expect(run('export')).toEqual({ exported: true, patterns: 3 });
    expect(runCount()).toBe(1);
    expect(existsSync(skipPath)).toBe(false);
  });

  it('should_reportThePause_when_verifyFindsNoCheckpoint', () => {
    const { run } = project(variant, 'too-large');
    const failed = run('export');

    expect(failed.retryAfter).toEqual(expect.any(String));
    expect(run('verify')).toEqual({
      valid: false, reason: 'missing', skippedUntil: failed.retryAfter,
      resumeHint: 'To retry now, delete .agentic-qe/brain-checkpoint.skip.json.',
    });
  });
});
