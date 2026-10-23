/**
 * Issue #1030 — a per-file coverage record is written only for a file inside
 * the project, listed once in its report.
 *
 * Before: an lcov `SF:../../../outside.ts` entry became a measured record
 * outside the project root, `./src/a.ts` and `src/a.ts` collapsed into one key
 * (the last write won), and a Windows `C:\…` path became a junk key on POSIX.
 */
import { describe, expect, it, vi } from 'vitest';
import { join, sep } from 'node:path';
import { projectFileCoverageKeys } from '../../../../src/domains/coverage-analysis/collected-metrics';
import { CoverageAnalyzerService } from '../../../../src/domains/coverage-analysis/services/coverage-analyzer';
import type { FileCoverage } from '../../../../src/domains/coverage-analysis/interfaces';

const ROOT = join(sep, 'work', 'project');

describe('#1030 — projectFileCoverageKeys', () => {
  it('keys project files by their absolute path', () => {
    const keys = projectFileCoverageKeys(['src/a.ts', join(ROOT, 'src', 'b.ts')], ROOT);
    expect([...keys.entries()]).toEqual([
      ['src/a.ts', join(ROOT, 'src', 'a.ts')],
      [join(ROOT, 'src', 'b.ts'), join(ROOT, 'src', 'b.ts')],
    ]);
  });

  it('leaves out a path outside the project root', () => {
    const keys = projectFileCoverageKeys(['../../../outside.ts', join(sep, 'elsewhere', 'c.ts'), 'src/a.ts'], ROOT);
    expect([...keys.keys()]).toEqual(['src/a.ts']);
  });

  it('keeps a project file whose name starts with two dots', () => {
    expect([...projectFileCoverageKeys(['..config.ts'], ROOT).values()]).toEqual([join(ROOT, '..config.ts')]);
  });

  it.runIf(sep === '/')('leaves out a Windows absolute path read on POSIX', () => {
    const keys = projectFileCoverageKeys(['C:\\repo\\src\\a.ts', 'src/b.ts'], ROOT);
    expect([...keys.keys()]).toEqual(['src/b.ts']);
  });

  it('leaves out every spelling of a file the report lists twice', () => {
    const keys = projectFileCoverageKeys(['./src/a.ts', 'src/a.ts', 'src/b.ts'], ROOT);
    expect([...keys.keys()]).toEqual(['src/b.ts']);
  });
});

describe('#1030 — the coverage analyzer stores per-file records only for those keys', () => {
  const file = (path: string, covered: number): FileCoverage => ({
    path,
    lines: { covered, total: 10 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    statements: { covered, total: 10 },
    uncoveredLines: [],
    uncoveredBranches: [],
  });

  it('writes no record for an outside, Windows or doubly listed path', async () => {
    const store = new Map<string, unknown>();
    const memory = {
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
      get: vi.fn(async (key: string) => store.get(key)),
      delete: vi.fn(async (key: string) => store.delete(key)),
      storeVector: vi.fn(async () => undefined),
      search: vi.fn(async () => []),
      vectorSearch: vi.fn(async () => []),
    };
    const analyzer = new CoverageAnalyzerService(memory as never);

    const result = await analyzer.analyze({
      coverageData: {
        files: [
          file('src/kept.ts', 8),
          file('../../../outside.ts', 9),
          file('C:\\repo\\src\\win.ts', 7),
          file('./src/twice.ts', 1),
          file('src/twice.ts', 10),
        ],
        summary: { line: 70, branch: 0, function: 0, statement: 70, files: 5 },
      },
      threshold: 80,
      includeFileDetails: true,
      measured: true,
      projectRoot: ROOT,
    });

    expect(result.success).toBe(true);
    const perFile = [...store.keys()].filter(key => key.startsWith('coverage:file:')).sort();
    expect(perFile).toEqual([`coverage:file:${join(ROOT, 'src', 'kept.ts')}`]);
    expect(store.get(`coverage:file:${join(ROOT, 'src', 'kept.ts')}`)).toMatchObject({ line: 80, measured: true });
  });
});
