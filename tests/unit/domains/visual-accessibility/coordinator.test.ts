/**
 * Agentic QE v3 - Visual Accessibility Coordinator Unit Tests
 * Milestone 1.5: Domain Coordinator Testing
 *
 * Tests cover:
 * - Constructor and initialization
 * - Visual regression testing
 * - Accessibility audits (WCAG compliance)
 * - Screenshot comparison
 * - Color contrast analysis
 * - Responsive design testing
 * - MinCut topology awareness
 * - Consensus verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VisualAccessibilityCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/visual-accessibility/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  flushPromises,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';

describe('VisualAccessibilityCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: VisualAccessibilityCoordinator;

  const defaultConfig: Partial<CoordinatorConfig> = {
    maxConcurrentWorkflows: 5,
    defaultTimeout: 60000,
    publishEvents: true,
    enableMinCutAwareness: false,
    enableConsensus: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new VisualAccessibilityCoordinator(
      ctx.eventBus,
      ctx.memory,
      ctx.agentCoordinator,
      defaultConfig
    );
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  // ===========================================================================
  // Constructor and Initialization Tests
  // ===========================================================================

  describe('Constructor and Initialization', () => {
    it('should create coordinator with default config', () => {
      const coord = new VisualAccessibilityCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator
      );
      expect(coord).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent on multiple initializations', async () => {
      await coordinator.initialize();
      await coordinator.initialize();
    });

    it('should start with no active workflows', async () => {
      await coordinator.initialize();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Visual Regression Tests
  // ===========================================================================

  describe('Visual Regression Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runVisualRegression()', () => {
      it('should run visual regression tests', async () => {
        const result = await coordinator.runVisualRegression({
          baselineUrl: 'http://localhost:3000',
          compareUrl: 'http://localhost:3001',
          pages: ['/home', '/about'],
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.differences).toBeDefined();
        }
      });

      it('should spawn visual testing agent', async () => {
        await coordinator.runVisualRegression({
          baselineUrl: 'http://localhost:3000',
          compareUrl: 'http://localhost:3001',
          pages: ['/home'],
        });

        expect(ctx.agentCoordinator.spawn).toHaveBeenCalled();
      });

      it('should return error when agent limit reached', async () => {
        ctx.agentCoordinator.setMaxAgents(0);

        const result = await coordinator.runVisualRegression({
          baselineUrl: 'http://localhost:3000',
          compareUrl: 'http://localhost:3001',
          pages: ['/home'],
        });

        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Accessibility Audit Tests
  // ===========================================================================

  describe('Accessibility Audit', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('runAccessibilityAudit()', () => {
      it('should have runAccessibilityAudit method', async () => {
        // Verify the method exists - actual network tests are integration tests
        expect(typeof coordinator.runAccessibilityAudit).toBe('function');
      });
    });

    // #1145: a page no browser could load is not a pass, a fail or a finding
    describe('runAccessibilityAudit() without a measurement', () => {
      const axeJson = JSON.stringify({
        violations: [{
          id: 'image-alt', impact: 'critical', description: 'Images must have alternate text',
          help: 'Images must have alternate text', tags: ['wcag2a', 'wcag111'],
          nodes: [{ selector: 'img', html: '<img>', target: ['img'], failureSummary: 'no alt' }],
        }],
        passes: ['html-has-lang'], incomplete: [], inapplicable: [],
      });

      function browserClient() {
        return {
          tool: 'vibium',
          launch: vi.fn().mockResolvedValue({ success: true, value: { id: 's' } }),
          navigate: vi.fn(async (url: string) => url.includes('.invalid')
            ? { success: false, error: new Error('net::ERR_NAME_NOT_RESOLVED') }
            : { success: true, value: { url, title: 't', statusCode: 200, loadTime: 1 } }),
          evaluate: vi.fn().mockResolvedValue({ success: true, value: axeJson }),
          quit: vi.fn().mockResolvedValue({ success: true, value: undefined }),
          isAvailable: vi.fn().mockResolvedValue(true),
          dispose: vi.fn().mockResolvedValue(undefined),
        } as never;
      }

      async function coordinatorWith(accessibilityConfig: Record<string, unknown>) {
        const coord = new VisualAccessibilityCoordinator(
          ctx.eventBus, ctx.memory, ctx.agentCoordinator, defaultConfig, {},
          { preferAgentBrowser: false, ...accessibilityConfig }
        );
        await coord.initialize();
        return coord;
      }

      it('should report not-measured with no findings when no browser is available', async () => {
        const coord = await coordinatorWith({});
        const result = await coord.runAccessibilityAudit(['https://example.invalid/'], 'AA');
        await coord.dispose();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.status).toBe('not-measured');
          expect(result.value.measuredUrls).toBe(0);
          expect(result.value.passingUrls).toBe(0);
          expect(result.value.totalViolations).toBe(0);
          expect(result.value.topIssues).toEqual([]);
          expect(result.value.notMeasured?.[0].url).toBe('https://example.invalid/');
          expect(result.value.message).toContain('NOT MEASURED for 1 of 1 URL(s)');
        }
        expect(ctx.eventBus.getPublishedEvents()
          .filter((e) => e.type === 'visual-accessibility.AccessibilityAuditCompleted')).toEqual([]);
      });

      it('should count only the measured URL when another host does not resolve', async () => {
        const coord = await coordinatorWith({ browserClient: browserClient() });
        const result = await coord.runAccessibilityAudit(
          ['https://example.invalid/', 'http://127.0.0.1:18145/'], 'AA'
        );
        await coord.dispose();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.status).toBe('partial');
          expect(result.value.measuredUrls).toBe(1);
          expect(result.value.totalViolations).toBe(1);
          expect(result.value.topIssues.map((i) => i.affectedUrls)).toEqual([['http://127.0.0.1:18145/']]);
          expect(result.value.notMeasured).toEqual([
            { url: 'https://example.invalid/', reason: expect.stringContaining('ERR_NAME_NOT_RESOLVED') },
          ]);
          const invalid = result.value.reports.find((r) => r.url === 'https://example.invalid/');
          expect(invalid?.measured).toBe(false);
          expect(invalid?.violations).toEqual([]);
        }
      });

      it('should list a URL whose audit errored instead of dropping it', async () => {
        const coord = await coordinatorWith({ browserClient: browserClient() });
        // The measured report cannot be stored, so the tester returns an error
        vi.spyOn(ctx.memory, 'set').mockImplementation(async (key: string) => {
          if (key.startsWith('visual-accessibility:report:')) throw new Error('Storage failed');
        });
        const result = await coord.runAccessibilityAudit(['http://127.0.0.1:18145/'], 'AA');
        await coord.dispose();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.status).toBe('not-measured');
          expect(result.value.reports).toEqual([]);
          expect(result.value.notMeasured).toEqual([
            { url: 'http://127.0.0.1:18145/', reason: 'Storage failed' },
          ]);
        }
      });

      it('should not turn a missing report into a clean single-URL pass', async () => {
        const coord = await coordinatorWith({});
        const result = await coord.runAccessibilityAuditSingle({ url: 'https://example.invalid/', wcagLevel: 'AA' });
        await coord.dispose();

        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.message).toContain('NOT MEASURED');
      });

      it('should not invent contrast issues for an unmeasured page', async () => {
        const coord = await coordinatorWith({});
        const result = await coord.analyzeColorContrast({ url: 'https://example.invalid/' });
        await coord.dispose();

        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.message).toContain('Color contrast NOT MEASURED');
      });
    });
  });

  // ===========================================================================
  // Screenshot Comparison Tests
  // ===========================================================================

  describe('Screenshot Comparison', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('compareScreenshots()', () => {
      it('should compare screenshots', async () => {
        const result = await coordinator.compareScreenshots({
          baseline: 'screenshots/baseline.png',
          current: 'screenshots/current.png',
          threshold: 0.1,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.diffPercentage).toBeDefined();
          expect(result.value.passed).toBeDefined();
        }
      });
    });
  });

  // ===========================================================================
  // Color Contrast Analysis Tests
  // ===========================================================================

  describe('Color Contrast Analysis', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('analyzeColorContrast()', () => {
      it('should have analyzeColorContrast method', async () => {
        // Verify the method exists
        expect(typeof coordinator.analyzeColorContrast).toBe('function');
      });
    });
  });

  // ===========================================================================
  // Responsive Design Tests
  // ===========================================================================

  describe('Responsive Design Testing', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('testResponsiveDesign()', () => {
      it('should test responsive design across viewports', async () => {
        const result = await coordinator.testResponsiveDesign({
          url: 'http://localhost:3000',
          viewports: [
            { width: 375, height: 667, name: 'mobile' },
            { width: 768, height: 1024, name: 'tablet' },
            { width: 1920, height: 1080, name: 'desktop' },
          ],
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.viewportResults).toBeDefined();
        }
      });
    });
  });

  // ===========================================================================
  // MinCut Topology Awareness Tests
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: VisualAccessibilityCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new VisualAccessibilityCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableMinCutAwareness: true,
          topologyHealthThreshold: 0.5,
          pauseOnCriticalTopology: true,
        }
      );
      await topologyCoordinator.initialize();
    });

    afterEach(async () => {
      await topologyCoordinator.dispose();
    });

    it('should report topology health status', () => {
      expect(topologyCoordinator.isTopologyHealthy()).toBe(true);
    });

    it('should accept MinCut bridge', () => {
      expect(() => {
        topologyCoordinator.setMinCutBridge({} as any);
      }).not.toThrow();
    });

    it('should check if domain is weak point', () => {
      expect(topologyCoordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should filter target domains based on topology', () => {
      const targets = ['quality-assessment', 'test-execution'] as any[];
      const filtered = topologyCoordinator.getTopologyBasedRouting(targets);
      expect(Array.isArray(filtered)).toBe(true);
    });
  });

  // ===========================================================================
  // Consensus Verification Tests
  // ===========================================================================

  describe('Consensus Verification', () => {
    let consensusCoordinator: VisualAccessibilityCoordinator;

    beforeEach(async () => {
      consensusCoordinator = new VisualAccessibilityCoordinator(
        ctx.eventBus,
        ctx.memory,
        ctx.agentCoordinator,
        {
          ...defaultConfig,
          enableConsensus: true,
          consensusThreshold: 0.7,
          consensusStrategy: 'weighted',
          consensusMinModels: 2,
        }
      );
      await consensusCoordinator.initialize();
    });

    afterEach(async () => {
      await consensusCoordinator.dispose();
    });

    it('should check consensus availability', () => {
      const available = consensusCoordinator.isConsensusAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should get consensus statistics', () => {
      const stats = consensusCoordinator.getConsensusStats();
      // Stats may be undefined if consensus engine not fully initialized
      expect(stats === undefined || typeof stats === 'object').toBe(true);
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose without errors', async () => {
      await coordinator.initialize();
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });

    it('should clear workflows on dispose', async () => {
      await coordinator.initialize();
      await coordinator.dispose();
      expect(coordinator.getActiveWorkflows()).toHaveLength(0);
    });
  });
});
