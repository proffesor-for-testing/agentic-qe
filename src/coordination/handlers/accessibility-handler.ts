/**
 * test-accessibility task handler (#1465).
 *
 * Runs the real browser audit (AccessibilityTesterService, the same service
 * behind `qe/a11y/audit`) and maps its report to the task result. When no
 * browser could load the page the result is unmeasured, carries the service's
 * own reason, and has no findings or verdict (#1145).
 */

import type { MemoryBackend } from '../../kernel/interfaces.js';
import type { AccessibilityReport, AuditOptions } from '../../domains/visual-accessibility/interfaces';
import type { Result } from '../../shared/types';
import { CallerInputError, isCallerInputError, toErrorMessage } from '../../shared/error-utils.js';
import { assertAuditableUrl } from '../../domains/visual-accessibility/services/audit-url-policy.js';

/** The slice of AccessibilityTesterService this handler uses. */
export interface AccessibilityAuditor {
  audit(url: string, options?: AuditOptions): Promise<Result<AccessibilityReport, Error>>;
  dispose?(): Promise<void>;
}

export interface AccessibilityTaskPayload {
  url?: string;
  standard?: string;
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
  passed: boolean;
  score: number;
  measured: boolean;
  violations: AccessibilityTaskViolation[];
  warnings: Array<{ id: string; description: string; nodes: number }>;
  passedRules: number;
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
export const ACCESSIBILITY_STANDARDS = ['wcag21-aa', 'wcag21-aaa', 'wcag22-aa', 'section508'] as const;
export type AccessibilityStandard = typeof ACCESSIBILITY_STANDARDS[number];

/** The standard to use, or a CallerInputError for one that is not supported (#1465). */
export function resolveAccessibilityStandard(standard: unknown): AccessibilityStandard {
  if (standard === undefined || standard === null || standard === '') return 'wcag21-aa';
  if (typeof standard === 'string' && (ACCESSIBILITY_STANDARDS as readonly string[]).includes(standard)) {
    return standard as AccessibilityStandard;
  }
  throw new CallerInputError(
    `standard ${JSON.stringify(standard)} is not supported; use one of ${ACCESSIBILITY_STANDARDS.join(', ')}`);
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
  return standard === 'wcag21-aaa' ? 'AAA' : 'AA';
}

function notMeasured(
  url: string, standard: string, wcagLevel: 'A' | 'AA' | 'AAA', reason: string, started: number,
): AccessibilityTaskResult {
  return {
    url, standard, wcagLevel,
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
  const standard = resolveAccessibilityStandard(payload.standard);
  const wcagLevel = standardToWcagLevel(standard);

  let audit: Result<AccessibilityReport, Error>;
  try {
    audit = await auditor.audit(url, { wcagLevel, includeWarnings: true });
  } catch (error) {
    if (isCallerInputError(error)) throw error;
    return notMeasured(url, standard, wcagLevel, `the audit failed: ${toErrorMessage(error)}`, started);
  }

  if (!audit.success) {
    if (isCallerInputError(audit.error)) throw audit.error;
    return notMeasured(url, standard, wcagLevel, `the audit failed: ${audit.error.message}`, started);
  }
  const report = audit.value;
  if (report.measured !== true) {
    return notMeasured(url, standard, wcagLevel, report.notMeasuredReason ?? 'not measured', started);
  }

  const violations = mapViolations(report);
  return {
    url, standard, wcagLevel,
    // Same verdict rule as qe/a11y/audit: no critical or serious violation
    passed: !violations.some((v) => v.impact === 'critical' || v.impact === 'serious'),
    score: report.score,
    measured: true,
    violations,
    warnings: report.incomplete.map((i) => ({ id: i.id, description: i.description, nodes: i.nodes.length })),
    passedRules: report.passes.length,
    auditDurationMs: Date.now() - started,
  };
}

/** Builds the real service; one per task so its browser is closed afterwards. */
export async function createAccessibilityAuditor(memory: MemoryBackend): Promise<AccessibilityAuditor> {
  const { AccessibilityTesterService } = await import(
    '../../domains/visual-accessibility/services/accessibility-tester.js'
  );
  return new AccessibilityTesterService(memory);
}
