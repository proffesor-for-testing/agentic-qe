import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';
import type { CIConfig, CIPhase, CIRunResult } from '../../../../src/cli/utils/ci-config.js';
import { getDefaultCIConfig } from '../../../../src/cli/utils/ci-config.js';
import { createCICommand } from '../../../../src/cli/commands/ci.js';

// Test execution/aggregation independently of YAML parsing. The integration
// suite also runs the real command defaults and registered MCP gate together.
vi.mock('../../../../src/cli/utils/ci-config.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  findCIConfigFile: () => null,
  getDefaultCIConfig: vi.fn(),
}));

const passing = {
  coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 10,
  securityVulnerabilities: 0, technicalDebt: 2, duplications: 3,
};

describe('CI gate execution and reporting', () => {
  let directory: string;
  let config: CIConfig;
  let reads: number;
  let failFirstGate: boolean;

  function phase(name: string, overrides: Partial<CIPhase> = {}): CIPhase {
    return {
      name, type: 'quality-gate', enabled: true, config: {},
      continueOnFailure: false, timeout: 60, ...overrides,
    };
  }

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'aqe-ci-command-'));
    reads = 0;
    failFirstGate = false;
    config = {
      version: '1', name: 'fixture', phases: [phase('Gate')],
      output: { directory, format: 'json', combinedReport: true },
      qualityGate: { enforced: true, thresholds: {} },
    };
    vi.mocked(getDefaultCIConfig).mockImplementation(() => config);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function run(args: string[] = []) {
    const context = {
      kernel: {
        memory: {
          get: async (key: string) => {
            const metric = key.split(':')[1] as keyof typeof passing;
            const failing = failFirstGate && reads++ < 7 && metric === 'coverage';
            return {
              schemaVersion: 1, metric, value: failing ? 0 : passing[metric],
              source: 'fixture', measuredAt: new Date().toISOString(),
            };
          },
        },
        getDomainAPIAsync: async () => undefined,
      },
    } as unknown as CLIContext;
    const cleanup = vi.fn(async (_code: number) => undefined);
    const command = createCICommand(context, cleanup as unknown as (code: number) => Promise<never>, async () => true);
    const output = path.join(directory, 'result.json');
    await command.parseAsync(['run', '--format', 'json', '--output', output, ...args], { from: 'user' });
    return {
      report: JSON.parse(readFileSync(output, 'utf8')) as CIRunResult,
      artifact: JSON.parse(readFileSync(path.join(directory, 'quality-gate.json'), 'utf8')),
      exitCode: cleanup.mock.calls[0][0],
    };
  }

  it('does not count disabled gates as executed or passed', async () => {
    config.phases[0].enabled = false;
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.report).toMatchObject({ qualityGatePassed: false, qualityGateStatus: 'not-run' });
    expect(result.artifact).toMatchObject({ passed: false, evidenceStatus: 'not-run' });
  });

  it('keeps each gate artifact and fails the aggregate when a later gate passes', async () => {
    failFirstGate = true;
    config.phases = [phase('First', { continueOnFailure: true }), phase('Second')];
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.report.phases.map(item => item.status)).toEqual(['failed', 'passed']);
    expect(result.report.qualityGatePassed).toBe(false);
    expect(result.artifact).toMatchObject({ passed: false, status: 'failed' });
    const paths = result.report.phases.map(item => item.artifacts[0]);
    expect(new Set(paths).size).toBe(2);
    expect(JSON.parse(readFileSync(paths[0], 'utf8')).passed).toBe(false);
    expect(JSON.parse(readFileSync(paths[1], 'utf8')).passed).toBe(true);
  });

  it('continues after an advisory gate failure while preserving its failed result', async () => {
    failFirstGate = true;
    config.phases.push(phase('After gate', { type: 'custom' }));
    const result = await run(['--no-quality-gate']);
    expect(result.exitCode).toBe(0);
    expect(result.report.phases.map(item => item.phase)).toEqual(['Gate', 'After gate']);
    expect(result.report).toMatchObject({
      qualityGatePassed: false, qualityGateStatus: 'failed', qualityGateEnforced: false, overallStatus: 'warning',
    });
    expect(result.artifact.passed).toBe(false);
  });

  it('does not suppress a non-gate failure when gate enforcement is disabled', async () => {
    config.phases.push(phase('Coverage', { type: 'coverage' }));
    const result = await run(['--no-quality-gate']);
    expect(result.exitCode).toBe(1);
    expect(result.report).toMatchObject({ overallStatus: 'failed', qualityGatePassed: true });
  });

  it('invalidates a prior approval when another phase stops execution before the gate', async () => {
    expect((await run()).artifact.passed).toBe(true);
    config.phases.unshift(phase('Coverage', { type: 'coverage' }));
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.report.phases).toHaveLength(1);
    expect(result.report.qualityGateStatus).toBe('not-run');
    expect(result.artifact).toMatchObject({ passed: false, evidenceStatus: 'not-run' });
  });

  it('requires every selected gate to execute, even if an earlier one passed', async () => {
    config.phases.push(phase('Coverage', { type: 'coverage' }), phase('Second gate'));
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.report).toMatchObject({ qualityGatePassed: false, qualityGateStatus: 'not-run' });
    expect(result.artifact.passed).toBe(false);
  });
});
