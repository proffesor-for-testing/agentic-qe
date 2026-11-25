/**
 * #1453: `aqe prove` attests only measured evidence.
 *
 * Every flag is read from the candidate-bound receipts the measured gate
 * reads, and qualityGatePassed is the verdict `aqe quality --gate` reaches for
 * the same checkout and the same evidence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildAttestation,
  collectAttestationEvidence,
  collectMetrics,
  collectUnboundFiles,
  createProveCommand,
  formatMarkdown,
  handleProve,
} from '../../../../src/cli/commands/prove.js';
import {
  describeUnavailableQualityEvidence,
  evaluateMeasuredQualityEvidence,
  getMeasuredQualityExitCode,
} from '../../../../src/cli/commands/quality.js';
import {
  loadQualityEvidenceSet,
  writeQualityEvidence,
  writeTestRunEvidence,
  type QualityEvidenceValues,
} from '../../../../src/domains/quality-assessment/quality-evidence.js';
import type { QualityEvidenceCandidate } from '../../../../src/domains/quality-assessment/evidence-candidate.js';
import { createGitCandidateFixture, fixtureCandidate } from '../../../fixtures/quality-evidence-candidates.js';

/** A Map-backed evidence store with the get/set the evidence module uses. */
function mapMemory() {
  const store = new Map<string, unknown>();
  const k = (key: string, ns?: string) => `${ns ?? ''}\0${key}`;
  return {
    get: async <T>(key: string, opts?: { namespace?: string }) => store.get(k(key, opts?.namespace)) as T | undefined,
    set: async (key: string, value: unknown, opts?: { namespace?: string }) => { store.set(k(key, opts?.namespace), value); },
  };
}

const PASSING: QualityEvidenceValues = {
  coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 10,
  securityVulnerabilities: 0, technicalDebt: 2, duplications: 3,
};

const candidate = fixtureCandidate('prove-1453');

async function record(memory: ReturnType<typeof mapMemory>, values: Partial<QualityEvidenceValues>,
  at: QualityEvidenceCandidate = candidate, measuredAt = new Date().toISOString()) {
  await writeQualityEvidence(memory as never, values, { measuredAt, source: 'test-fixture', candidate: at });
}

/** The verdict `aqe quality --gate` reaches: the same calls its action makes. */
async function gateExitCode(memory: ReturnType<typeof mapMemory>): Promise<number> {
  try {
    return getMeasuredQualityExitCode(evaluateMeasuredQualityEvidence(
      await loadQualityEvidenceSet(memory as never, { candidate })));
  } catch (error) {
    return getMeasuredQualityExitCode(await describeUnavailableQualityEvidence(memory as never, error));
  }
}

async function attest(memory: ReturnType<typeof mapMemory>, root = '/nonexistent-1453') {
  const evidence = await collectAttestationEvidence(memory as never, { candidate });
  return buildAttestation(root, await collectMetrics(root, evidence), evidence, await collectUnboundFiles(root));
}

