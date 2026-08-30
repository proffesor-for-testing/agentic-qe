import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigration } from '../../../src/migrations/20260830_add_learning_evidence_tables.js';
import {
  admitLearningEvidence,
  createLearningEvidenceManifest,
} from '../../../src/learning/learning-evidence-admission.js';
import { persistLearningEvidence } from '../../../src/learning/evidence-admission-store.js';

describe('learning evidence persistence', () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec("CREATE TABLE qe_patterns (id TEXT PRIMARY KEY, qe_domain TEXT, domain TEXT); INSERT INTO qe_patterns VALUES ('p1','test-generation','learning-optimization')");
    applyMigration(db);
  });
  afterEach(() => db.close());

  it('atomically persists admitted evidence and strict segment lineage', () => {
    const manifest = createLearningEvidenceManifest({
      trajectoryId: 'run-1', taskFamily: 'defect-fix', revision: 'abc', environment: 'node-22',
      outcome: 'verified-success', oracleRefs: ['test:regression'], sourceKind: 'executed',
      processSignals: { observedBeforeActing: true, verificationAfterActing: true, toolSuccessRate: 1,
        repeatedNoProgressActions: 0, scopeDrift: false, leakageOrShortcut: false,
        weakenedOracle: false, unsafeSideEffect: false },
      segments: [
        { id: 'observe', parentIds: [], kind: 'observe', contribution: 'supporting',
          evidenceRefs: ['source:1'], admitForLearning: true, reasons: [] },
        { id: 'verify', parentIds: ['observe'], kind: 'verify', contribution: 'causal',
          evidenceRefs: ['test:1'], admitForLearning: true, reasons: [] },
      ],
    });
    const result = persistLearningEvidence(db, manifest, admitLearningEvidence(manifest), {
      patternId: 'p1', policyVersion: 'adr-131-v1', policyHash: 'policy-hash',
    });

    expect(result.disposition).toBe('admitted');
    expect((db.prepare('SELECT COUNT(*) count FROM learning_evidence_segments WHERE manifest_id=?').get('run-1') as { count: number }).count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) count FROM learning_segment_edges WHERE manifest_id=?').get('run-1') as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT COUNT(*) count FROM pattern_segment_lineage WHERE use_kind='promotion-support'").get() as { count: number }).count).toBe(2);
  });

  it('rolls back the whole write when parent lineage is invalid', () => {
    const manifest = createLearningEvidenceManifest({
      trajectoryId: 'bad-run', taskFamily: 'defect-fix', outcome: 'verified-success',
      revision: 'abc', environment: 'node-22', oracleRefs: ['test'], sourceKind: 'executed',
      processSignals: { observedBeforeActing: true, verificationAfterActing: true, toolSuccessRate: 1,
        repeatedNoProgressActions: 0, scopeDrift: false, leakageOrShortcut: false,
        weakenedOracle: false, unsafeSideEffect: false },
      segments: [{ id: 'verify', parentIds: ['missing'], kind: 'verify', contribution: 'causal',
        evidenceRefs: ['test'], admitForLearning: true, reasons: [] }],
    });
    expect(() => persistLearningEvidence(db, manifest, admitLearningEvidence(manifest)))
      .toThrow(/FOREIGN KEY/);
    expect((db.prepare("SELECT COUNT(*) count FROM learning_evidence_manifests WHERE id='bad-run'").get() as { count: number }).count).toBe(0);
  });
});

