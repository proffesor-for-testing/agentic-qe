/**
 * #1228: visual-accessibility never presents an unmeasured value as a measurement.
 *
 * - analyzeColorContrast returns the colours and ratio axe-core measured, not #000000 / #ffffff / 1.0
 * - the Vibium contrast check lists no synthetic passing elements (#333333 on #ffffff, 12.63)
 * - checkContrast / checkKeyboardNavigation run through the agent-browser client the audit uses
 * - the keyboard check does not claim a visible focus indicator it never checked
 * - the browser swarm audit runs axe-core instead of returning a placeholder score of 100
 * - security-visual-testing reports PII and layout shifts as not measured, not as clean
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from '../../../../src/shared/types';
import type { IBrowserClient } from '../../../../src/integrations/browser';
import { AccessibilityTesterService } from '../../../../src/domains/visual-accessibility/services/accessibility-tester';
import {
  extractContrastFromVibiumResult,
  checkKeyboardWithVibium,
} from '../../../../src/domains/visual-accessibility/services/accessibility-tester-browser';
import { VisualAccessibilityCoordinator } from '../../../../src/domains/visual-accessibility/coordinator';
import { BrowserSwarmCoordinator } from '../../../../src/domains/visual-accessibility/services/browser-swarm-coordinator';
import { SecurityVisualTestingSkill } from '../../../../src/skills/security-visual-testing/index';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend';
import { createCoordinatorTestContext } from '../coordinator-test-utils';

const browserIntegration = vi.hoisted(() => ({ getBrowserClientForUseCase: vi.fn() }));
vi.mock('../../../../src/integrations/browser/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getBrowserClientForUseCase: browserIntegration.getBrowserClientForUseCase,
}));

/** The summary axe-core 4.8 writes for a color-contrast failure. */
const AXE_SUMMARY = 'Fix any of the following:\n  Element has insufficient color contrast of 2.32 ' +
  '(foreground color: #aaaaaa, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). ' +
  'Expected contrast ratio of 4.5:1';