describe('#1453 aqe prove attests measured evidence only', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prove-1453-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('reports no flag as true for a project where nothing ran (issue repro 1)', async () => {
    const att = await attest(mapMemory());

    expect(att.attestation).toEqual({
      testsExecuted: false, coverageChecked: false, securityScanned: false, qualityGatePassed: false,
    });
    expect(att.evidence.securityScanned).toMatchObject({ status: 'unmeasured', code: 'missing' });
    expect(att.evidence.qualityGate).toMatchObject({ status: 'unmeasured', exitCode: 3 });
    expect(att.metrics.vulnerabilities).toBeNull();
  });

  it('does not pass the gate from on-disk reports while the measured gate exits 3 (issue repro 2)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'junit.xml'), '<testsuites tests="10" failures="0"></testsuites>');
    fs.mkdirSync(path.join(tmpDir, 'coverage'));
    fs.writeFileSync(path.join(tmpDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 80 } } }));
    const memory = mapMemory();

    const att = await attest(memory, tmpDir);

    expect(await gateExitCode(memory)).toBe(3);
    expect(att.attestation).toEqual({
      testsExecuted: false, coverageChecked: false, securityScanned: false, qualityGatePassed: false,
    });
    // The files are reported as unbound and feed neither the metrics nor the score.
    expect(att.unboundFiles).toEqual({ junit: { testCount: 10, passRate: 100 }, coverageSummary: { linesPct: 80 } });
    expect(att.metrics).toMatchObject({ testCount: null, passRate: null, coveragePercent: null, qualityScore: null });
  });

  it('marks every flag unmeasured when no evidence store is available', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const att = await handleProve({ projectRoot: tmpDir });

    expect(Object.values(att.attestation)).toEqual([false, false, false, false]);
    expect(att.evidence.testsExecuted).toMatchObject({ status: 'unmeasured', code: 'evidence-store-unavailable' });
    expect(att.evidence.qualityGate).toMatchObject({ status: 'unmeasured', exitCode: 3 });
  });

  it('attests a measured test run with coverage, but not the gate while other metrics are unmeasured', async () => {
    const memory = mapMemory();
    await writeTestRunEvidence(memory as never, { runId: 'run-1', passed: 12, failed: 0 },
      { source: 'aqe test execute', coverage: 91, candidate });

    const att = await attest(memory);

    expect(att.attestation.testsExecuted).toBe(true);
    expect(att.attestation.coverageChecked).toBe(true);
    expect(att.evidence.testsExecuted).toMatchObject({ status: 'measured', value: 100, runId: 'run-1' });
    expect(att.evidence.coverageChecked).toMatchObject({ status: 'measured', value: 91, runId: 'run-1' });
    expect(att.attestation.securityScanned).toBe(false);
    expect(att.attestation.qualityGatePassed).toBe(false);
    expect(att.evidence.qualityGate.status).toBe('unmeasured');
    expect(att.evidence.qualityGate.unmeasured).toEqual(
      ['criticalBugs', 'codeSmells', 'securityVulnerabilities', 'technicalDebt', 'duplications']);
    expect(await gateExitCode(memory)).toBe(3);
  });

  it('attests a recorded security scan and reports its vulnerability count', async () => {
    const memory = mapMemory();
    await record(memory, { securityVulnerabilities: 3 });

    const att = await attest(memory);

    expect(att.attestation.securityScanned).toBe(true);
    expect(att.evidence.securityScanned).toMatchObject({ status: 'measured', value: 3, source: 'test-fixture' });
    expect(att.metrics.vulnerabilities).toBe(3);
    // Measured is not passed: the flag row says MEASURED, only the gate row says PASSED/FAILED.
    const md = formatMarkdown(att);
    expect(md).toContain('| Security Scanned | MEASURED (securityVulnerabilities = 3) |');
    expect(md).not.toContain('PASS |');
  });

  it('takes every metric from the same receipts as the flags, so the document cannot contradict itself', async () => {
    const memory = mapMemory();
    await record(memory, PASSING);
    fs.writeFileSync(path.join(tmpDir, 'junit.xml'), '<testsuites tests="4" failures="3"></testsuites>');

    const att = await attest(memory, tmpDir);

    expect(att.metrics).toMatchObject({
      testCount: null, passRate: 100, coveragePercent: 90, vulnerabilities: 0,
      qualityScore: Math.round(100 * 0.4 + 90 * 0.3 + 100 * 0.3),
    });
    expect(att.unboundFiles.junit).toEqual({ testCount: 4, passRate: 25 });
    expect(att.attestation.qualityGatePassed).toBe(true);
  });

  it('gives no quality score while any of its inputs is unmeasured', async () => {
    const memory = mapMemory();
    await writeTestRunEvidence(memory as never, { runId: 'run-2', passed: 3, failed: 0 },
      { source: 'aqe test execute', coverage: 70, candidate });

    const att = await attest(memory);

    expect(att.metrics).toMatchObject({ passRate: 100, coveragePercent: 70, vulnerabilities: null, qualityScore: null });
  });

  it('qualityGatePassed is true exactly when the measured gate passes the same evidence', async () => {
    const cases: Array<[string, Partial<QualityEvidenceValues>, boolean, number]> = [
      ['all measured and passing', PASSING, true, 0],
      ['passing with low coverage headroom', { ...PASSING, coverage: 82 }, true, 2],
      ['coverage below threshold', { ...PASSING, coverage: 50 }, false, 1],
      ['a vulnerability found', { ...PASSING, securityVulnerabilities: 1 }, false, 1],
      ['one metric unmeasured', { ...PASSING, duplications: undefined }, false, 3],
    ];
    for (const [label, values, passes, exitCode] of cases) {
      const memory = mapMemory();
      const measured = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
      await record(memory, measured);

      const att = await attest(memory);

      expect(await gateExitCode(memory), label).toBe(exitCode);
      expect(att.evidence.qualityGate.exitCode, label).toBe(exitCode);
      expect(att.attestation.qualityGatePassed, label).toBe(passes);
    }
  });

  it('names the failed checks when the measured gate fails', async () => {
    const memory = mapMemory();
    await record(memory, { ...PASSING, coverage: 50 });

    const att = await attest(memory);

    expect(att.evidence.qualityGate).toEqual({ status: 'failed', exitCode: 1, failedChecks: ['coverage'] });
  });

  it('does not attest evidence recorded for a different checkout', async () => {
    const memory = mapMemory();
    await record(memory, PASSING, fixtureCandidate('another-checkout'));

    const att = await attest(memory);

    expect(Object.values(att.attestation)).toEqual([false, false, false, false]);
    expect(att.evidence.testsExecuted.code).toBe('mismatched');
    expect(att.evidence.qualityGate.status).toBe('unmeasured');
  });

  it('does not attest stale evidence', async () => {
    const memory = mapMemory();
    await record(memory, PASSING, candidate, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());

    const att = await attest(memory);

    expect(att.attestation.testsExecuted).toBe(false);
    expect(att.evidence.testsExecuted.code).toBe('stale');
    expect(att.attestation.qualityGatePassed).toBe(false);
  });

  it('does not attest coverage from a failing run without that run\'s test result', async () => {
    const memory = mapMemory();
    await writeQualityEvidence(memory as never, { coverage: 95 },
      { measuredAt: new Date().toISOString(), source: 'coverage-analysis', runStatus: 'failed', candidate });

    const att = await attest(memory);

    expect(att.attestation.coverageChecked).toBe(false);
    expect(att.evidence.coverageChecked.code).toBe('unpaired-failed-run');
  });

  it('shows unmeasured checks and an unevaluated gate in Markdown', async () => {
    const md = formatMarkdown(await attest(mapMemory()));

    expect(md).toContain('| Security Scanned | UNMEASURED (missing: No measured quality evidence found for securityVulnerabilities.) |');
    expect(md).toContain('| Quality Gate | NOT EVALUATED (insufficient evidence) |');
    expect(md).toContain('| Vulnerabilities | unmeasured |');
    expect(md).toContain('| Quality Score | unmeasured |');
  });

  it('changes the hash when only the evidence changes', async () => {
    const empty = await collectAttestationEvidence(mapMemory() as never, { candidate });
    const memory = mapMemory();
    await record(memory, PASSING);
    const measured = await collectAttestationEvidence(memory as never, { candidate });
    const metrics = await collectMetrics(tmpDir);
    // Pin the clock so the timestamp is identical across the builds.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T00:00:00.000Z'));
    try {
      const a = buildAttestation(tmpDir, metrics, empty);
      const b = buildAttestation(tmpDir, metrics, measured);

      expect(a.timestamp).toBe(b.timestamp);
      expect(buildAttestation(tmpDir, metrics, empty).hash).toBe(a.hash);
      expect(b.hash).not.toBe(a.hash);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('#1453 createProveCommand reads the evidence store the gate reads', () => {
  beforeEach(() => {
    const root = createGitCandidateFixture('aqe-prove-1453-');
    // An initialized project: prove reads its evidence store, never creates one.
    fs.mkdirSync(path.join(root, '.agentic-qe'));
    fs.writeFileSync(path.join(root, '.agentic-qe', 'memory.db'), '');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('attests from context.kernel.memory for the resolved checkout', async () => {
    const { resolveQualityEvidenceCandidate } = await import(
      '../../../../src/domains/quality-assessment/evidence-candidate.js');
    const memory = mapMemory();
    await writeQualityEvidence(memory as never, PASSING,
      { measuredAt: new Date().toISOString(), source: 'test-fixture', candidate: resolveQualityEvidenceCandidate() });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
    const exit = vi.fn(async () => undefined as never);

    const cmd = createProveCommand({ kernel: { memory } } as never, exit, async () => true);
    await cmd.parseAsync(['node', 'prove']);

    const att = JSON.parse(logs.join('\n'));
    expect(exit).toHaveBeenCalledWith(0);
    expect(att.attestation).toEqual({
      testsExecuted: true, coverageChecked: true, securityScanned: true, qualityGatePassed: true,
    });
    expect(att.evidence.candidate.status).toBe('resolved');
  });

  it('writing the attestation into the checkout does not change the candidate it attests', async () => {
    const { resolveQualityEvidenceCandidate } = await import(
      '../../../../src/domains/quality-assessment/evidence-candidate.js');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = resolveQualityEvidenceCandidate();

    await handleProve({ memory: mapMemory() as never, output: path.join(process.env.AQE_PROJECT_ROOT!, 'proof.json') });

    expect(before.status).toBe('resolved');
    expect(resolveQualityEvidenceCandidate().id).toBe(before.id);
  });

  it.each([
    ['no .agentic-qe at all', false],
    ['only the empty .agentic-qe directory CLI startup leaves', true],
  ])('refuses, without creating a store, in a project where AQE is not initialized (%s)', async (_label, emptyDir) => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prove-1453-bare-'));
    if (emptyDir) fs.mkdirSync(path.join(bare, '.agentic-qe'));
    vi.stubEnv('AQE_PROJECT_ROOT', bare);
    const { clearProjectRootCache } = await import('../../../../src/kernel/project-root.js');
    clearProjectRootCache();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const init = vi.fn(async () => true);
    const exit = vi.fn(async () => undefined as never);
    try {
      await createProveCommand({} as never, exit, init).parseAsync(['node', 'prove']);

      expect(exit).toHaveBeenCalledWith(1);
      expect(init).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(error.mock.calls.join(' ')).toMatch(/not initialized/);
      expect(fs.existsSync(path.join(bare, '.agentic-qe'))).toBe(emptyDir);
      expect(fs.existsSync(path.join(bare, '.agentic-qe', 'memory.db'))).toBe(false);
    } finally {
      clearProjectRootCache();
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it('produces no attestation when the evidence store cannot be opened', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.fn(async () => undefined as never);

    const cmd = createProveCommand({} as never, exit, async () => false);
    await cmd.parseAsync(['node', 'prove']);

    expect(log).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
