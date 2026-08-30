import { describe, expect, it } from 'vitest';
import {
  admitLearningEvidence,
  countIndependentAdmissions,
  createLearningEvidenceManifest,
} from '../../../src/learning/learning-evidence-admission.js';

function validInput(id = 'trajectory-1') {
  return {
    trajectoryId: id,
    taskFamily: 'typescript-defect-fix',
    revision: 'abc123',
    environment: 'node-22',
    outcome: 'verified-success' as const,
    oracleRefs: ['test:regression'],
    sourceKind: 'executed' as const,
    processSignals: {
      observedBeforeActing: true,
      verificationAfterActing: true,
      toolSuccessRate: 1,
      repeatedNoProgressActions: 0,
      scopeDrift: false,
      leakageOrShortcut: false,
      weakenedOracle: false,
      unsafeSideEffect: false,
    },
    segments: [
      { id: 'causal', parentIds: [], kind: 'act' as const, contribution: 'causal' as const,
        evidenceRefs: ['diff:1'], admitForLearning: true, reasons: [] },
      { id: 'noise', parentIds: [], kind: 'other' as const, contribution: 'irrelevant' as const,
        evidenceRefs: [], admitForLearning: false, reasons: ['no contribution'] },
    ],
  };
}

describe('learning evidence admission', () => {
  it('hashes and freezes manifests before evaluating them', () => {
    const manifest = createLearningEvidenceManifest(validInput());
    expect(manifest.trajectoryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.segments[0])).toBe(true);
  });

  it('admits only contributing segments from a verified trajectory', () => {
    expect(admitLearningEvidence(createLearningEvidenceManifest(validInput()))).toEqual({
      disposition: 'admit', autoPromotable: true,
      admittedSegmentIds: ['causal'], rejectedSegmentIds: ['noise'], reasons: [],
    });
  });

  it('rejects a successful trajectory with a weakened oracle', () => {
    const input = validInput();
    input.processSignals.weakenedOracle = true;
    expect(admitLearningEvidence(createLearningEvidenceManifest(input))).toMatchObject({
      disposition: 'reject', autoPromotable: false, reasons: ['oracle:weakened'],
    });
  });

  it('rejects unsafe success and inferred or unverifiable evidence', () => {
    const unsafe = validInput();
    unsafe.processSignals.unsafeSideEffect = true;
    expect(admitLearningEvidence(createLearningEvidenceManifest(unsafe)).autoPromotable).toBe(false);

    const inferred = { ...validInput(), sourceKind: 'inferred' as const, oracleRefs: [] };
    expect(admitLearningEvidence(createLearningEvidenceManifest(inferred))).toMatchObject({
      disposition: 'human-review', autoPromotable: false,
    });
  });

  it('does not count replayed copies as independent evidence', () => {
    const original = createLearningEvidenceManifest(validInput('run-1'));
    const replay = createLearningEvidenceManifest(validInput('run-2'));
    const distinct = createLearningEvidenceManifest({
      ...validInput('run-3'), revision: 'def456',
    });
    expect(countIndependentAdmissions([original, replay, distinct])).toBe(2);
  });

  it('rejects a manifest modified after hashing', () => {
    const manifest = createLearningEvidenceManifest(validInput());
    const forged = { ...manifest, outcome: 'verified-failure' as const };
    expect(admitLearningEvidence(forged)).toMatchObject({
      disposition: 'reject', autoPromotable: false,
    });
    expect(admitLearningEvidence(forged).reasons).toContain('integrity:trajectory-hash-mismatch');
  });

  it('requires evidence references and clean process signals for automatic admission', () => {
    const input = validInput();
    input.processSignals.scopeDrift = true;
    input.segments[0].evidenceRefs = [];
    const result = admitLearningEvidence(createLearningEvidenceManifest(input));
    expect(result.disposition).toBe('human-review');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'process:scope-drift', 'segments:admitted-without-evidence',
    ]));
  });
});
