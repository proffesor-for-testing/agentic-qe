/**
 * #1354: `coverage_analyze_sublinear` (task `analyze-coverage`) with `target`
 * set to a coverage report, or to a project whose report it discovers, read
 * the report without refusing hardlinks; so did `qe/coverage/gaps` and
 * `qe/coverage/analyze` when they discover a report under `target`. Over MCP
 * a hardlinked report is now refused and named; the CLI's shared resolution
 * keeps reading the operator's own reports. Real hardlinks in a temp project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveExistingCoverage } from '../../../../src/coordination/handlers/coverage-target';
import { registerCoverageHandlers } from '../../../../src/coordination/handlers/coverage-handlers';
import type { InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';
import { CoverageAnalyzeTool, CoverageGapsTool } from '../../../../src/mcp/tools';
import { findAndParseCoverage } from '../../../../src/domains/coverage-analysis/services/coverage-parser';

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

const SECRET = 'OUTSIDE_SECRET_1354';

function fakeAnalyzer() {
  return {
    analyze: vi.fn(async (req: { coverageData: { summary: Record<string, number> } }) => ({
      success: true,
      value: { summary: req.coverageData.summary, meetsThreshold: false, recommendations: [] },
    })),
    findGaps: async () => ({ success: true, value: { gaps: [] } }),
  };
}

async function mcpAnalyze(target: string): Promise<{ success: boolean; value?: Record<string, unknown>; error?: Error }> {
  let handler!: InstanceTaskHandler;
  registerCoverageHandlers({
    registerHandler: (_type: string, fn: InstanceTaskHandler) => { handler = fn; },
    getCoverageAnalyzer: () => fakeAnalyzer(),
  } as never);
  return await handler({ payload: { target, detectGaps: false } } as never) as
    { success: boolean; value?: Record<string, unknown>; error?: Error };
}

describe('hardlinked coverage reports over MCP (#1354)', () => {
  let base: string;
  let root: string;
  let report: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1354-cov-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fx"}');
    fs.writeFileSync(path.join(root, 'src', 'a.js'), 'function add(a, b) {\n  return a + b;\n}\n');
    fs.writeFileSync(path.join(base, 'outside', 'lcov.info'),
      `TN:\nSF:${SECRET}.ts\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n`);
    report = path.join(root, 'coverage', 'lcov.info');
    fs.linkSync(path.join(base, 'outside', 'lcov.info'), report);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_COVERAGE_NO_EXEC', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  describe('shared resolution', () => {
    it("refuses a hardlinked report target with { hardlinks: 'refuse' }", async () => {
      const existing = await resolveExistingCoverage(report, { hardlinks: 'refuse' });
      expect(existing).toMatchObject({
        status: 'evaluated',
        evaluation: { status: 'no-data', reason: 'refused-report', refused: [{ path: report, reason: 'hardlinked' }] },
      });
    });

    it("refuses a hardlinked discovered project report with { hardlinks: 'refuse' }", async () => {
      const existing = await resolveExistingCoverage(root, { hardlinks: 'refuse' });
      expect(existing).toMatchObject({ status: 'no-report', refused: [{ path: report, reason: 'hardlinked' }] });
    });

    it('keeps reading it by default, as the CLI does', async () => {
      const existing = await resolveExistingCoverage(report);
      expect(existing).toMatchObject({ status: 'evaluated', evaluation: { status: 'measured' } });
    });
  });

  describe('MCP analyze-coverage (coverage_analyze_sublinear)', () => {
    it('refuses a hardlinked report given as the target and names it', async () => {
      const result = await mcpAnalyze(report);
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(result.success).toBe(true);
      expect(result.value).toMatchObject({ measured: false, coverageMethod: 'none' });
      expect(result.value?.warning).toContain(report);
      expect(result.value?.warning).toMatch(/more than one hardlink/);
    });

    it('refuses a hardlinked report discovered under the target', async () => {
      const result = await mcpAnalyze(root);
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(JSON.stringify(result)).toMatch(/more than one hardlink/);
    });

    it('still reads a plain report', async () => {
      fs.rmSync(report);
      fs.writeFileSync(report, `TN:\nSF:${path.join(root, 'src', 'a.js')}\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n`);
      const result = await mcpAnalyze(report);
      expect(result.value).toMatchObject({ measured: true });
    });
  });

  describe('qe/coverage tools without coverageFile', () => {
    it('refuse a hardlinked report they discover under target', async () => {
      for (const tool of [new CoverageGapsTool(), new CoverageAnalyzeTool()]) {
        const result = await tool.invoke({ target: root, minRisk: 0 });
        expect(result.success, tool.name).toBe(false);
        expect(result.error, tool.name).toMatch(/hardlinked/);
        expect(JSON.stringify(result), tool.name).not.toContain(SECRET);
      }
    });

    it('findAndParseCoverage reads it unless the caller refuses hardlinks', async () => {
      await expect(findAndParseCoverage(root, undefined, { hardlinks: 'refuse' })).rejects.toThrow(/hardlinked/);
      const read = await findAndParseCoverage(root);
      expect(read?.files.size).toBe(1);
    });
  });
});
