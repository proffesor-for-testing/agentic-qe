/**
 * Failure-mode verification reach contracts (#651).
 *
 * Quality evidence is useful only within the boundary it actually observed.
 * This module keeps that boundary revision-bound and fail-closed: direct,
 * executed, fresh evidence with the required oracle can cover a risk; partial,
 * inferred, stale, unavailable, and wrong-target evidence remains visible but
 * cannot silently produce a passing coverage verdict.
 */

import { createHash } from 'node:crypto';

export type FailureModeSeverity = 'critical' | 'high' | 'medium' | 'low';
export type VerificationChannel =
  | 'static'
  | 'build'
  | 'runtime'
  | 'api'
  | 'browser'
  | 'telemetry'
  | 'hardware'
  | 'human';
export type VerificationReachLevel = 'direct' | 'partial' | 'none';
export type VerificationEvidenceClass = 'EXECUTED' | 'STATIC' | 'INFERRED' | 'UNKNOWN';
export type VerificationExecutionStatus = 'passed' | 'failed' | 'not-run' | 'unavailable';
export type UncoveredDisposition = 'fail' | 'inconclusive' | 'human-review';
export type VerificationCoverageVerdict = 'pass' | UncoveredDisposition;

export interface VerificationTarget {
  revision: string;
  digest: string;
  environment: string;
}

export interface VerificationCost {
  tokens?: number;
  durationMs?: number;
  monetary?: number;
}

export interface VerificationReach {
  checkId: string;
  channel: VerificationChannel;
  reach: VerificationReachLevel;
  evidenceClass: VerificationEvidenceClass;
  executionStatus: VerificationExecutionStatus;
  target: VerificationTarget;
  oracleRef?: string;
  observedAt?: string;
  limitations: string[];
  cost?: VerificationCost;
}

export interface FailureModeRequirement {
  riskId: string;
  failureMode: string;
  severity: FailureModeSeverity;
  requiredOracle: string;
  requiredObservations: VerificationChannel[];
  checks: VerificationReach[];
  dispositionWhenUncovered: UncoveredDisposition;
}

export interface VerificationReachManifest {
  id: string;
  systemUnderTest: string;
  artifact: VerificationTarget;
  risks: FailureModeRequirement[];
  generatedAt: string;
  expiresAt?: string;
  manifestHash: string;
}

export type VerificationReachManifestInput = Omit<VerificationReachManifest, 'manifestHash'>;

export interface FailureModeReachResult {
  riskId: string;
  failureMode: string;
  severity: FailureModeSeverity;
  verdict: VerificationCoverageVerdict;
  directCheckIds: string[];
  partialCheckIds: string[];
  failedCheckIds: string[];
  uncoveredObservations: VerificationChannel[];
  limitations: string[];
  reason: string;
}

export interface VerificationReachResult {
  manifestId: string;
  manifestHash: string;
  systemUnderTest: string;
  artifact: VerificationTarget;
  coverageVerdict: VerificationCoverageVerdict;
  risks: FailureModeReachResult[];
  evaluatedAt: string;
}

export interface VerificationReachEvaluationOptions {
  now?: Date;
}

/** Create a manifest whose hash binds its target, risks, checks, and lifetime. */
export function createVerificationReachManifest(
  input: VerificationReachManifestInput,
): VerificationReachManifest {
  validateManifestShape(input);
  const manifest = structuredClone(input) as VerificationReachManifestInput;
  return {
    ...manifest,
    manifestHash: computeVerificationReachManifestHash(manifest),
  };
}

/** Compute the canonical SHA-256 identity for all manifest content except the hash itself. */
export function computeVerificationReachManifestHash(
  manifest: VerificationReachManifest | VerificationReachManifestInput,
): string {
  const { manifestHash: _ignored, ...content } = manifest as VerificationReachManifest;
  return `sha256:${createHash('sha256').update(canonicalJson(content)).digest('hex')}`;
}

/** Bind a reach manifest to the exact artifact bytes submitted to the gate. */
export function computeVerificationArtifactDigest(artifact: string): string {
  return `sha256:${createHash('sha256').update(artifact).digest('hex')}`;
}

/** Evaluate whether the declared evidence can directly observe every required failure mode. */
export function evaluateVerificationReach(
  manifest: VerificationReachManifest,
  options: VerificationReachEvaluationOptions = {},
): VerificationReachResult {
  validateManifestShape(manifest);
  const expectedHash = computeVerificationReachManifestHash(manifest);
  if (manifest.manifestHash !== expectedHash) {
    throw new Error(`Verification reach manifestHash mismatch: expected ${expectedHash}`);
  }

  const now = options.now ?? new Date();
  const evaluatedAt = now.toISOString();
  const manifestExpired = manifest.expiresAt != null
    && now.getTime() > parseTimestamp(manifest.expiresAt, 'expiresAt');

  const risks = manifest.risks.map((requirement) => evaluateRisk(
    requirement,
    manifest,
    manifestExpired,
    now.getTime(),
  ));

  return {
    manifestId: manifest.id,
    manifestHash: manifest.manifestHash,
    systemUnderTest: manifest.systemUnderTest,
    artifact: structuredClone(manifest.artifact),
    coverageVerdict: aggregateVerdicts(risks.map((risk) => risk.verdict)),
    risks,
    evaluatedAt,
  };
}

