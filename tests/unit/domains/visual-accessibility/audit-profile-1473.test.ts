/**
 * #1473: a public standard resolves into a versioned rule profile, the
 * scan evidence says what ran, and the outcome keeps review items apart
 * from the legacy `passed` severity threshold.
 *
 * The tag sets are checked against the installed axe-core rule metadata.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  AUDIT_STANDARDS,
  BEST_PRACTICE_TAG,
  axeScanEvidence,
  levelOnlyBackendEvidence,
  notRunEvidence,
  resolveAuditProfile,
  standardToWcagLevel,
} from '../../../../src/domains/visual-accessibility/services/audit-profile';
import { buildAuditOutcome } from '../../../../src/domains/visual-accessibility/services/audit-outcome';
import { getAxeTagsForWcagLevel } from '../../../../src/domains/visual-accessibility/services/accessibility-tester-browser';

const axe = createRequire(import.meta.url)('axe-core') as {
  version: string;
  getRules(tags?: string[]): Array<{ ruleId: string; tags: string[] }>;
};
const rulesFor = (tags: readonly string[]) => axe.getRules([...tags]).map((r) => r.ruleId);
/** Rules a tag filter actually runs: axe-core leaves experimental rules out. */
const runnableFor = (tags: readonly string[]) =>
  axe.getRules([...tags]).filter((r) => !r.tags.includes('experimental')).map((r) => r.ruleId);

/** The expected tags per preset, written out so a resolver that collapses presets fails. */
const EXPECTED_TAGS: Record<string, string[]> = {
  'wcag21-aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  'wcag21-aaa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag2aaa', 'wcag21aaa'],
  'wcag22-aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
  section508: ['wcag2a', 'wcag2aa'],
};

describe('resolveAuditProfile (#1473)', () => {
  it.each(AUDIT_STANDARDS)('resolves %s into its own versioned tag set', (standard) => {
    const profile = resolveAuditProfile(standard);

    expect(profile.id).toBe(`${standard}@1`);
    expect(profile.standard).toBe(standard);
    expect(profile.axeTags).toEqual(EXPECTED_TAGS[standard]);
    expect(profile.includesBestPractices).toBe(false);
  });

  it('gives every preset a distinct tag set', () => {
    const sets = AUDIT_STANDARDS.map((s) => resolveAuditProfile(s).axeTags.join(','));

    expect(new Set(sets).size).toBe(AUDIT_STANDARDS.length);
  });

  it('defaults to wcag21-aa and rejects an unknown standard as caller input', () => {
    expect(resolveAuditProfile(undefined).id).toBe('wcag21-aa@1');
    expect(() => resolveAuditProfile('wcag30-aa')).toThrow(expect.objectContaining({ name: 'CallerInputError' }));
  });

  it('adds best-practice rules only on request and says so in the profile id', () => {
    const profile = resolveAuditProfile('wcag22-aa', { includeBestPractices: true });

    expect(profile.id).toBe('wcag22-aa+best-practice@1');
    expect(profile.axeTags).toContain(BEST_PRACTICE_TAG);
    expect(resolveAuditProfile('wcag22-aa').axeTags).not.toContain(BEST_PRACTICE_TAG);
  });

  it('reports section508 as the automated WCAG 2.0 A/AA subset of the 2018 baseline', () => {
    const profile = resolveAuditProfile('section508');

    expect(profile.label).toMatch(/2018.*automated subset.*WCAG 2\.0 Level A and AA/);
    expect(profile.axeTags).not.toContain('section508');
    expect(profile.limitations.join(' ')).toMatch(/503 media player/);
  });

  it('keeps the level-only view: AAA for wcag21-aaa, AA otherwise', () => {
    expect(AUDIT_STANDARDS.map(standardToWcagLevel)).toEqual(['AA', 'AAA', 'AA', 'AA']);
  });
});

