/**
 * #1186: a coverage report that exists but was refused unread (linked out of
 * the project, a FIFO) was reported as "no coverage report", the same as a
 * missing one, and a refused report given as the target was described as
 * unparseable. Every surface now names the report and why it was refused:
 * the shared resolution, the MCP `analyze-coverage` handler, `aqe coverage`
 * and `aqe fleet analyze`. Uses real symlinks and FIFOs in a temp project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describeNoData, resolveExistingCoverage } from '../../../../src/coordination/handlers/coverage-target';
import { registerCoverageHandlers } from '../../../../src/coordination/handlers/coverage-handlers';
import type { InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';
import { evaluateCliCoverage, type CoverageAnalyzeAPI } from '../../../../src/cli/utils/coverage-verdict';
import { planFleetOperation } from '../../../../src/cli/utils/fleet-operation';
import { DEFAULT_MAX_CONFINED_READ_BYTES } from '../../../../src/shared/io/confined-read';

const fifoSupported = process.platform !== 'win32';

function fakeAnalyzer(): CoverageAnalyzeAPI & { findGaps: () => Promise<unknown> } {
  return {
    analyze: vi.fn(async (req: { coverageData: { summary: Record<string, number> } }) => ({
      success: true,
      value: { summary: req.coverageData.summary, meetsThreshold: false, recommendations: [] },
    })),
    findGaps: async () => ({ success: true, value: { gaps: [] } }),
  };
}

async function mcpAnalyze(target: string): Promise<Record<string, unknown>> {
  let handler!: InstanceTaskHandler;
  registerCoverageHandlers({
    registerHandler: (_type: string, fn: InstanceTaskHandler) => { handler = fn; },
    getCoverageAnalyzer: () => fakeAnalyzer(),
  } as never);
  const result = await handler({ payload: { target, detectGaps: false } } as never) as
    { success: boolean; value?: Record<string, unknown>; error?: Error };
  if (!result.success) throw result.error;
  return result.value!;
}

describe('refused vs missing coverage report (#1186)', () => {
  let base: string;
  let root: string;
  let report: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1186-cov-')));
    root = path.join(base, 'proj');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fx"}');
    fs.writeFileSync(path.join(root, 'src', 'a.js'), 'function add(a, b) {\n  return a + b;\n}\n');
    const lcov = `TN:\nSF:${path.join(root, 'src', 'a.js')}\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n`;
    fs.writeFileSync(path.join(base, 'outside', 'lcov.info'), lcov);
    report = path.join(root, 'coverage', 'lcov.info');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    // The MCP handler must not run the fixture's test suite.
    vi.stubEnv('AQE_COVERAGE_NO_EXEC', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(base, { recursive: true, force: true });
  });

  const linkReportOut = (): void => fs.symlinkSync(path.join(base, 'outside', 'lcov.info'), report);

  describe('shared resolution', () => {
    it('a missing report is no-report with nothing refused', async () => {
      const existing = await resolveExistingCoverage(root);
      expect(existing).toMatchObject({ status: 'no-report', refused: [] });
    });

    it('a report linked out of the project is no-report naming the refusal', async () => {
      linkReportOut();
      const existing = await resolveExistingCoverage(root);
      expect(existing).toMatchObject({
        status: 'no-report',
        refused: [{ path: report, reason: 'outside-project-root' }],
      });
    });

    it.runIf(fifoSupported)('a FIFO report is refused as not-a-file, without hanging', async () => {
      execFileSync('mkfifo', [path.join(root, 'coverage', 'coverage-final.json')]);
      const existing = await resolveExistingCoverage(root);
      expect(existing).toMatchObject({
        status: 'no-report',
        refused: [{ path: path.join(root, 'coverage', 'coverage-final.json'), reason: 'not-a-file' }],
      });
    });

    it('a refused report given as the target is refused-report, not unreadable-report', async () => {
      linkReportOut();
      const existing = await resolveExistingCoverage(report);
      expect(existing).toMatchObject({
        status: 'evaluated',
        evaluation: { status: 'no-data', reason: 'refused-report', refused: [{ path: report, reason: 'outside-project-root' }] },
      });
      if (existing.status !== 'evaluated' || existing.evaluation.status !== 'no-data') throw new Error('unreachable');
      const message = describeNoData('refused-report', report, root, existing.evaluation.refused);
      expect(message).toContain(`Coverage report refused and not read: ${report} (outside-project-root`);
      expect(message).not.toMatch(/could not be parsed/);
    });

    it('a readable report is still used when an earlier location was refused', async () => {
      execFileSync('mkfifo', [path.join(root, 'coverage', 'coverage-final.json')]);
      fs.copyFileSync(path.join(base, 'outside', 'lcov.info'), report);
      const existing = await resolveExistingCoverage(root);
      expect(existing).toMatchObject({ status: 'evaluated', evaluation: { status: 'measured' } });
    });
  });

  describe('MCP analyze-coverage', () => {
    it('names the refused report in the warning of the labelled estimate', async () => {
      linkReportOut();
      const value = await mcpAnalyze(root);
      expect(value.estimated).toBe(true);
      expect(value.warning).toContain(`Coverage report refused and not read: ${report} (outside-project-root`);
    });

    it('a report target linked out is refused by the payload guard, with its reason', async () => {
      linkReportOut();
      await expect(mcpAnalyze(report)).rejects.toThrow(/lcov\.info \(outside-project-root\)/);
    });

    it('a report target the guard accepts but the reader refuses says why, not "could not be parsed"', async () => {
      // Sparse, so nothing is written: over the reader's 128 MB default limit.
      fs.writeFileSync(report, '');
      fs.truncateSync(report, DEFAULT_MAX_CONFINED_READ_BYTES + 1);
      const value = await mcpAnalyze(report);
      expect(value.measured).toBe(false);
      expect(value.warning).toContain(`Coverage report refused and not read: ${report} (too-large`);
      expect(value.warning).not.toMatch(/could not be parsed/);
    });

    it('a missing report says nothing about a refusal', async () => {
      const value = await mcpAnalyze(root);
      expect(String(value.warning)).not.toContain('refused');
    });
  });

  describe('CLI', () => {
    it('aqe coverage: the estimate says the report was refused, not that none exists', async () => {
      linkReportOut();
      const outcome = await evaluateCliCoverage(fakeAnalyzer(), root, 80, () => undefined);
      expect(outcome).toMatchObject({ kind: 'estimate', refused: [{ path: report, reason: 'outside-project-root' }] });
      if (outcome.kind !== 'estimate') throw new Error('unreachable');
      expect(outcome.message).toContain(`Coverage report refused and not read: ${report}`);
      expect(outcome.message).not.toContain('no coverage report exists');
    });

    it('aqe coverage: without a report the estimate message is unchanged', async () => {
      const outcome = await evaluateCliCoverage(fakeAnalyzer(), root, 80, () => undefined);
      if (outcome.kind !== 'estimate') throw new Error(`expected estimate, got ${outcome.kind}`);
      expect(outcome.message).toContain('no coverage report exists');
    });

    it('aqe coverage <refused report>: an error naming the refusal', async () => {
      linkReportOut();
      const outcome = await evaluateCliCoverage(fakeAnalyzer(), report, 80, () => undefined);
      expect(outcome).toMatchObject({ kind: 'error', reason: 'refused-report' });
      if (outcome.kind !== 'error') throw new Error('unreachable');
      expect(outcome.message).toContain('(outside-project-root');
    });

    it('aqe fleet analyze: the refusal names the report instead of "No coverage report"', async () => {
      linkReportOut();
      const plan = await planFleetOperation('analyze', root, root);
      expect(plan.success).toBe(false);
      const message = plan.success ? '' : plan.error;
      expect(message).toContain(`Coverage report refused and not read: ${report} (outside-project-root`);
      expect(message).not.toContain('No coverage report for project');
    });
  });
});
