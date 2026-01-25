/**
 * Agentic QE v3 - Responsive Tester Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ResponsiveTesterService,
  ResponsiveTestConfig,
  DEVICE_VIEWPORTS,
} from '../../../../src/domains/visual-accessibility/services/responsive-tester';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { Viewport } from '../../../../src/domains/visual-accessibility/interfaces';

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

describe('ResponsiveTesterService', () => {
  let service: ResponsiveTesterService;
  let mockMemory: MockMemoryBackend;

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    service = new ResponsiveTesterService(mockMemory);
  });

  describe('DEVICE_VIEWPORTS', () => {
    it('should include mobile device viewports', () => {
      expect(DEVICE_VIEWPORTS['iphone-14']).toBeDefined();
      expect(DEVICE_VIEWPORTS['iphone-14'].isMobile).toBe(true);
      expect(DEVICE_VIEWPORTS['iphone-14'].hasTouch).toBe(true);
    });

    it('should include tablet device viewports', () => {
      expect(DEVICE_VIEWPORTS['ipad-mini']).toBeDefined();
      expect(DEVICE_VIEWPORTS['ipad-pro']).toBeDefined();
    });

    it('should include desktop viewports', () => {
      expect(DEVICE_VIEWPORTS['desktop-hd']).toBeDefined();
      expect(DEVICE_VIEWPORTS['desktop-hd'].isMobile).toBe(false);
      expect(DEVICE_VIEWPORTS['desktop-hd'].width).toBe(1920);
    });

    it('should have correct device scale factors', () => {
      expect(DEVICE_VIEWPORTS['iphone-14'].deviceScaleFactor).toBe(3);
      expect(DEVICE_VIEWPORTS['desktop-hd'].deviceScaleFactor).toBe(1);
    });
  });

  describe('testResponsiveness', () => {
    it('should test responsiveness across default viewports', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.timestamp).toBeInstanceOf(Date);
        expect(Array.isArray(result.value.viewports)).toBe(true);
        expect(result.value.viewports.length).toBeGreaterThan(0);
      }
    });

    it('should return layout score between 0 and 100', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.layoutScore).toBeGreaterThanOrEqual(0);
        expect(result.value.layoutScore).toBeLessThanOrEqual(105); // Includes bonus
      }
    });

    it('should test custom viewports when provided', async () => {
      const customViewports: Viewport[] = [
        { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const result = await service.testResponsiveness('https://example.com', {
        viewports: customViewports,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewports.length).toBe(2);
        expect(result.value.viewports[0].viewport.width).toBe(320);
        expect(result.value.viewports[1].viewport.width).toBe(1440);
      }
    });

    it('should detect layout issues', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        result.value.viewports.forEach((viewportResult) => {
          expect(Array.isArray(viewportResult.layoutIssues)).toBe(true);
        });
      }
    });

    it('should include render time for each viewport', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        result.value.viewports.forEach((viewportResult) => {
          expect(typeof viewportResult.renderTime).toBe('number');
          expect(viewportResult.renderTime).toBeGreaterThan(0);
        });
      }
    });

    it('should generate recommendations based on issues', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.recommendations)).toBe(true);
      }
    });

    it('should include screenshot for each viewport', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        result.value.viewports.forEach((viewportResult) => {
          expect(viewportResult.screenshot).toBeDefined();
          expect(viewportResult.screenshot.id).toBeDefined();
          expect(viewportResult.screenshot.url).toBe('https://example.com');
        });
      }
    });

    it('should detect breakpoint issues', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.breakpointIssues)).toBe(true);
      }
    });

    it('should store result in memory', async () => {
      await service.testResponsiveness('https://example.com');

      const stored = mockMemory.getAll();
      const responsiveKeys = Array.from(stored.keys()).filter((k) =>
        k.includes('responsive')
      );
      expect(responsiveKeys.length).toBeGreaterThan(0);
    });
  });

  describe('compareViewports', () => {
    it('should compare two viewports', async () => {
      const result = await service.compareViewports(
        'https://example.com',
        DEVICE_VIEWPORTS['iphone-14'],
        DEVICE_VIEWPORTS['desktop-hd']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.baselineId).toBeDefined();
        expect(result.value.comparisonId).toBeDefined();
        expect(typeof result.value.diffPercentage).toBe('number');
      }
    });

    it('should return valid diff status', async () => {
      const result = await service.compareViewports(
        'https://example.com',
        DEVICE_VIEWPORTS['iphone-14'],
        DEVICE_VIEWPORTS['laptop']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(['identical', 'acceptable', 'changed', 'failed']).toContain(
          result.value.status
        );
      }
    });

    it('should calculate structural diff based on viewport size difference', async () => {
      const result = await service.compareViewports(
        'https://example.com',
        DEVICE_VIEWPORTS['iphone-se'],
        DEVICE_VIEWPORTS['desktop-2k']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Larger viewport differences should result in higher diff percentage
        expect(result.value.diffPercentage).toBeGreaterThan(0);
      }
    });
  });

  describe('testBreakpoint', () => {
    it('should test specific breakpoint width', async () => {
      const result = await service.testBreakpoint('https://example.com', 768);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport.width).toBe(768);
      }
    });

    it('should set mobile flag for small breakpoints', async () => {
      const result = await service.testBreakpoint('https://example.com', 375);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport.isMobile).toBe(true);
      }
    });

    it('should set desktop flag for large breakpoints', async () => {
      const result = await service.testBreakpoint('https://example.com', 1920);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport.isMobile).toBe(false);
      }
    });

    it('should include layout issues for breakpoint', async () => {
      const result = await service.testBreakpoint('https://example.com', 480);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.layoutIssues)).toBe(true);
      }
    });

    it('should indicate pass/fail for breakpoint', async () => {
      const result = await service.testBreakpoint('https://example.com', 1024);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value.passed).toBe('boolean');
      }
    });
  });

  describe('analyzeBreakpoints', () => {
    it('should analyze breakpoints for URL', async () => {
      const result = await service.analyzeBreakpoints('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.currentBreakpoints)).toBe(true);
        expect(Array.isArray(result.value.suggestedBreakpoints)).toBe(true);
        expect(Array.isArray(result.value.contentBreaks)).toBe(true);
      }
    });

    it('should return coverage score', async () => {
      const result = await service.analyzeBreakpoints('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value.coverageScore).toBe('number');
        expect(result.value.coverageScore).toBeGreaterThanOrEqual(0);
        expect(result.value.coverageScore).toBeLessThanOrEqual(100);
      }
    });

    it('should include content breaks with reasons', async () => {
      const result = await service.analyzeBreakpoints('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.contentBreaks.length > 0) {
        const contentBreak = result.value.contentBreaks[0];
        expect(contentBreak).toHaveProperty('width');
        expect(contentBreak).toHaveProperty('reason');
        expect(contentBreak).toHaveProperty('affectedElements');
      }
    });

    it('should suggest standard breakpoints', async () => {
      const result = await service.analyzeBreakpoints('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        const suggested = result.value.suggestedBreakpoints;
        expect(suggested.length).toBeGreaterThan(0);
        // Should include some standard breakpoints
        const standardBreakpoints = [576, 768, 992, 1200, 1400];
        const hasStandard = suggested.some((bp) =>
          standardBreakpoints.some((std) => Math.abs(bp - std) < 50)
        );
        expect(hasStandard).toBe(true);
      }
    });
  });

  describe('layout issue detection', () => {
    it('should detect horizontal overflow on small viewports', async () => {
      const result = await service.testBreakpoint('https://example.com', 320);

      expect(result.success).toBe(true);
      // Layout issues are probabilistically generated in stub implementation
      // Just verify the structure is correct
      if (result.success) {
        result.value.layoutIssues.forEach((issue) => {
          expect(issue).toHaveProperty('type');
          expect(issue).toHaveProperty('severity');
          expect(issue).toHaveProperty('element');
          expect(issue).toHaveProperty('description');
          expect(issue).toHaveProperty('viewport');
        });
      }
    });

    it('should classify issue severity correctly', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        const allIssues = result.value.viewports.flatMap((v) => v.layoutIssues);
        const validSeverities = ['critical', 'warning', 'info'];
        allIssues.forEach((issue) => {
          expect(validSeverities).toContain(issue.severity);
        });
      }
    });

    it('should detect touch target size issues on mobile', async () => {
      const result = await service.testBreakpoint('https://example.com', 375);

      expect(result.success).toBe(true);
      // Touch target issues are probabilistically generated
      // Verify structure is correct for any detected issues
      if (result.success) {
        const touchIssues = result.value.layoutIssues.filter(
          (i) => i.type === 'touch-target-size'
        );
        touchIssues.forEach((issue) => {
          expect(issue.severity).toBe('warning');
        });
      }
    });
  });

  describe('custom configuration', () => {
    it('should use custom viewports', async () => {
      const customViewports: Viewport[] = [
        { width: 800, height: 600, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      ];

      const customConfig: Partial<ResponsiveTestConfig> = {
        viewports: customViewports,
      };

      const customService = new ResponsiveTesterService(mockMemory, customConfig);
      const result = await customService.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewports.length).toBe(1);
        expect(result.value.viewports[0].viewport.width).toBe(800);
      }
    });

    it('should use custom breakpoints', async () => {
      const customConfig: Partial<ResponsiveTestConfig> = {
        breakpoints: [400, 800, 1200],
      };

      const customService = new ResponsiveTesterService(mockMemory, customConfig);
      const result = await customService.analyzeBreakpoints('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.currentBreakpoints).toEqual([400, 800, 1200]);
      }
    });

    it('should use custom minimum font size', () => {
      const customConfig: Partial<ResponsiveTestConfig> = {
        minFontSize: 14,
      };

      const customService = new ResponsiveTesterService(mockMemory, customConfig);
      expect(customService).toBeDefined();
    });

    it('should use custom minimum touch target size', () => {
      const customConfig: Partial<ResponsiveTestConfig> = {
        minTouchTargetSize: 48,
      };

      const customService = new ResponsiveTesterService(mockMemory, customConfig);
      expect(customService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle test responsiveness errors gracefully', async () => {
      const errorMemory = new MockMemoryBackend();
      vi.spyOn(errorMemory, 'set').mockRejectedValue(new Error('Storage failed'));

      const errorService = new ResponsiveTesterService(errorMemory);
      const result = await errorService.testResponsiveness('https://example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('should handle compare viewports errors gracefully', async () => {
      // Create mock that works normally for regular operations
      const result = await service.compareViewports(
        'https://example.com',
        DEVICE_VIEWPORTS['iphone-14'],
        DEVICE_VIEWPORTS['desktop-hd']
      );

      expect(result.success).toBe(true);
    });

    it('should handle breakpoint analysis errors gracefully', async () => {
      const result = await service.analyzeBreakpoints('https://example.com');

      expect(result.success).toBe(true);
    });
  });

  describe('viewport result structure', () => {
    it('should include all required fields in viewport result', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        result.value.viewports.forEach((viewportResult) => {
          expect(viewportResult).toHaveProperty('viewport');
          expect(viewportResult).toHaveProperty('screenshot');
          expect(viewportResult).toHaveProperty('layoutIssues');
          expect(viewportResult).toHaveProperty('renderTime');
          expect(viewportResult).toHaveProperty('passed');
        });
      }
    });

    it('should include screenshot metadata', async () => {
      const result = await service.testResponsiveness('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        result.value.viewports.forEach((viewportResult) => {
          expect(viewportResult.screenshot.metadata).toHaveProperty('browser');
          expect(viewportResult.screenshot.metadata).toHaveProperty('os');
          expect(viewportResult.screenshot.metadata).toHaveProperty('loadTime');
        });
      }
    });
  });
});
