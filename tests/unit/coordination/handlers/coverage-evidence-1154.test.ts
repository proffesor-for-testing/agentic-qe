/**
 * Issue #1154: a coverage report that covers only part of the target, or that
 * is older than the sources, must not produce a passing verdict.
 *
 * Fixture from the issue: the report covers `src/math.js` only and
 * `src/unsafe.js` has no measurement. Before the fix:
 *   - `aqe fleet run analyze --target src` printed "100% over 1 files" and
 *     "Verdict: PASSED";
 *   - `aqe coverage src` printed "Threshold: Met".
 * Every surface reads the shared resolver (`resolveExistingCoverage` /
 * `evaluateCoverageForTarget`), so each one is checked here: the resolver, the
 * MCP / task_orchestrate `analyze-coverage` handler, the CLI verdict, and the
 * fleet plan and verdict.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveExistingCoverage } from '../../../../src/coordination/handlers/coverage-target';
import { describeEvidence } from '../../../../src/coordination/handlers/coverage-evidence';
import { createTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import {
  EXIT_UNMEASURED,
  coverageExitCode,
  coverageJson,
  evaluateCliCoverage,
  type CoverageAnalyzeAPI,
} from '../../../../src/cli/utils/coverage-verdict';
import { planFleetOperation } from '../../../../src/cli/utils/fleet-operation';
import { reportFleetVerdict } from '../../../../src/cli/utils/fleet-result';

// Side-effect import: registers the coverage-analysis domain service factory.
import '../../../../src/domains/coverage-analysis';

const MATH_JS = 'export function add(a, b) {\n  return a + b;\n}\n';
const UNSAFE_JS = 'export function run(code) {\n  return eval(code);\n}\n';
const LCOV_MATH = 'TN:\nSF:src/math.js\nFN:1,add\nFNDA:1,add\nFNF:1\nFNH:1\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n';
const LCOV_BOTH = LCOV_MATH +
  'TN:\nSF:src/unsafe.js\nFN:1,run\nFNDA:1,run\nFNF:1\nFNH:1\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n';

const OLD = new Date('2020-01-01T00:00:00Z');
const NEWER = new Date('2021-01-01T00:00:00Z');
const NEWEST = new Date('2022-01-01T00:00:00Z');

let root: string;
const at = (rel: string) => path.join(root, rel);

function write(rel: string, content: string, mtime: Date = OLD): void {
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), content);
  fs.utimesSync(at(rel), mtime, mtime);
}

/** The issue's fixture: the report (newer than the sources) covers math.js only. */
function partialFixture(): void {
  write('src/math.js', MATH_JS, OLD);
  write('src/unsafe.js', UNSAFE_JS, OLD);
  write('coverage/lcov.info', LCOV_MATH, NEWER);
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
    id: `task-1154-${Date.now()}`, type: 'analyze-coverage', priority: 'p1', targetDomains: [],
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
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1154-')));
  fs.mkdirSync(at('.git'));
  fs.writeFileSync(at('package.json'), '{"name":"fx1154","version":"1.0.0"}');
  savedAqeRoot = process.env.AQE_PROJECT_ROOT;
  savedNoExec = process.env.AQE_COVERAGE_NO_EXEC;
  process.env.AQE_PROJECT_ROOT = root;
  // Every case reads a report on disk; nothing may run the fixture's tests.
  process.env.AQE_COVERAGE_NO_EXEC = '1';
});