describe(`profiles against axe-core ${axe.version} rule metadata (#1473)`, () => {
  it('runs the WCAG 2.2-only target-size rule for wcag22-aa and not for wcag21-aa', () => {
    expect(rulesFor(resolveAuditProfile('wcag22-aa').axeTags)).toContain('target-size');
    expect(rulesFor(resolveAuditProfile('wcag21-aa').axeTags)).not.toContain('target-size');
    expect(rulesFor(resolveAuditProfile('wcag21-aaa').axeTags)).not.toContain('target-size');
  });

  it('runs no best-practice-only rule unless asked', () => {
    const bestPracticeOnly = axe.getRules([BEST_PRACTICE_TAG])
      .filter((r) => !r.tags.some((t) => /^wcag\d/.test(t))).map((r) => r.ruleId);

    for (const standard of AUDIT_STANDARDS) {
      const rules = rulesFor(resolveAuditProfile(standard).axeTags);
      expect(rules.filter((id) => bestPracticeOnly.includes(id)), standard).toEqual([]);
    }
    expect(rulesFor(resolveAuditProfile('wcag21-aa', { includeBestPractices: true }).axeTags)).toContain('region');
  });

  it('does not run the obsolete 4.1.1 Parsing rules in any profile', () => {
    for (const standard of AUDIT_STANDARDS) {
      expect(rulesFor(resolveAuditProfile(standard).axeTags), standard).not.toContain('duplicate-id');
    }
  });

  it('needs only tags the engine knows', () => {
    for (const standard of AUDIT_STANDARDS) {
      for (const tag of resolveAuditProfile(standard).requiredTags) {
        expect(runnableFor([tag]).length, `${standard}: ${tag}`).toBeGreaterThan(0);
      }
    }
  });

  it('differs from the legacy level-only set, which spans 2.2 and best practices', () => {
    expect(getAxeTagsForWcagLevel('AA')).toEqual(expect.arrayContaining(['wcag22aa', BEST_PRACTICE_TAG]));
    expect(resolveAuditProfile('wcag21-aa').axeTags).not.toEqual(getAxeTagsForWcagLevel('AA'));
  });
});

const IDS = { violations: ['image-alt'], passes: ['html-has-lang'], incomplete: ['color-contrast'], inapplicable: ['video-caption'] };

describe('scan evidence (#1473)', () => {
  it('reports an applied profile with engine version, tags, executed rules and coverage', () => {
    const profile = resolveAuditProfile('wcag22-aa');
    const counts = Object.fromEntries(profile.axeTags.map((t) => [t, rulesFor([t]).length]));

    const scan = axeScanEvidence('agent-browser', profile, {
      appliedTags: profile.axeTags, engineVersion: '4.8.4', tagRuleCounts: counts, ruleIds: IDS,
    });

    expect(scan).toMatchObject({
      backend: 'agent-browser', engine: { name: 'axe-core', version: '4.8.4' },
      requestedProfile: 'wcag22-aa@1', effectiveProfile: 'wcag22-aa@1', profileSupport: 'applied',
      appliedTags: EXPECTED_TAGS['wcag22-aa'],
      executedRules: ['color-contrast', 'html-has-lang', 'image-alt', 'video-caption'],
      coverage: { violations: 1, passes: 1, incomplete: 1, inapplicable: 1 },
    });
    expect(scan.limitations.join(' ')).toMatch(/Tags that select no rule in axe-core 4\.8\.4: wcag22a\b/);
  });

  it('marks the profile unsupported when the engine has no rule for a required tag', () => {
    const profile = resolveAuditProfile('wcag22-aa');
    const counts = Object.fromEntries(profile.axeTags.map((t) => [t, t === 'wcag22aa' ? 0 : 5]));

    const scan = axeScanEvidence('agent-browser', profile, {
      appliedTags: profile.axeTags, engineVersion: '4.6.0', tagRuleCounts: counts, ruleIds: IDS,
    });

    expect(scan).toMatchObject({ requestedProfile: 'wcag22-aa@1', effectiveProfile: null, profileSupport: 'unsupported' });
    expect(scan.limitations.join(' ')).toMatch(/has no rules for wcag22aa/);
  });

  it('does not count a profile as applied without the engine version or the per-tag rule counts', () => {
    const profile = resolveAuditProfile('wcag21-aa');
    const counts = Object.fromEntries(profile.axeTags.map((t) => [t, 3]));

    const noVersion = axeScanEvidence('agent-browser', profile, {
      appliedTags: profile.axeTags, engineVersion: null, tagRuleCounts: counts, ruleIds: IDS,
    });
    const noCounts = axeScanEvidence('agent-browser', profile, {
      appliedTags: profile.axeTags, engineVersion: '4.8.4', ruleIds: IDS,
    });

    expect(noVersion).toMatchObject({ effectiveProfile: null, profileSupport: 'unsupported' });
    expect(noVersion.limitations.join(' ')).toMatch(/did not report its version, so the profile is not verified/);
    expect(noCounts).toMatchObject({ effectiveProfile: null, profileSupport: 'unsupported' });
    expect(noCounts.limitations.join(' ')).toMatch(/did not report which rules each tag selects/);
  });

  it('does not count a profile as applied when no rule produced a result', () => {
    const profile = resolveAuditProfile('wcag22-aa');
    const scan = axeScanEvidence('agent-browser', profile, {
      appliedTags: profile.axeTags, engineVersion: '4.8.4',
      tagRuleCounts: Object.fromEntries(profile.axeTags.map((t) => [t, 1])),
      ruleIds: { violations: [], passes: [], incomplete: [], inapplicable: [] },
    });

    expect(scan).toMatchObject({ effectiveProfile: null, profileSupport: 'unsupported', executedRules: [] });
    expect(buildAuditOutcome({ measured: true, scan, violations: [], needsReview: 0 }))
      .toMatchObject({ status: 'profile-unavailable', severityThresholdMet: false, reviewRequired: true });
  });

  it('reports a level-only run when no profile was requested', () => {
    const scan = axeScanEvidence('agent-browser', undefined, {
      appliedTags: getAxeTagsForWcagLevel('AA'), engineVersion: null, ruleIds: IDS,
    });

    expect(scan).toMatchObject({ requestedProfile: null, effectiveProfile: null, profileSupport: 'level-only' });
    expect(scan.limitations.join(' ')).toMatch(/did not report its version/);
  });

  it('reports a level-only backend as not applying a requested profile', () => {
    const scan = levelOnlyBackendEvidence('vibium', resolveAuditProfile('section508'), 'AA');

    expect(scan).toMatchObject({ backend: 'vibium', engine: null, effectiveProfile: null, profileSupport: 'unsupported', appliedTags: null });
  });
});

