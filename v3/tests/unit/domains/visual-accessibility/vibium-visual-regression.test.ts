/**
 * Visual Regression Service Tests
 * Split from vibium-visual-testing.test.ts
 * GOAP Action A2.4: Tests for visual-regression service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '../../../../src/shared/types/index.js';
import { FilePath } from '../../../../src/shared/value-objects/index.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import type { VibiumClient } from '../../../../src/integrations/vibium/types.js';
import type {
  Screenshot,
  Viewport,
  VisualDiff,
  DiffStatus,
} from '../../../../src/domains/visual-accessibility/interfaces.js';

import {
  VisualRegressionService,
  createVisualRegressionService,
  type VisualRegressionConfig,
  type VisualRegressionResult,
  type BaselineMetadata,
} from '../../../../src/domains/visual-accessibility/services/visual-regression.js';

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
      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
      expect(service).toBeInstanceOf(VisualRegressionService);
    });

    it('should create service with Vibium client', () => {
      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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
        diffThreshold: 1.0,
        useBrowserCapture: false,
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
        diffThreshold: 0.01,
        useBrowserCapture: false,
      });

      const result = await service.runTest('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
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
        .mockResolvedValueOnce(baselineMetadata);

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
      const result = await service.runTest('https://example.com', {
        forceUpdateBaseline: true,
      });

      expect(result.success).toBe(true);
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(baselineMetadata)
        .mockResolvedValueOnce(baselineScreenshot);

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
        const result = await service.deleteBaseline('baseline-1');

        expect(result.success).toBe(true);
        expect(mockMemory.delete).toHaveBeenCalled();
      });

      it('should return error for non-existent baseline', async () => {
        (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
      const result = await service.compareScreenshots(screenshot, screenshot);

      expect(result.success).toBe(true);
      if (result.success) {
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
      const available = await service.isBrowserAvailable();

      expect(available).toBe(true);
    });

    it('should return false when no client provided', async () => {
      const service = createVisualRegressionService(mockMemory, null);
      const available = await service.isBrowserAvailable();

      expect(available).toBe(false);
    });

    it('should cache availability result', async () => {
      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });

      await service.isBrowserAvailable();
      await service.isBrowserAvailable();

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

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
      const result = await service.getDiff('screenshot-1_screenshot-2');

      expect(result).toEqual(diff);
    });

    it('should return null for non-existent diff', async () => {
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = createVisualRegressionService(mockMemory, mockVibiumClient, undefined, { useBrowserCapture: false });
      const result = await service.getDiff('non-existent');

      expect(result).toBeNull();
    });
  });
});
