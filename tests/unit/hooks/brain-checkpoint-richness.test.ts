/**
 * #1251: the Stop-hook checkpoint exports to a temp path, so it must name the
 * published aqe.rvf for the #629 richness guard to compare against. When the
 * guard refuses, the old checkpoint stays and the hook backs off like the
 * too-large path (#1238). A deliberate shrink (`aqe learning prune --apply`)
 * leaves an acknowledgement that the next export honours once.
 *
 * Covers both the shipped helper and the inline copy `aqe init` generates.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { HooksPhase } from '../../../src/init/phases/07-hooks.js';
import { CHECKPOINT_SHRINK_ACK_FILE } from '../../../src/learning/checkpoint-shrink-ack.js';

const REPO_ROOT = resolve(__dirname, '../../..');
const SHIPPED = resolve(REPO_ROOT, '.claude/helpers/brain-checkpoint.cjs');
const RICHER = 'RVF_MIRROR_RICHER: refusing to replace richer mirrored tables: qe_patterns 25 -> 5. '
  + 'Restore/import the mirror first, or repeat with --force-overwrite-richer after preserving a backup.';

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

/** Project with the helper and a fake `aqe` that logs its arguments; `mode` picks its behaviour. */
function project(variant: Variant) {
  tmp = mkdtempSync(join(tmpdir(), 'aqe-1251-hook-'));
  const aqeDir = join(tmp, 'proj', '.agentic-qe');
  mkdirSync(join(tmp, 'proj', '.claude', 'helpers'), { recursive: true });
  mkdirSync(aqeDir);
  writeFileSync(join(aqeDir, 'memory.db'), ''); // placeholder in a tmp dir only
  const helper = join(tmp, 'proj', '.claude', 'helpers', 'brain-checkpoint.cjs');
  variant.install(helper);

  const argsLog = join(tmp, 'args.log');
  const modeFile = join(tmp, 'mode');
  const fakeAqe = join(tmp, 'aqe');
  writeFileSync(fakeAqe, `#!/bin/sh\necho "$*" >> "${argsLog}"\n`
    + `if [ "$(cat "${modeFile}")" = richer ]; then echo "  Brain export failed: ${RICHER}" >&2; exit 1; fi\n`
    + `if [ "$(cat "${modeFile}")" = crash ]; then exit 3; fi\n`
    + 'while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out=$2; shift; done\n'
    + 'printf NEW-RVF > "$out"; echo "Patterns: 5"\n');
  chmodSync(fakeAqe, 0o755);

  const run = (cmd: 'export' | 'verify') => JSON.parse(execFileSync(
    process.execPath, [helper, cmd, '--json'],
    { env: { PATH: process.env.PATH ?? '', AQE_HOOK_BIN: fakeAqe }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  ));
  const calls = () => (existsSync(argsLog) ? readFileSync(argsLog, 'utf-8').split('\n').filter(Boolean) : []);
  const rvf = join(aqeDir, 'aqe.rvf');
  const ack = join(aqeDir, CHECKPOINT_SHRINK_ACK_FILE);
  const skip = join(aqeDir, 'brain-checkpoint.skip.json');
  return {
    run, calls, rvf, ack, skip,
    mode: (m: 'richer' | 'ok' | 'crash') => writeFileSync(modeFile, m),
    seedCheckpoint: (secondsAgo = 60) => {
      writeFileSync(rvf, 'RICH-RVF');
      const t = new Date(Date.now() - secondsAgo * 1000);
      utimesSync(rvf, t, t);
    },
    acknowledge: (secondsAgo = 0) => writeFileSync(ack, JSON.stringify({
      at: new Date(Date.now() - secondsAgo * 1000).toISOString(), reason: 'aqe learning prune --apply',
    })),
  };
}

describe.skipIf(process.platform === 'win32').each(variants)('brain-checkpoint $name richness guard (#1251)', (variant) => {
  it('should_compareWithThePublishedCheckpoint_when_oneExists', () => {
    const p = project(variant);
    p.mode('ok');
    p.seedCheckpoint();

    p.run('export');

    expect(p.calls()[0]).toContain(`--compare-with ${p.rvf} --richness-policy checkpoint`);
  });

  it('should_notCompare_when_thereIsNoCheckpointYet', () => {
    const p = project(variant);
    p.mode('ok');

    expect(p.run('export')).toMatchObject({ exported: true });
    expect(p.calls()[0]).not.toContain('--compare-with');
  });

  it('should_keepTheRicherCheckpointAndBackOff_when_theGuardRefuses', () => {
    const p = project(variant);
    p.mode('richer');
    p.seedCheckpoint();

    const first = p.run('export');
    const second = p.run('export');

    expect(first).toMatchObject({ exported: false, richer: true, reason: RICHER });
    expect(readFileSync(p.rvf, 'utf-8')).toBe('RICH-RVF');
    expect(second).toMatchObject({ exported: false, skipped: true, reason: RICHER, retryAfter: first.retryAfter });
    expect(p.calls()).toHaveLength(1);
  });

  it('should_reportThePause_when_theSessionStartsDuringTheBackOff', () => {
    const p = project(variant);
    p.mode('richer');
    p.seedCheckpoint();
    const refused = p.run('export');

    expect(p.run('verify')).toMatchObject({ pausedUntil: refused.retryAfter, pauseReason: RICHER });
  });

  it('should_overwriteOnceAndSpendTheAck_when_aShrinkWasAcknowledged', () => {
    const p = project(variant);
    p.mode('ok');
    p.seedCheckpoint();
    p.acknowledge();

    const accepted = p.run('export');
    p.run('export');

    expect(accepted).toMatchObject({ exported: true, acceptedShrink: 'aqe learning prune --apply' });
    expect(p.calls()[0]).toContain('--force-overwrite-richer');
    expect(p.calls()[0]).not.toContain('--compare-with');
    expect(existsSync(p.ack)).toBe(false);
    expect(p.calls()[1]).toContain('--compare-with');
  });

  it('should_endTheBackOff_when_theShrinkIsAcknowledgedAfterTheRefusal', () => {
    const p = project(variant);
    p.mode('richer');
    p.seedCheckpoint();
    p.run('export');
    p.mode('ok');
    p.acknowledge(-1); // a second after the refusal

    expect(p.run('export')).toMatchObject({ exported: true, acceptedShrink: 'aqe learning prune --apply' });
    expect(existsSync(p.skip)).toBe(false);
  });

  it('should_keepTheAck_when_theAcknowledgedExportFails', () => {
    const p = project(variant);
    p.mode('crash');
    p.seedCheckpoint();
    p.acknowledge();

    expect(p.run('export')).toMatchObject({ exported: false });
    expect(existsSync(p.ack)).toBe(true);
    expect(readFileSync(p.rvf, 'utf-8')).toBe('RICH-RVF');
  });

  it('should_ignoreAnAckOlderThanTheCheckpoint', () => {
    const p = project(variant);
    p.mode('ok');
    p.acknowledge(120);
    p.seedCheckpoint(60); // exported after the shrink: the ack is spent

    p.run('export');

    expect(p.calls()[0]).not.toContain('--force-overwrite-richer');
    expect(existsSync(p.ack)).toBe(false);
  });
});
