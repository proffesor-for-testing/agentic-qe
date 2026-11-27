/**
 * Audit rule profiles (#1473).
 *
 * A public standard (`wcag21-aa`, `wcag22-aa`, `section508`, ...) is resolved
 * once into a versioned rule profile: the exact axe-core tags the scan runs.
 * Both MCP entry points (accessibility_test and qe/a11y/audit) carry the
 * profile through AuditOptions to the backend, and every report says which
 * profile was requested, which one the backend applied, and what that leaves
 * out. Callers that pass only a WCAG level keep the legacy tag set
 * (getAxeTagsForWcagLevel).
 *
 * Tag choices were checked against axe-core's rule metadata (4.8 and 4.11):
 * - WCAG 2.1 profiles do not run `wcag22aa` (target-size) rules.
 * - `best-practice` rules are not WCAG requirements and run only on request.
 * - 4.1.1 Parsing rules carry `wcag2a-obsolete` in axe-core 4.11 and are not run;
 *   WCAG 2.2 removed 4.1.1 and the WCAG 2.0/2.1 errata treat it as satisfied.
 * - axe-core's own `section508` tag refers to the original 2001 rules
 *   (36 CFR 1194.22). The current (2018) Section 508 web baseline adopts
 *   WCAG 2.0 Level A and AA, so `section508` runs the WCAG 2.0 A/AA tags and
 *   reports that it is only the automated subset of that baseline.
 */

import { CallerInputError } from '../../../shared/error-utils.js';
import type { AuditRuleProfile, AuditScanEvidence, WCAGLevel } from '../interfaces.js';

export const AUDIT_STANDARDS = ['wcag21-aa', 'wcag21-aaa', 'wcag22-aa', 'section508'] as const;
export type AuditStandard = typeof AUDIT_STANDARDS[number];
export const DEFAULT_AUDIT_STANDARD: AuditStandard = 'wcag21-aa';

/** Bump when a preset's tags change, so stored results say which rule set they used. */
export const AUDIT_PROFILE_VERSION = '1';

export const BEST_PRACTICE_TAG = 'best-practice';

/** Applies to every automated scan, whatever the profile. */
export const AUTOMATED_SCAN_LIMITATION =
  'Automated axe-core rules test only part of the success criteria; a scan without violations is not a conformance claim, ' +
  'and checks that need review (incomplete) and untested criteria need a manual review.';

interface ProfilePreset {
  readonly label: string;
  readonly wcagLevel: WCAGLevel;
  readonly axeTags: readonly string[];
  /** Tags the engine must know for the profile to be honoured; one that selects no rule means unsupported. */
  readonly requiredTags: readonly string[];
  readonly limitations: readonly string[];
}

const WCAG20_AA = ['wcag2a', 'wcag2aa'] as const;
const WCAG21_AA = [...WCAG20_AA, 'wcag21a', 'wcag21aa'] as const;

const PRESETS: Record<AuditStandard, ProfilePreset> = {
  'wcag21-aa': {
    label: 'WCAG 2.1 Level A and AA',
    wcagLevel: 'AA',
    axeTags: WCAG21_AA,
    requiredTags: WCAG20_AA,
    limitations: [],
  },
  'wcag21-aaa': {
    label: 'WCAG 2.1 Level A, AA and AAA',
    wcagLevel: 'AAA',
    axeTags: [...WCAG21_AA, 'wcag2aaa', 'wcag21aaa'],
    requiredTags: [...WCAG20_AA, 'wcag2aaa'],
    limitations: ['axe-core automates few Level AAA criteria; most AAA criteria need a manual review.'],
  },
  'wcag22-aa': {
    label: 'WCAG 2.2 Level A and AA',
    wcagLevel: 'AA',
    axeTags: [...WCAG21_AA, 'wcag22a', 'wcag22aa'],
    requiredTags: [...WCAG20_AA, 'wcag22aa'],
    limitations: [],
  },
  section508: {
    label: 'Section 508 (2018) web baseline, automated subset: WCAG 2.0 Level A and AA',
    wcagLevel: 'AA',
    axeTags: WCAG20_AA,
    requiredTags: WCAG20_AA,
    limitations: [
      'Only the automated WCAG 2.0 A/AA rules of the Section 508 web baseline run. Not covered: 502 interoperability ' +
      'with assistive technology, 503 media player and caption controls, 504 authoring tools, 602 support documentation.',
      "axe-core's section508 tag (the original 2001 rules, 36 CFR 1194.22) is not used.",
    ],
  },
};

/** The standard to use, or a CallerInputError for one that is not supported. */
export function resolveAuditStandard(standard: unknown): AuditStandard {
  if (standard === undefined || standard === null || standard === '') return DEFAULT_AUDIT_STANDARD;
  if (typeof standard === 'string' && (AUDIT_STANDARDS as readonly string[]).includes(standard)) {
    return standard as AuditStandard;
  }
  throw new CallerInputError(
    `standard ${JSON.stringify(standard)} is not supported; use one of ${AUDIT_STANDARDS.join(', ')}`);
}

export interface ResolveProfileOptions {
  /** Add axe-core's best-practice rules (not WCAG requirements). Default false. */
  readonly includeBestPractices?: boolean;
}

