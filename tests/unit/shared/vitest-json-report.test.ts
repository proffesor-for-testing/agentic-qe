import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createVitestJsonReport,
  needsVitestJsonReportFile,
  resolveVitestJsonOutput,
} from '../../../src/shared/vitest-json-report.js';

const REPORT = '{"numTotalTests":1,"testResults":[]}';

describe('vitest JSON report resolution (Vitest 4 and 5 parity)', () => {
  it('prefers the report file over stdout when the runner wrote one', () => {
    const report = createVitestJsonReport();
    try {
      mkdirSync(dirname(report.path), { recursive: true });
      writeFileSync(report.path, REPORT);
      // Vitest 5 (and Vitest 4 with --outputFile) print only this line.
      expect(report.read(`JSON report written to ${report.path}\n`)).toBe(REPORT);
    } finally {
      report.cleanup();
    }
  });

  it('falls back to stdout when no report file exists', () => {
    const report = createVitestJsonReport();
    try {
      expect(report.read(REPORT)).toBe(REPORT);
    } finally {
      report.cleanup();
    }
  });

  it('falls back to stdout when the report file is empty', () => {
    const report = createVitestJsonReport();
    try {
      writeFileSync(report.path, '   \n');
      expect(report.read('stdout-doc')).toBe('stdout-doc');
    } finally {
      report.cleanup();
    }
  });

  it('gives each run its own report path and removes it on cleanup', () => {
    const a = createVitestJsonReport();
    const b = createVitestJsonReport();
    expect(a.path).not.toBe(b.path);
    expect(a.args).toEqual([`--outputFile=${a.path}`]);
    writeFileSync(a.path, REPORT);
    a.cleanup();
    b.cleanup();
    expect(existsSync(a.path)).toBe(false);
    expect(() => a.cleanup()).not.toThrow();
  });

  it('resolves undefined report paths to stdout', () => {
    expect(resolveVitestJsonOutput('doc', undefined)).toBe('doc');
  });

  it('detects vitest json invocations that still need an output file', () => {
    expect(needsVitestJsonReportFile(['vitest', 'run', '--reporter=json', 'a.test.ts'])).toBe(true);
    expect(needsVitestJsonReportFile(['vitest', 'run', '--reporter', 'json'])).toBe(true);
    // Runner configured separately from its arguments (flaky detector config shape).
    expect(needsVitestJsonReportFile(['vitest', 'run', '--reporter=json', 'a.test.ts'].slice(0))).toBe(true);
    expect(needsVitestJsonReportFile(['/repo/node_modules/.bin/vitest', 'run', '--reporter=json'])).toBe(true);
    expect(needsVitestJsonReportFile(['vitest.cmd', 'run', '--reporter=json'])).toBe(true);
    expect(needsVitestJsonReportFile(['npx', 'run', '--reporter=json'])).toBe(false);
    expect(needsVitestJsonReportFile(['vitest', 'run', '--reporter=json', '--outputFile=/tmp/x.json'])).toBe(false);
    expect(needsVitestJsonReportFile(['vitest', 'run', '--reporter=verbose'])).toBe(false);
    expect(needsVitestJsonReportFile(['jest', '--json'])).toBe(false);
  });
});
