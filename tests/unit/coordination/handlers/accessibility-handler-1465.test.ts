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
import { CallerInputError } from '../../../../src/shared/error-utils';
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

    expect(auditor.audit).toHaveBeenCalledWith(URL, {
      wcagLevel: 'AA', includeWarnings: true, profile: expect.objectContaining({ id: 'wcag22-aa@1' }),
    });
    expect(result).toMatchObject({
      url: URL, standard: 'wcag22-aa', wcagLevel: 'AA', measured: true, score: 72,
      passed: false, passedRules: 1,
      warnings: [{ id: 'color-contrast', description: 'Contrast unknown', nodes: 0 }],
      finalUrl: URL,
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

    expect(auditor.audit).toHaveBeenCalledWith(URL, {
      wcagLevel: 'AAA', includeWarnings: true, profile: expect.objectContaining({ id: 'wcag21-aaa@1' }),
    });
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

  it('does not tell the caller to install a browser when the page was an error page', async () => {
    const auditor = auditorReturning(ok(measuredReport({
      measured: false, notMeasuredReason: 'the page returned HTTP 404', violations: [], passes: [], score: -1,
    })));

    const result = await runAccessibilityTest(auditor, { url: URL });

    expect(result).toMatchObject({ measured: false, score: -1, notMeasuredReason: 'the page returned HTTP 404' });
    expect(result.note).toContain('error page');
    expect(result.note).not.toContain('npm install');
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

  it.each([
    [undefined, 'url must be a non-empty http or https URL'],
    ['file:///etc/hostname', 'url scheme file: is not allowed'],
    ['javascript:alert(1)', 'url scheme javascript: is not allowed'],
    ['data:text/html,<p>x</p>', 'url scheme data: is not allowed'],
    ['not a url', 'url is not a valid absolute URL'],
  ])('rejects %s as a caller input error without calling the service', async (url, message) => {
    const auditor = auditorReturning(ok(measuredReport()));

    const run = runAccessibilityTest(auditor, { url: url as string | undefined });

    await expect(run).rejects.toMatchObject({ name: 'CallerInputError', message: expect.stringContaining(message) });
    expect(auditor.audit).not.toHaveBeenCalled();
  });

  it('allows a local dev server url', async () => {
    const auditor = auditorReturning(ok(measuredReport()));

    await runAccessibilityTest(auditor, { url: 'http://localhost:3000/' });

    expect(auditor.audit).toHaveBeenCalledWith('http://localhost:3000/', expect.anything());
  });

  it('rejects an unsupported standard instead of auditing at another level', async () => {
    const auditor = auditorReturning(ok(measuredReport()));

    const run = runAccessibilityTest(auditor, { url: URL, standard: 'wcag22-aaa' });

    await expect(run).rejects.toMatchObject({ name: 'CallerInputError', message: expect.stringContaining('wcag22-aaa') });
    expect(auditor.audit).not.toHaveBeenCalled();
  });

  it('passes a caller input error from the service through instead of calling it unmeasured', async () => {
    const auditor = auditorReturning(err(new CallerInputError('url scheme ftp: is not allowed')));

    await expect(runAccessibilityTest(auditor, { url: URL })).rejects.toBeInstanceOf(CallerInputError);
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

    expect(audit).toHaveBeenCalledWith(URL, {
      wcagLevel: 'AA', includeWarnings: true, profile: expect.objectContaining({ id: 'wcag21-aa@1' }),
    });
    expect(dispose).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.value).toMatchObject({ measured: true, score: 72 });
    expect(result.value.violations).toHaveLength(1);
    vi.doUnmock('../../../../src/domains/visual-accessibility/services/accessibility-tester.js');
  });

  it('returns a caller input error as a failed task, not as a result', async () => {
    const handlers = new Map<string, (task: unknown) => Promise<unknown>>();
    registerMiscHandlers({
      registerHandler: (type: string, handler: (task: unknown) => Promise<unknown>) => handlers.set(type, handler),
      memory: {},
    } as never);

    const result = await handlers.get('test-accessibility')!({ payload: { url: 'file:///etc/passwd' } }) as
      { success: boolean; error?: Error };

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(CallerInputError);
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

  it('echoes url, finalUrl, standard and WCAG level so the audited page and level are visible', () => {
    const result = map({ measured: true, score: 90, url: URL, finalUrl: `${URL}home`, standard: 'wcag22-aa', wcagLevel: 'AA' });

    expect(result).toMatchObject({ url: URL, finalUrl: `${URL}home`, standard: 'wcag22-aa', wcagLevel: 'AA' });
  });

  it('drops finalUrl from an unmeasured result', () => {
    const result = map({ measured: false, url: URL, finalUrl: URL });

    expect(result.finalUrl).toBeUndefined();
  });

  it.each([
    [{ url: 'file:///etc/hostname' }, 'url scheme file: is not allowed'],
    [{ url: 'javascript:alert(1)' }, 'url scheme javascript: is not allowed'],
    [{ url: URL, standard: 'wcag22-aaa' }, 'is not supported'],
  ])('mapToPayload rejects %j as a caller input error', (params, message) => {
    const build = () => accessibilityTestConfig.mapToPayload(params as never, null);

    expect(build).toThrow(CallerInputError);
    expect(build).toThrow(message);
  });

  it('mapToPayload keeps a supported standard and defaults to wcag21-aa', () => {
    expect(accessibilityTestConfig.mapToPayload({ url: URL, standard: 'section508' }, null)).toMatchObject({ standard: 'section508' });
    expect(accessibilityTestConfig.mapToPayload({ url: URL }, null)).toMatchObject({ standard: 'wcag21-aa', url: URL });
  });

  it('never reports passed for an unmeasured result', () => {
    const result = map({ measured: false, passed: true, score: 100 });

    expect(result.passed).toBe(false);
  });
});