function evaluateRisk(
  requirement: FailureModeRequirement,
  manifest: VerificationReachManifest,
  manifestExpired: boolean,
  evaluatedAt: number,
): FailureModeReachResult {
  const direct = new Set<string>();
  const partial = new Set<string>();
  const failed = new Set<string>();
  const covered = new Set<VerificationChannel>();
  const limitations = new Set<string>();

  for (const check of requirement.checks) {
    for (const limitation of check.limitations) limitations.add(limitation);
    if (!isUsableObservation(check, manifest, manifestExpired, evaluatedAt)) continue;

    if (check.reach === 'partial') {
      partial.add(check.checkId);
      continue;
    }
    if (check.reach !== 'direct') continue;
    if (!requirement.requiredObservations.includes(check.channel)) continue;
    if (check.oracleRef !== requirement.requiredOracle) continue;

    if (check.executionStatus === 'failed') {
      failed.add(check.checkId);
      continue;
    }
    if (check.executionStatus === 'passed') {
      direct.add(check.checkId);
      covered.add(check.channel);
    }
  }

  const uncoveredObservations = requirement.requiredObservations.filter(
    (channel) => !covered.has(channel),
  );
  const verdict: VerificationCoverageVerdict = failed.size > 0
    ? 'fail'
    : uncoveredObservations.length === 0
      ? 'pass'
      : requirement.dispositionWhenUncovered;

  return {
    riskId: requirement.riskId,
    failureMode: requirement.failureMode,
    severity: requirement.severity,
    verdict,
    directCheckIds: [...direct],
    partialCheckIds: [...partial],
    failedCheckIds: [...failed],
    uncoveredObservations,
    limitations: [...limitations],
    reason: buildRiskReason(verdict, failed, uncoveredObservations, manifestExpired),
  };
}

function isUsableObservation(
  check: VerificationReach,
  manifest: VerificationReachManifest,
  manifestExpired: boolean,
  evaluatedAt: number,
): boolean {
  if (manifestExpired) return false;
  if (!sameTarget(check.target, manifest.artifact)) return false;
  if (check.evidenceClass !== 'EXECUTED') return false;
  if (check.executionStatus === 'not-run' || check.executionStatus === 'unavailable') return false;
  if (!check.observedAt) return false;

  const observedAt = parseTimestamp(check.observedAt, `check ${check.checkId} observedAt`);
  const generatedAt = parseTimestamp(manifest.generatedAt, 'generatedAt');
  if (observedAt < generatedAt) return false;
  if (observedAt > evaluatedAt) return false;
  if (manifest.expiresAt && observedAt > parseTimestamp(manifest.expiresAt, 'expiresAt')) return false;
  return true;
}

function sameTarget(actual: VerificationTarget, expected: VerificationTarget): boolean {
  return actual.revision === expected.revision
    && actual.digest === expected.digest
    && actual.environment === expected.environment;
}

function aggregateVerdicts(verdicts: VerificationCoverageVerdict[]): VerificationCoverageVerdict {
  if (verdicts.some((verdict) => verdict === 'fail')) return 'fail';
  if (verdicts.some((verdict) => verdict === 'human-review')) return 'human-review';
  if (verdicts.some((verdict) => verdict === 'inconclusive')) return 'inconclusive';
  return 'pass';
}

function buildRiskReason(
  verdict: VerificationCoverageVerdict,
  failed: Set<string>,
  uncovered: VerificationChannel[],
  manifestExpired: boolean,
): string {
  if (manifestExpired) return `verification manifest expired; uncovered: ${uncovered.join(', ')}`;
  if (failed.size > 0) return `direct check failed: ${[...failed].join(', ')}`;
  if (verdict === 'pass') return 'all required observation channels have direct executed reach';
  return `required reach is uncovered (${uncovered.join(', ')}); disposition: ${verdict}`;
}

function validateManifestShape(manifest: VerificationReachManifestInput | VerificationReachManifest): void {
  if (!manifest.id || !manifest.systemUnderTest) {
    throw new Error('Verification reach manifest requires id and systemUnderTest');
  }
  if (!manifest.artifact.revision || !manifest.artifact.digest || !manifest.artifact.environment) {
    throw new Error('Verification reach manifest artifact requires revision, digest, and environment');
  }
  parseTimestamp(manifest.generatedAt, 'generatedAt');
  if (manifest.expiresAt) parseTimestamp(manifest.expiresAt, 'expiresAt');
  if (manifest.risks.length === 0) {
    throw new Error('Verification reach manifest requires at least one failure mode');
  }

  const riskIds = new Set<string>();
  for (const risk of manifest.risks) {
    if (riskIds.has(risk.riskId)) throw new Error(`Duplicate riskId: ${risk.riskId}`);
    riskIds.add(risk.riskId);
    if (!risk.riskId || !risk.failureMode || !risk.requiredOracle) {
      throw new Error('Each failure mode requires riskId, failureMode, and requiredOracle');
    }
    if (risk.requiredObservations.length === 0) {
      throw new Error(`Failure mode ${risk.riskId} requires at least one observation channel`);
    }
  }
}

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ${field} timestamp: ${value}`);
  return timestamp;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
