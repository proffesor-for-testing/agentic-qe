/**
 * #1146: `aqe fleet run --parallel N` submitted the same payload N times, so
 * every worker repeated the whole job. The target's files are now split
 * across the workers and their results combined for the verdict.
 */
import { describe, expect, it } from 'vitest';
import { combineFleetResults, shardFleetPayload, splitEvenly } from '../../../src/cli/utils/fleet-shard.js';

const scan = (file: string, over: Record<string, unknown> = {}) => ({
  vulnerabilities: [],
  summary: { critical: 0, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 1 },
  coverage: { filesScanned: 1, linesScanned: 10 },
  evidence: { completeness: 'complete', requestedPaths: [file] },
  ...over,
});

describe('splitEvenly (#1146)', () => {
  it('splits into contiguous chunks whose sizes differ by at most one, covering every item once', () => {
    expect(splitEvenly(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(splitEvenly(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toEqual([['a', 'b', 'c'], ['d', 'e'], ['f', 'g']]);
  });

  it('never makes an empty chunk when there are fewer items than parts', () => {
    expect(splitEvenly(['a', 'b'], 4)).toEqual([['a'], ['b']]);
  });
});

describe('shardFleetPayload (#1146)', () => {
  const files = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'];

  it('gives each scan worker a disjoint share of the files', () => {
    const plan = shardFleetPayload('scan', { files }, 2);
    expect(plan.payloads).toEqual([{ files: ['a.js', 'b.js', 'c.js'] }, { files: ['d.js', 'e.js'] }]);
    expect(plan.files.flat()).toEqual(files);
    expect(plan.note).toBeUndefined();
  });

  it('splits test source files the same way', () => {
    const plan = shardFleetPayload('test', { sourceFiles: files, language: 'ts' }, 3);
    expect(plan.payloads.map(p => p.sourceFiles)).toEqual([['a.js', 'b.js'], ['c.js', 'd.js'], ['e.js']]);
    expect(plan.payloads.every(p => p.language === 'ts')).toBe(true);
  });

  it('uses 4 workers when --parallel is not given', () => {
    expect(shardFleetPayload('scan', { files }, undefined).payloads).toHaveLength(4);
  });

  it('says so when --parallel asks for more workers than there are files', () => {
    const plan = shardFleetPayload('scan', { files: ['a.js'] }, 3);
    expect(plan.payloads).toEqual([{ files: ['a.js'] }]);
    expect(plan.note).toBe('--parallel 3 asks for more workers than there are files (1); 1 run.');
  });

  it('runs analyze as one task, and says --parallel does not apply when it was given', () => {
    const payload = { coverageData: { files: [] }, threshold: 80 };
    expect(shardFleetPayload('analyze', payload, undefined)).toEqual({ payloads: [payload], files: [[]] });
    const plan = shardFleetPayload('analyze', payload, 4);
    expect(plan.payloads).toEqual([payload]);
    expect(plan.note).toContain('judges one coverage report as a whole, so it runs as one task');
  });
});

describe('combineFleetResults (#1146)', () => {
  it('adds up the scan shards: findings, severity counts and files scanned', () => {
    const finding = { severity: 'critical', title: 'eval', location: { file: 'b.js', line: 1 } };
    const combined = combineFleetResults('scan', [
      scan('a.js'),
      scan('b.js', { vulnerabilities: [finding], summary: { critical: 1, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 1 } }),
    ]);
    expect(combined).toEqual({
      vulnerabilities: [finding],
      summary: { critical: 1, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 2 },
      coverage: { filesScanned: 2, linesScanned: 20 },
      evidence: { completeness: 'complete' },
    });
  });

  it('calls the combined scan partial when one shard was not fully analyzed', () => {
    const combined = combineFleetResults('scan', [scan('a.js'), scan('b.js', { evidence: { completeness: 'partial' } })]);
    expect(combined).toMatchObject({ evidence: { completeness: 'partial' } });
  });

  it('leaves completeness unknown when a shard has no evidence', () => {
    const noEvidence = scan('b.js');
    delete (noEvidence as Record<string, unknown>).evidence;
    expect(combineFleetResults('scan', [scan('a.js'), noEvidence])).not.toHaveProperty('evidence');
  });

  it('joins the generated tests of every shard', () => {
    expect(combineFleetResults('test', [{ tests: [{ name: 'a' }] }, { tests: [{ name: 'b' }] }]))
      .toEqual({ tests: [{ name: 'a' }, { name: 'b' }] });
  });

  it('returns no result when a shard result cannot be read', () => {
    expect(combineFleetResults('scan', [scan('a.js'), { unexpected: true }])).toBeUndefined();
    expect(combineFleetResults('test', [{ tests: [] }, undefined])).toBeUndefined();
    expect(combineFleetResults('scan', [])).toBeUndefined();
  });

  it('returns a single worker result unchanged', () => {
    const only = scan('a.js');
    expect(combineFleetResults('scan', [only])).toBe(only);
  });
});
