/**
 * Issue #914 follow-through: cache keys built by joining data with ':', '|' or ','
 * collide when the data contains the delimiter. These builders now encode a JSON
 * tuple, as #863 did for the shared embedding cache.
 */
import { describe, expect, it } from 'vitest';
import { RuVectorCoverageRouter } from '../../../src/integrations/ruvector/coverage-router';
import { RuVectorDiffRiskClassifier } from '../../../src/integrations/ruvector/diff-risk-classifier';
import { ContextCompiler } from '../../../src/context/compiler';
import type { RuVectorConfig } from '../../../src/integrations/ruvector/interfaces';

const config = { enabled: true, cacheEnabled: true } as RuVectorConfig;

type CoverageKey = { computeCacheKey(data: unknown[], target: number): string };
type DiffKey = { computeCacheKey(context: unknown): string };
type CompilerKey = { buildCacheKey(request: unknown): string };

function coverage(filePath: string, lineCoverage: number, branchCoverage: number) {
  return { filePath, lineCoverage, branchCoverage };
}
function file(filePath: string, additions = 1) {
  return { filePath, status: 'modified', additions, deletions: 0 };
}

describe('RuVectorCoverageRouter cache key (#914)', () => {
  const key = (data: unknown[], target = 80) =>
    (new RuVectorCoverageRouter(config) as unknown as CoverageKey).computeCacheKey(data, target);

  it('keeps a "|" or ":" in a file path from merging with the next entry', () => {
    // Old key for both: "80:a:1:2|b:3:4".
    expect(key([coverage('a:1:2|b', 3, 4)])).not.toBe(key([coverage('a', 1, 2), coverage('b', 3, 4)]));
  });

  it('is still order-independent for the same files', () => {
    const files = [coverage('src/a.ts', 50, 40), coverage('src/b.ts', 60, 70)];
    expect(key(files)).toBe(key([...files].reverse()));
    expect(key(files, 80)).not.toBe(key(files, 90));
  });
});

describe('RuVectorDiffRiskClassifier cache key (#914)', () => {
  const key = (context: unknown) =>
    (new RuVectorDiffRiskClassifier(config) as unknown as DiffKey).computeCacheKey(context);

  it('keeps delimiters in the commit hash or a file path from colliding', () => {
    // Old key for both: "c:a:modified:1:0|b:modified:1:0".
    expect(key({ commitHash: 'c', files: [file('a'), file('b')] }))
      .not.toBe(key({ commitHash: 'c:a', files: [file('modified:1:0|b')] }));
    expect(key({ commitHash: 'x', files: [file('a:modified:1:0|b')] }))
      .not.toBe(key({ commitHash: 'x', files: [file('a'), file('b')] }));
  });

  it('is still order-independent and defaults a missing commit hash', () => {
    const files = [file('a'), file('b', 2)];
    expect(key({ files })).toBe(key({ commitHash: '', files: [...files].reverse() }));
  });
});

describe('ContextCompiler cache key (#914)', () => {
  const compiler = () => new ContextCompiler({ sources: [] }) as unknown as CompilerKey;
  const request = (targetFiles: string[], taskDescription = 'task', agentType = 'qe-test-architect') =>
    ({ agentType, targetFiles, taskDescription });

  it('keeps a "," in a file name from looking like two files', () => {
    expect(compiler().buildCacheKey(request(['a,b']))).not.toBe(compiler().buildCacheKey(request(['a', 'b'])));
  });

  it('keeps a ":" in the agent type from shifting into the file list', () => {
    expect(compiler().buildCacheKey(request(['x'], 'task', 'agent:y')))
      .not.toBe(compiler().buildCacheKey(request(['y:x'], 'task', 'agent')));
  });

  it('does not reorder the caller-owned targetFiles array', () => {
    const files = ['b.ts', 'a.ts'];
    compiler().buildCacheKey(request(files));
    expect(files).toEqual(['b.ts', 'a.ts']);
    expect(compiler().buildCacheKey(request(['b.ts', 'a.ts']))).toBe(compiler().buildCacheKey(request(['a.ts', 'b.ts'])));
  });
});
