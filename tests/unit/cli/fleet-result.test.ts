/**
 * #1125 review: `aqe fleet run` judges what each handler returned instead of
 * reporting every completed task as a success.
 */
import { describe, expect, it } from 'vitest';
import { judgeFleetRun, reportFleetVerdict, summarizeFleetResult } from '../../../src/cli/utils/fleet-result.js';

const scan = (over: Record<string, unknown> = {}) => ({
  vulnerabilities: [],
  summary: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
  coverage: { filesScanned: 2 },
  evidence: { completeness: 'complete' },
  ...over,
});

describe('summarizeFleetResult (#1125)', () => {
  it('passes a complete scan without critical or high findings', () => {
    const summary = summarizeFleetResult('scan', scan({ summary: { critical: 0, high: 0, medium: 2, low: 0, informational: 0 } }));
    expect(summary).toEqual({
      lines: ['Findings: critical 0, high 0, medium 2, low 0, informational 0', 'Files scanned: 2 (evidence: complete)'],
      passed: true, reasons: [],
    });
  });

  it('fails a scan whose evidence says not every file was analyzed', () => {
    const summary = summarizeFleetResult('scan', scan({ evidence: { completeness: 'partial' } }));
    expect(summary.passed).toBe(false);
    expect(summary.reasons).toEqual(['scan evidence is partial: not every requested file was analyzed']);
  });

  it('shows coverage figures and leaves an uncollected metric as n/a, not 0%', () => {
    const summary = summarizeFleetResult('analyze', {
      summary: { line: 75, branch: 0, function: 50, statement: 75, files: 1 },
      meetsThreshold: false,
      collected: { branch: false, function: true, statement: true },
    });
    expect(summary.lines).toEqual([
      'Coverage: line 75%, branch n/a (not collected), function 50%, statement 75% over 1 files',
      'Overall over collected metrics: 66.7% (threshold 80%)',
    ]);
    expect(summary.reasons).toEqual(['coverage is below the 80% threshold']);
  });

  // The analyzer's meetsThreshold averages all four metrics, an uncollected
  // one as 0, so a line-only report at 90% would read as below threshold.
  it('passes a line-only report above the threshold whatever the analyzer averaged', () => {
    const summary = summarizeFleetResult('analyze', {
      summary: { line: 90, branch: 0, function: 0, statement: 0, files: 3 },
      meetsThreshold: false,
      collected: { branch: false, function: false, statement: false },
    });
    expect(summary).toMatchObject({ passed: true, reasons: [] });
    expect(summary.lines[1]).toBe('Overall over collected metrics: 90.0% (threshold 80%)');
  });

  it('fails when no tests were generated', () => {
    expect(summarizeFleetResult('test', { tests: [] }).reasons).toEqual(['no tests were generated']);
  });

  it.each(['scan', 'test', 'analyze'] as const)('fails a %s result it cannot read instead of passing it', (operation) => {
    expect(summarizeFleetResult(operation, undefined)).toMatchObject({ passed: false, reasons: [`the ${operation} result has no readable summary`] });
  });
});

describe('reportFleetVerdict (#1125)', () => {
  // #1146: each worker scanned its own share of the files, so their results
  // are combined into one summary instead of being shown per worker.
  it('prints one combined summary of the workers and fails when a worker did not complete', () => {
    const lines: string[] = [];
    const passed = reportFleetVerdict('scan', [
      { success: true, result: scan() }, { success: true, result: scan() }, { success: false, result: undefined },
    ], line => lines.push(line));
    expect(passed).toBe(false);
    expect(lines.filter(l => l.includes('Findings:'))).toHaveLength(1);
    expect(lines).toContain('   Files scanned: 4 (evidence: complete)');
    expect(lines.at(-1)).toContain('Verdict: FAILED (1 of 3 workers did not complete)');
  });

  it('fails on a finding from any shard', () => {
    const critical = scan({
      vulnerabilities: [{ severity: 'critical', title: 'eval', location: { file: 'b.js', line: 3 } }],
      summary: { critical: 1, high: 0, medium: 0, low: 0, informational: 0 },
    });
    const verdict = judgeFleetRun('scan', [{ success: true, result: scan() }, { success: true, result: critical }]);
    expect(verdict).toMatchObject({ passed: false, reasons: ['1 critical and 0 high findings'] });
    expect(verdict.summary?.lines).toContain('  [critical] eval @ b.js:3');
  });

  it('has no summary when no worker completed', () => {
    expect(judgeFleetRun('scan', [{ success: false, result: undefined }])).toEqual({
      combined: undefined, passed: false, reasons: ['1 of 1 workers did not complete'],
    });
  });
});
