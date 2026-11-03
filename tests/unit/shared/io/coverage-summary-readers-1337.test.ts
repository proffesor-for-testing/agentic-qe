/**
 * #1337: the other readers of a fixed-name coverage-summary.json read it
 * through the confined reader, like the context compiler's coverage source.
 * A FIFO at that name is skipped without blocking and a summary symlinked out
 * of the project is not read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { collectMetrics } from '../../../../src/cli/commands/prove.js';
import { ProjectAnalyzer } from '../../../../src/init/project-analyzer.js';
import { readCoverageSummary } from '../../../../src/mcp/tools/planning/world-state.js';
import { TestBasedVerifier } from '../../../../src/agents/claim-verifier/verifiers/test-verifier.js';
import { persistTestAndCoverage } from '../../../../src/cli/commands/hooks-handlers/command-hooks.js';

// The post-command hook writes to the unified memory database. Stand in a
// recording fake for it, so the test sees which coverage_sessions row would
// have been written and no real database is opened.
const { coverageRows, fakeDb } = vi.hoisted(() => {
  const coverageRows: unknown[][] = [];
  const fakeDb = {
    pragma: () => undefined,
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => { if (sql.includes('INSERT INTO coverage_sessions')) coverageRows.push(args); },
      get: () => undefined,
    }),
  };
  return { coverageRows, fakeDb };
});
vi.mock('../../../../src/kernel/unified-memory.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getUnifiedMemory: () => ({ isInitialized: () => true, initialize: async () => undefined, getDatabase: () => fakeDb }),
}));

const fifoSupported = process.platform !== 'win32';

const SUMMARY = JSON.stringify({
  total: { lines: { pct: 77 }, branches: { pct: 66 }, functions: { pct: 55 }, statements: { pct: 44 } },
});

/** Each reader, reduced to the line coverage it reports (null = not read). */
const readers: Array<[string, (root: string) => Promise<number | null>]> = [
  ['prove collectMetrics', async (root) => {
    const m = await collectMetrics(root);
    return m.coveragePercent === 0 ? null : m.coveragePercent;
  }],
  ['ProjectAnalyzer.measureCoverage', async (root) => {
    // A refused report is no report: hasReport is false, not true with zeros.
    const c = await new ProjectAnalyzer(root).measureCoverage();
    return c.hasReport ? c.lines : null;
  }],
  ['world-state readCoverageSummary', async (root) => readCoverageSummary(root)?.line ?? null],
  ['TestBasedVerifier coverage report', async (root) => {
    const verifier = new TestBasedVerifier({ rootDir: root });
    const read = (verifier as unknown as { getCoverageData(): Promise<{ lines: number }> }).getCoverageData();
    return read.then((d) => d.lines, () => null);
  }],
  ['hooks post-command persistTestAndCoverage', async (root) => {
    // The hook reads coverage/coverage-summary.json under process.cwd().
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
    coverageRows.length = 0;
    try {
      await persistTestAndCoverage({ command: 'npx vitest run', framework: 'vitest', success: true, durationMs: 0 });
    } finally {
      cwd.mockRestore();
    }
    // after_lines is the 7th bound value of the coverage_sessions insert.
    return coverageRows.length === 0 ? null : (coverageRows[0][6] as number);
  }],
];

describe.each(readers)('%s (#1337)', (_name, read) => {
  let base: string;
  let root: string;
  let outside: string;
  const summaryPath = () => path.join(root, 'coverage', 'coverage-summary.json');

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'aqe-1337-')));
    root = path.join(base, 'project');
    outside = path.join(base, 'outside');
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    fs.mkdirSync(outside);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('reads a regular summary inside the project', async () => {
    fs.writeFileSync(summaryPath(), SUMMARY);
    expect(await read(root)).toBe(77);
  });

  it('does not read a summary symlinked out of the project', async () => {
    fs.writeFileSync(path.join(outside, 'coverage-summary.json'), SUMMARY);
    fs.symlinkSync(path.join(outside, 'coverage-summary.json'), summaryPath());
    expect(await read(root)).toBeNull();
  });

  it.runIf(fifoSupported)('skips a FIFO summary without blocking', async () => {
    execFileSync('mkfifo', [summaryPath()]);
    // A delayed writer: a blocking open waits for it, so the elapsed time
    // tells a refused read from a blocked one, and the suite cannot hang.
    const writer = spawn('sh', ['-c', 'sleep 6; exec 3>"$0"', summaryPath()], { stdio: 'ignore' });
    try {
      const started = Date.now();
      expect(await read(root)).toBeNull();
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      writer.kill('SIGKILL');
    }
  }, 20000);
});
