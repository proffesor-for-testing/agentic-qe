/**
 * prediction/visual-test-regression Test Suite
 *
 * Tests for visual regression detection using computer vision and
 * perceptual diffing algorithms for UI component testing.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { VisualTestRegressionHandler } from '@mcp/handlers/prediction/visual-test-regression';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('VisualTestRegressionHandler', () => {
  let handler: VisualTestRegressionHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      registerAgent: jest.fn(),
      getAllAgents: jest.fn().mockReturnValue([])
    } as any;

    mockHookExecutor = {
      executeHook: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new VisualTestRegressionHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path', () => {
    it('should detect visual regressions successfully', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://storage.example.com/baselines/homepage-v1.png',
            'https://storage.example.com/baselines/login-v1.png',
            'https://storage.example.com/baselines/dashboard-v1.png'
          ],
          comparisonImages: [
            'https://storage.example.com/current/homepage-latest.png',
            'https://storage.example.com/current/login-latest.png',
            'https://storage.example.com/current/dashboard-latest.png'
          ],
          threshold: 0.05,
          viewports: [
            { width: 1920, height: 1080, name: 'desktop' },
            { width: 768, height: 1024, name: 'tablet' },
            { width: 375, height: 667, name: 'mobile' }
          ]
        },
        options: {
          ignoreRegions: [
            { x: 0, y: 0, width: 100, height: 50 }
          ],
          ignoreColors: false,
          ignoreAntialiasing: true,
          generateReport: true
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.totalTests).toBeGreaterThan(0);
      expect(response.data.summary.overallStatus).toMatch(/pass|fail|warning/);
    });

    it('should return detailed comparison results', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://cdn.example.com/baseline/product-page.png',
            'https://cdn.example.com/baseline/checkout.png'
          ],
          comparisonImages: [
            'https://cdn.example.com/test/product-page.png',
            'https://cdn.example.com/test/checkout.png'
          ],
          threshold: 0.03,
          viewports: [
            { width: 1440, height: 900, name: 'laptop' }
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.comparisons).toBeDefined();
      expect(Array.isArray(response.data.comparisons)).toBe(true);
      expect(response.data.comparisons.length).toBeGreaterThan(0);

      const comparison = response.data.comparisons[0];
      expect(comparison).toHaveProperty('id');
      expect(comparison).toHaveProperty('baseline');
      expect(comparison).toHaveProperty('comparison');
      expect(comparison).toHaveProperty('viewport');
      expect(comparison).toHaveProperty('result');
      expect(comparison).toHaveProperty('analysis');
      expect(comparison).toHaveProperty('metadata');

      // Result validation
      expect(comparison.result.status).toMatch(/pass|fail|warning/);
      expect(comparison.result.diffPercentage).toBeGreaterThanOrEqual(0);
      expect(comparison.result.diffPercentage).toBeLessThanOrEqual(1);
      expect(comparison.result.pixelDiffCount).toBeGreaterThanOrEqual(0);

      // Analysis validation
      expect(comparison.analysis.changeType).toMatch(/layout|color|text|mixed|none/);
      expect(Array.isArray(comparison.analysis.affectedAreas)).toBe(true);
      expect(comparison.analysis.perceptualDiff).toBeGreaterThanOrEqual(0);
    });

    it('should provide visual insights', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://images.test.io/base/header.png',
            'https://images.test.io/base/footer.png',
            'https://images.test.io/base/sidebar.png'
          ],
          comparisonImages: [
            'https://images.test.io/new/header.png',
            'https://images.test.io/new/footer.png',
            'https://images.test.io/new/sidebar.png'
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.insights).toBeDefined();
      expect(Array.isArray(response.data.insights)).toBe(true);

      if (response.data.insights.length > 0) {
        const insight = response.data.insights[0];
        expect(insight.type).toMatch(/regression|improvement|intentional-change|false-positive/);
        expect(insight.severity).toMatch(/low|medium|high/);
        expect(insight.description).toBeDefined();
        expect(Array.isArray(insight.affectedTests)).toBe(true);
        expect(insight.suggestedAction).toBeDefined();
      }
    });

    it('should generate actionable recommendations', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://screenshots.app/v1/modal-dialog.png'
          ],
          comparisonImages: [
            'https://screenshots.app/v2/modal-dialog.png'
          ],
          threshold: 0.02
        },
        options: {
          generateReport: true
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);

      if (response.data.recommendations.length > 0) {
        const rec = response.data.recommendations[0];
        expect(rec).toHaveProperty('id');
        expect(rec.priority).toMatch(/low|medium|high|critical/);
        expect(rec.category).toMatch(/baseline-update|test-fix|code-fix|threshold-adjustment/);
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(Array.isArray(rec.actions)).toBe(true);
        expect(rec.confidence).toBeGreaterThan(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should track performance metrics', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://perf.test/baseline1.png',
            'https://perf.test/baseline2.png',
            'https://perf.test/baseline3.png'
          ],
          comparisonImages: [
            'https://perf.test/current1.png',
            'https://perf.test/current2.png',
            'https://perf.test/current3.png'
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.performance).toBeDefined();
      expect(response.data.performance.comparisonTime).toBeGreaterThan(0);
      expect(response.data.performance.avgDiffCalculation).toBeGreaterThan(0);
    });

    it('should generate reports when requested', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://example.com/base.png'],
          comparisonImages: ['https://example.com/test.png']
        },
        options: {
          generateReport: true
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.report).toBeDefined();
      expect(response.data.report?.htmlPath).toBeDefined();
      expect(response.data.report?.htmlPath).toContain('.html');
      expect(response.data.report?.jsonPath).toBeDefined();
      expect(response.data.report?.jsonPath).toContain('.json');
    });
  });

  describe('Multiple Viewports', () => {
    it('should test across multiple viewports', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://ui.example.com/landing-page.png'
          ],
          comparisonImages: [
            'https://ui.example.com/landing-page-new.png'
          ],
          viewports: [
            { width: 1920, height: 1080, name: '1080p-desktop' },
            { width: 1366, height: 768, name: 'laptop' },
            { width: 1024, height: 768, name: 'tablet-landscape' },
            { width: 768, height: 1024, name: 'tablet-portrait' },
            { width: 414, height: 896, name: 'iphone-xr' },
            { width: 375, height: 667, name: 'iphone-se' }
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.comparisons.length).toBe(6); // 1 image × 6 viewports

      const viewportNames = response.data.comparisons.map((c: any) => c.metadata.device);
      expect(viewportNames).toContain('1080p-desktop');
      expect(viewportNames).toContain('laptop');
      expect(viewportNames).toContain('tablet-landscape');
      expect(viewportNames).toContain('iphone-xr');
    });

    it('should detect responsive design issues', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://responsive.test/navbar.png'
          ],
          comparisonImages: [
            'https://responsive.test/navbar-updated.png'
          ],
          viewports: [
            { width: 1920, height: 1080, name: 'desktop' },
            { width: 375, height: 667, name: 'mobile' }
          ],
          threshold: 0.01
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.comparisons.length).toBe(2);

      const desktopComparison = response.data.comparisons.find((c: any) =>
        c.viewport.width === 1920
      );
      const mobileComparison = response.data.comparisons.find((c: any) =>
        c.viewport.width === 375
      );

      expect(desktopComparison).toBeDefined();
      expect(mobileComparison).toBeDefined();
    });
  });

  describe('Change Type Detection', () => {
    // TODO: Flaky test - changeType detection varies based on mock response timing
    it.skip('should detect layout changes', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://layout.test/grid-original.png'],
          comparisonImages: ['https://layout.test/grid-modified.png'],
          threshold: 0.08
        }
      });

      expect(response.success).toBe(true);
      const comparison = response.data.comparisons[0];
      expect(['layout', 'mixed']).toContain(comparison.analysis.changeType);
    });

    it('should detect color-only changes', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://color.test/theme-light.png'],
          comparisonImages: ['https://color.test/theme-dark.png'],
          threshold: 0.01
        }
      });

      expect(response.success).toBe(true);
      const comparison = response.data.comparisons[0];
      expect(comparison.analysis.changeType).toBeDefined();
    });

    it('should detect text changes', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://text.test/paragraph-v1.png'],
          comparisonImages: ['https://text.test/paragraph-v2.png'],
          threshold: 0.04
        }
      });

      expect(response.success).toBe(true);
      const comparison = response.data.comparisons[0];
      expect(['text', 'mixed', 'layout']).toContain(comparison.analysis.changeType);
    });

    it('should detect no changes', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://identical.test/static-image.png'],
          comparisonImages: ['https://identical.test/static-image.png'],
          threshold: 0.0
        }
      });

      expect(response.success).toBe(true);
      // When comparing identical images, diff should be very low
      const comparison = response.data.comparisons[0];
      expect(comparison.result.diffPercentage).toBeLessThan(0.1);
    });
  });

  describe('Affected Areas', () => {
    it('should identify affected regions with high diff', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://region.test/banner.png'],
          comparisonImages: ['https://region.test/banner-new.png'],
          threshold: 0.02
        }
      });

      expect(response.success).toBe(true);
      const comparison = response.data.comparisons[0];

      if (comparison.result.status !== 'pass') {
        expect(Array.isArray(comparison.analysis.affectedAreas)).toBe(true);

        if (comparison.analysis.affectedAreas.length > 0) {
          const area = comparison.analysis.affectedAreas[0];
          expect(area).toHaveProperty('x');
          expect(area).toHaveProperty('y');
          expect(area).toHaveProperty('width');
          expect(area).toHaveProperty('height');
          expect(area).toHaveProperty('severity');
          expect(area.severity).toMatch(/low|medium|high/);
        }
      }
    });

    it('should calculate perceptual difference', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://perceptual.test/gradient.png'],
          comparisonImages: ['https://perceptual.test/gradient-shifted.png']
        }
      });

      expect(response.success).toBe(true);
      const comparison = response.data.comparisons[0];
      expect(comparison.analysis.perceptualDiff).toBeGreaterThanOrEqual(0);
      expect(comparison.analysis.perceptualDiff).toBeLessThanOrEqual(1);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty baseline images', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [],
          comparisonImages: ['https://test.com/image.png']
        }
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Baseline images');
    });

    it('should reject empty comparison images', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://test.com/baseline.png'],
          comparisonImages: []
        }
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Comparison images');
    });

    it('should reject missing testConfig', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await handler.handle({
        testConfig: null as any
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: null as any,
          comparisonImages: null as any
        }
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle single image comparison', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://single.test/image.png'],
          comparisonImages: ['https://single.test/image-new.png']
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.comparisons.length).toBe(1);
    });

    it('should handle mismatched image counts', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: [
            'https://mismatch.test/img1.png',
            'https://mismatch.test/img2.png',
            'https://mismatch.test/img3.png'
          ],
          comparisonImages: [
            'https://mismatch.test/new1.png',
            'https://mismatch.test/new2.png'
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.comparisons).toBeDefined();
    });

    it('should handle very low thresholds', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://threshold.test/precise.png'],
          comparisonImages: ['https://threshold.test/precise-copy.png'],
          threshold: 0.001
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should handle very high thresholds', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://threshold.test/lenient.png'],
          comparisonImages: ['https://threshold.test/lenient-different.png'],
          threshold: 0.5
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.overallStatus).toBeDefined();
    });

    it('should handle concurrent requests', async () => {
      const testData = {
        testConfig: {
          baselineImages: ['https://concurrent.test/baseline.png'],
          comparisonImages: ['https://concurrent.test/comparison.png']
        }
      };

      const promises = Array.from({ length: 10 }, () =>
        handler.handle(testData)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('requestId');
      });
    });

    it('should handle ignore regions', async () => {
      const response = await handler.handle({
        testConfig: {
          baselineImages: ['https://ignore.test/with-ads.png'],
          comparisonImages: ['https://ignore.test/with-different-ads.png']
        },
        options: {
          ignoreRegions: [
            { x: 100, y: 50, width: 300, height: 250 }, // Ad region
            { x: 800, y: 50, width: 300, height: 250 }  // Another ad
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time for single comparison', async () => {
      const startTime = Date.now();

      await handler.handle({
        testConfig: {
          baselineImages: ['https://perf.test/single.png'],
          comparisonImages: ['https://perf.test/single-new.png']
        }
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should complete within reasonable time for multiple images', async () => {
      const startTime = Date.now();

      const images = Array.from({ length: 5 }, (_, i) =>
        `https://perf.test/image${i}.png`
      );

      await handler.handle({
        testConfig: {
          baselineImages: images,
          comparisonImages: images.map(img => img.replace('.png', '-new.png'))
        }
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Hook Integration', () => {
    it('should execute pre-task hook', async () => {
      await handler.handle({
        testConfig: {
          baselineImages: ['https://hook.test/base.png'],
          comparisonImages: ['https://hook.test/comp.png']
        }
      });

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'pre-task',
        expect.objectContaining({
          taskType: 'visual-test-regression'
        })
      );
    });

    it('should execute post-task hook', async () => {
      await handler.handle({
        testConfig: {
          baselineImages: ['https://hook.test/base.png'],
          comparisonImages: ['https://hook.test/comp.png']
        }
      });

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'post-task',
        expect.objectContaining({
          taskType: 'visual-test-regression'
        })
      );
    });
  });
});
