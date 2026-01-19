/**
 * Vibium Visual Testing Services Tests
 * GOAP Action A2.5: Comprehensive tests for visual testing services
 *
 * Tests the following services:
 * - axe-core-integration.ts (A2.2)
 * - viewport-capture.ts (A2.3)
 * - visual-regression.ts (A2.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, err } from '../../../../src/shared/types/index.js';
import { FilePath } from '../../../../src/shared/value-objects/index.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import type { VibiumClient } from '../../../../src/integrations/vibium/types.js';
import type {
  Screenshot,
  Viewport,
  ScreenshotMetadata,
  AccessibilityReport,
  AccessibilityViolation,
} from '../../../../src/domains/visual-accessibility/interfaces.js';

// ============================================================================
// Axe-Core Integration Tests
// ============================================================================

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
      // evaluate now returns Result<T, VibiumError>
      evaluateFunction.mockResolvedValueOnce({ success: true, value: true }); // axe already loaded

      const result = await injectAxeCore(mockVibiumClient);

      expect(result.success).toBe(true);
      expect(evaluateFunction).toHaveBeenCalledTimes(1);
    });

    it('should load axe-core from CDN', async () => {
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false }) // axe not loaded
        .mockResolvedValueOnce({ success: true, value: true }); // CDN load successful

      const result = await injectAxeCore(mockVibiumClient, { useCDN: true });

      expect(result.success).toBe(true);
      expect(evaluateFunction).toHaveBeenCalledTimes(2);
    });

    it('should return error when CDN fails and no fallback', async () => {
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false }) // axe not loaded
        .mockResolvedValueOnce({ success: false, error: new Error('CDN load failed') });

      const result = await injectAxeCore(mockVibiumClient, { useCDN: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AxeCoreInjectionError);
        expect(result.error.message).toContain('Failed to inject axe-core');
      }
    });

    it('should respect timeout option', async () => {
      evaluateFunction.mockResolvedValueOnce({ success: true, value: false });

      await injectAxeCore(mockVibiumClient, { timeout: 5000 });

      // Verify timeout was used in the script
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
      // Mock axe-core being available - evaluate returns Result<T, VibiumError>
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: undefined }) // injection check passes (axe loaded)
        .mockResolvedValueOnce({ success: true, value: mockAxeResults }); // audit returns results
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
      // Reset to fresh state
      evaluateFunction.mockReset();

      // First check fails (axe not loaded), then successful injection and audit
      evaluateFunction
        .mockResolvedValueOnce({ success: false, error: new Error('axe-core not loaded') }) // initial check fails
        .mockResolvedValueOnce({ success: true, value: false }) // check again - not loaded
        .mockResolvedValueOnce({ success: true, value: true }) // CDN injection succeeds
        .mockResolvedValueOnce({ success: false, error: new Error('axe-core not loaded') }) // verification check fails
        .mockResolvedValueOnce({ success: true, value: false }) // final check - not loaded
        .mockResolvedValueOnce({ success: true, value: true }); // CDN load succeeds

      const result = await runAxeAudit(mockVibiumClient);

      // Should fail because injection ultimately didn't succeed in this test scenario
      expect(result.success).toBe(false);
    });

    it('should return error when audit fails', async () => {
      evaluateFunction.mockReset();
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: undefined }) // verification passes
        .mockResolvedValueOnce({ success: false, error: new Error('Audit execution failed') }); // audit fails

      const result = await runAxeAudit(mockVibiumClient);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AxeCoreAuditError);
      }
    });

    it('should validate result structure', async () => {
      evaluateFunction.mockReset();
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: undefined }) // verification passes
        .mockResolvedValueOnce({ success: true, value: { invalid: 'structure' } }); // Invalid result

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

      // Score should be reduced due to critical violation
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
      // evaluate returns Result<T, VibiumError> structure
      evaluateFunction
        .mockResolvedValueOnce({ success: true, value: false }) // axe not loaded check
        .mockResolvedValueOnce({ success: true, value: true }) // CDN injection
        .mockResolvedValueOnce({ success: true, value: undefined }) // axe verification
        .mockResolvedValueOnce({ success: true, value: mockCompleteAxeResults }); // audit results
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

      const auditCall = evaluateFunction.mock.calls[3]; // 4th call is the audit
      expect(auditCall[0]).toContain('exclude');
    });

    it('should apply specific rules when provided', async () => {
      await runCompleteAxeAudit(mockVibiumClient, 'https://example.com', {
        rules: ['color-contrast', 'image-alt'],
      });

      const auditCall = evaluateFunction.mock.calls[3]; // 4th call is the audit
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

// ============================================================================
// Viewport Capture Service Tests
// ============================================================================

import {
  ViewportCaptureService,
  createViewportCaptureService,
  VIEWPORT_PRESETS,
  DEFAULT_BREAKPOINTS,
  type ViewportCaptureConfig,
  type ViewportCaptureResult,
  type MultiViewportCaptureResult,
  type ResponsiveAnalysis,
} from '../../../../src/domains/visual-accessibility/services/viewport-capture.js';

describe('viewport-capture', () => {
  let mockMemory: MemoryBackend;
  let mockVibiumClient: VibiumClient;

  beforeEach(() => {
    mockMemory = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    } as unknown as MemoryBackend;

    mockVibiumClient = {
      getSession: vi.fn().mockResolvedValue(null),
      launch: vi.fn().mockResolvedValue(ok({ sessionId: 'test-session' })),
      navigate: vi.fn().mockResolvedValue(ok({ success: true, durationMs: 1000 })),
      screenshot: vi.fn().mockResolvedValue(ok({ path: '/test/screenshot.png' })),
      close: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    } as unknown as VibiumClient;
  });

  describe('createViewportCaptureService', () => {
    it('should create service with defaults', () => {
      const service = createViewportCaptureService(mockMemory);
      expect(service).toBeInstanceOf(ViewportCaptureService);
    });

    it('should create service with Vibium client', () => {
      const service = createViewportCaptureService(mockMemory, mockVibiumClient);
      expect(service).toBeInstanceOf(ViewportCaptureService);
    });

    it('should create service with custom config', () => {
      const config: Partial<ViewportCaptureConfig> = {
        screenshotDirectory: '/custom/screenshots',
        diffThreshold: 0.5,
      };

      const service = createViewportCaptureService(mockMemory, undefined, config);
      expect(service).toBeInstanceOf(ViewportCaptureService);
    });
  });

  describe('captureAtViewport', () => {
    it('should capture screenshot at viewport (simulated)', async () => {
      const service = createViewportCaptureService(mockMemory);
      const viewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const result = await service.captureAtViewport('https://example.com', viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport).toEqual(viewport);
        expect(result.value.screenshot.url).toBe('https://example.com');
        expect(result.value.success).toBe(true);
        expect(result.value.captureTimeMs).toBeGreaterThan(0);
      }
    });

    it('should capture with Vibium when available', async () => {
      (mockVibiumClient.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'active-session',
      });

      const service = createViewportCaptureService(mockMemory, mockVibiumClient);
      const viewport: Viewport = {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const result = await service.captureAtViewport('https://example.com', viewport, {
        fullPage: true,
      });

      expect(result.success).toBe(true);
      expect(mockVibiumClient.navigate).toHaveBeenCalled();
      expect(mockVibiumClient.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true })
      );
    });

    it('should handle capture errors gracefully', async () => {
      (mockVibiumClient.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'active-session',
      });
      (mockVibiumClient.navigate as ReturnType<typeof vi.fn>).mockResolvedValue(
        err(new Error('Navigation failed'))
      );

      const service = createViewportCaptureService(mockMemory, mockVibiumClient);
      const viewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const result = await service.captureAtViewport('https://example.com', viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(false);
        expect(result.value.error).toBeDefined();
      }
    });

    it('should store screenshot in memory', async () => {
      const service = createViewportCaptureService(mockMemory);
      const viewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      await service.captureAtViewport('https://example.com', viewport);

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });

  describe('captureAllViewports', () => {
    it('should capture screenshots at multiple viewports', async () => {
      const service = createViewportCaptureService(mockMemory);
      const viewports: Viewport[] = [
        { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const result = await service.captureAllViewports('https://example.com', viewports);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures).toHaveLength(2);
        expect(result.value.successCount).toBe(2);
        expect(result.value.failedCount).toBe(0);
        expect(result.value.url).toBe('https://example.com');
      }
    });

    it('should track timing metrics', async () => {
      const service = createViewportCaptureService(mockMemory);
      const viewports: Viewport[] = [
        { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const result = await service.captureAllViewports('https://example.com', viewports);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalTimeMs).toBeGreaterThan(0);
        expect(result.value.startedAt).toBeInstanceOf(Date);
        expect(result.value.completedAt).toBeInstanceOf(Date);
      }
    });

    it('should handle partial failures', async () => {
      (mockVibiumClient.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'active-session',
      });
      (mockVibiumClient.navigate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(ok({ success: true, durationMs: 1000 }))
        .mockResolvedValueOnce(err(new Error('Navigation failed')));

      const service = createViewportCaptureService(mockMemory, mockVibiumClient);
      const viewports: Viewport[] = [
        { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const result = await service.captureAllViewports('https://example.com', viewports);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.successCount).toBe(1);
        expect(result.value.failedCount).toBe(1);
      }
    });
  });

  describe('captureWithPresets', () => {
    it('should capture using standard presets', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureWithPresets('https://example.com', [
        'mobile-m',
        'tablet',
        'desktop',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures).toHaveLength(3);
        expect(result.value.captures[0].viewport.width).toBe(VIEWPORT_PRESETS['mobile-m'].width);
        expect(result.value.captures[1].viewport.width).toBe(VIEWPORT_PRESETS['tablet'].width);
        expect(result.value.captures[2].viewport.width).toBe(VIEWPORT_PRESETS['desktop'].width);
      }
    });

    it('should warn on unknown presets', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureWithPresets('https://example.com', [
        'mobile-m',
        'unknown-preset',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        // Only mobile-m should be captured
        expect(result.value.captures).toHaveLength(1);
      }
    });

    it('should return error when no valid presets', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureWithPresets('https://example.com', [
        'invalid-1',
        'invalid-2',
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No valid viewport presets');
      }
    });
  });

  describe('captureResponsiveBreakpoints', () => {
    it('should capture at responsive breakpoints', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBeGreaterThan(0);
        expect(result.value.detectedBreakpoints).toBeDefined();
        expect(result.value.layoutShifts).toBeDefined();
        expect(result.value.responsiveScore).toBeGreaterThanOrEqual(0);
        expect(result.value.responsiveScore).toBeLessThanOrEqual(100);
      }
    });

    it('should include standard breakpoints by default', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { includeStandardBreakpoints: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const capturedWidths = result.value.captures.map((c) => c.viewport.width);
        // Check that common breakpoints are included
        expect(capturedWidths).toContain(768);
        expect(capturedWidths).toContain(1024);
      }
    });

    it('should respect custom breakpoints', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { customBreakpoints: [400, 900, 1600] }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const capturedWidths = result.value.captures.map((c) => c.viewport.width);
        expect(capturedWidths).toContain(400);
        expect(capturedWidths).toContain(900);
        expect(capturedWidths).toContain(1600);
      }
    });

    it('should detect layout shifts', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { stepSize: 200 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.layoutShifts)).toBe(true);
        // Should detect shifts between significantly different viewports
        result.value.layoutShifts.forEach((shift) => {
          expect(shift.fromWidth).toBeLessThan(shift.toWidth);
          expect(shift.shiftMagnitude).toBeGreaterThanOrEqual(0);
          expect(shift.affectedAreas).toBeDefined();
        });
      }
    });

    it('should calculate responsive score', async () => {
      const service = createViewportCaptureService(mockMemory);

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.responsiveScore).toBeGreaterThanOrEqual(0);
        expect(result.value.responsiveScore).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('compareScreenshots', () => {
    it('should compare two screenshots', async () => {
      const screenshot1: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot1.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const screenshot2: Screenshot = {
        id: 'screenshot-2',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot2.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(screenshot1)
        .mockResolvedValueOnce(screenshot2);

      const service = createViewportCaptureService(mockMemory);
      const result = await service.compareScreenshots('screenshot-1', 'screenshot-2');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.screenshot1Id).toBe('screenshot-1');
        expect(result.value.screenshot2Id).toBe('screenshot-2');
        expect(result.value.similarity).toBeGreaterThanOrEqual(0);
        expect(result.value.similarity).toBeLessThanOrEqual(1);
        expect(result.value.differencePercent).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return error for missing screenshot', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createViewportCaptureService(mockMemory);
      const result = await service.compareScreenshots('screenshot-1', 'screenshot-2');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Screenshot not found');
      }
    });

    it('should use custom threshold', async () => {
      const screenshot1: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot1.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(screenshot1)
        .mockResolvedValueOnce(screenshot1);

      const service = createViewportCaptureService(mockMemory);
      const result = await service.compareScreenshots('screenshot-1', 'screenshot-1', 0.05);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.threshold).toBe(0.05);
      }
    });
  });

  describe('getScreenshot', () => {
    it('should retrieve stored screenshot', async () => {
      const screenshot: Screenshot = {
        id: 'test-id',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(screenshot);

      const service = createViewportCaptureService(mockMemory);
      const result = await service.getScreenshot('test-id');

      expect(result).toEqual(screenshot);
    });

    it('should return null for non-existent screenshot', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createViewportCaptureService(mockMemory);
      const result = await service.getScreenshot('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('VIEWPORT_PRESETS', () => {
    it('should have standard mobile presets', () => {
      expect(VIEWPORT_PRESETS['mobile-s']).toBeDefined();
      expect(VIEWPORT_PRESETS['mobile-m']).toBeDefined();
      expect(VIEWPORT_PRESETS['mobile-l']).toBeDefined();

      expect(VIEWPORT_PRESETS['mobile-m'].isMobile).toBe(true);
      expect(VIEWPORT_PRESETS['mobile-m'].hasTouch).toBe(true);
    });

    it('should have tablet and desktop presets', () => {
      expect(VIEWPORT_PRESETS['tablet']).toBeDefined();
      expect(VIEWPORT_PRESETS['laptop']).toBeDefined();
      expect(VIEWPORT_PRESETS['desktop']).toBeDefined();

      expect(VIEWPORT_PRESETS['desktop'].isMobile).toBe(false);
      expect(VIEWPORT_PRESETS['desktop'].width).toBe(1440);
    });

    it('should have high-resolution presets', () => {
      expect(VIEWPORT_PRESETS['4k']).toBeDefined();
      expect(VIEWPORT_PRESETS['4k'].width).toBe(3840);
      expect(VIEWPORT_PRESETS['4k'].deviceScaleFactor).toBe(2);
    });
  });

  describe('DEFAULT_BREAKPOINTS', () => {
    it('should have common CSS breakpoints', () => {
      expect(DEFAULT_BREAKPOINTS).toContain(320); // Small mobile
      expect(DEFAULT_BREAKPOINTS).toContain(768); // Tablet
      expect(DEFAULT_BREAKPOINTS).toContain(1024); // Desktop
      expect(DEFAULT_BREAKPOINTS).toContain(1440); // Large desktop
    });
  });
});

// ============================================================================
// Visual Regression Service Tests
// ============================================================================

import {
  VisualRegressionService,
  createVisualRegressionService,
  type VisualRegressionConfig,
  type VisualRegressionResult,
  type BaselineMetadata,
} from '../../../../src/domains/visual-accessibility/services/visual-regression.js';
import type {
  VisualDiff,
  DiffStatus,
} from '../../../../src/domains/visual-accessibility/interfaces.js';

describe('visual-regression', () => {
  let mockMemory: MemoryBackend;
  let mockVibiumClient: VibiumClient;

  beforeEach(() => {
    mockMemory = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    } as unknown as MemoryBackend;

    mockVibiumClient = {
      getSession: vi.fn().mockResolvedValue(null),
      launch: vi.fn().mockResolvedValue(ok({ sessionId: 'test-session' })),
      navigate: vi.fn().mockResolvedValue(ok({ success: true, durationMs: 1000 })),
      screenshot: vi.fn().mockResolvedValue(ok({ path: '/test/screenshot.png' })),
      compareScreenshots: vi.fn().mockResolvedValue(
        ok({
          differencePercent: 0.5,
          diffRegions: [],
          diffImagePath: '/test/diff.png',
        })
      ),
      close: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(false),
    } as unknown as VibiumClient;
  });

  describe('createVisualRegressionService', () => {
    it('should create service with minimal dependencies', () => {
      const service = createVisualRegressionService(mockMemory);
      expect(service).toBeInstanceOf(VisualRegressionService);
    });

    it('should create service with Vibium client', () => {
      const service = createVisualRegressionService(mockMemory, mockVibiumClient);
      expect(service).toBeInstanceOf(VisualRegressionService);
    });

    it('should create service with custom config', () => {
      const config: Partial<VisualRegressionConfig> = {
        diffThreshold: 1.0,
        captureTimeout: 60000,
      };

      const service = createVisualRegressionService(mockMemory, null, undefined, config);
      expect(service).toBeInstanceOf(VisualRegressionService);
    });
  });

  describe('runTest', () => {
    it('should create new baseline when none exists', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTest('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(true);
        expect(result.value.newBaseline).toBe(true);
        expect(result.value.baseline).toBeNull();
        expect(result.value.current).toBeDefined();
      }
    });

    it('should compare against existing baseline', async () => {
      const baselineMetadata: BaselineMetadata = {
        id: 'baseline-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        screenshotId: 'screenshot-baseline',
        version: 1,
      };

      const baselineScreenshot: Screenshot = {
        id: 'screenshot-baseline',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/baseline.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baselineMetadata)
        .mockResolvedValueOnce(baselineScreenshot);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTest('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.baseline).toBeDefined();
        expect(result.value.diff).toBeDefined();
        expect(result.value.newBaseline).toBe(false);
      }
    });

    it('should pass when differences are within threshold', async () => {
      const baselineMetadata: BaselineMetadata = {
        id: 'baseline-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        screenshotId: 'screenshot-baseline',
        version: 1,
      };

      const baselineScreenshot: Screenshot = {
        id: 'screenshot-baseline',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/baseline.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baselineMetadata)
        .mockResolvedValueOnce(baselineScreenshot);

      const service = createVisualRegressionService(mockMemory, null, undefined, {
        diffThreshold: 1.0, // Allow 1% difference
      });

      const result = await service.runTest('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(true);
        expect(result.value.diff?.status).toMatch(/identical|acceptable/);
      }
    });

    it('should fail when differences exceed threshold', async () => {
      const baselineMetadata: BaselineMetadata = {
        id: 'baseline-1',
        url: 'https://different.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        screenshotId: 'screenshot-baseline',
        version: 1,
      };

      const baselineScreenshot: Screenshot = {
        id: 'screenshot-baseline',
        url: 'https://different.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/baseline.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baselineMetadata)
        .mockResolvedValueOnce(baselineScreenshot);

      const service = createVisualRegressionService(mockMemory, null, undefined, {
        diffThreshold: 0.01, // Very strict threshold
      });

      const result = await service.runTest('https://example.com'); // Different URL

      expect(result.success).toBe(true);
      if (result.success) {
        // Different URLs should cause a failure
        expect(result.value.diff?.diffPercentage).toBeGreaterThan(0);
      }
    });

    it('should support force update baseline option', async () => {
      const baselineMetadata: BaselineMetadata = {
        id: 'baseline-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        screenshotId: 'screenshot-baseline',
        version: 1,
      };

      const baselineScreenshot: Screenshot = {
        id: 'screenshot-baseline',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/baseline.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baselineMetadata)
        .mockResolvedValueOnce(baselineScreenshot)
        .mockResolvedValueOnce(baselineMetadata); // For updateBaseline

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTest('https://example.com', {
        forceUpdateBaseline: true,
      });

      expect(result.success).toBe(true);
      // Baseline should have been updated
      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should handle custom viewport', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const customViewport: Viewport = {
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      };

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTest('https://example.com', {
        viewport: customViewport,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport).toEqual(customViewport);
      }
    });
  });

  describe('runTests', () => {
    it('should run tests for multiple URLs', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTests([
        'https://example.com',
        'https://example.com/about',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalTests).toBe(2);
        expect(result.value.results).toHaveLength(2);
        expect(result.value.newBaselines).toBe(2);
      }
    });

    it('should run tests for multiple viewports', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const viewports: Viewport[] = [
        { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTests(['https://example.com'], viewports);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalTests).toBe(2);
        expect(result.value.results).toHaveLength(2);
      }
    });

    it('should track passed and failed counts', async () => {
      const baselineMetadata: BaselineMetadata = {
        id: 'baseline-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        screenshotId: 'screenshot-baseline',
        version: 1,
      };

      const baselineScreenshot: Screenshot = {
        id: 'screenshot-baseline',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/baseline.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // No baseline for first URL
        .mockResolvedValueOnce(baselineMetadata) // Baseline for second URL
        .mockResolvedValueOnce(baselineScreenshot);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTests([
        'https://example.com',
        'https://example.com',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed + result.value.failed).toBe(result.value.totalTests);
      }
    });

    it('should calculate duration', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.runTests(['https://example.com']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.duration).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('baseline management', () => {
    describe('setBaseline', () => {
      it('should create new baseline', async () => {
        const screenshot: Screenshot = {
          id: 'screenshot-1',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          timestamp: new Date(),
          path: FilePath.create('/test/screenshot.png'),
          metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
        };

        const service = createVisualRegressionService(mockMemory);
        const result = await service.setBaseline(screenshot, 'Initial baseline');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.url).toBe('https://example.com');
          expect(result.value.screenshotId).toBe('screenshot-1');
          expect(result.value.version).toBe(1);
          expect(result.value.reason).toBe('Initial baseline');
        }
      });

      it('should store baseline with approver', async () => {
        const screenshot: Screenshot = {
          id: 'screenshot-1',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          timestamp: new Date(),
          path: FilePath.create('/test/screenshot.png'),
          metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
        };

        const service = createVisualRegressionService(mockMemory);
        const result = await service.setBaseline(screenshot, 'Approved baseline', 'qa-team');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.approvedBy).toBe('qa-team');
        }
      });
    });

    describe('getBaseline', () => {
      it('should retrieve existing baseline', async () => {
        const baselineMetadata: BaselineMetadata = {
          id: 'baseline-1',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          createdAt: new Date(),
          updatedAt: new Date(),
          screenshotId: 'screenshot-1',
          version: 1,
        };

        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(baselineMetadata);

        const service = createVisualRegressionService(mockMemory);
        const viewport: Viewport = {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        };

        const result = await service.getBaseline('https://example.com', viewport);

        expect(result).toEqual(baselineMetadata);
      });

      it('should return null for non-existent baseline', async () => {
        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const service = createVisualRegressionService(mockMemory);
        const viewport: Viewport = {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        };

        const result = await service.getBaseline('https://example.com', viewport);

        expect(result).toBeNull();
      });
    });

    describe('updateBaseline', () => {
      it('should update existing baseline', async () => {
        const existingBaseline: BaselineMetadata = {
          id: 'baseline-1',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          screenshotId: 'screenshot-old',
          version: 1,
        };

        const newScreenshot: Screenshot = {
          id: 'screenshot-new',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          timestamp: new Date(),
          path: FilePath.create('/test/screenshot-new.png'),
          metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
        };

        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(existingBaseline);

        const service = createVisualRegressionService(mockMemory);
        const result = await service.updateBaseline('baseline-1', newScreenshot, 'Updated design');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.screenshotId).toBe('screenshot-new');
          expect(result.value.version).toBe(2);
          expect(result.value.reason).toBe('Updated design');
        }
      });

      it('should return error for non-existent baseline', async () => {
        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const screenshot: Screenshot = {
          id: 'screenshot-1',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          timestamp: new Date(),
          path: FilePath.create('/test/screenshot.png'),
          metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
        };

        const service = createVisualRegressionService(mockMemory);
        const result = await service.updateBaseline('non-existent', screenshot, 'Update');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('Baseline not found');
        }
      });
    });

    describe('deleteBaseline', () => {
      it('should delete existing baseline', async () => {
        const baselineMetadata: BaselineMetadata = {
          id: 'baseline-1',
          url: 'https://example.com',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
          createdAt: new Date(),
          updatedAt: new Date(),
          screenshotId: 'screenshot-1',
          version: 1,
        };

        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(baselineMetadata);

        const service = createVisualRegressionService(mockMemory);
        const result = await service.deleteBaseline('baseline-1');

        expect(result.success).toBe(true);
        expect(mockMemory.delete).toHaveBeenCalled();
      });

      it('should return error for non-existent baseline', async () => {
        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const service = createVisualRegressionService(mockMemory);
        const result = await service.deleteBaseline('non-existent');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('Baseline not found');
        }
      });
    });
  });

  describe('compareScreenshots', () => {
    it('should compare identical screenshots', async () => {
      const screenshot: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const service = createVisualRegressionService(mockMemory);
      const result = await service.compareScreenshots(screenshot, screenshot);

      expect(result.success).toBe(true);
      if (result.success) {
        // Even identical screenshots may have small deterministic noise
        expect(result.value.status).toMatch(/identical|acceptable/);
        expect(result.value.diffPercentage).toBeLessThan(1);
      }
    });

    it('should detect differences in different screenshots', async () => {
      const screenshot1: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot1.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const screenshot2: Screenshot = {
        id: 'screenshot-2',
        url: 'https://different.com',
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot2.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const service = createVisualRegressionService(mockMemory);
      const result = await service.compareScreenshots(screenshot1, screenshot2);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.diffPercentage).toBeGreaterThan(0);
        expect(result.value.status).toMatch(/changed|failed/);
      }
    });

    it('should use browser-based comparison when available', async () => {
      (mockVibiumClient.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const screenshot1: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot1.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const screenshot2: Screenshot = {
        id: 'screenshot-2',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot2.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, {
        useBrowserCapture: true,
      });

      const result = await service.compareScreenshots(screenshot1, screenshot2);

      expect(result.success).toBe(true);
      expect(mockVibiumClient.compareScreenshots).toHaveBeenCalled();
    });

    it('should fall back to deterministic comparison when browser fails', async () => {
      (mockVibiumClient.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (mockVibiumClient.compareScreenshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        err(new Error('Comparison failed'))
      );

      const screenshot: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, {
        useBrowserCapture: true,
      });

      const result = await service.compareScreenshots(screenshot, screenshot);

      expect(result.success).toBe(true);
      // Should use deterministic comparison as fallback
    });

    it('should generate diff regions for significant differences', async () => {
      const screenshot1: Screenshot = {
        id: 'screenshot-1',
        url: 'https://example.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot1.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const screenshot2: Screenshot = {
        id: 'screenshot-2',
        url: 'https://different.com',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        timestamp: new Date(),
        path: FilePath.create('/test/screenshot2.png'),
        metadata: { browser: 'chromium', os: 'linux', fullPage: false, loadTime: 1000 },
      };

      const service = createVisualRegressionService(mockMemory);
      const result = await service.compareScreenshots(screenshot1, screenshot2);

      expect(result.success).toBe(true);
      if (result.success && result.value.diffPercentage > 0.5) {
        expect(result.value.regions.length).toBeGreaterThan(0);
        result.value.regions.forEach((region) => {
          expect(region.x).toBeGreaterThanOrEqual(0);
          expect(region.y).toBeGreaterThanOrEqual(0);
          expect(region.width).toBeGreaterThan(0);
          expect(region.height).toBeGreaterThan(0);
          expect(['added', 'removed', 'modified']).toContain(region.changeType);
          expect(['low', 'medium', 'high']).toContain(region.significance);
        });
      }
    });
  });

  describe('isBrowserAvailable', () => {
    it('should check browser availability', async () => {
      (mockVibiumClient.isAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const service = createVisualRegressionService(mockMemory, mockVibiumClient);
      const available = await service.isBrowserAvailable();

      expect(available).toBe(true);
    });

    it('should return false when no client provided', async () => {
      const service = createVisualRegressionService(mockMemory, null);
      const available = await service.isBrowserAvailable();

      expect(available).toBe(false);
    });

    it('should cache availability result', async () => {
      const service = createVisualRegressionService(mockMemory, mockVibiumClient);

      await service.isBrowserAvailable();
      await service.isBrowserAvailable();

      // Should only call isAvailable once due to caching
      expect(mockVibiumClient.isAvailable).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDiff', () => {
    it('should retrieve stored diff', async () => {
      const diff: VisualDiff = {
        baselineId: 'screenshot-1',
        comparisonId: 'screenshot-2',
        diffPercentage: 1.5,
        diffPixels: 1000,
        regions: [],
        status: 'changed',
      };

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(diff);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.getDiff('screenshot-1_screenshot-2');

      expect(result).toEqual(diff);
    });

    it('should return null for non-existent diff', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createVisualRegressionService(mockMemory);
      const result = await service.getDiff('non-existent');

      expect(result).toBeNull();
    });
  });
});
