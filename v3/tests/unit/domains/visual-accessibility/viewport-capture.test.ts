/**
 * Tests for ViewportCaptureService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ViewportCaptureService,
  createViewportCaptureService,
  VIEWPORT_PRESETS,
  DEFAULT_BREAKPOINTS,
  type ViewportPreset,
  type ViewportCaptureConfig,
} from '../../../../src/domains/visual-accessibility/services/viewport-capture.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import type { Viewport } from '../../../../src/domains/visual-accessibility/interfaces.js';

// Mock memory backend
function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    has: vi.fn(async (key: string) => store.has(key)),
    clear: vi.fn(async () => store.clear()),
    keys: vi.fn(async () => Array.from(store.keys())),
    search: vi.fn(async () => []),
  } as unknown as MemoryBackend;
}

describe('ViewportCaptureService', () => {
  let memory: MemoryBackend;
  let service: ViewportCaptureService;

  beforeEach(() => {
    memory = createMockMemory();
    // Disable preferAgentBrowser to prevent real browser client creation in tests
    service = new ViewportCaptureService(memory, undefined, { preferAgentBrowser: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('VIEWPORT_PRESETS', () => {
    it('should define all standard presets', () => {
      expect(VIEWPORT_PRESETS['mobile-s']).toBeDefined();
      expect(VIEWPORT_PRESETS['mobile-m']).toBeDefined();
      expect(VIEWPORT_PRESETS['mobile-l']).toBeDefined();
      expect(VIEWPORT_PRESETS['tablet']).toBeDefined();
      expect(VIEWPORT_PRESETS['laptop']).toBeDefined();
      expect(VIEWPORT_PRESETS['desktop']).toBeDefined();
      expect(VIEWPORT_PRESETS['desktop-l']).toBeDefined();
    });

    it('should have correct mobile-s dimensions', () => {
      const preset = VIEWPORT_PRESETS['mobile-s'];
      expect(preset.width).toBe(320);
      expect(preset.height).toBe(568);
      expect(preset.isMobile).toBe(true);
      expect(preset.hasTouch).toBe(true);
    });

    it('should have correct desktop dimensions', () => {
      const preset = VIEWPORT_PRESETS['desktop'];
      expect(preset.width).toBe(1440);
      expect(preset.height).toBe(900);
      expect(preset.isMobile).toBe(false);
      expect(preset.hasTouch).toBe(false);
    });

    it('should have correct tablet dimensions', () => {
      const preset = VIEWPORT_PRESETS['tablet'];
      expect(preset.width).toBe(768);
      expect(preset.height).toBe(1024);
      expect(preset.isMobile).toBe(true);
      expect(preset.hasTouch).toBe(true);
    });
  });

  describe('DEFAULT_BREAKPOINTS', () => {
    it('should define standard CSS breakpoints', () => {
      expect(DEFAULT_BREAKPOINTS).toContain(320);
      expect(DEFAULT_BREAKPOINTS).toContain(768);
      expect(DEFAULT_BREAKPOINTS).toContain(1024);
      expect(DEFAULT_BREAKPOINTS).toContain(1440);
      expect(DEFAULT_BREAKPOINTS).toContain(1920);
    });

    it('should be sorted in ascending order', () => {
      for (let i = 1; i < DEFAULT_BREAKPOINTS.length; i++) {
        expect(DEFAULT_BREAKPOINTS[i]).toBeGreaterThan(DEFAULT_BREAKPOINTS[i - 1]);
      }
    });
  });

  describe('captureAtViewport', () => {
    it('should capture screenshot at given viewport', async () => {
      const viewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const result = await service.captureAtViewport(
        'https://example.com',
        viewport
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport).toEqual(viewport);
        expect(result.value.success).toBe(true);
        expect(result.value.screenshot).toBeDefined();
        expect(result.value.screenshot.url).toBe('https://example.com');
        expect(result.value.captureTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include capture timing metrics', async () => {
      const viewport: Viewport = {
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      };

      const result = await service.captureAtViewport(
        'https://example.com/page',
        viewport
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captureTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.value.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should store screenshot metadata', async () => {
      const viewport: Viewport = {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const result = await service.captureAtViewport(
        'https://example.com',
        viewport
      );

      expect(result.success).toBe(true);
      expect(memory.set).toHaveBeenCalled();
    });
  });

  describe('captureAllViewports', () => {
    it('should capture screenshots at multiple viewports', async () => {
      const viewports: Viewport[] = [
        { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const result = await service.captureAllViewports(
        'https://example.com',
        viewports
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBe(3);
        expect(result.value.successCount).toBe(3);
        expect(result.value.failedCount).toBe(0);
        expect(result.value.url).toBe('https://example.com');
      }
    });

    it('should track timing for all captures', async () => {
      const viewports: Viewport[] = [
        { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const result = await service.captureAllViewports(
        'https://example.com',
        viewports
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.value.startedAt).toBeInstanceOf(Date);
        expect(result.value.completedAt).toBeInstanceOf(Date);
        expect(result.value.completedAt.getTime()).toBeGreaterThanOrEqual(
          result.value.startedAt.getTime()
        );
      }
    });
  });

  describe('captureWithPresets', () => {
    it('should capture using named presets', async () => {
      const result = await service.captureWithPresets(
        'https://example.com',
        ['mobile-m', 'tablet', 'desktop']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBe(3);

        // Verify viewport dimensions match presets
        const widths = result.value.captures.map(c => c.viewport.width);
        expect(widths).toContain(375); // mobile-m
        expect(widths).toContain(768); // tablet
        expect(widths).toContain(1440); // desktop
      }
    });

    it('should warn on invalid preset names but continue', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await service.captureWithPresets(
        'https://example.com',
        ['mobile-m', 'invalid-preset', 'desktop']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBe(2); // Only valid presets
      }
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should fail if no valid presets provided', async () => {
      const result = await service.captureWithPresets(
        'https://example.com',
        ['invalid1', 'invalid2']
      );

      expect(result.success).toBe(false);
    });
  });

  describe('captureResponsiveBreakpoints', () => {
    it('should capture at breakpoints within range', async () => {
      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1024
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBeGreaterThan(0);
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.responsiveScore).toBeGreaterThanOrEqual(0);
        expect(result.value.responsiveScore).toBeLessThanOrEqual(100);
      }
    });

    it('should detect breakpoints', async () => {
      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should detect standard breakpoints within range
        expect(result.value.detectedBreakpoints.length).toBeGreaterThanOrEqual(0);

        // Each breakpoint should have required properties
        for (const bp of result.value.detectedBreakpoints) {
          expect(bp.width).toBeGreaterThanOrEqual(320);
          expect(bp.width).toBeLessThanOrEqual(1920);
          expect(bp.confidence).toBeGreaterThanOrEqual(0);
          expect(bp.confidence).toBeLessThanOrEqual(1);
          expect(bp.changeType).toBeDefined();
          expect(bp.description).toBeDefined();
        }
      }
    });

    it('should detect layout shifts', async () => {
      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Layout shifts should have required properties
        for (const shift of result.value.layoutShifts) {
          expect(shift.fromWidth).toBeLessThan(shift.toWidth);
          expect(shift.shiftMagnitude).toBeGreaterThanOrEqual(0);
          expect(shift.affectedAreas).toBeInstanceOf(Array);
          expect(typeof shift.isProblematic).toBe('boolean');
        }
      }
    });

    it('should include standard breakpoints when requested', async () => {
      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { includeStandardBreakpoints: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const capturedWidths = result.value.captures.map(c => c.viewport.width);

        // Should include standard breakpoints that are within range
        for (const bp of DEFAULT_BREAKPOINTS) {
          if (bp >= 320 && bp <= 1920) {
            expect(capturedWidths).toContain(bp);
          }
        }
      }
    });

    it('should respect custom step size', async () => {
      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        400,
        800,
        { stepSize: 200, includeStandardBreakpoints: false }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const widths = result.value.captures.map(c => c.viewport.width);
        // Should include 400, 600, 800 (every 200px)
        expect(widths).toContain(400);
        expect(widths).toContain(600);
        expect(widths).toContain(800);
      }
    });
  });

  describe('compareScreenshots', () => {
    it('should compare two screenshots', async () => {
      // First capture two screenshots
      const viewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const capture1 = await service.captureAtViewport(
        'https://example.com',
        viewport
      );
      const capture2 = await service.captureAtViewport(
        'https://example.com',
        viewport
      );

      expect(capture1.success).toBe(true);
      expect(capture2.success).toBe(true);

      if (capture1.success && capture2.success) {
        const comparison = await service.compareScreenshots(
          capture1.value.screenshot.id,
          capture2.value.screenshot.id
        );

        expect(comparison.success).toBe(true);
        if (comparison.success) {
          expect(comparison.value.screenshot1Id).toBe(capture1.value.screenshot.id);
          expect(comparison.value.screenshot2Id).toBe(capture2.value.screenshot.id);
          expect(comparison.value.similarity).toBeGreaterThanOrEqual(0);
          expect(comparison.value.similarity).toBeLessThanOrEqual(1);
          expect(comparison.value.differencePercent).toBeGreaterThanOrEqual(0);
          expect(typeof comparison.value.matches).toBe('boolean');
        }
      }
    });

    it('should return error for non-existent screenshot', async () => {
      const result = await service.compareScreenshots(
        'non-existent-id-1',
        'non-existent-id-2'
      );

      expect(result.success).toBe(false);
    });
  });

  describe('getScreenshot', () => {
    it('should retrieve stored screenshot', async () => {
      const viewport: Viewport = {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      const captureResult = await service.captureAtViewport(
        'https://example.com',
        viewport
      );

      expect(captureResult.success).toBe(true);
      if (captureResult.success) {
        const screenshot = await service.getScreenshot(
          captureResult.value.screenshot.id
        );

        expect(screenshot).toBeDefined();
        expect(screenshot?.id).toBe(captureResult.value.screenshot.id);
        expect(screenshot?.url).toBe('https://example.com');
      }
    });

    it('should return null for non-existent screenshot', async () => {
      const screenshot = await service.getScreenshot('non-existent-id');
      expect(screenshot).toBeNull();
    });
  });

  describe('createViewportCaptureService factory', () => {
    it('should create service instance', () => {
      const factoryService = createViewportCaptureService(memory);
      expect(factoryService).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const config: Partial<ViewportCaptureConfig> = {
        screenshotDirectory: '/custom/path',
        captureTimeout: 60000,
        parallelLimit: 5,
      };

      const factoryService = createViewportCaptureService(memory, undefined, config);
      expect(factoryService).toBeDefined();
    });
  });
});
