/**
 * #1474 — the quality-gate worker judges the candidate of the checkout it runs
 * in, resolved from the real project root (no candidate mock here).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QualityGateWorker } from '../../../../src/workers/workers/quality-gate';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import {
  writeQualityEvidence,
  type QualityEvidenceValues,
} from '../../../../src/domains/quality-assessment/quality-evidence';
import { commitFixtureChange, createGitCandidateFixture } from '../../../fixtures/quality-evidence-candidates';
import { namespacedStore, contextFor } from './measured-worker-store';

const PASSING: QualityEvidenceValues = {
  coverage: 86.5, testsPassing: 100, criticalBugs: 0, codeSmells: 4,
  securityVulnerabilities: 0, technicalDebt: 1.5, duplications: 2,
};

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function measureHere(store: ReturnType<typeof namespacedStore>) {
  await writeQualityEvidence(store.memory as unknown as MemoryBackend, PASSING, {
    measuredAt: new Date().toISOString(), source: 'unit-test-measurement',
  });
}

describe('#1474 — quality-gate worker candidate identity', () => {
  it('valid candidate: evidence measured on this checkout yields a verdict recording candidate and receipts', async () => {
    const root = createGitCandidateFixture('aqe-worker-1474-');
    dirs.push(root);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    const store = namespacedStore();
    await measureHere(store);

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    const current = store.read('quality-gate:current') as Record<string, any>;
    expect(current).toMatchObject({ measured: true, schemaVersion: 2, passed: true, candidate: { status: 'resolved', dirty: false } });
    expect(Object.values(current.receipts).map((r: any) => r.key))
      .toEqual(expect.arrayContaining([expect.stringContaining(current.candidate.id)]));
    expect(result.metrics.domainMetrics).toMatchObject({ gateStatus: 'evaluated', gatePassed: 'YES' });
  });

  it('valid candidate that moved on: evidence from the previous commit is insufficient and nothing is stored', async () => {
    const root = createGitCandidateFixture('aqe-worker-1474-');
    dirs.push(root);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    const store = namespacedStore();
    await measureHere(store);
    commitFixtureChange(root, 'export const a = 2;\n');
    store.memory.set.mockClear();

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalled();
    const finding = result.findings.find((f) => f.type === 'quality-gate-insufficient-evidence')!;
    const problems = (finding.context as { problems: Array<{ code: string }> }).problems;
    expect(problems).toHaveLength(7);
    expect(problems.every((p) => p.code === 'mismatched')).toBe(true);
    expect(result.metrics.domainMetrics).toMatchObject({ gateStatus: 'insufficient-evidence', gatePassed: 'unmeasured' });
  });

  it('unavailable candidate (no Git work tree): insufficient evidence, nothing stored', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-worker-nongit-'));
    dirs.push(root);
    writeFileSync(join(root, 'package.json'), '{"name":"nongit"}');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    const store = namespacedStore();
    await measureHere(store);
    store.memory.set.mockClear();

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalled();
    const finding = result.findings.find((f) => f.type === 'quality-gate-insufficient-evidence')!;
    expect(finding.context).toMatchObject({ candidate: { status: 'unavailable' } });
    const problems = (finding.context as { problems: Array<{ code: string }> }).problems;
    expect(problems.every((p) => p.code === 'candidate-unavailable')).toBe(true);
  });
});