/** Resolve a public standard into the rule profile the scan runs. Throws CallerInputError for an unknown one. */
export function resolveAuditProfile(standard: unknown, options: ResolveProfileOptions = {}): AuditRuleProfile {
  const resolved = resolveAuditStandard(standard);
  const preset = PRESETS[resolved];
  const includesBestPractices = options.includeBestPractices === true;
  const limitations = [
    AUTOMATED_SCAN_LIMITATION,
    ...preset.limitations,
    ...(includesBestPractices
      ? ['best-practice rules are included; their findings are not WCAG failures.']
      : ['best-practice rules (not WCAG requirements) are not run; set includeBestPractices to add them.']),
  ];
  return {
    id: `${resolved}${includesBestPractices ? '+best-practice' : ''}@${AUDIT_PROFILE_VERSION}`,
    standard: resolved,
    version: AUDIT_PROFILE_VERSION,
    label: preset.label,
    wcagLevel: preset.wcagLevel,
    axeTags: includesBestPractices ? [...preset.axeTags, BEST_PRACTICE_TAG] : [...preset.axeTags],
    requiredTags: [...preset.requiredTags],
    includesBestPractices,
    limitations,
  };
}

/** The WCAG level a standard resolves to (the legacy, level-only view of a profile). */
export function standardToWcagLevel(standard: unknown): WCAGLevel {
  return resolveAuditProfile(standard).wcagLevel;
}

// ============================================================================
// Scan evidence: what the backend actually ran
// ============================================================================

/** Said of a level-only scan: no profile was requested. */
export const LEVEL_ONLY_LIMITATION =
  'No rule profile was requested: the legacy level-only tag set ran (WCAG 2.0 to 2.2 tags up to the level, plus best-practice rules).';

/** The engine side of an axe-core run, as reported from the page. */
export interface AxeRunFacts {
  readonly appliedTags: readonly string[];
  readonly engineVersion: string | null;
  /** Rules each applied tag selects in the running engine; undefined when the page did not report them. */
  readonly tagRuleCounts?: Readonly<Record<string, number>>;
  readonly ruleIds: { readonly violations: readonly string[]; readonly passes: readonly string[];
    readonly incomplete: readonly string[]; readonly inapplicable: readonly string[] };
}

/**
 * Evidence for an axe-core run whose tags the backend controlled. The profile
 * counts as applied only with full evidence (#1473): the engine version, the
 * rules each tag selects, every required tag selecting a rule, and at least one
 * rule producing a result. Anything less gives `effectiveProfile: null`.
 */
export function axeScanEvidence(backend: string, profile: AuditRuleProfile | undefined, facts: AxeRunFacts): AuditScanEvidence {
  const version = facts.engineVersion;
  const engineName = `axe-core ${version ?? '(version not reported)'}`;
  const counts = facts.tagRuleCounts;
  const emptyTags = counts ? facts.appliedTags.filter((t) => counts[t] === 0) : [];
  const missing = profile && counts ? profile.requiredTags.filter((t) => !(counts[t] > 0)) : [];
  const { violations, passes, incomplete, inapplicable } = facts.ruleIds;
  const executed = [...new Set([...violations, ...passes, ...incomplete, ...inapplicable])].sort();
  const limitations = [
    ...(profile ? profile.limitations : [AUTOMATED_SCAN_LIMITATION, LEVEL_ONLY_LIMITATION]),
    ...(version ? [] : ['The engine did not report its version, so the profile is not verified.']),
    ...(counts ? [] : ['The engine did not report which rules each tag selects, so the profile is not verified.']),
    ...(executed.length > 0 ? [] : ['No rule produced a result, so nothing was measured under the profile.']),
    ...(emptyTags.length > 0 ? [`Tags that select no rule in ${engineName}: ${emptyTags.join(', ')}.`] : []),
    ...(missing.length > 0
      ? [`${engineName} has no rules for ${missing.join(', ')}, so profile ${profile!.id} could not be applied.`] : []),
  ];
  const applied = profile !== undefined && version !== null && counts !== undefined &&
    missing.length === 0 && executed.length > 0;
  return {
    backend,
    engine: { name: 'axe-core', version },
    requestedProfile: profile?.id ?? null,
    effectiveProfile: applied ? profile!.id : null,
    profileSupport: profile ? (applied ? 'applied' : 'unsupported') : 'level-only',
    appliedTags: [...facts.appliedTags],
    executedRules: executed,
    coverage: {
      violations: violations.length, passes: passes.length,
      incomplete: incomplete.length, inapplicable: inapplicable.length,
    },
    limitations,
  };
}

/** Evidence for a backend that selects rules by WCAG level only (Vibium). */
export function levelOnlyBackendEvidence(
  backend: string, profile: AuditRuleProfile | undefined, wcagLevel: WCAGLevel,
): AuditScanEvidence {
  return {
    backend,
    engine: null,
    requestedProfile: profile?.id ?? null,
    effectiveProfile: null,
    profileSupport: profile ? 'unsupported' : 'level-only',
    appliedTags: null,
    executedRules: null,
    coverage: null,
    limitations: [
      AUTOMATED_SCAN_LIMITATION,
      `The ${backend} backend selects rules by WCAG level (${wcagLevel}) only and does not report its engine version` +
      (profile ? `; the requested profile ${profile.id} was not applied.` : '.'),
    ],
  };
}

/** Evidence for a report where nothing ran (not measured, or simulation). */
export function notRunEvidence(backend: string, profile: AuditRuleProfile | undefined): AuditScanEvidence {
  return {
    backend,
    engine: null,
    requestedProfile: profile?.id ?? null,
    effectiveProfile: null,
    profileSupport: 'not-run',
    appliedTags: null,
    executedRules: null,
    coverage: null,
    limitations: ['No rule ran on the page.'],
  };
}

/** Evidence for a measured report whose backend said nothing about what it ran: the profile is not verified. */
export function unreportedEvidence(profile: AuditRuleProfile): AuditScanEvidence {
  return {
    backend: 'unknown',
    engine: null,
    requestedProfile: profile.id,
    effectiveProfile: null,
    profileSupport: 'unsupported',
    appliedTags: null,
    executedRules: null,
    coverage: null,
    limitations: [...profile.limitations, 'The backend did not report which rules it ran; the profile is not verified.'],
  };
}
