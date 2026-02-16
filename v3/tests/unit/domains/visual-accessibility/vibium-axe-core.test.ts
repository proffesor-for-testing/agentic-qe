/**
 * Axe-Core Integration Tests
 * Split from vibium-visual-testing.test.ts
 * GOAP Action A2.2: Tests for axe-core-integration service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VibiumClient } from '../../../../src/integrations/vibium/types.js';

import {
  injectAxeCore,
  runAxeAudit,
  parseAxeResults,
  runCompleteAxeAudit,
  AxeCoreInjectionError,
  AxeCoreAuditError,
  WCAG_TAG_MAP,
  WCAG_CRITERIA_MAP,
  FIX_SUGGESTIONS,
  AXE_CORE_CDN_URL,
  type AxeResults,
  type AxeViolation,
  type AxeOptions,
} from '../../../../src/domains/visual-accessibility/services/axe-core-integration.js';
import { ok, err } from '../../../../src/shared/types/index.js';

describe('axe-core-integration', () => {
  let mockVibiumClient: VibiumClient;
  let evaluateFunction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    evaluateFunction = vi.fn();

    mockVibiumClient = {
      evaluate: evaluateFunction,
      navigate: vi.fn(),
      screenshot: vi.fn(),
      getSession: vi.fn(),
      launch: vi.fn(),
      close: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      findElement: vi.fn(),
      getText: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      waitForElement: vi.fn(),
      compareScreenshots: vi.fn(),
    } as unknown as VibiumClient;
  });

  describe('injectAxeCore', () => {
    it('should detect already loaded axe-core', async () => {
      evaluateFunction.mockResolvedValueOnce({ success: true, value: true });

      const result = await injectAxeCore(mockVibiumClient);

      expect(result.success).toBe(true);
      expect(evaluateFunction).toHaveBeenCalledTimes(1);
    });

    it('should load axe-core from CDN', async () => {
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false })
        .mockResolvedValueOnce({ success: true, value: true });

      const result = await injectAxeCore(mockVibiumClient, { useCDN: true });

      expect(result.success).toBe(true);
      expect(evaluateFunction).toHaveBeenCalledTimes(2);
    });

    it('should return error when CDN fails and no fallback', async () => {
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false })
        .mockResolvedValueOnce({ success: false, error: new Error('CDN load failed') });

      const result = await injectAxeCore(mockVibiumClient, { useCDN: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AxeCoreInjectionError);
        expect(result.error.message).toContain('Failed to inject axe-core');
      }
    });

    it('should respect timeout option', async () => {
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false })
        .mockResolvedValueOnce({ success: true, value: true });

      await injectAxeCore(mockVibiumClient, { timeout: 5000 });

      const lastCall = evaluateFunction.mock.calls[evaluateFunction.mock.calls.length - 1];
      expect(lastCall[0]).toContain('5000');
    });

    it('should handle injection errors gracefully', async () => {
      evaluateFunction.mockResolvedValue({ success: false, error: new Error('Script execution failed') });

      const result = await injectAxeCore(mockVibiumClient);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AxeCoreInjectionError);
        expect(result.error.message).toContain('Failed to inject axe-core');
      }
    });
  });

  describe('runAxeAudit', () => {
    const mockAxeResults: AxeResults = {
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          tags: ['wcag2aa', 'wcag143'],
          description: 'Ensures the contrast between text and background meets WCAG requirements',
          help: 'Elements must have sufficient color contrast',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/color-contrast',
          nodes: [
            {
              html: '<button>Click Me</button>',
              impact: 'serious',
              target: ['.button-class'],
              failureSummary: 'Element has insufficient color contrast',
              any: [
                {
                  id: 'color-contrast',
                  impact: 'serious',
                  message: 'Element has insufficient color contrast of 2.5:1',
                },
              ],
              all: [],
              none: [],
            },
          ],
        },
      ],
      passes: [
        {
          id: 'document-title',
          impact: null,
          tags: ['wcag2a'],
          description: 'Ensures document has a title',
          help: 'Documents must have <title> element',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/document-title',
          nodes: [],
        },
      ],
      incomplete: [],
      inapplicable: [],
      timestamp: new Date().toISOString(),
      url: 'https://example.com',
      testEnvironment: {
        userAgent: 'Mozilla/5.0',
        windowWidth: 1280,
        windowHeight: 720,
        orientationAngle: 0,
        orientationType: 'landscape-primary',
      },
      testRunner: { name: 'axe' },
      toolOptions: { reporter: 'v2' },
    };

    beforeEach(() => {
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: undefined })
        .mockResolvedValueOnce({ success: true, value: mockAxeResults });
    });

    it('should run axe audit successfully', async () => {
      const result = await runAxeAudit(mockVibiumClient);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.violations).toHaveLength(1);
        expect(result.value.violations[0].id).toBe('color-contrast');
        expect(result.value.passes).toHaveLength(1);
      }
    });

    it('should pass axe options correctly', async () => {
      const options: AxeOptions = {
        runOnly: { type: 'tag', values: ['wcag2aa'] },
        resultTypes: ['violations', 'passes'],
      };

      await runAxeAudit(mockVibiumClient, options);

      const auditCall = evaluateFunction.mock.calls[1];
      expect(auditCall[0]).toContain('"runOnly"');
      expect(auditCall[0]).toContain('wcag2aa');
    });

    it('should inject axe-core if not loaded', async () => {
      evaluateFunction.mockReset();

      evaluateFunction
        .mockResolvedValueOnce({ success: false, error: new Error('axe-core not loaded') })
        .mockResolvedValueOnce({ success: true, value: false })
        .mockResolvedValueOnce({ success: true, value: true })
        .mockResolvedValueOnce({ success: false, error: new Error('axe-core not loaded') })
        .mockResolvedValueOnce({ success: true, value: false })
        .mockResolvedValueOnce({ success: true, value: true });

      const result = await runAxeAudit(mockVibiumClient);

      expect(result.success).toBe(false);
    });

    it('should return error when audit fails', async () => {
      evaluateFunction.mockReset();
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: undefined })
        .mockResolvedValueOnce({ success: false, error: new Error('Audit execution failed') });

      const result = await runAxeAudit(mockVibiumClient);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AxeCoreAuditError);
      }
    });

    it('should validate result structure', async () => {
      evaluateFunction.mockReset();
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: undefined })
        .mockResolvedValueOnce({ success: true, value: { invalid: 'structure' } });

      const result = await runAxeAudit(mockVibiumClient);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid axe-core result structure');
      }
    });
  });

  describe('parseAxeResults', () => {
    it('should parse violations correctly', () => {
      const axeResults: AxeResults = {
        violations: [
          {
            id: 'image-alt',
            impact: 'critical',
            tags: ['wcag2a', 'wcag111'],
            description: 'Images must have alternate text',
            help: 'Images must have alternative text',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/image-alt',
            nodes: [
              {
                html: '<img src="logo.png">',
                impact: 'critical',
                target: ['img.logo'],
                failureSummary: 'Fix all of the following: Element does not have an alt attribute',
                any: [],
                all: [
                  {
                    id: 'has-alt',
                    impact: 'critical',
                    message: 'Element does not have an alt attribute',
                  },
                ],
                none: [],
              },
            ],
          },
        ],
        passes: [],
        incomplete: [],
        inapplicable: [],
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
        testEnvironment: {
          userAgent: 'Mozilla/5.0',
          windowWidth: 1280,
          windowHeight: 720,
          orientationAngle: 0,
          orientationType: 'landscape-primary',
        },
        testRunner: { name: 'axe' },
        toolOptions: {},
      };

      const report = parseAxeResults(axeResults, 'AA');

      expect(report.url).toBe('https://example.com');
      expect(report.wcagLevel).toBe('AA');
      expect(report.violations).toHaveLength(1);

      const violation = report.violations[0];
      expect(violation.id).toBe('image-alt');
      expect(violation.impact).toBe('critical');
      expect(violation.nodes).toHaveLength(1);
      expect(violation.nodes[0].html).toBe('<img src="logo.png">');
      expect(violation.nodes[0].fixSuggestion).toBe(
        'Add alternative text to images using the alt attribute'
      );
    });

    it('should parse passed rules', () => {
      const axeResults: AxeResults = {
        violations: [],
        passes: [
          {
            id: 'html-has-lang',
            impact: null,
            tags: ['wcag2a', 'wcag311'],
            description: 'Ensures html element has lang attribute',
            help: '<html> element must have a lang attribute',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/html-has-lang',
            nodes: [
              {
                html: '<html lang="en">',
                impact: null,
                target: ['html'],
                any: [],
                all: [],
                none: [],
              },
            ],
          },
        ],
        incomplete: [],
        inapplicable: [],
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
        testEnvironment: {
          userAgent: 'Mozilla/5.0',
          windowWidth: 1280,
          windowHeight: 720,
          orientationAngle: 0,
          orientationType: 'landscape-primary',
        },
        testRunner: { name: 'axe' },
        toolOptions: {},
      };

      const report = parseAxeResults(axeResults);

      expect(report.passes).toHaveLength(1);
      expect(report.passes[0].id).toBe('html-has-lang');
      expect(report.passes[0].nodes).toBe(1);
    });

    it('should parse incomplete checks', () => {
      const axeResults: AxeResults = {
        violations: [],
        passes: [],
        incomplete: [
          {
            id: 'color-contrast',
            impact: 'serious',
            tags: ['wcag2aa'],
            description: 'Color contrast check',
            help: 'Elements must have sufficient color contrast',
            helpUrl: 'https://example.com',
            nodes: [
              {
                html: '<div>Text</div>',
                impact: 'serious',
                target: ['div'],
                failureSummary: 'Unable to determine contrast due to background image',
                any: [],
                all: [],
                none: [],
              },
            ],
          },
        ],
        inapplicable: [],
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
        testEnvironment: {
          userAgent: 'Mozilla/5.0',
          windowWidth: 1280,
          windowHeight: 720,
          orientationAngle: 0,
          orientationType: 'landscape-primary',
        },
        testRunner: { name: 'axe' },
        toolOptions: {},
      };

      const report = parseAxeResults(axeResults);

      expect(report.incomplete).toHaveLength(1);
      expect(report.incomplete[0].id).toBe('color-contrast');
      expect(report.incomplete[0].reason).toContain('Unable to determine contrast');
    });

    it('should calculate accessibility score', () => {
      const axeResults: AxeResults = {
        violations: [
          {
            id: 'critical-violation',
            impact: 'critical',
            tags: [],
            description: 'Critical issue',
            help: 'Fix this',
            helpUrl: 'https://example.com',
            nodes: [{ html: '', impact: 'critical', target: ['div'], any: [], all: [], none: [] }],
          },
        ],
        passes: [],
        incomplete: [],
        inapplicable: [],
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
        testEnvironment: {
          userAgent: 'Mozilla/5.0',
          windowWidth: 1280,
          windowHeight: 720,
          orientationAngle: 0,
          orientationType: 'landscape-primary',
        },
        testRunner: { name: 'axe' },
        toolOptions: {},
      };

      const report = parseAxeResults(axeResults);

      expect(report.score).toBeLessThan(100);
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle perfect score (no violations)', () => {
      const axeResults: AxeResults = {
        violations: [],
        passes: [
          {
            id: 'all-good',
            impact: null,
            tags: [],
            description: 'Everything passes',
            help: 'Great job',
            helpUrl: 'https://example.com',
            nodes: [],
          },
        ],
        incomplete: [],
        inapplicable: [],
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
        testEnvironment: {
          userAgent: 'Mozilla/5.0',
          windowWidth: 1280,
          windowHeight: 720,
          orientationAngle: 0,
          orientationType: 'landscape-primary',
        },
        testRunner: { name: 'axe' },
        toolOptions: {},
      };

      const report = parseAxeResults(axeResults);

      expect(report.score).toBe(100);
      expect(report.violations).toHaveLength(0);
    });
  });

  describe('runCompleteAxeAudit', () => {
    const mockCompleteAxeResults = {
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
      timestamp: new Date().toISOString(),
      url: 'https://example.com',
      testEnvironment: {
        userAgent: 'Mozilla/5.0',
        windowWidth: 1280,
        windowHeight: 720,
        orientationAngle: 0,
        orientationType: 'landscape-primary',
      },
      testRunner: { name: 'axe' },
      toolOptions: {},
    };

    beforeEach(() => {
      (mockVibiumClient.navigate as ReturnType<typeof vi.fn>).mockResolvedValue(
        ok({ success: true, durationMs: 1000 })
      );

      evaluateFunction.mockReset();
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false })
        .mockResolvedValueOnce({ success: true, value: true })
        .mockResolvedValueOnce({ success: true, value: undefined })
        .mockResolvedValueOnce({ success: true, value: mockCompleteAxeResults });
    });

    it('should run complete audit workflow', async () => {
      const result = await runCompleteAxeAudit(mockVibiumClient, 'https://example.com');

      expect(result.success).toBe(true);
      expect(mockVibiumClient.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com' })
      );
    });

    it('should pass WCAG level to parser', async () => {
      const result = await runCompleteAxeAudit(mockVibiumClient, 'https://example.com', {
        wcagLevel: 'AAA',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.wcagLevel).toBe('AAA');
      }
    });

    it('should handle navigation failure', async () => {
      (mockVibiumClient.navigate as ReturnType<typeof vi.fn>).mockResolvedValue(
        err(new Error('Navigation failed'))
      );

      const result = await runCompleteAxeAudit(mockVibiumClient, 'https://example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Failed to navigate');
      }
    });

    it('should apply exclude selectors', async () => {
      await runCompleteAxeAudit(mockVibiumClient, 'https://example.com', {
        excludeSelectors: ['.ad-banner', '#cookie-notice'],
      });

      const auditCall = evaluateFunction.mock.calls[3];
      expect(auditCall[0]).toContain('exclude');
    });

    it('should apply specific rules when provided', async () => {
      await runCompleteAxeAudit(mockVibiumClient, 'https://example.com', {
        rules: ['color-contrast', 'image-alt'],
      });

      const auditCall = evaluateFunction.mock.calls[3];
      expect(auditCall[0]).toContain('color-contrast');
      expect(auditCall[0]).toContain('image-alt');
    });
  });

  describe('WCAG constants', () => {
    it('should have valid WCAG tag mappings', () => {
      expect(WCAG_TAG_MAP['wcag2a']).toEqual({ level: 'A', version: '2.0' });
      expect(WCAG_TAG_MAP['wcag21aa']).toEqual({ level: 'AA', version: '2.1' });
      expect(WCAG_TAG_MAP['wcag22aaa']).toEqual({ level: 'AAA', version: '2.2' });
    });

    it('should have WCAG criteria mappings', () => {
      expect(WCAG_CRITERIA_MAP['wcag111']).toEqual({
        id: '1.1.1',
        level: 'A',
        title: 'Non-text Content',
      });
      expect(WCAG_CRITERIA_MAP['wcag143']).toEqual({
        id: '1.4.3',
        level: 'AA',
        title: 'Contrast (Minimum)',
      });
    });

    it('should have fix suggestions for common rules', () => {
      expect(FIX_SUGGESTIONS['image-alt']).toContain('alt attribute');
      expect(FIX_SUGGESTIONS['color-contrast']).toContain('contrast');
      expect(FIX_SUGGESTIONS['button-name']).toContain('accessible text');
    });

    it('should have valid CDN URL', () => {
      expect(AXE_CORE_CDN_URL).toContain('axe-core');
      expect(AXE_CORE_CDN_URL).toContain('https://');
    });
  });
});
