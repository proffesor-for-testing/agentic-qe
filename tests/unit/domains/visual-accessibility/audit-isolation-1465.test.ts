/**
 * #1465 review: the shared accessibility audit service (behind accessibility_test
 * and qe/a11y/audit) must
 *  - give every audit its own agent-browser session, so parallel audits never
 *    read each other's pages, and never kill another session by name prefix;
 *  - report an error page (non-2xx main document) as not measured;
 *  - audit only http(s) URLs (local hosts allowed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IBrowserClient } from '../../../../src/integrations/browser/index.js';
import { ok } from '../../../../src/shared/types';
import { AccessibilityTesterService } from '../../../../src/domains/visual-accessibility/services/accessibility-tester';
import { auditUrlProblem } from '../../../../src/domains/visual-accessibility/services/audit-url-policy';
import { checkDocumentStatus } from '../../../../src/domains/visual-accessibility/services/accessibility-tester-browser';
import { sessionKillPattern } from '../../../../src/integrations/browser/agent-browser/command-executor';
import { A11yAuditTool } from '../../../../src/mcp/tools/visual-accessibility/index';

const browserIntegration = vi.hoisted(() => ({ getBrowserClientForUseCase: vi.fn() }));
vi.mock('../../../../src/integrations/browser/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBrowserClientForUseCase: browserIntegration.getBrowserClientForUseCase,
}));

const AXE_ONE_VIOLATION = {
  violations: [{
    id: 'image-alt', impact: 'critical', description: 'img alt', help: 'Images must have alternate text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/image-alt', tags: ['wcag2a', 'wcag111'],
    nodes: [{ selector: 'img', html: '<img src="x.png">', target: ['img'], failureSummary: 'Fix: add alt' }],
  }],
  passes: ['document-title'], incomplete: [], inapplicable: [],
};

/** Agent-browser double: the status script returns `status`; any other script returns the axe result. */
function agentBrowser(status: number, axe: unknown = AXE_ONE_VIOLATION, finalUrl?: string): IBrowserClient {
  return {
    tool: 'agent-browser',
    launch: vi.fn().mockResolvedValue(ok({ id: 'session' })),
    navigate: vi.fn().mockResolvedValue(ok({ url: 'http://127.0.0.1/', title: 't', loadTime: 1 })),
    evaluate: vi.fn(async (script: string) =>
      ok(script.includes("getEntriesByType('navigation')")
        ? (finalUrl ? JSON.stringify({ status, url: finalUrl }) : status)
        : JSON.stringify(axe))),
    quit: vi.fn().mockResolvedValue(ok(undefined)),
    isAvailable: vi.fn().mockResolvedValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockResolvedValue(ok({ interactiveElements: [] })),
  } as unknown as IBrowserClient;
}

function memory() {
  const store = new Map<string, unknown>();
  return {
    initialize: async () => {}, dispose: async () => {},
    get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v); },
    delete: async (k: string) => store.delete(k), has: async (k: string) => store.has(k),
    search: async () => [], vectorSearch: async () => [], storeVector: async () => {},
  } as never;
}

const launchSession = (client: IBrowserClient): string =>
  (client.launch as ReturnType<typeof vi.fn>).mock.calls[0][0].sessionName;

