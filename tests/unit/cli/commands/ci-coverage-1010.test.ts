/**
 * Issue #1010 — the `aqe ci` coverage phase uses the SAME resolution and
 * verdict as `aqe coverage` and MCP: measured / unmeasured / labelled
 * estimate. It gates only on measured values, reads lcov.info, treats a target
 * the report does not cover as UNMEASURED (not 0%), and leaves uncollected
 * metrics out of the threshold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';
import type { CIConfig, CIRunResult } from '../../../../src/cli/utils/ci-config.js';
import { getDefaultCIConfig } from '../../../../src/cli/utils/ci-config.js';
import { createCICommand } from '../../../../src/cli/commands/ci.js';

vi.mock('../../../../src/cli/utils/ci-config.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  findCIConfigFile: () => null,
  getDefaultCIConfig: vi.fn(),
}));

function istanbulEntry(file: string, total: number, covered: number): Record<string, unknown> {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    statementMap[String(i)] = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 5 } };
    s[String(i)] = i < covered ? 1 : 0;
  }
  // No branch data in this report.
  return { path: file, statementMap, s, branchMap: {}, b: {},
    fnMap: { 0: { name: 'f', loc: { start: { line: 1 } } } }, f: { 0: 1 } };
}

describe('#1010 — aqe ci coverage phase uses the shared measured/unmeasured/estimate verdict', () => {
  let root: string;
  let out: string;
  let analyze: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'aqe-1010-')));
    out = path.join(root, '.aqe-ci-output');
    writeFileSync(path.join(root, 'package.json'), '{"name":"ci-1010"}');
    mkdirSync(path.join(root, 'src'));
    mkdirSync(path.join(root, 'lib'));
    writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n'.repeat(10));
    writeFileSync(path.join(root, 'lib', 'b.ts'), 'export const b = 1;\n'.repeat(10));
    analyze = vi.fn(async (req: { coverageData: { summary: Record<string, number> } }) => ({
      success: true,
      value: { summary: req.coverageData.summary, meetsThreshold: false, recommendations: [] },
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function report(entries: Record<string, unknown>): void {
    mkdirSync(path.join(root, 'coverage'), { recursive: true });
    writeFileSync(path.join(root, 'coverage', 'coverage-final.json'), JSON.stringify(entries));
  }

  async function runPhase(target: string, threshold = 80) {
    const config: CIConfig = {
      version: '1', name: 'fixture',
      phases: [{ name: 'Coverage', type: 'coverage', enabled: true, config: { target, threshold }, continueOnFailure: false, timeout: 60 }],
      output: { directory: out, format: 'json', combinedReport: true },
      qualityGate: { enforced: false, thresholds: {} },
    };
    vi.mocked(getDefaultCIConfig).mockImplementation(() => config);
    const context = {
      kernel: { memory: { get: async () => undefined }, getDomainAPIAsync: async () => ({ analyze, detectGaps: vi.fn() }) },
    } as unknown as CLIContext;
    const cleanup = vi.fn(async (_code: number) => undefined);
    const command = createCICommand(context, cleanup as unknown as (code: number) => Promise<never>, async () => true);
    const output = path.join(root, 'result.json');
    await command.parseAsync(['run', '--format', 'json', '--output', output], { from: 'user' });
    const result = JSON.parse(readFileSync(output, 'utf8')) as CIRunResult;
    return { phase: result.phases[0], result, exitCode: cleanup.mock.calls[0][0] };
  }

  it('a target the report does not cover is UNMEASURED — never "Line: 0%"', async () => {
    const a = path.join(root, 'src', 'a.ts');
    report({ [a]: istanbulEntry(a, 10, 9) });
    const { phase } = await runPhase(path.join(root, 'lib'));

    expect(phase.summary).toMatch(/UNMEASURED/);
    expect(phase.summary).not.toMatch(/(Line|Branch): 0%/);
    expect(phase.status).not.toBe('passed');
    expect(phase.exitCode).toBe(3);
    expect(phase.details).toMatchObject({ measured: false, unmeasured: true, reason: 'target-not-covered', line: null });
    // Nothing is analyzed, so nothing can be persisted as a fake 0%.
    expect(analyze).not.toHaveBeenCalled();
  });

  it('reads lcov.info like aqe coverage does (measured, not a heuristic)', async () => {
    mkdirSync(path.join(root, 'coverage'));
    const da = Array.from({ length: 10 }, (_, i) => `DA:${i + 1},${i < 5 ? 1 : 0}`).join('\n');
    writeFileSync(path.join(root, 'coverage', 'lcov.info'), `TN:\nSF:src/a.ts\n${da}\nLF:10\nLH:5\nend_of_record\n`);
    const { phase } = await runPhase(path.join(root, 'src'));

    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ measured: true }));
    expect(phase.details).toMatchObject({ measured: true, line: 50, branch: null, meetsThreshold: false });
    expect(phase.summary).toMatch(/Line: 50(\.0)?%/);
    expect(phase.status).toBe('warning');
  });

  it('leaves an uncollected metric out of the threshold (Branch n/a, not "Branch: 0%")', async () => {
    const a = path.join(root, 'src', 'a.ts');
    report({ [a]: istanbulEntry(a, 10, 9) });
    const { phase } = await runPhase(path.join(root, 'src'));

    expect(phase.status).toBe('passed');
    expect(phase.summary).toMatch(/Branch: n\/a/);
    expect(phase.summary).not.toMatch(/Branch: 0%/);
    expect(phase.details).toMatchObject({ measured: true, line: 90, branch: null, meetsThreshold: true });
  });

  it('labels a no-report heuristic as an ESTIMATE and never passes the gate on it', async () => {
    const { phase } = await runPhase(path.join(root, 'src'), 1);

    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ measured: false }));
    expect(phase.summary).toMatch(/ESTIMATE/);
    expect(phase.status).toBe('warning');
    expect(phase.exitCode).toBe(3);
    expect(phase.details).toMatchObject({ measured: false, estimated: true, coverageMethod: 'static-estimation', meetsThreshold: null });
  });

  it('a missing target fails the phase', async () => {
    const { phase } = await runPhase(path.join(root, 'nope'));
    expect(phase.status).toBe('failed');
    expect(phase.summary).toMatch(/does not exist/);
  });
});
