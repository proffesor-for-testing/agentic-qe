import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUALITY_THRESHOLDS,
  QUALITY_EVIDENCE_NAMESPACE,
  evaluateQualityEvidence,
  loadQualityEvidence,
  writeQualityEvidence,
  type QualityEvidenceValues,
} from '../../../../src/domains/quality-assessment/quality-evidence.js';

function createMemory() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn(async (key: string, options?: { namespace?: string }) =>
      values.get(`${options?.namespace ?? 'default'}:${key}`)),
    set: vi.fn(async (key: string, value: unknown, options?: { namespace?: string }) => {
      values.set(`${options?.namespace ?? 'default'}:${key}`, value);
    }),
  };
}

const passingValues: QualityEvidenceValues = {
  coverage: 90,
  testsPassing: 100,
  criticalBugs: 0,
  codeSmells: 10,
  securityVulnerabilities: 0,
  technicalDebt: 2,
  duplications: 3,
};

describe('quality evidence contract', () => {
  it('should round-trip timestamped evidence through the canonical namespace', async () => {
    const memory = createMemory();
    const measuredAt = '2026-08-03T08:00:00.000Z';

    await writeQualityEvidence(memory as never, passingValues, {
      measuredAt,
      source: 'quality-analyzer',
    });
    const loaded = await loadQualityEvidence(memory as never, {
      now: Date.parse(measuredAt) + 1_000,
    });

    expect(loaded).toEqual(passingValues);
    expect(memory.set).toHaveBeenCalledWith(
      'quality-evidence:criticalBugs:latest',
      expect.objectContaining({ measuredAt, source: 'quality-analyzer' }),
      expect.objectContaining({ namespace: QUALITY_EVIDENCE_NAMESPACE, persist: true }),
    );
  });

  it('should fail closed when configured evidence is missing', async () => {
    await expect(loadQualityEvidence(createMemory() as never)).rejects.toThrow(
      /no measured quality evidence/i,
    );
  });

  it('should fail closed when evidence is malformed', async () => {
    const memory = createMemory();
    memory.values.set(`${QUALITY_EVIDENCE_NAMESPACE}:quality-evidence:coverage:latest`, {
      schemaVersion: 1,
      metric: 'coverage',
      value: Number.NaN,
      measuredAt: new Date().toISOString(),
      source: 'coverage-analysis',
    });

    await expect(loadQualityEvidence(memory as never)).rejects.toThrow(/malformed/i);
  });

  it('should fail closed when evidence is stale', async () => {
    const memory = createMemory();
    await writeQualityEvidence(memory as never, passingValues, {
      measuredAt: '2026-08-01T00:00:00.000Z',
      source: 'quality-analyzer',
    });

    await expect(loadQualityEvidence(memory as never, {
      now: Date.parse('2026-08-03T00:00:00.000Z'),
      maxAgeMs: 60_000,
    })).rejects.toThrow(/stale/i);
  });

  it('should evaluate every metric against the shared thresholds', () => {
    const result = evaluateQualityEvidence({ ...passingValues, technicalDebt: 6 });

    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(7);
    expect(result.checks.find((check) => check.name === 'technicalDebt')).toEqual(
      expect.objectContaining({
        passed: false,
        threshold: DEFAULT_QUALITY_THRESHOLDS.technicalDebt.value,
      }),
    );
  });
});