/** Agent-browser double whose evaluate() returns the given JSON for every script. */
function agentBrowser(evaluate: (script: string) => unknown): IBrowserClient {
  return {
    tool: 'agent-browser',
    launch: vi.fn().mockResolvedValue(ok({ id: 'session' })),
    navigate: vi.fn().mockResolvedValue(ok({ url: 'http://127.0.0.1/', title: 't', statusCode: 200, loadTime: 1 })),
    evaluate: vi.fn(async (script: string) => ok(JSON.stringify(evaluate(script)))),
    quit: vi.fn().mockResolvedValue(ok(undefined)),
    isAvailable: vi.fn().mockResolvedValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
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

describe('#1228 measured contrast values', () => {
  const axeAudit = {
    violations: [{
      id: 'color-contrast', impact: 'serious', description: 'contrast', help: 'contrast', tags: ['wcag2aa', 'wcag143'],
      nodes: [
        // check data from axe-core (the normal case)
        { selector: 'p.muted', html: '<p>', target: ['p.muted'], failureSummary: AXE_SUMMARY,
          contrast: { fgColor: '#aaaaaa', bgColor: '#ffffff', contrastRatio: 2.32, expectedContrastRatio: '4.5:1' } },
        // large text: axe-core requires 3:1
        { selector: 'h2', html: '<h2>', target: ['h2'], failureSummary: '',
          contrast: { fgColor: '#999999', bgColor: '#ffffff', contrastRatio: 2.85, expectedContrastRatio: '3:1' } },
        // no check data: values come from the summary text
        { selector: 'span', html: '<span>', target: ['span'], failureSummary: AXE_SUMMARY },
        // nothing reported: not measured, never a default colour
        { selector: 'em', html: '<em>', target: ['em'], failureSummary: 'Fix any of the following' },
      ],
    }],
    passes: ['html-has-lang'], incomplete: [], inapplicable: [],
  };

  it('analyzeColorContrast returns the colours and ratio axe-core measured', async () => {
    const ctx = createCoordinatorTestContext();
    const coord = new VisualAccessibilityCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { enableMinCutAwareness: false, enableConsensus: false, enableFlashAttention: false }, {},
      { preferAgentBrowser: false, browserClient: agentBrowser(() => axeAudit) }
    );
    await coord.initialize();
    const result = await coord.analyzeColorContrast({ url: 'http://127.0.0.1/', wcagLevel: 'AA' });
    await coord.dispose();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.issues).toEqual([
      { element: 'p.muted', foreground: '#aaaaaa', background: '#ffffff', ratio: 2.32, required: 4.5, measured: true },
      { element: 'h2', foreground: '#999999', background: '#ffffff', ratio: 2.85, required: 3, measured: true },
      { element: 'span', foreground: '#aaaaaa', background: '#ffffff', ratio: 2.32, required: 4.5, measured: true },
      { element: 'em', foreground: null, background: null, ratio: -1, required: 4.5, measured: false,
        notMeasuredReason: expect.stringContaining('did not report') },
    ]);
  });

  it('the Vibium contrast check lists no synthetic passing elements', () => {
    const result = extractContrastFromVibiumResult({
      passes: true, violations: [], passedRules: ['color-contrast'], incompleteRules: [],
      violationsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    } as never, 'AA');

    expect(result).toEqual({ success: true, value: [] });
    expect(JSON.stringify(result)).not.toMatch(/#333333|12\.63/);
  });

  it('the Vibium contrast check reads the values from the axe-core summary', () => {
    const result = extractContrastFromVibiumResult({
      passes: false, passedRules: [], incompleteRules: [],
      violationsBySeverity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      violations: [{ id: 'color-contrast', rule: 'color-contrast', impact: 'high', description: '', help: '',
        nodes: [{ selector: 'p', html: '<p>', target: ['p'], failureSummary: AXE_SUMMARY }] }],
    } as never, 'AA');

    expect(result.success && result.value).toEqual([expect.objectContaining({
      element: 'p', foreground: '#aaaaaa', background: '#ffffff', ratio: 2.32, requiredRatio: 4.5, passes: false, measured: true,
    })]);
  });
});

describe('#1228 contrast and keyboard checks use the agent-browser client', () => {
  beforeEach(() => browserIntegration.getBrowserClientForUseCase.mockReset());

  it('checkContrast is measured through the agent-browser client, with failing and passing elements', async () => {
    const client = agentBrowser(() => ({
      violations: [{ selector: 'p.muted', failureSummary: AXE_SUMMARY,
        contrast: { fgColor: '#aaaaaa', bgColor: '#ffffff', contrastRatio: 2.32, expectedContrastRatio: '4.5:1' } }],
      passes: [{ selector: 'h1', contrast: { fgColor: '#222222', bgColor: '#ffffff', contrastRatio: 15.91, expectedContrastRatio: '4.5:1' } }],
    }));
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(client);
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.checkContrast('http://127.0.0.1/');

    expect(browserIntegration.getBrowserClientForUseCase).toHaveBeenCalledWith('accessibility');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([
      expect.objectContaining({ element: 'p.muted', foreground: '#aaaaaa', background: '#ffffff', ratio: 2.32, passes: false, measured: true }),
      expect.objectContaining({ element: 'h1', foreground: '#222222', background: '#ffffff', ratio: 15.91, passes: true, measured: true }),
    ]);
    expect(String((client.evaluate as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("values: ['color-contrast']");
  });

  it('checkKeyboardNavigation is measured through the agent-browser client and leaves focus visibility unmeasured', async () => {
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(agentBrowser(() => ({
      focusable: [{ selector: 'a', tagName: 'A' }, { selector: 'button', tagName: 'BUTTON' }],
      violations: [{ id: 'tabindex', nodes: [{ selector: '#skip', failureSummary: 'tabindex > 0' }] }],
    })));
    const service = new AccessibilityTesterService(memory(), {});

    const result = await service.checkKeyboardNavigation('http://127.0.0.1/');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.focusableElements).toBe(2);
    expect(result.value.tabOrder.map((t) => [t.elementType, t.hasVisibleFocus])).toEqual([['link', null], ['button', null]]);
    expect(result.value.issues).toEqual([{ type: 'incorrect-tab-order', selector: '#skip', description: 'tabindex > 0' }]);
    expect(result.value.notMeasured?.join(' ')).toMatch(/focus indicator.*focus traps/);
  });

  it('reports NOT MEASURED with the browser error when neither client can run the check', async () => {
    const client = agentBrowser(() => ({}));
    (client.navigate as ReturnType<typeof vi.fn>).mockResolvedValue(err(new Error('net::ERR_NAME_NOT_RESOLVED')));
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(client);
    const service = new AccessibilityTesterService(memory(), {});

    const contrast = await service.checkContrast('https://example.invalid/');
    const keyboard = await service.checkKeyboardNavigation('https://example.invalid/');

    expect(contrast.success || contrast.error.message).toMatch(/Color contrast NOT MEASURED.*ERR_NAME_NOT_RESOLVED/);
    expect(keyboard.success || keyboard.error.message).toMatch(/Keyboard navigation NOT MEASURED.*ERR_NAME_NOT_RESOLVED/);
  });

  it('the Vibium keyboard check does not claim a visible focus indicator it never checked', async () => {
    const vibium = {
      launch: vi.fn().mockResolvedValue(ok(undefined)),
      navigate: vi.fn().mockResolvedValue(ok(undefined)),
      findElements: vi.fn().mockResolvedValue(ok([{ selector: 'a', tagName: 'a' }])),
      checkAccessibility: vi.fn().mockResolvedValue(err(new Error('Use axe-core-integration module'))),
      quit: vi.fn().mockResolvedValue(ok(undefined)),
    };

    const result = await checkKeyboardWithVibium(vibium as never, 'http://127.0.0.1/', 'AA', { headless: true, timeout: 1000 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.tabOrder[0].hasVisibleFocus).toBeNull();
    expect(result.value.notMeasured?.join(' ')).toContain('Use axe-core-integration module');
  });
});

describe('#1228 browser swarm accessibility audit', () => {
  it('runs axe-core in each viewport instead of returning a placeholder score of 100', async () => {
    const client = agentBrowser(() => ({
      violations: [{ id: 'image-alt', impact: 'critical', description: 'alt', help: 'alt', tags: ['wcag2a', 'wcag111'],
        nodes: [{ selector: 'img', html: '<img>', target: ['img'], failureSummary: 'no alt' }] }],
      passes: ['html-has-lang'], incomplete: [], inapplicable: [],
    }));
    (client as unknown as { setViewport: unknown }).setViewport = vi.fn().mockResolvedValue(ok(undefined));
    browserIntegration.getBrowserClientForUseCase.mockResolvedValue(client);
    const mem = new InMemoryBackend();
    await mem.initialize();
    const swarm = new BrowserSwarmCoordinator(mem, { enableMemoryMonitoring: false });
    await swarm.initialize([{ width: 375, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true }]);

    const result = await swarm.auditAllViewports('http://127.0.0.1/');
    await swarm.shutdown();

    expect(result.success).toBe(true);
    if (!result.success) return;
    const reports = [...result.value.reports.values()];
    expect(reports).toHaveLength(1);
    expect(reports[0].measured).toBe(true);
    expect(reports[0].violations.map((v) => v.id)).toEqual(['image-alt']);
    expect(reports[0].score).toBeLessThan(100);
    expect(result.value.aggregatedViolations).toBe(1);
  });
});

describe('#1228 security-visual-testing', () => {
  const viewport = { width: 375, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

  function skillWith(visualReport: unknown) {
    const coordinator = {
      runVisualTests: vi.fn().mockResolvedValue(ok(visualReport)),
      runAccessibilityAudit: vi.fn(),
    };
    const skill = new SecurityVisualTestingSkill(coordinator as never);
    // Skip browser start-up: these paths do not use the browser client
    Object.assign(skill, { initialized: true, browserClient: {} });
    return skill;
  }

  const visualReport = {
    totalTests: 1, passed: 0, failed: 0, newBaselines: 1, duration: 1,
    results: [{ url: 'https://app.test/profile', viewport, status: 'new',
      screenshot: { path: { value: '/tmp/profile.png' }, timestamp: new Date() } }],
  };

  it('detectPII reports the screenshot as not scanned, not as free of PII', async () => {
    const result = await skillWith(visualReport).detectPII('/tmp/profile.png');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.detected).toBeNull();
    expect(result.value.measured).toBe(false);
    expect(result.value.confidence).toBe(-1);
    expect(result.value.notMeasuredReason).toContain('PII NOT MEASURED');
  });

  it('the audit counts no PII result as a measured "none found"', async () => {
    const result = await skillWith(visualReport).executeSecurityVisualAudit({
      urls: ['https://app.test/profile'], viewports: [viewport],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.summary.piiDetections).toBe(-1);
    expect(result.value.piiDetections).toEqual([expect.objectContaining({
      detected: null, measured: false, confidence: -1, screenshot: { original: '/tmp/profile.png' },
    })]);
    expect(result.value.recommendations).toContainEqual(expect.objectContaining({
      type: 'pii', description: expect.stringContaining('PII NOT MEASURED for 1 screenshot(s)'),
    }));
  });

  it('layout shifts are reported as not measured, not as "No significant layout shifts detected"', async () => {
    const result = await skillWith(visualReport).executeResponsiveVisualAudit({
      url: 'https://app.test/profile', viewports: [viewport], detectLayoutShifts: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.layoutShifts).toEqual([]);
    expect(result.value.layoutShiftsMeasured).toBe(false);
    expect(result.value.layoutShiftsNotMeasuredReason).toContain('not compared');
    // A new baseline was compared with nothing: no 0% diff, no failure
    expect(result.value.visualRegressions).toEqual([{ viewport, diffPercentage: -1, status: 'new' }]);
  });
});
