import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';
import type { CIConfig } from '../../../../src/cli/utils/ci-config.js';
import { getDefaultCIConfig } from '../../../../src/cli/utils/ci-config.js';
import { createCICommand } from '../../../../src/cli/commands/ci.js';

// Exercise the registered command with programmatic configuration. A YAML
// parser defect cannot explain these threshold results.
vi.mock('../../../../src/cli/utils/ci-config.js', () => ({
  findCIConfigFile: () => null, parseCIConfigFile: vi.fn(), getDefaultCIConfig: vi.fn(),
}));

const fixtures: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function run(coverage: number, threshold?: number, criticalBugs = 0, args: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), 'aqe-ci-threshold-'));
  fixtures.push(directory);
  const config: CIConfig = {
    version: '1', name: 'threshold-fixture',
    phases: [{ name: 'Gate', type: 'quality-gate', enabled: true, config: {}, continueOnFailure: false, timeout: 60 }],
    output: { directory, format: 'json', combinedReport: true },
    qualityGate: { enforced: true, thresholds: { coverage: threshold } },
  };
  vi.mocked(getDefaultCIConfig).mockReturnValue(config);
  const values = { coverage, testsPassing: 100, criticalBugs, codeSmells: 0,
    securityVulnerabilities: 0, technicalDebt: 0, duplications: 0 };
  const get = vi.fn(async (key: string) => {
    const metric = key.split(':')[1] as keyof typeof values;
    return { schemaVersion: 1, metric, value: values[metric], source: 'measured-fixture', measuredAt: new Date().toISOString() };
  });
  const context = { kernel: { memory: { get } } } as unknown as CLIContext;
  const cleanup = vi.fn(async (_code: number) => undefined);
  const command = createCICommand(context, cleanup as unknown as (code: number) => Promise<never>, async () => true);
  const output = join(directory, 'result.json');
  await command.parseAsync(['run', '--format', 'json', '--output', output, ...args], { from: 'user' });
  return {
    report: JSON.parse(readFileSync(output, 'utf8')),
    artifact: JSON.parse(readFileSync(join(directory, 'quality-gate.json'), 'utf8')),
    exitCode: cleanup.mock.calls[0][0],
  };
}

describe('configured CI coverage threshold', () => {
  it.each([
    { coverage: 90, threshold: 95, expected: false },
    { coverage: 70, threshold: 50, expected: true },
    { coverage: 0, threshold: 0, expected: true },
    { coverage: 70, threshold: undefined, expected: false },
    { coverage: 90, threshold: undefined, expected: true },
  ])('evaluates measured $coverage against configured $threshold', async ({ coverage, threshold, expected }) => {
    const result = await run(coverage, threshold);
    expect(result.exitCode).toBe(expected ? 0 : 1);
    expect(result.report.qualityGatePassed).toBe(expected);
    expect(result.artifact.checks).toContainEqual(expect.objectContaining({
      name: 'coverage', threshold: threshold ?? 80, value: coverage, passed: expected,
    }));
  });

  it('preserves other measured checks when coverage is explicitly satisfied', async () => {
    const result = await run(100, 90, 1);
    expect(result.exitCode).toBe(1);
    expect(result.report.qualityGatePassed).toBe(false);
    expect(result.artifact.checks).toContainEqual(expect.objectContaining({ name: 'criticalBugs', threshold: 0, passed: false }));
  });

  it('keeps advisory gate failure visible without blocking the pipeline', async () => {
    const result = await run(90, 95, 0, ['--no-quality-gate']);
    expect(result.exitCode).toBe(0);
    expect(result.report).toMatchObject({ overallStatus: 'warning', qualityGatePassed: false });
    expect(result.artifact.checks).toContainEqual(expect.objectContaining({ name: 'coverage', threshold: 95, passed: false }));
  });

  it('does not mutate the shared default for subsequent gate invocations', async () => {
    expect((await run(70, 0)).report.qualityGatePassed).toBe(true);
    const defaultRun = await run(70);
    expect(defaultRun.report.qualityGatePassed).toBe(false);
    expect(defaultRun.artifact.checks).toContainEqual(expect.objectContaining({ name: 'coverage', threshold: 80, passed: false }));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 101, '90'])('fails closed for invalid programmatic threshold %s', async threshold => {
    const result = await run(100, threshold as number);
    expect(result.exitCode).toBe(1);
    expect(result.report.qualityGatePassed).toBe(false);
    expect(result.report.phases[0].summary).toMatch(/coverage.*threshold.*finite.*0.*100/i);
  });
});
