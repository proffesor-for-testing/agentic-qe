/**
 * #1473: rule profiles against a real browser (agent-browser), real axe-core
 * and a loopback HTTP fixture. A WCAG 2.2-only defect (target-size) is
 * reported for wcag22-aa and not for wcag21-aa; a common A defect (image-alt)
 * is reported for both; a best-practice-only defect (region) only on request.
 * Each run is compared with axe-core run directly on the same page with the
 * same tags. A clean page and an incomplete-only page cover the other outcomes.
 *
 * Needs agent-browser (npm install -g agent-browser && agent-browser install),
 * and network access for the axe-core script the audit loads. Skipped in CI and
 * when agent-browser is unavailable. *.e2e.test.ts files are excluded from the
 * default vitest config; run this file with a config that includes it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execSync } from 'node:child_process';
import { AccessibilityTesterService } from '../../../src/domains/visual-accessibility/services/accessibility-tester';
import { resolveAuditProfile } from '../../../src/domains/visual-accessibility/services/audit-profile';
import { buildAuditOutcome } from '../../../src/domains/visual-accessibility/services/audit-outcome';
import { AXE_LOADER_JS } from '../../../src/domains/visual-accessibility/services/accessibility-tester-browser';
import { getBrowserClientForUseCase } from '../../../src/integrations/browser';
import { liveAuditSessions, newAuditSessionName } from '../../../src/integrations/browser/agent-browser/audit-sessions';
import type { MemoryBackend } from '../../../src/kernel/interfaces';

const BROWSER_TIMEOUT = 120000;

let agentBrowserAvailable = false;
try {
  const output = execSync('npx --no-install agent-browser 2>&1 || true', { encoding: 'utf-8', stdio: 'pipe', timeout: 15000 });
  agentBrowserAvailable = output.includes('agent-browser') && output.includes('Usage:');
} catch {
  agentBrowserAvailable = false;
}
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const describeIfAvailable = (!isCI && agentBrowserAvailable) ? describe : describe.skip;

const memory = { get: async () => undefined, set: async () => undefined } as unknown as MemoryBackend;

const TINY = 'style="width:10px;height:10px;padding:0;margin:0;border:0"';
const PAGES: Record<string, string> = {
  // image-alt (WCAG 2.0 A), target-size (WCAG 2.2 AA only), region (best-practice only)
  '/mixed.html': `<!DOCTYPE html><html lang="en"><head><title>Mixed</title></head><body>
    <h1>Mixed</h1><img src="x.png">
    <div><button type="button" aria-label="one" ${TINY}></button><button type="button" aria-label="two" ${TINY}></button></div>
    </body></html>`,
  '/clean.html': `<!DOCTYPE html><html lang="en"><head><title>Clean</title></head><body><main>
    <h1>Welcome</h1><img src="x.png" alt="A description"><label for="e">Email</label><input id="e" type="email">
    <button type="button">Send</button></main></body></html>`,
  // Contrast over a gradient cannot be decided: incomplete only
  '/review.html': `<!DOCTYPE html><html lang="en"><head><title>Review</title></head><body><main>
    <h1>Review</h1><p style="color:#777;background-image:linear-gradient(#fff,#eee)">Text over a gradient</p></main></body></html>`,
};

describeIfAvailable('rule profiles with agent-browser and axe-core (#1473)', () => {
  let server: Server;
  let base = '';
  let service: AccessibilityTesterService;

  /** axe-core run directly on the page with the given tags: violation ids and the engine version. */
  async function directAxe(path: string, tags: readonly string[]): Promise<{ violations: string[]; version: string }> {
    const client = await getBrowserClientForUseCase('accessibility');
    await client.launch({ headless: true, sessionName: newAuditSessionName() });
    try {
      await client.navigate(`${base}${path}`);
      const result = await client.evaluate<string>(`(async function() { ${AXE_LOADER_JS}
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(tags)} } });
        return JSON.stringify({ violations: r.violations.map(v => v.id).sort(), version: axe.version }); })();`);
      if (!result.success) throw result.error;
      return JSON.parse(result.value);
    } finally {
      await client.quit();
    }
  }

  async function audit(path: string, standard: string, includeBestPractices = false) {
    const profile = resolveAuditProfile(standard, { includeBestPractices });
    const result = await service.audit(`${base}${path}`, { wcagLevel: profile.wcagLevel, profile });
    if (!result.success) throw result.error;
    return { profile, report: result.value };
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      const page = PAGES[req.url ?? ''];
      res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
      res.end(page ?? 'not found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    service = new AccessibilityTesterService(memory);
  });

  afterAll(async () => {
    await service.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(liveAuditSessions()).toEqual([]);
  });

  it('runs target-size for wcag22-aa only, and matches axe-core run directly', async () => {
    const wcag21 = await audit('/mixed.html', 'wcag21-aa');
    const wcag22 = await audit('/mixed.html', 'wcag22-aa');

    const ids = (r: typeof wcag21) => r.report.violations.map((v) => v.id).sort();
    expect(ids(wcag21)).toEqual(['image-alt']);
    expect(ids(wcag22)).toEqual(['image-alt', 'target-size']);
    expect(wcag21.report.scan?.executedRules).not.toContain('target-size');
    expect(wcag22.report.scan?.executedRules).toContain('target-size');
    expect(wcag22.report.scan).toMatchObject({
      backend: 'agent-browser', effectiveProfile: 'wcag22-aa@1', profileSupport: 'applied',
      appliedTags: wcag22.profile.axeTags,
    });

    const direct21 = await directAxe('/mixed.html', wcag21.profile.axeTags);
    const direct22 = await directAxe('/mixed.html', wcag22.profile.axeTags);
    expect(ids(wcag21)).toEqual(direct21.violations);
    expect(ids(wcag22)).toEqual(direct22.violations);
    expect(wcag22.report.scan?.engine?.version).toBe(direct22.version);
  }, BROWSER_TIMEOUT);

  it('runs best-practice rules only on request, and section508 without 2.1/2.2 rules', async () => {
    const withBestPractices = await audit('/mixed.html', 'wcag21-aa', true);
    const section508 = await audit('/mixed.html', 'section508');

    expect(withBestPractices.report.violations.map((v) => v.id)).toContain('region');
    expect(withBestPractices.report.scan?.effectiveProfile).toBe('wcag21-aa+best-practice@1');
    expect(section508.report.violations.map((v) => v.id)).toEqual(['image-alt']);
    expect(section508.report.scan?.appliedTags).toEqual(['wcag2a', 'wcag2aa']);
    expect(section508.report.scan?.limitations.join(' ')).toMatch(/automated WCAG 2\.0 A\/AA rules of the Section 508/);
  }, BROWSER_TIMEOUT);

  it('reports a clean page as no automated violations, and an incomplete-only page as needs review', async () => {
    const clean = await audit('/clean.html', 'wcag22-aa');
    const review = await audit('/review.html', 'wcag22-aa');

    const outcomeOf = (r: typeof clean) => buildAuditOutcome({
      measured: r.report.measured === true, scan: r.report.scan, violations: r.report.violations,
      needsReview: r.report.incomplete.length,
    });
    expect(clean.report.violations).toEqual([]);
    expect(clean.report.incomplete).toEqual([]);
    expect(outcomeOf(clean).status).toBe('no-automated-violations');
    expect(review.report.violations).toEqual([]);
    expect(review.report.incomplete.map((i) => i.id)).toEqual(['color-contrast']);
    expect(outcomeOf(review)).toMatchObject({ status: 'needs-review', severityThresholdMet: true, reviewRequired: true });
  }, BROWSER_TIMEOUT);
});
