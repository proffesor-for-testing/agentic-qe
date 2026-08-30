import { createHash } from 'node:crypto';

export type LearningContribution = 'causal' | 'supporting' | 'irrelevant' | 'harmful' | 'unknown';

export interface LearningSegment {
  readonly id: string;
  readonly parentIds: readonly string[];
  readonly kind: 'observe' | 'decide' | 'act' | 'verify' | 'recover' | 'other';
  readonly contribution: LearningContribution;
  readonly evidenceRefs: readonly string[];
  readonly admitForLearning: boolean;
  readonly reasons: readonly string[];
}

export interface LearningEvidenceManifest {
  readonly trajectoryId: string;
  readonly trajectoryHash: string;
  readonly taskFamily: string;
  readonly revision?: string;
  readonly environment?: string;
  readonly outcome: 'verified-success' | 'verified-failure' | 'unknown';
  readonly oracleRefs: readonly string[];
  readonly sourceKind: 'executed' | 'static' | 'human-reviewed' | 'inferred';
  readonly processSignals: Readonly<{
    observedBeforeActing: boolean;
    verificationAfterActing: boolean;
    toolSuccessRate: number;
    repeatedNoProgressActions: number;
    scopeDrift: boolean;
    leakageOrShortcut: boolean;
    weakenedOracle: boolean;
    unsafeSideEffect: boolean;
  }>;
  readonly segments: readonly LearningSegment[];
}

export interface LearningAdmissionResult {
  readonly disposition: 'admit' | 'reject' | 'human-review';
  readonly autoPromotable: boolean;
  readonly admittedSegmentIds: readonly string[];
  readonly rejectedSegmentIds: readonly string[];
  readonly reasons: readonly string[];
}

type ManifestInput = Omit<LearningEvidenceManifest, 'trajectoryHash'>;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function freezeManifest(manifest: LearningEvidenceManifest): LearningEvidenceManifest {
  Object.freeze(manifest.processSignals);
  manifest.segments.forEach(segment => {
    Object.freeze(segment.parentIds);
    Object.freeze(segment.evidenceRefs);
    Object.freeze(segment.reasons);
    Object.freeze(segment);
  });
  Object.freeze(manifest.oracleRefs);
  Object.freeze(manifest.segments);
  return Object.freeze(manifest);
}

export function createLearningEvidenceManifest(input: ManifestInput): LearningEvidenceManifest {
  const trajectoryHash = createHash('sha256').update(canonicalize(input)).digest('hex');
  return freezeManifest({ ...input, trajectoryHash });
}

function expectedTrajectoryHash(manifest: LearningEvidenceManifest): string {
  const { trajectoryHash: _claimedHash, ...input } = manifest;
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}

export function admitLearningEvidence(manifest: LearningEvidenceManifest): LearningAdmissionResult {
  const reasons: string[] = [];
  if (manifest.trajectoryHash !== expectedTrajectoryHash(manifest)) reasons.push('integrity:trajectory-hash-mismatch');
  if (manifest.outcome !== 'verified-success') reasons.push(`outcome:${manifest.outcome}`);
  if (manifest.sourceKind === 'inferred') reasons.push('source:inferred');
  if (manifest.oracleRefs.length === 0) reasons.push('oracle:missing');
  if (!manifest.processSignals.verificationAfterActing) reasons.push('verification:missing-after-action');
  if (!manifest.processSignals.observedBeforeActing) reasons.push('process:acted-before-observation');
  if (manifest.processSignals.toolSuccessRate < 0 || manifest.processSignals.toolSuccessRate > 1) {
    reasons.push('process:invalid-tool-success-rate');
  } else if (manifest.processSignals.toolSuccessRate < 1) {
    reasons.push('process:tool-failure');
  }
  if (manifest.processSignals.repeatedNoProgressActions > 0) reasons.push('process:repeated-no-progress');
  if (manifest.processSignals.scopeDrift) reasons.push('process:scope-drift');
  if (manifest.processSignals.weakenedOracle) reasons.push('oracle:weakened');
  if (manifest.processSignals.leakageOrShortcut) reasons.push('process:leakage-or-shortcut');
  if (manifest.processSignals.unsafeSideEffect) reasons.push('process:unsafe-side-effect');

  const admittedSegmentIds = manifest.segments
    .filter(segment => segment.admitForLearning &&
      (segment.contribution === 'causal' || segment.contribution === 'supporting'))
    .map(segment => segment.id);
  const rejectedSegmentIds = manifest.segments
    .filter(segment => !admittedSegmentIds.includes(segment.id))
    .map(segment => segment.id);
  if (admittedSegmentIds.length === 0) reasons.push('segments:no-admitted-contribution');
  if (manifest.segments.some(segment => admittedSegmentIds.includes(segment.id) && segment.evidenceRefs.length === 0)) {
    reasons.push('segments:admitted-without-evidence');
  }

  const hardReject = reasons.some(reason =>
    reason === 'oracle:weakened' || reason === 'process:leakage-or-shortcut' ||
    reason === 'process:unsafe-side-effect' || reason === 'integrity:trajectory-hash-mismatch' ||
    reason === 'process:invalid-tool-success-rate' || reason.startsWith('outcome:'),
  );
  const disposition = hardReject ? 'reject' : reasons.length > 0 ? 'human-review' : 'admit';
  return Object.freeze({
    disposition,
    autoPromotable: disposition === 'admit',
    admittedSegmentIds: Object.freeze(admittedSegmentIds),
    rejectedSegmentIds: Object.freeze(rejectedSegmentIds),
    reasons: Object.freeze(reasons),
  });
}

export function countIndependentAdmissions(
  manifests: readonly LearningEvidenceManifest[],
): number {
  const identities = new Set<string>();
  for (const manifest of manifests) {
    if (!admitLearningEvidence(manifest).autoPromotable) continue;
    const { trajectoryId: _runIdentity, trajectoryHash: _runHash, ...evidence } = manifest;
    identities.add(canonicalize(evidence));
  }
  return identities.size;
}