afterEach(() => {
  if (savedAqeRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
  else process.env.AQE_PROJECT_ROOT = savedAqeRoot;
  if (savedNoExec === undefined) delete process.env.AQE_COVERAGE_NO_EXEC;
  else process.env.AQE_COVERAGE_NO_EXEC = savedNoExec;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('#1154 — shared resolver: completeness and staleness', () => {
  it('counts a target file missing from the report as unmeasured', async () => {
    partialFixture();

    const existing = await resolveExistingCoverage(at('src'));

    expect(existing.status).toBe('evaluated');
    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.evidence).toEqual({
      status: 'insufficient-evidence', unmeasuredFiles: [at('src/unsafe.js')], targetFiles: 2,
    });
    expect(describeEvidence(existing.evaluation.evidence, root)[0])
      .toContain('1 of 2 source files under the target are not in the coverage report ' +
        '(UNMEASURED, not counted as covered): src/unsafe.js. Regenerate the report');
  });

  it('is complete when every target source file is in a current report', async () => {
    write('src/math.js', MATH_JS);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_BOTH, NEWER);

    const existing = await resolveExistingCoverage(at('src'));

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.evidence).toEqual({ status: 'complete', unmeasuredFiles: [], targetFiles: 2 });
  });

  it('flags a report older than a source file as stale', async () => {
    write('src/math.js', MATH_JS, NEWEST);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_BOTH, NEWER);

    const existing = await resolveExistingCoverage(at('src'));

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    const { evidence } = existing.evaluation;
    expect(evidence.status).toBe('insufficient-evidence');
    expect(evidence.unmeasuredFiles).toEqual([]);
    expect(evidence.stale).toEqual({
      reportPath: at('coverage/lcov.info'), reportModified: NEWER.toISOString(), newerFiles: [at('src/math.js')],
    });
    expect(describeEvidence(evidence, root)[0]).toContain('coverage/lcov.info is STALE: 1 source file was modified after it was written');
  });

  it('does not count tests, type declarations, tool config or other languages as unmeasured', async () => {
    write('src/math.js', MATH_JS);
    write('src/math.test.js', 'test("a", () => {});');
    write('src/types.d.ts', 'export type A = 1;');
    write('vitest.config.ts', 'export default {};');
    write('scripts/helper.py', 'print(1)');
    write('coverage/lcov.info', LCOV_MATH, NEWER);

    const existing = await resolveExistingCoverage(root);

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.evidence.status).toBe('complete');
  });

  it('lists files outside the report when the coverage config scope cannot be read, and says so', async () => {
    write('src/math.js', MATH_JS);
    write('src/generated.js', 'export const g = 1;');
    write('vitest.config.ts', "const excluded = ['src/generated.js'];\nexport default { test: { coverage: { exclude: excluded } } };");
    write('coverage/lcov.info', LCOV_MATH, NEWER);

    const existing = await resolveExistingCoverage(at('src'));

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.evidence.unmeasuredFiles).toEqual([at('src/generated.js')]);
    expect(existing.evaluation.evidence.coverageScope).toEqual({ source: 'vitest.config.ts', readable: false });
    expect(describeEvidence(existing.evaluation.evidence, root)[0])
      .toContain('The coverage include/exclude in vitest.config.ts could not be read statically');
  });

  it('does not look below the source walker depth limit (6 directories)', async () => {
    write('src/math.js', MATH_JS);
    write('src/a/b/c/d/e/f/g/deep.js', 'export const d = 1;');
    write('coverage/lcov.info', LCOV_MATH, NEWER);

    const existing = await resolveExistingCoverage(at('src'));

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.evidence.unmeasuredFiles).toEqual([]);
  });

  it('judges a report given as the target whole, but still checks it for staleness', async () => {
    write('src/math.js', MATH_JS, NEWEST);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_MATH, NEWER);

    const existing = await resolveExistingCoverage(at('coverage/lcov.info'));

    if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
    expect(existing.evaluation.evidence.unmeasuredFiles).toEqual([]);
    expect(existing.evaluation.evidence.stale?.newerFiles).toEqual([at('src/math.js')]);
  });
});

