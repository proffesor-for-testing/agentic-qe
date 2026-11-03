/**
 * #1337: CoverageContextSource reads its fixed-name coverage reports through
 * the confined reader, under the project root.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { CoverageContextSource } from '../../../src/context/sources/coverage-source.js';

const fifoSupported = process.platform !== 'win32';

const summary = (marker: string, pct: number) => JSON.stringify({
  total: { lines: { pct }, branches: { pct }, functions: { pct } },
  [`/project/src/${marker}.ts`]: { lines: { pct }, branches: { pct }, functions: { pct } },
});

const request = { targetFiles: ['src/add.ts'], agentType: 'qe-test', taskDescription: 'route' };

describe('CoverageContextSource (#1337)', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'aqe-cov-ctx-')));
    root = path.join(base, 'project');
    outside = path.join(base, 'outside');
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    fs.mkdirSync(outside);
    // Before #1337 the source read relative to process.cwd(); pin it to the
    // project so the refusal tests below exercise the same files either way.
    vi.spyOn(process, 'cwd').mockReturnValue(root);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const reportPath = () => path.join(root, 'coverage', 'coverage-summary.json');
  const gather = () => new CoverageContextSource(root).gather(request);

  it('reads a regular report inside the project', async () => {
    fs.writeFileSync(reportPath(), summary('add', 42));
    const fragments = await gather();
    expect(fragments.map((f) => f.content).join('\n')).toContain('lines=42%');
  });

  it('reads under the given project root, not process.cwd()', async () => {
    fs.writeFileSync(reportPath(), summary('add', 42));
    vi.spyOn(process, 'cwd').mockReturnValue(outside);
    const fragments = await gather();
    expect(fragments.map((f) => f.content).join('\n')).toContain('lines=42%');
  });

  it('does not read a report symlinked out of the project', async () => {
    const target = path.join(outside, 'coverage-summary.json');
    fs.writeFileSync(target, summary('add', 77));
    fs.symlinkSync(target, reportPath());
    const fragments = await gather();
    expect(fragments).toEqual([]);
  });

  it('falls through to the next report when an earlier one is refused', async () => {
    const target = path.join(outside, 'coverage-summary.json');
    fs.writeFileSync(target, summary('add', 77));
    fs.symlinkSync(target, reportPath());
    fs.writeFileSync(path.join(root, 'coverage', 'coverage-final.json'), summary('add', 42));
    const content = (await gather()).map((f) => f.content).join('\n');
    expect(content).toContain('lines=42%');
    expect(content).not.toContain('77');
  });

  it.runIf(fifoSupported)('skips a FIFO report without blocking', async () => {
    execFileSync('mkfifo', [reportPath()]);
    // A writer that opens the FIFO after a delay: a blocking open would wait
    // for it, so the elapsed time tells a refused read from a blocked one
    // (and the suite cannot hang if the read does block).
    const writer = spawn('sh', ['-c', 'sleep 6; exec 3>"$0"', reportPath()], { stdio: 'ignore' });
    try {
      const started = Date.now();
      const fragments = await gather();
      expect(Date.now() - started).toBeLessThan(3000);
      expect(fragments).toEqual([]);
    } finally {
      writer.kill('SIGKILL');
    }
  }, 20000);

  it.runIf(fifoSupported)('does not open a FIFO outside the project through a symlink', async () => {
    const fifo = path.join(outside, 'fifo');
    execFileSync('mkfifo', [fifo]);
    fs.symlinkSync(fifo, reportPath());
    const writer = spawn('sh', ['-c', 'sleep 6; exec 3>"$0"', fifo], { stdio: 'ignore' });
    try {
      const started = Date.now();
      expect(await gather()).toEqual([]);
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      writer.kill('SIGKILL');
    }
  }, 20000);
});
