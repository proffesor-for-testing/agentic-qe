/**
 * Issue #1219 (item 3) — the coverage summary counts only report entries that
 * are project files.
 *
 * Fixture from the issue: an lcov report holding `SF:../../../outside.ts`,
 * `SF:C:\repo\src\win.ts` and `src/a.ts` listed twice, for a project with two
 * source files. #1030 left those entries out of the per-file records, but the
 * summary still counted them: `lineCoverage 73`, `totalFiles 5`, evidence
 * "complete". Every surface reads the shared resolver
 * (`evaluateCoverageForTarget`), so it is checked here with the MCP /
 * task_orchestrate `analyze-coverage` handler and the CLI verdict.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveExistingCoverage } from '../../../../src/coordination/handlers/coverage-target';
import { describeEvidence, describeExcludedEntries } from '../../../../src/coordination/handlers/coverage-evidence';
import { classifyProjectCoveragePaths } from '../../../../src/domains/coverage-analysis/collected-metrics';
import { createTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import { coverageJson, evaluateCliCoverage, type CoverageAnalyzeAPI } from '../../../../src/cli/utils/coverage-verdict';

// Side-effect import: registers the coverage-analysis domain service factory.
import '../../../../src/domains/coverage-analysis';

const OLD = new Date('2020-01-01T00:00:00Z');
const NEWER = new Date('2021-01-01T00:00:00Z');

/** One lcov record: `covered` of `total` lines hit. */
function record(sf: string, total: number, covered: number): string {
  const lines = Array.from({ length: total }, (_, i) => `DA:${i + 1},${i < covered ? 1 : 0}\n`).join('');
  return `TN:\nSF:${sf}\n${lines}LF:${total}\nLH:${covered}\nend_of_record\n`;
}

let root: string;
const at = (rel: string) => path.join(root, rel);

function write(rel: string, content: string, mtime: Date = OLD): void {
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), content);
  fs.utimesSync(at(rel), mtime, mtime);
}

/** The issue's report: two project files, plus entries that are not project files. */
function issueFixture(): void {
  write('src/a.ts', 'export const a = 1;\n');
  write('src/b.ts', 'export const b = 1;\n');
  write('coverage/lcov.info',
    record('../../../outside.ts', 40, 40) +
    record('C:\\repo\\src\\win.ts', 40, 40) +
    record('src/a.ts', 10, 8) +
    record('./src/a.ts', 10, 8) +
    record('src/b.ts', 100, 50), NEWER);
}

function createKernel() {
  const store = new Map<string, unknown>();
  return {
    memory: {
      initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
      store: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      retrieve: vi.fn(async (k: string) => store.get(k) ?? null),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      delete: vi.fn(async (k: string) => { store.delete(k); }),
      list: vi.fn(async () => [...store.keys()]),
      search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), query: vi.fn(async () => []),
      storeVector: vi.fn(async () => {}),
    },
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []), dispose: vi.fn(async () => {}),
    },
    agentCoordinator: { spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}) },
    initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
  };
}

/** The `analyze-coverage` handler that MCP `coverage_analyze_sublinear` and `task_orchestrate` run. */
async function analyzeViaHandler(target: string): Promise<Record<string, unknown>> {
  const executor = createTaskExecutor(createKernel() as never, {
    saveResults: false, resultsDir: root, defaultLanguage: 'javascript', defaultFramework: 'vitest',
  });
  const result = await executor.execute({
    id: `task-1219-${Date.now()}`, type: 'analyze-coverage', priority: 'p1', targetDomains: [],
    payload: { target, detectGaps: false, saveResults: false }, timeout: 60000, createdAt: new Date(),
  } as unknown as QueenTask);
  expect(result.success).toBe(true);
  return result.data as Record<string, unknown>;
}

/** A stand-in for the coverage domain that echoes the summary it is given. */
function fakeAnalyzer(): CoverageAnalyzeAPI {
  return {
    analyze: vi.fn(async (req: { coverageData: { summary: Record<string, number> } }) => ({
      success: true, value: { summary: req.coverageData.summary, recommendations: [] },
    })),
  };
}

let savedAqeRoot: string | undefined;
let savedNoExec: string | undefined;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1219-')));
  fs.mkdirSync(at('.git'));
  fs.writeFileSync(at('package.json'), '{"name":"fx1219","version":"1.0.0"}');
  savedAqeRoot = process.env.AQE_PROJECT_ROOT;
  savedNoExec = process.env.AQE_COVERAGE_NO_EXEC;
  process.env.AQE_PROJECT_ROOT = root;
  process.env.AQE_COVERAGE_NO_EXEC = '1';
});

