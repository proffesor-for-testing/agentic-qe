/**
 * #1020: the coordinator's report, dashboard, risk, readiness, debt and
 * simplified-gate helpers read MEASURED evidence only. A metric without
 * evidence is -1 and listed in `unmeasured`; it never becomes a passing
 * default (formerly coverage 80, testsPassing 95, 0 bugs, 0 vulnerabilities).
 */
import { describe, expect, it } from 'vitest';
import * as Reports from '../../../../src/domains/quality-assessment/coordinator-reports';
import { QualityGateService } from '../../../../src/domains/quality-assessment/services/quality-gate';
import {
  QUALITY_METRICS,
  writeQualityEvidence,
  type QualityEvidenceValues,
} from '../../../../src/domains/quality-assessment/quality-evidence';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

function memoryStub(): MemoryBackend {
  const store = new Map<string, unknown>();
  const key = (k: string, opts?: { namespace?: string }) => `${opts?.namespace ?? ''}:${k}`;
  return {
    initialize: async () => {},
    dispose: async () => {},
    set: async (k: string, value: unknown, opts?: { namespace?: string }) => { store.set(key(k, opts), value); },
    get: async (k: string, opts?: { namespace?: string }) => store.get(key(k, opts)),
    delete: async (k: string) => store.delete(k),
    has: async (k: string) => store.has(k),
    search: async () => [],
    vectorSearch: async () => [],
    storeVector: async () => {},
  } as unknown as MemoryBackend;
}

const HEALTHY: QualityEvidenceValues = {
  coverage: 90,
  testsPassing: 100,
  criticalBugs: 0,
  codeSmells: 4,
  securityVulnerabilities: 0,
  technicalDebt: 3,
  duplications: 2,
};

async function measured(values: Partial<QualityEvidenceValues>): Promise<MemoryBackend> {
  const memory = memoryStub();
  await writeQualityEvidence(memory, values, { measuredAt: new Date().toISOString(), source: 'test' });
  return memory;
}

describe('coordinator report helpers without evidence (#1020)', () => {
  it('reports every metric as -1 and unmeasured instead of passing defaults', async () => {
    const { metrics, unmeasured } = await Reports.getMeasuredMetrics(memoryStub());

    expect(Object.values(metrics).every((v) => v === -1)).toBe(true);
    expect(unmeasured).toEqual([...QUALITY_METRICS]);
  });

  it('gives the dashboard no score', async () => {
    const result = await Reports.getQualityDashboard(memoryStub());

    expect(result.success && result.value).toMatchObject({
      overallScore: -1,
      evidenceStatus: 'insufficient-evidence',
      unmeasured: [...QUALITY_METRICS],
    });
  });

  it('never declares a production deployment ready', async () => {
    const result = await Reports.assessDeploymentReadiness(memoryStub(), { environment: 'production', changeSet: [] });

    expect(result.success && result.value).toMatchObject({
      ready: false,
      score: -1,
      evidenceStatus: 'insufficient-evidence',
      unmeasured: ['coverage', 'testsPassing', 'securityVulnerabilities', 'criticalBugs'],
    });
  });

  it('does not call the risk level low', async () => {
    const result = await Reports.analyzeRisks(memoryStub(), { scope: 'project', includeSecurityRisks: true });

    expect(result.success && result.value).toMatchObject({ risks: [], overallRiskLevel: 'insufficient-evidence' });
  });

  it('reports no technical debt figure and no invented file paths', async () => {
    const result = await Reports.analyzeTechnicalDebt(memoryStub(), { projectPath: '/proj', includeCodeSmells: true });

    expect(result.success && result.value).toMatchObject({
      totalDebt: -1,
      debtRatio: -1,
      items: [],
      evidenceStatus: 'insufficient-evidence',
    });
  });

  it('writes a report that names the missing metrics', async () => {
    const result = await Reports.generateReport(memoryStub(), { format: 'json', includeRecommendations: true });
    const report = JSON.parse(result.success ? result.value.content : '{}');

    expect(report.evidenceStatus).toBe('insufficient-evidence');
    expect(report.metrics.coverage).toBe(-1);
    expect(report.recommendations).not.toContain('Increase test coverage to at least 80%');
    expect(report.recommendations.some((r: string) => r.startsWith('Insufficient evidence: coverage'))).toBe(true);
  });
});

describe('coordinator report helpers with measured evidence (#1020)', () => {
  it('scores and approves a fully measured healthy project', async () => {
    const memory = await measured(HEALTHY);

    const dashboard = await Reports.getQualityDashboard(memory);
    const readiness = await Reports.assessDeploymentReadiness(memory, { environment: 'production', changeSet: [] });

    expect(dashboard.success && dashboard.value).toMatchObject({ overallScore: 96, evidenceStatus: 'measured', unmeasured: [] });
    expect(readiness.success && readiness.value).toMatchObject({ ready: true, score: 96, evidenceStatus: 'measured' });
  });

  it('keeps a measured critical risk conclusive while other inputs are missing', async () => {
    const memory = await measured({ coverage: 30 });

    const result = await Reports.analyzeRisks(memory, { scope: 'project', includeSecurityRisks: true });

    expect(result.success && result.value).toMatchObject({
      overallRiskLevel: 'critical',
      unmeasured: ['technicalDebt', 'securityVulnerabilities'],
    });
  });

  it('describes measured debt items against the project, not invented files', async () => {
    const memory = await measured({ technicalDebt: 12, duplications: 4, codeSmells: 6 });

    const result = await Reports.analyzeTechnicalDebt(memory, { projectPath: '/proj', includeCodeSmells: true });

    expect(result.success && result.value).toMatchObject({ totalDebt: 12, debtRatio: 0.12, evidenceStatus: 'measured' });
    expect(result.success && result.value.items.map((i) => i.file)).toEqual(['/proj', '/proj']);
  });
});

describe('buildFullGateRequest (#1020)', () => {
  it('marks every metric the caller did not supply as unmeasured', () => {
    const request = Reports.buildFullGateRequest({ gateId: 'g', metrics: { coverage: 85 } });

    expect(request.metrics).toEqual({
      coverage: 85, testsPassing: -1, criticalBugs: -1, codeSmells: -1,
      securityVulnerabilities: -1, technicalDebt: -1, duplications: -1,
    });
  });

  it('cannot pass a gate evaluated with no metrics', async () => {
    const gate = new QualityGateService(memoryStub());

    const result = await gate.evaluateGate(Reports.buildFullGateRequest({ gateId: 'empty', metrics: {} }));

    expect(result.success && result.value).toMatchObject({
      passed: false,
      overallScore: -1,
      failedChecks: [],
      evidenceStatus: 'insufficient-evidence',
      unmeasured: ['coverage', 'testsPassing', 'criticalBugs', 'codeSmells', 'securityVulnerabilities'],
    });
  });
});