describe('#1154 — MCP coverage_analyze_sublinear / task_orchestrate handler', () => {
  it('does not meet the threshold and names the unmeasured file', async () => {
    partialFixture();

    const data = await analyzeViaHandler(at('src'));

    expect(data.lineCoverage).toBe(100);
    expect(data.meetsThreshold).toBe(false);
    expect(data.evidenceStatus).toBe('insufficient-evidence');
    expect(data.unmeasuredFiles).toEqual([at('src/unsafe.js')]);
    expect(data.warning).toContain('INSUFFICIENT EVIDENCE');
    expect(data.warning).toContain('src/unsafe.js');
  });

  it('reports a stale report', async () => {
    write('src/math.js', MATH_JS, NEWEST);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_BOTH, NEWER);

    const data = await analyzeViaHandler(at('src'));

    expect(data.meetsThreshold).toBe(false);
    expect((data.staleReport as { newerFiles: string[] }).newerFiles).toEqual([at('src/math.js')]);
  });

  it('still meets the threshold on complete, current evidence', async () => {
    write('src/math.js', MATH_JS);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_BOTH, NEWER);

    const data = await analyzeViaHandler(at('src'));

    expect(data.meetsThreshold).toBe(true);
    expect(data.evidenceStatus).toBe('complete');
  });
});

describe('#1154 — aqe coverage verdict', () => {
  it('is not "Met" while a target file is unmeasured, and exits UNMEASURED', async () => {
    partialFixture();

    const outcome = await evaluateCliCoverage(fakeAnalyzer(), at('src'), 80, () => undefined);

    expect(outcome.kind).toBe('measured');
    if (outcome.kind !== 'measured') return;
    expect(outcome.verdict.meetsThreshold).toBe(false);
    expect(outcome.insufficientEvidence).toHaveLength(1);
    expect(coverageExitCode(outcome, 80)).toBe(EXIT_UNMEASURED);
    expect(coverageJson(outcome, 80, at('src'))).toMatchObject({
      meetsThreshold: false, evidenceStatus: 'insufficient-evidence', unmeasuredFiles: [at('src/unsafe.js')],
    });
  });

  it('is "Met" on complete, current evidence', async () => {
    write('src/math.js', MATH_JS);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_BOTH, NEWER);

    const outcome = await evaluateCliCoverage(fakeAnalyzer(), at('src'), 80, () => undefined);

    if (outcome.kind !== 'measured') throw new Error('not measured');
    expect(outcome.verdict.meetsThreshold).toBe(true);
    expect(outcome.insufficientEvidence).toEqual([]);
    expect(coverageExitCode(outcome, 80)).toBe(0);
  });
});

describe('#1154 — aqe fleet run analyze verdict', () => {
  const passingResult = {
    success: true,
    result: { summary: { line: 100, branch: 0, function: 100, statement: 0, files: 1 },
      collected: { branch: false, function: true, statement: false } },
  };

  it('plans the analysis with the evidence and fails the verdict on it', async () => {
    partialFixture();

    const plan = await planFleetOperation('analyze', at('src'));

    expect(plan.success).toBe(true);
    if (!plan.success) return;
    expect(plan.task.insufficientEvidence).toEqual([expect.stringContaining('src/unsafe.js')]);
    const lines: string[] = [];
    expect(reportFleetVerdict('analyze', [passingResult], line => lines.push(line), plan.task.insufficientEvidence)).toBe(false);
    expect(lines.join('\n')).toContain('Verdict: FAILED (insufficient evidence');
    expect(lines.join('\n')).not.toContain('Verdict: PASSED');
  });

  it('passes on complete, current evidence', async () => {
    write('src/math.js', MATH_JS);
    write('src/unsafe.js', UNSAFE_JS);
    write('coverage/lcov.info', LCOV_BOTH, NEWER);

    const plan = await planFleetOperation('analyze', at('src'));

    if (!plan.success) throw new Error(plan.error);
    expect(plan.task.insufficientEvidence).toBeUndefined();
    expect(reportFleetVerdict('analyze', [passingResult], () => {}, plan.task.insufficientEvidence)).toBe(true);
  });
});