describe('#1465 per-audit browser sessions', () => {
  beforeEach(() => browserIntegration.getBrowserClientForUseCase.mockReset());

  it('gives each parallel audit its own client and its own aqe-a11y session', async () => {
    const clients = [agentBrowser(200), agentBrowser(200), agentBrowser(200)];
    clients.forEach((c) => browserIntegration.getBrowserClientForUseCase.mockResolvedValueOnce(c));
    const service = new AccessibilityTesterService(memory(), {});

    const results = await Promise.all(['a', 'b', 'c'].map((p) => service.audit(`http://127.0.0.1:8080/${p}.html`)));

    expect(results.every((r) => r.success && r.value.measured === true)).toBe(true);
    const sessions = clients.map(launchSession);
    expect(new Set(sessions).size).toBe(3);
    for (const name of sessions) expect(name).toMatch(new RegExp(`^aqe-a11y-${process.pid}-[0-9a-f-]{36}$`));
    for (const client of clients) expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('uses a fresh session for the contrast and keyboard checks too', async () => {
    const client = agentBrowser(200, { violations: [], passes: [] });
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(client);
    const service = new AccessibilityTesterService(memory(), {});

    await service.checkContrast('http://127.0.0.1/');

    expect(launchSession(client)).toMatch(/^aqe-a11y-/);
  });

  it('anchors the pkill pattern so one session never matches another by prefix', () => {
    const pattern = new RegExp(sessionKillPattern('aqe-a11y-1'));

    expect(pattern.test('node agent-browser --session aqe-a11y-1 open http://x')).toBe(true);
    expect(pattern.test('node agent-browser --session=aqe-a11y-1')).toBe(true);
    expect(pattern.test('node agent-browser --session aqe-a11y-12 open http://x')).toBe(false);
    expect(pattern.test('node agent-browser --session aqe-a11y-1-other open')).toBe(false);
    expect(pattern.test('node agent-browser --session default open')).toBe(false);
  });
});

describe('#1465 error pages are not measured', () => {
  beforeEach(() => browserIntegration.getBrowserClientForUseCase.mockReset());

  it.each([404, 500, 301])('reports HTTP %i as not measured with the status as the reason', async (status) => {
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(agentBrowser(status));
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.audit('http://127.0.0.1:8080/nope.html');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({
      measured: false, score: -1, violations: [], passes: [], notMeasuredReason: `the page returned HTTP ${status}`,
    });
  });

  it('audits a 2xx page', async () => {
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(agentBrowser(200));
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.audit('http://127.0.0.1:8080/ok.html');

    expect(result.success && result.value.measured).toBe(true);
    expect(result.success && result.value.violations.map((v) => v.id)).toEqual(['image-alt']);
  });

  it('reports the final URL after a redirect and keeps url as requested', async () => {
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(agentBrowser(200, AXE_ONE_VIOLATION, 'http://127.0.0.1:8080/new.html'));
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.audit('http://127.0.0.1:8080/old.html');

    expect(result.success && result.value).toMatchObject({
      measured: true, url: 'http://127.0.0.1:8080/old.html', finalUrl: 'http://127.0.0.1:8080/new.html',
    });
  });

  it('uses the requested url as finalUrl when the page does not report one', async () => {
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(agentBrowser(200));
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.audit('http://127.0.0.1:8080/ok.html');

    expect(result.success && result.value.finalUrl).toBe('http://127.0.0.1:8080/ok.html');
  });

  it('audits the page when the browser reports no status (0), the documented limitation', async () => {
    const status = await checkDocumentStatus(agentBrowser(0));

    expect(status.success).toBe(true);
  });
});

describe('#1465 audit URL policy', () => {
  it.each([
    'http://127.0.0.1:3000/', 'https://example.com/a?b=1', 'http://localhost/', 'http://10.0.0.5:8080/', 'http://[::1]:5173/',
  ])('allows %s', (url) => {
    expect(auditUrlProblem(url)).toBeNull();
  });

  it.each([
    ['file:///etc/hostname', 'file:'], ['javascript:alert(1)', 'javascript:'], ['data:text/html,x', 'data:'],
    ['ftp://example.com/', 'ftp:'], ['chrome://settings', 'chrome:'],
  ])('rejects %s', (url, scheme) => {
    expect(auditUrlProblem(url)).toContain(`url scheme ${scheme} is not allowed`);
  });

  it('rejects a relative or garbage url', () => {
    expect(auditUrlProblem('not a url')).toContain('not a valid absolute URL');
    expect(auditUrlProblem('')).toContain('non-empty');
  });

  it('the service returns a caller input error and loads nothing for a file: url', async () => {
    browserIntegration.getBrowserClientForUseCase.mockReset();
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.audit('file:///etc/hostname');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('CallerInputError');
    expect(browserIntegration.getBrowserClientForUseCase).not.toHaveBeenCalled();
  });

  it.each(['checkContrast', 'checkKeyboardNavigation'] as const)('%s rejects a file: url without a browser', async (method) => {
    browserIntegration.getBrowserClientForUseCase.mockReset();
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service[method]('file:///etc/hostname');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('CallerInputError');
    expect(browserIntegration.getBrowserClientForUseCase).not.toHaveBeenCalled();
  });

  it('validateWCAGLevel rejects a javascript: url as a caller input error', async () => {
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.validateWCAGLevel('javascript:alert(1)', 'AA');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.name).toBe('CallerInputError');
  });

  it('qe/a11y/audit rejects the call before auditing when any url is not http(s)', async () => {
    const tool = new A11yAuditTool();

    const result = await tool.execute(
      { urls: ['http://127.0.0.1/', 'javascript:alert(1)'] },
      { requestId: 'r1', startTime: Date.now() } as never,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('url scheme javascript: is not allowed');
  });
});
