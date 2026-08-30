import { randomUUID } from 'node:crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { LearningAdmissionResult, LearningEvidenceManifest } from './learning-evidence-admission.js';

export interface PersistLearningEvidenceOptions {
  patternId?: string;
  policyVersion?: string;
  policyHash?: string;
  correlationGroup?: string;
}

export interface PersistedLearningEvidence {
  manifestId: string;
  admissionId: string;
  disposition: 'admitted' | 'rejected' | 'review-required';
}

function evidenceClass(source: LearningEvidenceManifest['sourceKind']): 'EXECUTED' | 'STATIC' | 'INFERRED' {
  if (source === 'executed') return 'EXECUTED';
  if (source === 'static' || source === 'human-reviewed') return 'STATIC';
  return 'INFERRED';
}

export function persistLearningEvidence(
  db: DatabaseType,
  manifest: LearningEvidenceManifest,
  admission: LearningAdmissionResult,
  options: PersistLearningEvidenceOptions = {},
): PersistedLearningEvidence {
  if (!/^[a-f0-9]{64}$/.test(manifest.trajectoryHash)) {
    throw new Error('trajectoryHash must be a lowercase SHA-256 digest');
  }
  const disposition = admission.disposition === 'admit'
    ? 'admitted'
    : admission.disposition === 'reject' ? 'rejected' : 'review-required';
  const admissionId = randomUUID();

  const persist = db.transaction(() => {
    db.prepare(`
      INSERT INTO learning_evidence_manifests (
        id, trajectory_id, trajectory_hash, manifest_hash, task_family,
        task_identity, run_identity, correlation_group, dedupe_fingerprint,
        revision, environment, outcome, oracle_refs_json, source_kind,
        process_signals_json, manifest_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      manifest.trajectoryId, manifest.trajectoryId, manifest.trajectoryHash,
      manifest.trajectoryHash, manifest.taskFamily, manifest.trajectoryId,
      manifest.trajectoryId, options.correlationGroup ?? null, manifest.trajectoryHash,
      manifest.revision ?? null, manifest.environment ?? null, manifest.outcome,
      JSON.stringify(manifest.oracleRefs), manifest.sourceKind,
      JSON.stringify(manifest.processSignals),
    );

    const insertSegment = db.prepare(`
      INSERT INTO learning_evidence_segments (
        id, manifest_id, segment_order, kind, contribution,
        evidence_refs_json, admit_for_learning, reasons_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    manifest.segments.forEach((segment, index) => insertSegment.run(
      segment.id, manifest.trajectoryId, index, segment.kind, segment.contribution,
      JSON.stringify(segment.evidenceRefs), segment.admitForLearning ? 1 : 0,
      JSON.stringify(segment.reasons),
    ));

    const insertEdge = db.prepare(`
      INSERT INTO learning_segment_edges (
        manifest_id, parent_segment_id, child_segment_id, edge_kind
      ) VALUES (?, ?, ?, 'depends-on')
    `);
    for (const segment of manifest.segments) {
      for (const parentId of segment.parentIds) {
        insertEdge.run(manifest.trajectoryId, parentId, segment.id);
      }
    }

    db.prepare(`
      INSERT INTO learning_evidence_admissions (
        id, manifest_id, decision_seq, disposition, reason_codes_json,
        assessor_kind, evidence_class, policy_version, policy_hash
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      admissionId, manifest.trajectoryId, disposition, JSON.stringify(admission.reasons),
      manifest.sourceKind, evidenceClass(manifest.sourceKind),
      options.policyVersion ?? null, options.policyHash ?? null,
    );

    if (options.patternId) {
      db.prepare(`
        INSERT INTO pattern_manifest_lineage (
          pattern_id, manifest_id, use_kind
        ) VALUES (?, ?, ?)
      `).run(
        options.patternId, manifest.trajectoryId,
        disposition === 'admitted' ? 'promotion-support' : 'rejection',
      );

      const insertSegmentLineage = db.prepare(`
        INSERT INTO pattern_segment_lineage (
          pattern_id, manifest_id, segment_id, use_kind
        ) VALUES (?, ?, ?, ?)
      `);
      for (const segmentId of admission.admittedSegmentIds) {
        insertSegmentLineage.run(
          options.patternId, manifest.trajectoryId, segmentId, 'promotion-support',
        );
      }
    }
  });

  persist();
  return { manifestId: manifest.trajectoryId, admissionId, disposition };
}

