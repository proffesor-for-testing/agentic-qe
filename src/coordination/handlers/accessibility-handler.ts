/**
 * test-accessibility task handler (#1465).
 *
 * Runs the real browser audit (AccessibilityTesterService, the same service
 * behind `qe/a11y/audit`) and maps its report to the task result. When no
 * browser could load the page the result is unmeasured, carries the service's
 * own reason, and has no findings or verdict (#1145).
 */

import type { MemoryBackend } from '../../kernel/interfaces.js';
import type {
  AccessibilityReport, AuditOptions, AuditOutcome, AuditRuleProfile, AuditScanEvidence,
} from '../../domains/visual-accessibility/interfaces';
import type { Result } from '../../shared/types';
import { isCallerInputError, toErrorMessage } from '../../shared/error-utils.js';
import { assertAuditableUrl } from '../../domains/visual-accessibility/services/audit-url-policy.js';
import {
  AUDIT_STANDARDS, notRunEvidence, resolveAuditProfile, resolveAuditStandard, unreportedEvidence, type AuditStandard,
} from '../../domains/visual-accessibility/services/audit-profile.js';
import { buildAuditOutcome, meetsSeverityThreshold } from '../../domains/visual-accessibility/services/audit-outcome.js';

/** The slice of AccessibilityTesterService this handler uses. */
export interface AccessibilityAuditor {
  audit(url: string, options?: AuditOptions): Promise<Result<AccessibilityReport, Error>>;
  dispose?(): Promise<void>;
}

export interface AccessibilityTaskPayload {
  url?: string;
  standard?: string;
  /** #1473: add axe-core best-practice rules (not WCAG requirements). Default false. */
  includeBestPractices?: boolean;
}

/** An axe-core check that could not be decided and needs a manual review (#1473). */
export interface AccessibilityReviewItem {
  id: string;
  description: string;
  reason: string;
  nodes: number;
}

export interface AccessibilityTaskViolation {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  wcagCriteria: string[];
  nodes: Array<{ selector: string; html: string; failureSummary: string; fixSuggestion?: string }>;
}

export interface AccessibilityTaskResult {
  url: string;
  standard: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  /** Legacy: the automated scan found no critical or serious violation. Not a conformance verdict (see outcome). */
  passed: boolean;
  score: number;
  measured: boolean;
  violations: AccessibilityTaskViolation[];
  warnings: Array<{ id: string; description: string; nodes: number }>;
  /** #1473: undecided checks, kept apart from violations; they need a manual review. */
  needsReview: AccessibilityReviewItem[];
  passedRules: number;
  /** #1473: the rule profile the standard resolved to (requested). */
  profile: AuditRuleProfile;
  /** #1473: what the backend ran: effective profile, applied tags, engine version, coverage. */
  scan: AuditScanEvidence;
  /** #1473: structured verdict and scope statement for summaries. */
  outcome: AuditOutcome;
  /** The URL actually audited after redirects, when measured. */
  finalUrl?: string;
  notMeasuredReason?: string;
  note?: string;
  auditDurationMs: number;
}

/** How to make a measurement possible; agent-browser is the backend this path loads. */
export const A11Y_BACKEND_HINT =
  'accessibility_test loads the page with agent-browser and runs axe-core in it. ' +
  'Install it where the MCP server runs (npm install -g agent-browser, then agent-browser install ' +
  'to fetch its browser) so that `npx agent-browser` works, then retry.';

/** The standards accessibility_test accepts, as in qe/a11y/audit's schema. */
export const ACCESSIBILITY_STANDARDS = AUDIT_STANDARDS;
export type AccessibilityStandard = AuditStandard;

/** The standard to use, or a CallerInputError for one that is not supported (#1465). */
export function resolveAccessibilityStandard(standard: unknown): AccessibilityStandard {
  return resolveAuditStandard(standard);
}

/** What to do next for a not-measured reason: the install hint only when no browser ran. */
export function nextStepFor(reason: string): string {
  if (/^the page returned HTTP \d+/.test(reason)) {
    return 'The URL answered with an error page, which is not audited; point url at a page that returns 2xx and retry.';
  }
  if (reason.includes('Failed to navigate')) {
    return 'The browser ran but could not load the URL; check that the server is running and reachable from the MCP server, then retry.';
  }
  return A11Y_BACKEND_HINT;
}

