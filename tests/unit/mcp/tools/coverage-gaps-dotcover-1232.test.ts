/**
 * #1232: qe/coverage/gaps never reports a dotCover statement with an unknown
 * FileIndex as a gap in a made-up `file-N`; it says the statements were skipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CoverageGapsTool } from '../../../../src/mcp/tools';

// Mock shared memory backend to prevent real SQLite initialization in unit tests
vi.mock('../../../../src/mcp/tools/base', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/mcp/tools/base')>();
  const mockMemory = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  return {
    ...original,
    getSharedMemoryBackend: vi.fn().mockResolvedValue(mockMemory),
    getMemoryBackend: vi.fn().mockResolvedValue(mockMemory),
  };
});

const statement = (index: number, line: number, covered: boolean) =>
  `<Statement FileIndex="${index}" Line="${line}" Column="1" EndLine="${line}" EndColumn="9" Covered="${covered ? 'True' : 'False'}" />`;

describe('qe/coverage/gaps with a dotCover report (#1232)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'aqe-1232-'));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('lists no file-N gap and returns the skipped-statement warning', async () => {
    writeFileSync(path.join(root, 'dotcover-report.xml'), `<Root CoveredStatements="2" TotalStatements="5">
  <File Index="1" Name="src/Calculator.cs" />
  ${statement(1, 1, true)}
  ${statement(1, 2, false)}
  ${statement(7, 10, false)}
  ${statement(7, 11, false)}
  ${statement(7, 12, true)}
</Root>`);

    const result = await new CoverageGapsTool().invoke({
      target: root, coverageFile: path.join(root, 'dotcover-report.xml'), coverageFormat: 'dotcover', minRisk: 0,
    });

    expect(result.success).toBe(true);
    const files = [...(result.data?.gaps ?? []), ...(result.data?.suggestedTests ?? [])].map((g) => g.file);
    expect(files.some((f) => /file-\d+/.test(f))).toBe(false);
    expect(result.data?.warnings).toEqual([
      'dotCover report references FileIndex 7 missing from its file table; 3 statement(s) skipped and their coverage is not reported',
    ]);
  });

  it('fails with the warning when no statement resolves to a file', async () => {
    writeFileSync(path.join(root, 'dotcover-report.xml'), `<Root CoveredStatements="1" TotalStatements="1">
  ${statement(4, 1, true)}
</Root>`);

    const result = await new CoverageGapsTool().invoke({
      target: root, coverageFile: path.join(root, 'dotcover-report.xml'), coverageFormat: 'dotcover',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/parsed 0 files.*FileIndex 4 missing from its file table/);
  });
});
