/**
 * #1238: the Stop-hook export writes a temp store next to aqe.rvf and renames
 * it over aqe.rvf only on success. A failed or too-large export must keep the
 * previous checkpoint, and neither path may leave temp files behind or write
 * through a planted symlink (#970).
 *
 * Covers both the shipped helper and the inline copy `aqe init` generates.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { HooksPhase } from '../../../src/init/phases/07-hooks.js';

const SHIPPED = resolve(__dirname, '../../../.claude/helpers/brain-checkpoint.cjs');
const TOO_LARGE = 'RVF_KERNEL_TOO_LARGE: the brain kernel needs at least 241.3 MB, over the 128.0 MB limit.';

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

/** Fake `aqe` bodies. Each writes its -o path (and the CLI's sidecars) first. */
const WRITE_OUT = 'while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out=$2; shift; done\n';
const FAKES = {
  'too-large': `${WRITE_OUT}printf PARTIAL > "$out"; printf PARTIAL > "$out.tmp.999"\n`
    + `echo "  Brain export failed: ${TOO_LARGE}" >&2; exit 1\n`,
  crash: `${WRITE_OUT}printf PARTIAL > "$out"; printf PARTIAL > "$out.idmap.json"; exit 3\n`,
  'no-store': 'echo "Patterns: 3"\n',
  ok: `${WRITE_OUT}printf NEW-RVF > "$out"; printf NEW-IDMAP > "$out.idmap.json"; `
    + 'printf NEW-MANIFEST > "$out.manifest.json"; echo "Patterns: 3"\n',
} as const;

let tmp: string;
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

function project(variant: Variant, fake: keyof typeof FAKES) {
  tmp = mkdtempSync(join(tmpdir(), 'aqe-1238-keep-'));
  const aqeDir = join(tmp, 'proj', '.agentic-qe');
  mkdirSync(join(tmp, 'proj', '.claude', 'helpers'), { recursive: true });
  mkdirSync(aqeDir);
  writeFileSync(join(aqeDir, 'memory.db'), ''); // placeholder in a tmp dir only
  const helper = join(tmp, 'proj', '.claude', 'helpers', 'brain-checkpoint.cjs');
  variant.install(helper);
  const fakeAqe = join(tmp, 'aqe');
  writeFileSync(fakeAqe, `#!/bin/sh\n${FAKES[fake]}`);
  chmodSync(fakeAqe, 0o755);

  const exportBrain = () => JSON.parse(execFileSync(process.execPath, [helper, 'export', '--json'], {
    env: { PATH: process.env.PATH ?? '', AQE_HOOK_BIN: fakeAqe }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const tmpFiles = () => readdirSync(aqeDir).filter(f => f.includes('.tmp'));
  const read = (name: string) => readFileSync(join(aqeDir, name), 'utf-8');
  const seedCheckpoint = () => {
    writeFileSync(join(aqeDir, 'aqe.rvf'), 'OLD-RVF');
    writeFileSync(join(aqeDir, 'aqe.rvf.idmap.json'), 'OLD-IDMAP');
  };
  return { aqeDir, exportBrain, tmpFiles, read, seedCheckpoint };
}

describe.skipIf(process.platform === 'win32').each(variants)('brain-checkpoint $name keeps the last checkpoint (#1238)', (variant) => {
  it('should_leaveThePreviousCheckpointByteIdentical_when_theExportIsTooLarge', () => {
    const p = project(variant, 'too-large');
    p.seedCheckpoint();

    expect(p.exportBrain()).toMatchObject({ exported: false, tooLarge: true });
    expect(p.read('aqe.rvf')).toBe('OLD-RVF');
    expect(p.read('aqe.rvf.idmap.json')).toBe('OLD-IDMAP');
    expect(p.tmpFiles()).toEqual([]);
  });

  it('should_leaveThePreviousCheckpointByteIdentical_when_theExportCrashes', () => {
    const p = project(variant, 'crash');
    p.seedCheckpoint();

    expect(p.exportBrain()).toMatchObject({ exported: false });
    expect(p.read('aqe.rvf')).toBe('OLD-RVF');
    expect(p.read('aqe.rvf.idmap.json')).toBe('OLD-IDMAP');
    expect(p.tmpFiles()).toEqual([]);
  });

  it('should_keepThePreviousCheckpoint_when_theExportExitsZeroWithoutAStore', () => {
    const p = project(variant, 'no-store');
    p.seedCheckpoint();

    expect(p.exportBrain()).toMatchObject({ exported: false, reason: expect.stringContaining('wrote no store') });
    expect(p.read('aqe.rvf')).toBe('OLD-RVF');
    expect(p.tmpFiles()).toEqual([]);
  });

  it('should_replaceTheCheckpointAndItsSidecars_when_theExportSucceeds', () => {
    const p = project(variant, 'ok');
    p.seedCheckpoint();

    expect(p.exportBrain()).toEqual({ exported: true, patterns: 3 });
    expect(p.read('aqe.rvf')).toBe('NEW-RVF');
    expect(p.read('aqe.rvf.idmap.json')).toBe('NEW-IDMAP');
    expect(p.read('aqe.rvf.manifest.json')).toBe('NEW-MANIFEST');
    expect(p.tmpFiles()).toEqual([]);
  });

  it('should_replaceAPlantedSymlink_insteadOfWritingThroughIt', () => {
    const p = project(variant, 'ok');
    const victim = join(tmp, 'victim.txt');
    writeFileSync(victim, 'VICTIM BYTES');
    symlinkSync(victim, join(p.aqeDir, 'aqe.rvf'));
    symlinkSync(victim, join(p.aqeDir, 'aqe.rvf.idmap.json'));

    expect(p.exportBrain()).toEqual({ exported: true, patterns: 3 });
    expect(readFileSync(victim, 'utf-8')).toBe('VICTIM BYTES');
    expect(lstatSync(join(p.aqeDir, 'aqe.rvf')).isFile()).toBe(true);
    expect(lstatSync(join(p.aqeDir, 'aqe.rvf.idmap.json')).isFile()).toBe(true);
    expect(p.read('aqe.rvf')).toBe('NEW-RVF');
  });

  it('should_sweepTempFilesOfAKilledRun_andKeepThoseOfALiveOne', () => {
    const p = project(variant, 'ok');
    const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
    writeFileSync(join(p.aqeDir, `aqe.rvf.tmp-${deadPid}-deadbeef`), 'STALE');
    writeFileSync(join(p.aqeDir, `aqe.rvf.tmp-${deadPid}-deadbeef.tmp.123`), 'STALE');
    writeFileSync(join(p.aqeDir, `aqe.rvf.tmp-${process.pid}-cafecafe`), 'LIVE');

    p.exportBrain();

    expect(p.tmpFiles()).toEqual([`aqe.rvf.tmp-${process.pid}-cafecafe`]);
  });
});
