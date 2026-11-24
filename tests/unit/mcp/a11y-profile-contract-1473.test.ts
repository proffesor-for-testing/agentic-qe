/**
 * #1473 contract: for every standard and both MCP paths (accessibility_test
 * and qe/a11y/audit), the resolved rule profile reaches the backend boundary
 * (the axe-core runOnly tags evaluated in the browser) and the serialized
 * response names the requested and effective profile, the applied tags and
 * the engine version. The expected tags are written out, so a resolver that
 * collapses standards into a level fails here.
 *
 * The browser client is a fake that answers like axe-core: a rule produces a
 * result only when one of its tags (from the installed axe-core metadata)
 * was applied.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
// Load the domain handlers first, as the other handler-config tests do (import cycle)
import '../../../src/mcp/handlers/domain-handlers';
import { accessibilityTestConfig } from '../../../src/mcp/handlers/domain-handler-configs';
import { AccessibilityTesterService } from '../../../src/domains/visual-accessibility/services/accessibility-tester';
import { runAccessibilityTest, type AccessibilityTaskPayload } from '../../../src/coordination/handlers/accessibility-handler';
import { A11yAuditTool } from '../../../src/mcp/tools/visual-accessibility';
import type { IBrowserClient } from '../../../src/integrations/browser';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import type { VibiumClient } from '../../../src/integrations/vibium';
import { ok } from '../../../src/shared/types';
import { resolveAuditProfile } from '../../../src/domains/visual-accessibility/services/audit-profile';

vi.mock('../../../src/mcp/tools/base', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/mcp/tools/base')>();
  const memory = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
  return { ...original, getSharedMemoryBackend: vi.fn().mockResolvedValue(memory) };
});

// Vibium is used only when browser mode and axe-core are enabled for it
vi.mock('../../../src/integrations/vibium/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/integrations/vibium/index.js')>()),
  isBrowserModeEnabled: () => true,
  isAxeCoreEnabled: () => true,
}));

const axe = createRequire(import.meta.url)('axe-core') as {
  version: string;
  getRules(tags?: string[]): Array<{ ruleId: string; tags: string[] }>;
};
const ruleTags = new Map(axe.getRules().map((r) => [r.ruleId, r.tags]));

const URL = 'http://127.0.0.1:18991/page.html';
const STANDARDS = ['wcag21-aa', 'wcag21-aaa', 'wcag22-aa', 'section508'] as const;
const EXPECTED_TAGS: Record<string, string[]> = {
  'wcag21-aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  'wcag21-aaa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag2aaa', 'wcag21aaa'],
  'wcag22-aa': ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
  section508: ['wcag2a', 'wcag2aa'],
};
/** The page's defects: a WCAG 2.0 A rule, a 2.2-only rule and a best-practice-only rule. */
const PAGE = {
  violations: [['image-alt', 'critical'], ['target-size', 'serious'], ['region', 'moderate']] as const,
  incomplete: ['color-contrast'],
  passes: ['html-has-lang', 'document-title'],
};

const memory = { get: async () => undefined, set: async () => undefined } as unknown as MemoryBackend;

/** A browser whose axe-core answers from the installed rule metadata; it records the tags it was given. */
function fakeAxeBrowser(): IBrowserClient & { appliedTags: string[][] } {
  const appliedTags: string[][] = [];
  const evaluate = vi.fn(async (script: string) => {
    if (!script.includes('axe.run')) return ok(JSON.stringify({ status: 200, url: URL }));
    const tags = JSON.parse(/values: (\[[^\]]*\])/.exec(script)![1]) as string[];
    appliedTags.push(tags);
    const inScope = (id: string) => (ruleTags.get(id) ?? []).some((t) => tags.includes(t));
    return ok(JSON.stringify({
      engine: { version: axe.version, tagRuleCounts: Object.fromEntries(tags.map((t) => [t, axe.getRules([t]).length])) },
      violations: PAGE.violations.filter(([id]) => inScope(id)).map(([id, impact]) => ({
        id, impact, description: id, help: id, tags: ruleTags.get(id),
        nodes: [{ selector: 'x', html: '<x>', target: ['x'], failureSummary: 'fix' }],
      })),
      passes: PAGE.passes.filter(inScope),
      incomplete: PAGE.incomplete.filter(inScope),
      inapplicable: [],
    }));
  });
  return {
    tool: 'agent-browser', appliedTags,
    launch: vi.fn(async () => ok({})), navigate: vi.fn(async () => ok({})), quit: vi.fn(async () => ok(undefined)),
    evaluate,
  } as unknown as IBrowserClient & { appliedTags: string[][] };
}

