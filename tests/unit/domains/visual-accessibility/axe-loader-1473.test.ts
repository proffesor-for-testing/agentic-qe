/**
 * #1473 review: the audit script always injects its own axe-core and checks it,
 * so a page-provided `axe` (a stub, or an element with id="axe") never produces
 * the results; a run where no rule produced a result is not measured; excluded
 * selectors go in axe.run's context; experimental rules are not counted for a tag.
 *
 * The generated browser script runs here in a Node vm against a fake page.
 */

import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { runAxeCore, AXE_CORE_VERSION } from '../../../../src/domains/visual-accessibility/services/accessibility-tester-browser';
import { AccessibilityTesterService } from '../../../../src/domains/visual-accessibility/services/accessibility-tester';
import { resolveAuditProfile } from '../../../../src/domains/visual-accessibility/services/audit-profile';
import type { IBrowserClient } from '../../../../src/integrations/browser';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { ok, err } from '../../../../src/shared/types';

type AxeLike = Record<string, unknown>;
const EMPTY = { violations: [], passes: [], incomplete: [], inapplicable: [] };

/** The stub from the review: it reports 4.8.4 and runs no rule. */
const STUB_AXE = { version: '4.8.4', getRules: () => [{}], run: async () => EMPTY };

/** An engine shaped like axe-core: 60 rules, one experimental rule tagged wcag21a. */
function engine(calls: unknown[][], results: unknown = { ...EMPTY, passes: [{ id: 'html-has-lang' }] }): AxeLike {
  const rules = [
    ...Array.from({ length: 59 }, (_, i) => ({ ruleId: `r${i}`, tags: ['wcag2a'] })),
    { ruleId: 'label-content-name-mismatch', tags: ['wcag21a', 'experimental'] },
  ];
  return {
    version: AXE_CORE_VERSION,
    getRules: (tags?: string[]) => (tags ? rules.filter((r) => r.tags.some((t) => tags.includes(t))) : rules),
    run: async (...args: unknown[]) => { calls.push(args); return results; },
  };
}

/** A fake page: `pageAxe` is what the page defines; `injected` is what our script tag installs on load. */
function pageClient(pageAxe: unknown, injected: AxeLike | null): IBrowserClient & { scripts: string[] } {
  const scripts: string[] = [];
  const evaluate = async (script: string) => {
    scripts.push(script);
    if (!script.includes('axe.run')) return ok(JSON.stringify({ status: 200, url: 'http://127.0.0.1/' }));
    const window: Record<string, unknown> = { axe: pageAxe };
    const document = {
      head: { appendChild: (tag: { onload: () => void }) => {
        if (injected) window.axe = injected;
        setTimeout(() => tag.onload(), 0);
      } },
      createElement: () => ({}),
    };
    try {
      return ok(await runInNewContext(script, { window, document, setTimeout, JSON }));
    } catch (error) {
      return err(error as Error);
    }
  };
  return {
    tool: 'agent-browser', scripts,
    launch: async () => ok({}), navigate: async () => ok({}), quit: async () => ok(undefined), evaluate,
  } as unknown as IBrowserClient & { scripts: string[] };
}

describe('the axe-core loader (#1473)', () => {
  it('injects its own engine even when the page defines axe, and uses the injected one', async () => {
    const calls: unknown[][] = [];
    const client = pageClient(STUB_AXE, engine(calls));

    const result = await runAxeCore(client, 'AA', { profile: resolveAuditProfile('wcag21-aa') });

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(result.success && result.value.engine?.version).toBe(AXE_CORE_VERSION);
  });

  it('refuses a page-provided axe stub that stays in place, instead of reporting a clean scan', async () => {
    const client = pageClient(STUB_AXE, null);

    const result = await runAxeCore(client, 'AA', { profile: resolveAuditProfile('wcag22-aa') });

    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toMatch(/did not load: the page defines its own axe/);
  });

  it('is not fooled by an element with id="axe"', async () => {
    const calls: unknown[][] = [];
    const client = pageClient({ tagName: 'DIV', id: 'axe' }, engine(calls));

    const result = await runAxeCore(client, 'AA');

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('reports a run in which no rule produced a result as an error, not a clean scan', async () => {
    const client = pageClient(null, engine([], EMPTY));

    const result = await runAxeCore(client, 'AA', { profile: resolveAuditProfile('wcag21-aa') });

    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toMatch(/no result for any rule/);
  });

  it('passes excluded selectors in the context argument and not in the options', async () => {
    const calls: unknown[][] = [];
    const client = pageClient(null, engine(calls));

    await runAxeCore(client, 'AA', { excludeSelectors: ['#ads', '.banner'] });

    const [context, options] = calls[0] as [unknown, Record<string, unknown>];
    expect(context).toEqual({ exclude: [['#ads'], ['.banner']] });
    expect(options).not.toHaveProperty('exclude');
  });

  it('counts only rules a tag filter runs: experimental rules are left out', async () => {
    const client = pageClient(null, engine([]));

    const result = await runAxeCore(client, 'AA', { profile: resolveAuditProfile('wcag21-aa') });

    expect(result.success && result.value.engine?.tagRuleCounts).toMatchObject({ wcag2a: 59, wcag21a: 0 });
  });
});

describe('a page whose axe stub runs no rule, through the audit service (#1473)', () => {
  it('is not measured, so it neither passes nor reports an applied profile', async () => {
    const memory = { get: async () => undefined, set: async () => undefined } as unknown as MemoryBackend;
    const service = new AccessibilityTesterService(memory, {
      browserClient: pageClient(STUB_AXE, null), useBrowserMode: true, preferAgentBrowser: true,
    });

    const report = await service.audit('http://127.0.0.1/', { wcagLevel: 'AA', profile: resolveAuditProfile('wcag22-aa') });

    expect(report.success).toBe(true);
    expect(report.success && report.value).toMatchObject({
      measured: false, score: -1,
      scan: { requestedProfile: 'wcag22-aa@1', effectiveProfile: null, profileSupport: 'not-run' },
    });
    expect(report.success && report.value.notMeasuredReason).toMatch(/page defines its own axe/);
  });
});
