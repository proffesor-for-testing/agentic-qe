/**
 * Agentic QE v3 - Visual Tester Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisualTesterService, VisualTesterConfig } from '../../../../src/domains/visual-accessibility/services/visual-tester';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { Screenshot, Viewport } from '../../../../src/domains/visual-accessibility/interfaces';

/**
 * Mock MemoryBackend implementation for testing
 */
class MockMemoryBackend implements MemoryBackend {
  private store: Map<string, unknown> = new Map();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {}

  // Test helper methods
  clear(): void {
    this.store.clear();
  }

  getAll(): Map<string, unknown> {
    return new Map(this.store);
  }
}

describe('VisualTesterService', () => {
  let service: VisualTesterService;
  let mockMemory: MockMemoryBackend;

  const defaultViewport: Viewport = {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  };

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    service = new VisualTesterService({ memory: mockMemory });
  });

  describe('captureScreenshot', () => {
    it('should capture screenshot with default viewport', async () => {
      const result = await service.captureScreenshot('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.viewport.width).toBe(1280);
        expect(result.value.viewport.height).toBe(720);
        expect(result.value.id).toBeDefined();
        expect(result.value.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should capture screenshot with custom viewport', async () => {
      const customViewport: Viewport = {
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      };

      const result = await service.captureScreenshot('https://example.com', {
        viewport: customViewport,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport).toEqual(customViewport);
      }
    });

    it('should capture full page screenshot when fullPage option is true', async () => {
      const result = await service.captureScreenshot('https://example.com', {
        fullPage: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metadata.fullPage).toBe(true);
      }
    });

    it('should store screenshot metadata in memory', async () => {
      const result = await service.captureScreenshot('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        const stored = await mockMemory.get<Screenshot>(
          `visual-accessibility:screenshot:${result.value.id}`
        );
        expect(stored).toBeDefined();
        expect(stored?.url).toBe('https://example.com');
      }
    });

    it('should generate unique IDs for each screenshot', async () => {
      const result1 = await service.captureScreenshot('https://example.com');
      const result2 = await service.captureScreenshot('https://example.com');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result2.success) {
        expect(result1.value.id).not.toBe(result2.value.id);
      }
    });

    it('should include browser and OS metadata', async () => {
      const result = await service.captureScreenshot('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metadata.browser).toBe('chromium');
        expect(result.value.metadata.os).toBeDefined();
      }
    });
  });

  describe('captureElement', () => {
    it('should capture element with selector', async () => {
      const result = await service.captureElement(
        'https://example.com',
        '.main-content'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.metadata.selector).toBe('.main-content');
        expect(result.value.metadata.fullPage).toBe(false);
      }
    });

    it('should use default viewport for element capture', async () => {
      const result = await service.captureElement('https://example.com', '#header');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport.width).toBe(1280);
      }
    });

    it('should store element screenshot in memory', async () => {
      const result = await service.captureElement('https://example.com', '#footer');

      expect(result.success).toBe(true);
      if (result.success) {
        const stored = await mockMemory.get<Screenshot>(
          `visual-accessibility:screenshot:${result.value.id}`
        );
        expect(stored).toBeDefined();
        expect(stored?.metadata.selector).toBe('#footer');
      }
    });
  });

  describe('setBaseline', () => {
    it('should set screenshot as baseline', async () => {
      const captureResult = await service.captureScreenshot('https://example.com');
      expect(captureResult.success).toBe(true);
      if (!captureResult.success) return;

      const result = await service.setBaseline(captureResult.value);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeDefined();
        expect(typeof result.value).toBe('string');
      }
    });

    it('should store baseline with URL and viewport key', async () => {
      const captureResult = await service.captureScreenshot('https://example.com');
      expect(captureResult.success).toBe(true);
      if (!captureResult.success) return;

      await service.setBaseline(captureResult.value);

      const stored = mockMemory.getAll();
      const baselineKeys = Array.from(stored.keys()).filter((k) =>
        k.includes('baseline')
      );
      expect(baselineKeys.length).toBeGreaterThan(0);
    });
  });

  describe('getBaseline', () => {
    it('should retrieve existing baseline', async () => {
      const captureResult = await service.captureScreenshot('https://example.com');
      expect(captureResult.success).toBe(true);
      if (!captureResult.success) return;

      await service.setBaseline(captureResult.value);

      const baseline = await service.getBaseline('https://example.com', defaultViewport);

      expect(baseline).not.toBeNull();
      expect(baseline?.url).toBe('https://example.com');
    });

    it('should return null for non-existent baseline', async () => {
      const baseline = await service.getBaseline(
        'https://nonexistent.com',
        defaultViewport
      );

      expect(baseline).toBeNull();
    });

    it('should differentiate baselines by viewport', async () => {
      const mobileViewport: Viewport = {
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      };

      // Create desktop baseline
      const desktopResult = await service.captureScreenshot('https://example.com', {
        viewport: defaultViewport,
      });
      expect(desktopResult.success).toBe(true);
      if (desktopResult.success) {
        await service.setBaseline(desktopResult.value);
      }

      // Create mobile baseline
      const mobileResult = await service.captureScreenshot('https://example.com', {
        viewport: mobileViewport,
      });
      expect(mobileResult.success).toBe(true);
      if (mobileResult.success) {
        await service.setBaseline(mobileResult.value);
      }

      const desktopBaseline = await service.getBaseline('https://example.com', defaultViewport);
      const mobileBaseline = await service.getBaseline('https://example.com', mobileViewport);

      expect(desktopBaseline).not.toBeNull();
      expect(mobileBaseline).not.toBeNull();
      expect(desktopBaseline?.id).not.toBe(mobileBaseline?.id);
    });
  });

  describe('compare', () => {
    it('should compare screenshot against baseline', async () => {
      // Create and set baseline
      const baselineCapture = await service.captureScreenshot('https://example.com');
      expect(baselineCapture.success).toBe(true);
      if (!baselineCapture.success) return;

      await service.setBaseline(baselineCapture.value);

      // Capture new screenshot
      const newCapture = await service.captureScreenshot('https://example.com');
      expect(newCapture.success).toBe(true);
      if (!newCapture.success) return;

      const result = await service.compare(newCapture.value, baselineCapture.value.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.baselineId).toBe(baselineCapture.value.id);
        expect(result.value.comparisonId).toBe(newCapture.value.id);
        expect(typeof result.value.diffPercentage).toBe('number');
        expect(result.value.diffPercentage).toBeGreaterThanOrEqual(0);
        expect(result.value.status).toBeDefined();
      }
    });

    it('should return error for non-existent baseline', async () => {
      const captureResult = await service.captureScreenshot('https://example.com');
      expect(captureResult.success).toBe(true);
      if (!captureResult.success) return;

      const result = await service.compare(captureResult.value, 'non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Baseline not found');
      }
    });

    it('should return valid diff status', async () => {
      const baselineCapture = await service.captureScreenshot('https://example.com');
      expect(baselineCapture.success).toBe(true);
      if (!baselineCapture.success) return;

      await service.setBaseline(baselineCapture.value);

      const newCapture = await service.captureScreenshot('https://example.com');
      expect(newCapture.success).toBe(true);
      if (!newCapture.success) return;

      const result = await service.compare(newCapture.value, baselineCapture.value.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(['identical', 'acceptable', 'changed', 'failed']).toContain(
          result.value.status
        );
      }
    });

    it('should include diff regions when differences exist', async () => {
      const baselineCapture = await service.captureScreenshot('https://example.com');
      expect(baselineCapture.success).toBe(true);
      if (!baselineCapture.success) return;

      await service.setBaseline(baselineCapture.value);

      const newCapture = await service.captureScreenshot('https://example.com');
      expect(newCapture.success).toBe(true);
      if (!newCapture.success) return;

      const result = await service.compare(newCapture.value, baselineCapture.value.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.regions)).toBe(true);
      }
    });

    it('should store diff result in memory', async () => {
      const baselineCapture = await service.captureScreenshot('https://example.com');
      expect(baselineCapture.success).toBe(true);
      if (!baselineCapture.success) return;

      await service.setBaseline(baselineCapture.value);

      const newCapture = await service.captureScreenshot('https://example.com');
      expect(newCapture.success).toBe(true);
      if (!newCapture.success) return;

      await service.compare(newCapture.value, baselineCapture.value.id);

      const stored = mockMemory.getAll();
      const diffKeys = Array.from(stored.keys()).filter((k) => k.includes('diff'));
      expect(diffKeys.length).toBeGreaterThan(0);
    });
  });

  describe('custom configuration', () => {
    it('should use custom config values', () => {
      const customConfig: Partial<VisualTesterConfig> = {
        diffThreshold: 5,
        baselineDirectory: 'custom/baselines',
        diffDirectory: 'custom/diffs',
      };

      const customService = new VisualTesterService({ memory: mockMemory }, customConfig);

      // Service should be created with custom config
      expect(customService).toBeDefined();
    });

    it('should use custom default viewport', async () => {
      const customConfig: Partial<VisualTesterConfig> = {
        defaultViewport: {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        },
      };

      const customService = new VisualTesterService({ memory: mockMemory }, customConfig);
      const result = await customService.captureScreenshot('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport.width).toBe(1920);
        expect(result.value.viewport.height).toBe(1080);
      }
    });
  });
});