const service = (browserClient: IBrowserClient) =>
  new AccessibilityTesterService(memory, { browserClient, useBrowserMode: true, preferAgentBrowser: true });

/** accessibility_test: MCP params -> task payload -> coordinator handler -> MCP result, serialized. */
async function viaAccessibilityTest(browser: IBrowserClient, params: Record<string, unknown>) {
  const payload = accessibilityTestConfig.mapToPayload(params as never, undefined) as AccessibilityTaskPayload;
  const data = await runAccessibilityTest(service(browser), payload);
  const result = accessibilityTestConfig.mapToResult('task-1', data as unknown as Record<string, unknown>, 1, []);
  return JSON.parse(JSON.stringify(result));
}

/** qe/a11y/audit: the tool's invoke, serialized; returns the first URL's audit plus the top-level profile. */
async function viaA11yAudit(browser: IBrowserClient, params: Record<string, unknown>) {
  const tool = new A11yAuditTool();
  (tool as unknown as { accessibilityTester: AccessibilityTesterService }).accessibilityTester = service(browser);
  const result = await tool.invoke({ urls: [URL], checkContrast: false, checkKeyboard: false, ...params });
  expect(result.success, result.error).toBe(true);
  const data = JSON.parse(JSON.stringify(result.data));
  return { ...data.audits[0], profile: data.profile };
}

const PATHS = [['accessibility_test', viaAccessibilityTest], ['qe/a11y/audit', viaA11yAudit]] as const;

describe.each(PATHS)('%s carries the rule profile to the backend and the response (#1473)', (_name, run) => {
  it.each(STANDARDS)('%s: runs its own tags and reports them', async (standard) => {
    const browser = fakeAxeBrowser();

    const out = await run(browser, { url: URL, standard });

    expect(browser.appliedTags).toEqual([EXPECTED_TAGS[standard]]);
    expect(out.profile).toMatchObject({ id: `${standard}@1`, standard, axeTags: EXPECTED_TAGS[standard] });
    expect(out.scan).toMatchObject({
      backend: 'agent-browser', engine: { name: 'axe-core', version: axe.version },
      requestedProfile: `${standard}@1`, effectiveProfile: `${standard}@1`, profileSupport: 'applied',
      appliedTags: EXPECTED_TAGS[standard],
    });
    expect(out.outcome.status).toBe('violations-found');
    expect(out.needsReview.map((r: { id: string }) => r.id)).toEqual(['color-contrast']);
  });

  it('reports target-size only for wcag22-aa, and best-practice rules only on request', async () => {
    const ids = async (params: Record<string, unknown>) =>
      (await run(fakeAxeBrowser(), { url: URL, ...params })).violations.map((v: { id: string }) => v.id);

    expect(await ids({ standard: 'wcag21-aa' })).toEqual(['image-alt']);
    expect(await ids({ standard: 'wcag22-aa' })).toEqual(['image-alt', 'target-size']);
    expect(await ids({ standard: 'wcag21-aa', includeBestPractices: true })).toEqual(['image-alt', 'region']);
  });

  it('keeps an incomplete-only page as needs-review while the legacy threshold passes', async () => {
    const browser = fakeAxeBrowser();
    const saved = PAGE.violations;
    (PAGE as { violations: unknown }).violations = [];
    try {
      const out = await run(browser, { url: URL, standard: 'wcag21-aa' });

      expect(out.passed).toBe(true);
      expect(out.outcome).toMatchObject({ status: 'needs-review', severityThresholdMet: true, reviewRequired: true, needsReview: 1 });
      expect(out.outcome.scope).toContain('1 check needs manual review');
    } finally {
      (PAGE as { violations: unknown }).violations = saved;
    }
  });
});

describe('a backend without profile support (#1473)', () => {
  it('reports the requested profile as not applied when only Vibium measured the page', async () => {
    const vibium = {
      launch: vi.fn(async () => ok({})), navigate: vi.fn(async () => ok({})), quit: vi.fn(async () => ok(undefined)),
      checkAccessibility: vi.fn(async () => ok({ violations: [], passedRules: ['image-alt'], incompleteRules: [] })),
    } as unknown as VibiumClient;
    const vibiumService = new AccessibilityTesterService(memory, { useBrowserMode: true, preferAgentBrowser: false }, vibium);

    const report = await vibiumService.audit(URL, { wcagLevel: 'AA', profile: resolveAuditProfile('wcag22-aa') });

    expect(report.success && report.value.measured).toBe(true);
    expect(report.success && report.value.scan).toMatchObject({
      backend: 'vibium', requestedProfile: 'wcag22-aa@1', effectiveProfile: null, profileSupport: 'unsupported',
    });
  });
});
