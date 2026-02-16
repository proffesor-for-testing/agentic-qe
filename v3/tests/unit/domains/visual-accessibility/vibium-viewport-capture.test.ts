/**
 * Viewport Capture Service Tests
 * Split from vibium-visual-testing.test.ts
 * GOAP Action A2.3: Tests for viewport-capture service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../../../../src/shared/types/index.js';
import { FilePath } from '../../../../src/shared/value-objects/index.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import type { VibiumClient } from '../../../../src/integrations/vibium/types.js';
import type {
  Screenshot,
  Viewport,
} from '../../../../src/domains/visual-accessibility/interfaces.js';

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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
      expect(service).toBeInstanceOf(ViewportCaptureService);
    });

    it('should create service with Vibium client', () => {
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, {
        preferAgentBrowser: false,
      });
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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, {
        preferAgentBrowser: false,
      });
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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

      const result = await service.captureWithPresets('https://example.com', [
        'mobile-m',
        'unknown-preset',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures).toHaveLength(1);
      }
    });

    it('should return error when no valid presets', async () => {
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { includeStandardBreakpoints: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const capturedWidths = result.value.captures.map((c) => c.viewport.width);
        expect(capturedWidths).toContain(768);
        expect(capturedWidths).toContain(1024);
      }
    });

    it('should respect custom breakpoints', async () => {
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

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
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { stepSize: 200 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.layoutShifts)).toBe(true);
        result.value.layoutShifts.forEach((shift) => {
          expect(shift.fromWidth).toBeLessThan(shift.toWidth);
          expect(shift.shiftMagnitude).toBeGreaterThanOrEqual(0);
          expect(shift.affectedAreas).toBeDefined();
        });
      }
    });

    it('should calculate responsive score', async () => {
      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });

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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
      const result = await service.getScreenshot('test-id');

      expect(result).toEqual(screenshot);
    });

    it('should return null for non-existent screenshot', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createViewportCaptureService(mockMemory, mockVibiumClient, { preferAgentBrowser: false });
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
      expect(DEFAULT_BREAKPOINTS).toContain(320);
      expect(DEFAULT_BREAKPOINTS).toContain(768);
      expect(DEFAULT_BREAKPOINTS).toContain(1024);
      expect(DEFAULT_BREAKPOINTS).toContain(1440);
    });
  });
});
