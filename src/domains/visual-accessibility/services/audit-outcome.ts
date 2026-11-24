/**
 * Structured audit outcome (#1473).
 *
 * The legacy `passed` boolean only says that the automated scan found no
 * critical or serious violation. The outcome says what the scan covered and
 * what is still open, so a summary can state the scope faithfully: an
 * incomplete-only scan meets the severity threshold yet still needs review.
 */

import type { AuditOutcome, AuditOutcomeStatus, AuditScanEvidence } from '../interfaces.js';

export interface AuditOutcomeInput {
  readonly measured: boolean;
  readonly scan?: AuditScanEvidence;
  readonly violations: ReadonlyArray<{ readonly impact: string }>;
  /** Checks the engine could not decide (axe-core "incomplete"). */
  readonly needsReview: number;
  readonly notMeasuredReason?: string;
}

/** The legacy verdict: no critical or serious violation in the automated scan. */
export function meetsSeverityThreshold(violations: ReadonlyArray<{ readonly impact: string }>): boolean {
  return !violations.some((v) => v.impact === 'critical' || v.impact === 'serious');
}

function statusOf(input: AuditOutcomeInput): AuditOutcomeStatus {
  if (!input.measured) return 'not-measured';
  if (input.scan?.requestedProfile && !input.scan.effectiveProfile) return 'profile-unavailable';
  if (input.violations.length > 0) return 'violations-found';
  if (input.needsReview > 0) return 'needs-review';
  return 'no-automated-violations';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A deterministic one-paragraph statement of the scan's scope and open items. */
export function describeScope(input: AuditOutcomeInput, status: AuditOutcomeStatus): string {
  const scan = input.scan;
  if (status === 'not-measured') {
    return `Not measured: ${input.notMeasuredReason ?? 'no browser audited the page'}. No finding, pass or fail.`;
  }
  const engine = scan?.engine ? `${scan.engine.name} ${scan.engine.version ?? '(version not reported)'}` : 'an automated checker';
  const profile = scan?.effectiveProfile
    ? `profile ${scan.effectiveProfile} (tags ${(scan.appliedTags ?? []).join(', ')})`
    : scan?.requestedProfile
      ? `the backend's own rule selection; requested profile ${scan.requestedProfile} was not applied`
      : `tags ${(scan?.appliedTags ?? []).join(', ') || 'chosen by WCAG level'}`;
  const serious = input.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length;
  return [
    `Automated ${engine} scan on ${scan?.backend ?? 'a browser'} with ${profile}.`,
    `${plural(input.violations.length, 'violation', 'violations')} (${serious} critical or serious);`,
    `${plural(input.needsReview, 'check needs', 'checks need')} manual review.`,
    'Not a conformance claim.',
  ].join(' ');
}

export function buildAuditOutcome(input: AuditOutcomeInput): AuditOutcome {
  const status = statusOf(input);
  const seriousOrCritical = input.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length;
  return {
    status,
    severityThresholdMet: input.measured && seriousOrCritical === 0,
    violations: input.violations.length,
    seriousOrCritical,
    needsReview: input.needsReview,
    reviewRequired: status !== 'no-automated-violations',
    scope: describeScope(input, status),
    limitations: input.scan?.limitations ?? [],
  };
}