export function standardToWcagLevel(standard: string): 'A' | 'AA' | 'AAA' {
  return resolveAuditProfile(standard).wcagLevel;
}

function notMeasured(
  url: string, profile: AuditRuleProfile, reason: string, started: number, scan?: AuditScanEvidence,
): AccessibilityTaskResult {
  const evidence = scan ?? notRunEvidence('none', profile);
  return {
    url, standard: profile.standard, wcagLevel: profile.wcagLevel,
    profile,
    scan: evidence,
    outcome: buildAuditOutcome({ measured: false, scan: evidence, violations: [], needsReview: 0, notMeasuredReason: reason }),
    needsReview: [],
    passed: false,
    // #1145: nothing was audited, so `passed: false` is not a verdict and the score is -1
    score: -1,
    measured: false,
    violations: [],
    warnings: [],
    passedRules: 0,
    notMeasuredReason: reason,
    note: `Accessibility NOT MEASURED: this is not a failing result. Reason: ${reason}. ${nextStepFor(reason)}`,
    auditDurationMs: Date.now() - started,
  };
}

function mapViolations(report: AccessibilityReport): AccessibilityTaskViolation[] {
  return report.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    wcagCriteria: v.wcagCriteria.map((c) => c.id),
    nodes: v.nodes.map((n) => ({
      selector: n.selector,
      html: n.html,
      failureSummary: n.failureSummary,
      ...(n.fixSuggestion !== undefined ? { fixSuggestion: n.fixSuggestion } : {}),
    })),
  }));
}

/**
 * Audit one URL. A bad url or standard throws a CallerInputError; any other
 * audit error becomes an unmeasured result whose reason is the error message.
 */
export async function runAccessibilityTest(
  auditor: AccessibilityAuditor,
  payload: AccessibilityTaskPayload,
): Promise<AccessibilityTaskResult> {
  const started = Date.now();
  assertAuditableUrl(payload.url);
  const url = payload.url.trim();
  // #1473: resolve the standard once; the profile goes to the backend and into the result
  const profile = resolveAuditProfile(payload.standard, { includeBestPractices: payload.includeBestPractices === true });
  const { standard, wcagLevel } = profile;

  let audit: Result<AccessibilityReport, Error>;
  try {
    audit = await auditor.audit(url, { wcagLevel, includeWarnings: true, profile });
  } catch (error) {
    if (isCallerInputError(error)) throw error;
    return notMeasured(url, profile, `the audit failed: ${toErrorMessage(error)}`, started);
  }

  if (!audit.success) {
    if (isCallerInputError(audit.error)) throw audit.error;
    return notMeasured(url, profile, `the audit failed: ${audit.error.message}`, started);
  }
  const report = audit.value;
  if (report.measured !== true) {
    return notMeasured(url, profile, report.notMeasuredReason ?? 'not measured', started, report.scan);
  }

  const violations = mapViolations(report);
  const needsReview = toReviewItems(report);
  // A backend that reports no evidence cannot show it applied the profile
  const scan = report.scan ?? unreportedEvidence(profile);
  return {
    url, standard, wcagLevel,
    profile,
    scan,
    outcome: buildAuditOutcome({ measured: true, scan, violations, needsReview: needsReview.length }),
    // Same verdict rule as qe/a11y/audit: no critical or serious violation
    passed: meetsSeverityThreshold(violations),
    score: report.score,
    measured: true,
    violations,
    warnings: report.incomplete.map((i) => ({ id: i.id, description: i.description, nodes: i.nodes.length })),
    needsReview,
    passedRules: report.passes.length,
    finalUrl: report.finalUrl ?? url,
    auditDurationMs: Date.now() - started,
  };
}

/** Undecided checks, kept for manual review (#1473). */
export function toReviewItems(report: AccessibilityReport): AccessibilityReviewItem[] {
  return report.incomplete.map((i) => ({ id: i.id, description: i.description, reason: i.reason, nodes: i.nodes.length }));
}

/** Builds the real service; one per task so its browser is closed afterwards. */
export async function createAccessibilityAuditor(memory: MemoryBackend): Promise<AccessibilityAuditor> {
  const { AccessibilityTesterService } = await import(
    '../../domains/visual-accessibility/services/accessibility-tester.js'
  );
  return new AccessibilityTesterService(memory);
}
