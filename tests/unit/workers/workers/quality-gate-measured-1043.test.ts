/**
 * Issue #1043 — the quality-gate worker evaluates the real gate on measured
 * evidence only.
 *
 * It used to evaluate nine rules with hardcoded current values (line 78.5,
 * branch 65.2, pass rate 98.2, 1 critical vuln, complexity 12, …) and store
 * the verdict as `quality-gate:current` / `quality-gate:history` every five
 * minutes. It now runs the canonical measured gate
 * (`inspectQualityEvidence` → `evaluateQualityEvidence`, the same validation
 * and thresholds as the quality_assess tool). Missing, stale or malformed
 * evidence → insufficient evidence: nothing written, an info finding naming
 * the unmeasured metrics. A status without the measured stamp (written by
 * <= 3.15.6) is ignored and replaced.
 */
import { describe, it, expect } from 'vitest';
import { QualityGateWorker } from '../../../../src/workers/workers/quality-gate';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import {
  writeQualityEvidence,
  type QualityEvidenceValues,
} from '../../../../src/domains/quality-assessment/quality-evidence';
import { namespacedStore, contextFor, type NamespacedStore } from './measured-worker-store';

const PASSING: QualityEvidenceValues = {
  coverage: 86.5,
  testsPassing: 100,
  criticalBugs: 0,
  codeSmells: 4,
  securityVulnerabilities: 0,
  technicalDebt: 1.5,
  duplications: 2,
};

async function measure(store: NamespacedStore, values: Partial<QualityEvidenceValues>, measuredAt?: string) {
  await writeQualityEvidence(store.memory as unknown as MemoryBackend, values, {
    measuredAt: measuredAt ?? new Date().toISOString(),
    source: 'unit-test-measurement',
  });
}

/** The status <= 3.15.6 stored: invented, unstamped. */
const LEGACY_INVENTED_STATUS = {
  passed: false, passedRules: 7, failedRules: 2, blockers: 2, warnings: 0, releaseReady: false,
  rules: [
    { id: 'coverage-line', name: 'Line Coverage', category: 'coverage', threshold: 80, operator: 'gte', currentValue: 78.5, unit: '%', blocking: true },
    { id: 'security-critical-vulns', name: 'Critical Vulnerabilities', category: 'security', threshold: 0, operator: 'eq', currentValue: 1, unit: 'issues', blocking: true },
  ],
};

const INVENTED = /78\.5|65\.2|98\.2|Average Complexity|Flaky Test Count|Avg Test Duration/;
const gateFindings = (findings: Array<{ type: string }>) =>
  findings.filter((f) => /^quality-gate-(failure|regression|improvement)$|^release-/.test(f.type));

describe('#1043 — quality-gate worker evaluates measured evidence only', () => {
  it('nothing measured: writes nothing, no verdict, reports insufficient evidence', async () => {
    const store = namespacedStore();
    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(result.success).toBe(true);
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(gateFindings(result.findings)).toEqual([]);
    const finding = result.findings.find((f) => f.type === 'quality-gate-insufficient-evidence');
    expect(finding).toMatchObject({ severity: 'info' });
    expect((finding!.context as { unmeasured: string[] }).unmeasured).toEqual(expect.arrayContaining([
      'coverage', 'testsPassing', 'criticalBugs', 'securityVulnerabilities',
    ]));
    expect(result.metrics.domainMetrics).toMatchObject({ gateStatus: 'insufficient-evidence', gatePassed: 'unmeasured' });
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
  });

  it('partial evidence: still no verdict and nothing written; measured values are reported as such', async () => {
    const store = namespacedStore();
    await measure(store, { coverage: 72.25, testsPassing: 100 });
    store.memory.set.mockClear();

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalled();
    expect(gateFindings(result.findings)).toEqual([]);
    const finding = result.findings.find((f) => f.type === 'quality-gate-insufficient-evidence')!;
    expect((finding.context as { unmeasured: string[] }).unmeasured).not.toContain('coverage');
    expect(result.metrics.domainMetrics).toMatchObject({
      gateStatus: 'insufficient-evidence', coverage: 72.25, testsPassing: 100, codeSmells: 'unmeasured',
    });
  });

  it('full measured evidence that passes: a stamped status with the real checks', async () => {
    const store = namespacedStore();
    await measure(store, PASSING);

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    const current = store.read('quality-gate:current') as Record<string, any>;
    expect(current).toMatchObject({ measured: true, schemaVersion: 1, passed: true });
    expect(current.checks).toHaveLength(7);
    expect(current.checks).toContainEqual(expect.objectContaining({ name: 'coverage', value: 86.5, threshold: 80, passed: true }));
    expect(store.read('quality-gate:history')).toEqual([expect.objectContaining({ measured: true, passed: true })]);
    expect(gateFindings(result.findings)).toEqual([]);
    expect(result.metrics.domainMetrics).toMatchObject({ gateStatus: 'evaluated', gatePassed: 'YES', failedChecks: 0 });
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
  });

  it('full measured evidence that fails: findings carry the measured values and thresholds', async () => {
    const store = namespacedStore();
    await measure(store, { ...PASSING, coverage: 61, securityVulnerabilities: 2 });

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(store.read('quality-gate:current')).toMatchObject({ measured: true, passed: false });
    expect(result.findings).toContainEqual(expect.objectContaining({
      type: 'quality-gate-failure', context: expect.objectContaining({ metric: 'coverage', value: 61, threshold: 80 }),
    }));
    expect(result.findings).toContainEqual(expect.objectContaining({
      type: 'quality-gate-failure', severity: 'critical',
      context: expect.objectContaining({ metric: 'securityVulnerabilities', value: 2, threshold: 0 }),
    }));
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'release-blocked' }));
    expect(result.metrics.domainMetrics).toMatchObject({ gatePassed: 'NO', failedChecks: 2 });
  });

  it('stale evidence (older than the gate accepts) is not evidence', async () => {
    const store = namespacedStore();
    await measure(store, PASSING, new Date(Date.now() - 2 * 86_400_000).toISOString());
    store.memory.set.mockClear();

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalled();
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'quality-gate-insufficient-evidence' }));
  });

  it('a legacy unstamped status is ignored (no regression vs invented values) and replaced', async () => {
    const store = namespacedStore();
    await store.memory.set('quality-gate:current', LEGACY_INVENTED_STATUS);
    store.memory.set.mockClear();

    const unmeasured = await new QualityGateWorker().execute(contextFor(store.memory));
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(store.read('quality-gate:current')).toEqual(LEGACY_INVENTED_STATUS);
    expect(JSON.stringify(unmeasured)).not.toMatch(INVENTED);

    await measure(store, PASSING);
    const measured = await new QualityGateWorker().execute(contextFor(store.memory));
    // The invented "failing" status must not yield an "improvement" finding.
    expect(gateFindings(measured.findings)).toEqual([]);
    expect(store.read('quality-gate:current')).toMatchObject({ measured: true, passed: true });
  });

  it('a measured pass followed by a measured failure is a regression', async () => {
    const store = namespacedStore();
    await measure(store, PASSING);
    await new QualityGateWorker().execute(contextFor(store.memory));
    await measure(store, { ...PASSING, testsPassing: 80 });

    const result = await new QualityGateWorker().execute(contextFor(store.memory));

    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'quality-gate-regression' }));
    expect(store.read('quality-gate:history')).toHaveLength(2);
  });
});
