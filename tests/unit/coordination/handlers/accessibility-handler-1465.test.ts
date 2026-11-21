/**
 * #1465: the test-accessibility task (behind the accessibility_test MCP tool)
 * runs the real audit service and maps its report faithfully. When nothing
 * was measured the result says why and carries no findings or verdict (#1145).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  runAccessibilityTest,
  type AccessibilityAuditor,
} from '../../../../src/coordination/handlers/accessibility-handler';
import { registerMiscHandlers } from '../../../../src/coordination/handlers/misc-handlers';
import type { AccessibilityReport } from '../../../../src/domains/visual-accessibility/interfaces';
import { ok, err } from '../../../../src/shared/types';
// Side-effect import: domain-handler-configs participates in a circular import.
import '../../../../src/mcp/handlers/domain-handlers';
import { accessibilityTestConfig } from '../../../../src/mcp/handlers/domain-handler-configs.js';

const URL = 'http://127.0.0.1:18990/';

function measuredReport(overrides: Partial<AccessibilityReport> = {}): AccessibilityReport {
  return {
    url: URL,
    timestamp: new Date(),
    violations: [{
      id: 'image-alt',
      impact: 'critical',
      wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
      description: 'Images must have alternate text',
      help: 'Images must have alternate text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      nodes: [{ selector: 'img', html: '<img src="a.png">', target: ['img'], failureSummary: 'Fix: add alt' }],
    }],
    passes: [{ id: 'document-title', description: 'Documents must have a title', nodes: 1 }],
    incomplete: [{ id: 'color-contrast', description: 'Contrast unknown', reason: 'background image', nodes: [] }],
    score: 72,
    wcagLevel: 'AA',
    measured: true,
    ...overrides,
  } as AccessibilityReport;
}

function auditorReturning(result: unknown): AccessibilityAuditor & { audit: ReturnType<typeof vi.fn> } {
  return { audit: vi.fn().mockResolvedValue(result) };
}

describe('runAccessibilityTest (#1465)', () => {
  it('maps a measured audit: violations, score, verdict and passed rules', async () => {
    const auditor = auditorReturning(ok(measuredReport()));

    const result = await runAccessibilityTest(auditor, { url: URL, standard: 'wcag22-aa' });

    expect(auditor.audit).toHaveBeenCalledWith(URL, { wcagLevel: 'AA', includeWarnings: true });
    expect(result).toMatchObject({
      url: URL, standard: 'wcag22-aa', wcagLevel: 'AA', measured: true, score: 72,
      passed: false, passedRules: 1,
      warnings: [{ id: 'color-contrast', description: 'Contrast unknown', nodes: 0 }],
    });
    expect(result.violations).toEqual([{
      id: 'image-alt', impact: 'critical', description: 'Images must have alternate text',
      help: 'Images must have alternate text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      wcagCriteria: ['1.1.1'],
      nodes: [{ selector: 'img', html: '<img src="a.png">', failureSummary: 'Fix: add alt' }],
    }]);
    expect(result.notMeasuredReason).toBeUndefined();
    expect(result.note).toBeUndefined();
  });

  it('passes a measured page that has only minor or moderate violations', async () => {
    const report = measuredReport();
    const auditor = auditorReturning(ok(measuredReport({
      violations: [{ ...report.violations[0], impact: 'moderate' }], score: 95,
    })));

    const result = await runAccessibilityTest(auditor, { url: URL });

    expect(result).toMatchObject({ measured: true, passed: true, score: 95, standard: 'wcag21-aa' });
  });

  it('asks for AAA when the standard is wcag21-aaa', async () => {
    const auditor = auditorReturning(ok(measuredReport()));

    await runAccessibilityTest(auditor, { url: URL, standard: 'wcag21-aaa' });

    expect(auditor.audit).toHaveBeenCalledWith(URL, { wcagLevel: 'AAA', includeWarnings: true });
  });

  it('reports unmeasured with the service reason when no browser loaded the page', async () => {
    const reason = 'no browser is available (install agent-browser or connect Vibium) to load the page';
    const auditor = auditorReturning(ok(measuredReport({
      measured: false, notMeasuredReason: reason, violations: [], passes: [], score: -1,
    })));

    const result = await runAccessibilityTest(auditor, { url: URL });

    expect(result).toMatchObject({
      measured: false, passed: false, score: -1, violations: [], warnings: [], passedRules: 0,
      notMeasuredReason: reason,
    });
    expect(result.note).toContain('NOT MEASURED');
    expect(result.note).toContain(reason);
    expect(result.note).toContain('agent-browser');
    expect(result.note).not.toMatch(/puppeteer|playwright/i);
  });

  it('reports unmeasured with the error when the service returns an error', async () => {
    const auditor = auditorReturning(err(new Error('Failed to navigate to http://127.0.0.1:18990/')));

    const result = await runAccessibilityTest(auditor, { url: URL });

    expect(result).toMatchObject({ measured: false, score: -1, violations: [] });
    expect(result.notMeasuredReason).toBe('the audit failed: Failed to navigate to http://127.0.0.1:18990/');
  });

  it('reports unmeasured with the error when the service throws', async () => {
    const auditor: AccessibilityAuditor = { audit: vi.fn().mockRejectedValue(new Error('spawn npx ENOENT')) };

    const result = await runAccessibilityTest(auditor, { url: URL });

    expect(result).toMatchObject({ measured: false, score: -1, passed: false, violations: [] });
    expect(result.notMeasuredReason).toBe('the audit failed: spawn npx ENOENT');
  });

  it('does not call the service when no url is given', async () => {
    const auditor = auditorReturning(ok(measuredReport()));

    const result = await runAccessibilityTest(auditor, {});

    expect(auditor.audit).not.toHaveBeenCalled();
    expect(result).toMatchObject({ measured: false, score: -1, notMeasuredReason: 'no url was given, so no page was loaded' });
  });
});

describe('test-accessibility handler registration (#1465)', () => {
  it('runs the real audit service instead of returning a fixed unmeasured stub', async () => {
    vi.resetModules();
    const audit = vi.fn().mockResolvedValue(ok(measuredReport()));
    const dispose = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../../../src/domains/visual-accessibility/services/accessibility-tester.js', () => ({
      AccessibilityTesterService: class { audit = audit; dispose = dispose; },
    }));
    const { registerMiscHandlers: register } = await import('../../../../src/coordination/handlers/misc-handlers');
    const handlers = new Map<string, (task: unknown) => Promise<unknown>>();
    register({
      registerHandler: (type: string, handler: (task: unknown) => Promise<unknown>) => handlers.set(type, handler),
      memory: {},
    } as never);

    const result = await handlers.get('test-accessibility')!({ payload: { url: URL } }) as
      { success: boolean; value: { measured: boolean; score: number; violations: unknown[] } };

    expect(audit).toHaveBeenCalledWith(URL, { wcagLevel: 'AA', includeWarnings: true });
    expect(dispose).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.value).toMatchObject({ measured: true, score: 72 });
    expect(result.value.violations).toHaveLength(1);
    vi.doUnmock('../../../../src/domains/visual-accessibility/services/accessibility-tester.js');
  });

  it('still registers the handler from the static module', () => {
    const types: string[] = [];
    registerMiscHandlers({ registerHandler: (type: string) => types.push(type), memory: {} } as never);

    expect(types).toContain('test-accessibility');
  });
});

describe('accessibilityTestConfig.mapToResult (#1465)', () => {
  const map = (data: Record<string, unknown>) => accessibilityTestConfig.mapToResult('task-1', data, 5);

  it('passes the not-measured reason through to the MCP result', () => {
    const result = map({ measured: false, score: -1, passed: false, notMeasuredReason: 'no browser', note: 'n' });

    expect(result).toMatchObject({ status: 'not-measured', measured: false, notMeasuredReason: 'no browser', score: -1 });
    expect(result.passedRules).toBeUndefined();
  });

  it('keeps passed rules and drops a reason on a measured result', () => {
    const result = map({ measured: true, score: 72, passed: false, passedRules: 12, violations: [{ id: 'image-alt' }] });

    expect(result).toMatchObject({ status: 'completed', measured: true, score: 72, passedRules: 12, passed: false });
    expect(result.notMeasuredReason).toBeUndefined();
  });

  it('never reports passed for an unmeasured result', () => {
    const result = map({ measured: false, passed: true, score: 100 });

    expect(result.passed).toBe(false);
  });
});
