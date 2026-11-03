/**
 * #1350: a coverage report named by an MCP caller (`coverageFile` on
 * qe/coverage/gaps and qe/coverage/analyze) refuses a hardlink, and a report
 * that does not parse is reported without quoting the file. Real hardlinks
 * in a temporary project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CoverageAnalyzeTool, CoverageGapsTool } from '../../../../src/mcp/tools';
import { parseCoverage } from '../../../../src/domains/coverage-analysis/services/coverage-parser';

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

const lcov = (file: string) => `TN:\nSF:${file}\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n`;

describe('caller-named coverage reports refuse hardlinks (#1350)', () => {
  let base: string;
  let root: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1350-cov-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(base, 'outside', 'lcov.info'), lcov('OUTSIDE_SECRET_1350.ts'));
    fs.linkSync(path.join(base, 'outside', 'lcov.info'), path.join(root, 'hard-lcov.info'));
    fs.writeFileSync(path.join(base, 'outside', 'coverage.json'), 'OUTSIDE_SECRET_1350=abc not json');
    fs.linkSync(path.join(base, 'outside', 'coverage.json'), path.join(root, 'hard-coverage.json'));
    fs.writeFileSync(path.join(root, 'plain-lcov.info'), lcov('src/inside.ts'));
    fs.writeFileSync(path.join(root, 'broken-coverage.json'), 'PLAIN_SECRET_1350=xyz not json');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const tools = () => [new CoverageGapsTool(), new CoverageAnalyzeTool()];

  it('refuses a hardlinked coverageFile without reading it', async () => {
    for (const tool of tools()) {
      for (const file of ['hard-lcov.info', 'hard-coverage.json']) {
        const refused = await tool.invoke({ target: root, coverageFile: path.join(root, file), minRisk: 0 });
        expect(refused.success, tool.name).toBe(false);
        expect(refused.error, tool.name).toContain('hardlinked');
        expect(JSON.stringify(refused), tool.name).not.toContain('OUTSIDE_SECRET_1350');
      }
    }
  });

  it('still reads a plain coverageFile', async () => {
    for (const tool of tools()) {
      const read = await tool.invoke({ target: root, coverageFile: path.join(root, 'plain-lcov.info'), minRisk: 0 });
      expect(read.success, `${tool.name}: ${read.error}`).toBe(true);
      expect(JSON.stringify(read.data)).toContain('inside');
    }
  });

  it('reports an unparseable coverageFile without quoting it', async () => {
    for (const tool of tools()) {
      const bad = await tool.invoke({ target: root, coverageFile: path.join(root, 'broken-coverage.json'), minRisk: 0 });
      expect(bad.success, tool.name).toBe(false);
      expect(bad.error, tool.name).toContain('not valid JSON');
      // Node's JSON error quotes the first characters of the input.
      expect(JSON.stringify(bad), tool.name).not.toContain('PLAIN_SECR');
    }
  });

  it('parseCoverage reads a hardlinked report unless the caller refuses hardlinks', async () => {
    const hard = path.join(root, 'hard-lcov.info');
    await expect(parseCoverage(hard, root, 'lcov', undefined, { hardlinks: 'refuse' })).rejects.toThrow(/hardlinked/);
    await expect(parseCoverage(hard, root, undefined, undefined, { hardlinks: 'refuse' })).rejects.toThrow(/hardlinked/);
    const read = await parseCoverage(hard, root);
    expect(read.files.size).toBe(1);
  });
});
