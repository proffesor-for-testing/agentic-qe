/**
 * AccessibilityTesterService against a real browser (agent-browser) and a
 * local HTTP fixture server (#1465). Only http(s) pages are audited, so the
 * fixtures are served over http rather than as data: URLs.
 *
 * Needs agent-browser (npm install -g agent-browser && agent-browser install).
 * Skipped in CI and when agent-browser is unavailable. *.e2e.test.ts files are
 * excluded from the default vitest config; run this file with a config that
 * includes it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execSync } from 'node:child_process';
import { AccessibilityTesterService } from '../../../src/domains/visual-accessibility/services/accessibility-tester';
import { liveAuditSessions } from '../../../src/integrations/browser/agent-browser/audit-sessions';
import type { MemoryBackend, VectorSearchResult } from '../../../src/kernel/interfaces';

const BROWSER_TIMEOUT = 90000;

let agentBrowserAvailable = false;
try {
  const output = execSync('npx --no-install agent-browser 2>&1 || true', { encoding: 'utf-8', stdio: 'pipe', timeout: 15000 });
  agentBrowserAvailable = output.includes('agent-browser') && output.includes('Usage:');
} catch {
  agentBrowserAvailable = false;
}
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const describeIfAvailable = (!isCI && agentBrowserAvailable) ? describe : describe.skip;

class TestMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();
  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}
  async set<T>(key: string, value: T): Promise<void> { this.store.set(key, value); }
  async get<T>(key: string): Promise<T | undefined> { return this.store.get(key) as T | undefined; }
  async delete(key: string): Promise<boolean> { return this.store.delete(key); }
  async has(key: string): Promise<boolean> { return this.store.has(key); }
  async search(): Promise<string[]> { return []; }
  async vectorSearch(): Promise<VectorSearchResult[]> { return []; }
  async storeVector(): Promise<void> {}
}

const PAGES: Record<string, string> = {
  '/bad.html': `<!DOCTYPE html><html><head><title>Bad</title></head><body>
    <img src="image.jpg"><input type="text">
    <p style="color: #bbb; background: #fff;">Low contrast text</p></body></html>`,
  '/good.html': `<!DOCTYPE html><html lang="en"><head><title>Good</title></head><body><main>
    <h1>Welcome</h1><img src="image.jpg" alt="A description">
    <label for="email">Email</label><input type="email" id="email">
    <button type="button">Send</button></main></body></html>`,
};

describeIfAvailable('AccessibilityTesterService with agent-browser (#1465)', () => {
  let server: Server;
  let base = '';
  let service: AccessibilityTesterService;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/moved') {
        res.writeHead(302, { Location: '/good.html' });
        res.end();
        return;
      }
      const page = PAGES[req.url ?? ''];
      res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
      res.end(page ?? '<!DOCTYPE html><html><head><title>Not found</title></head><body>404</body></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    service = new AccessibilityTesterService(new TestMemoryBackend());
  });

  afterAll(async () => {
    await service.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('measures a page with known violations', async () => {
    const result = await service.audit(`${base}/bad.html`, { wcagLevel: 'AA' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.measured).toBe(true);
    expect(result.value.violations.map((v) => v.id)).toEqual(expect.arrayContaining(['image-alt', 'label']));
    expect(result.value.score).toBeLessThan(100);
  }, BROWSER_TIMEOUT);

  it('measures a clean page with no violations', async () => {
    const result = await service.audit(`${base}/good.html`, { wcagLevel: 'AA' });

    expect(result.success && result.value.measured).toBe(true);
    expect(result.success && result.value.violations).toEqual([]);
  }, BROWSER_TIMEOUT);

  it('runs parallel audits in separate sessions without mixing their pages', async () => {
    const [bad, good, bad2] = await Promise.all([
      service.audit(`${base}/bad.html`), service.audit(`${base}/good.html`), service.audit(`${base}/bad.html`),
    ]);

    expect(bad.success && bad.value.violations.length).toBeGreaterThan(0);
    expect(bad2.success && bad2.value.violations.length).toBeGreaterThan(0);
    expect(good.success && good.value.violations).toEqual([]);
    expect(liveAuditSessions()).toEqual([]);
  }, BROWSER_TIMEOUT);

  it('reports a 404 page as not measured', async () => {
    const result = await service.audit(`${base}/missing.html`);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ measured: false, score: -1, notMeasuredReason: 'the page returned HTTP 404' });
  }, BROWSER_TIMEOUT);

  it('reports the final URL after a redirect, keeping the requested url', async () => {
    const result = await service.audit(`${base}/moved`);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ measured: true, url: `${base}/moved`, finalUrl: `${base}/good.html` });
  }, BROWSER_TIMEOUT);

  it('measures colour contrast and keyboard navigation', async () => {
    const contrast = await service.checkContrast(`${base}/bad.html`);
    const keyboard = await service.checkKeyboardNavigation(`${base}/good.html`);

    expect(contrast.success).toBe(true);
    expect(contrast.success && contrast.value.some((c) => !c.passes)).toBe(true);
    expect(keyboard.success).toBe(true);
    expect(keyboard.success && keyboard.value.tabOrder.length).toBeGreaterThan(0);
  }, BROWSER_TIMEOUT);

  it('rejects a data: url without loading it', async () => {
    const result = await service.audit('data:text/html,<p>x</p>');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('CallerInputError');
  });
});