afterEach(() => {
  if (savedAqeRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
  else process.env.AQE_PROJECT_ROOT = savedAqeRoot;
  if (savedNoExec === undefined) delete process.env.AQE_COVERAGE_NO_EXEC;
  else process.env.AQE_COVERAGE_NO_EXEC = savedNoExec;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('#1219 — classifyProjectCoveragePaths', () => {
  it('says why each entry is not a project file', () => {
    const { keys, excluded } = classifyProjectCoveragePaths(
      ['../../../outside.ts', 'C:\\repo\\src\\win.ts', 'src/a.ts', './src/a.ts', 'src/b.ts'], '/work/project');
    expect([...keys.keys()]).toEqual(['src/b.ts']);
    expect(excluded).toEqual([
      { path: '../../../outside.ts', reason: 'outside-project' },
      ...(path.sep === '/' ? [{ path: 'C:\\repo\\src\\win.ts', reason: 'windows-path' }] : []),
      { path: 'src/a.ts', reason: 'duplicate-spelling', file: path.resolve('/work/project/src/a.ts') },
      { path: './src/a.ts', reason: 'duplicate-spelling', file: path.resolve('/work/project/src/a.ts') },
    ]);
  });

  it('keeps an absolute path under the realpath of a symlinked root', () => {
    fs.mkdirSync(at('real/src'), { recursive: true });
    fs.symlinkSync(at('real'), at('link'));
    const { keys } = classifyProjectCoveragePaths([at('real/src/a.ts')], at('link'));
    expect([...keys.values()]).toEqual([at('real/src/a.ts')]);
  });
});

describe('#1219 — shared resolver', () => {
  it.runIf(path.sep === '/')('measures only project files and flags a doubly listed file as unmeasured', async () => {
    issueFixture();

    const existing = await resolveExistingCoverage(root);

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    const { files, evidence } = existing.evaluation;
    expect(files.map(f => f.path)).toEqual(['src/b.ts']);
    expect(evidence.status).toBe('insufficient-evidence');
    expect(evidence.conflictingFiles).toEqual([at('src/a.ts')]);
    expect(evidence.targetFiles).toBe(2);
    expect(evidence.excludedEntries?.map(e => [e.path, e.reason])).toEqual([
      ['../../../outside.ts', 'outside-project'],
      ['C:\\repo\\src\\win.ts', 'windows-path'],
      ['src/a.ts', 'duplicate-spelling'],
      ['./src/a.ts', 'duplicate-spelling'],
    ]);
    expect(describeEvidence(evidence, root)).toEqual([
      expect.stringContaining('1 source file is listed in the coverage report under two spellings'),
    ]);
    expect(describeExcludedEntries(evidence)).toEqual([
      '2 coverage report entries are not a project file and are left out of the figures: ' +
        '../../../outside.ts (outside the project root), C:\\repo\\src\\win.ts (a Windows path, which cannot name a file here).',
    ]);
  });

  it('is complete when the only extra entry is outside the project', async () => {
    write('src/b.ts', 'export const b = 1;\n');
    write('coverage/lcov.info', record('../../../outside.ts', 40, 40) + record('src/b.ts', 100, 50), NEWER);

    const existing = await resolveExistingCoverage(root);

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.files.map(f => f.path)).toEqual(['src/b.ts']);
    expect(existing.evaluation.evidence.status).toBe('complete');
    expect(describeExcludedEntries(existing.evaluation.evidence)).toHaveLength(1);
  });

  it('has no figure when every entry is outside the project', async () => {
    write('coverage/lcov.info', record('../../../outside.ts', 40, 40), NEWER);

    const existing = await resolveExistingCoverage(root);

    if (existing.status !== 'evaluated') throw new Error('not evaluated');
    expect(existing.evaluation).toEqual({ status: 'no-data', reason: 'target-not-covered' });
  });
});

describe('#1219 — MCP coverage_analyze_sublinear (analyze-coverage handler)', () => {
  it.runIf(path.sep === '/')('reports b.ts alone, names the left-out entries and does not meet the threshold', async () => {
    issueFixture();

    const data = await analyzeViaHandler(root);

    expect(data.lineCoverage).toBe(50);
    expect(data.totalFiles).toBe(1);
    expect((data.coverageByFile as Array<{ file: string }>).map(f => f.file)).toEqual(['src/b.ts']);
    expect(data.evidenceStatus).toBe('insufficient-evidence');
    expect(data.conflictingFiles).toEqual([at('src/a.ts')]);
    expect((data.excludedReportEntries as unknown[]).length).toBe(4);
    expect(data.meetsThreshold).toBe(false);
    expect(data.warning).toContain('under two spellings');
    expect(data.warning).toContain('../../../outside.ts (outside the project root)');
  });
});

describe('#1219 — CLI aqe coverage', () => {
  it.runIf(path.sep === '/')('summarises project files only and says which entries it left out', async () => {
    issueFixture();

    const outcome = await evaluateCliCoverage(fakeAnalyzer(), root, 80, () => {});

    if (outcome.kind !== 'measured') throw new Error(`not measured: ${outcome.kind}`);
    expect(outcome.summary.line).toBe(50);
    expect(outcome.summary.files).toBe(1);
    const json = coverageJson(outcome, 80, root);
    expect(json.evidenceStatus).toBe('insufficient-evidence');
    expect(json.conflictingFiles).toEqual([at('src/a.ts')]);
    expect(json.warning).toContain('INSUFFICIENT EVIDENCE');
    expect(json.warning).toContain('are not a project file and are left out of the figures');
  });
});