describe('buildAuditOutcome (#1473)', () => {
  const profile = resolveAuditProfile('wcag21-aa');
  const applied = axeScanEvidence('agent-browser', profile, {
    appliedTags: profile.axeTags, engineVersion: '4.8.4',
    tagRuleCounts: Object.fromEntries(profile.axeTags.map((t) => [t, 3])), ruleIds: IDS,
  });

  it('meets the severity threshold yet requires review for an incomplete-only scan', () => {
    const outcome = buildAuditOutcome({ measured: true, scan: applied, violations: [], needsReview: 1 });

    expect(outcome).toMatchObject({ status: 'needs-review', severityThresholdMet: true, reviewRequired: true, needsReview: 1 });
    expect(outcome.scope).toBe(
      'Automated axe-core 4.8.4 scan on agent-browser with profile wcag21-aa@1 (tags wcag2a, wcag2aa, wcag21a, wcag21aa). ' +
      '0 violations (0 critical or serious); 1 check needs manual review. Not a conformance claim.');
  });

  it('counts a moderate violation as found while the severity threshold still holds', () => {
    const outcome = buildAuditOutcome({ measured: true, scan: applied, violations: [{ impact: 'moderate' }], needsReview: 0 });

    expect(outcome).toMatchObject({ status: 'violations-found', severityThresholdMet: true, seriousOrCritical: 0 });
  });

  it('is clean only with the profile applied, no violation and nothing to review', () => {
    expect(buildAuditOutcome({ measured: true, scan: applied, violations: [], needsReview: 0 }))
      .toMatchObject({ status: 'no-automated-violations', severityThresholdMet: true, reviewRequired: false });
  });

  it('says profile-unavailable when the backend could not apply the requested profile', () => {
    const scan = levelOnlyBackendEvidence('vibium', profile, 'AA');

    expect(buildAuditOutcome({ measured: true, scan, violations: [], needsReview: 0 }))
      .toMatchObject({ status: 'profile-unavailable', severityThresholdMet: true, reviewRequired: true });
  });

  it('keeps the violations a level-only backend found visible under profile-unavailable', () => {
    const scan = levelOnlyBackendEvidence('vibium', profile, 'AA');

    const outcome = buildAuditOutcome({ measured: true, scan, violations: [{ impact: 'serious' }], needsReview: 0 });

    expect(outcome).toMatchObject({ status: 'profile-unavailable', violations: 1, seriousOrCritical: 1, severityThresholdMet: false });
    expect(outcome.scope).toBe(
      'Automated scan on vibium with requested profile wcag21-aa@1 not applied; the findings below come from the ' +
      "backend's own rule selection. 1 violation (1 critical or serious); 0 checks need manual review. Not a conformance claim.");
  });

  it('gives no verdict when nothing was measured', () => {
    const outcome = buildAuditOutcome({
      measured: false, scan: notRunEvidence('none', profile), violations: [], needsReview: 0, notMeasuredReason: 'no browser',
    });

    expect(outcome).toMatchObject({ status: 'not-measured', severityThresholdMet: false, reviewRequired: true });
    expect(outcome.scope).toBe('Not measured: no browser. No finding, pass or fail.');
  });
});
