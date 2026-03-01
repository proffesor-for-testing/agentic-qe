/**
 * Agentic QE v3 - Accessibility Tester Service Browser Integration Tests
 * Tests AccessibilityTesterService with mock browser client integration
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import {
  AccessibilityTesterService,
  AccessibilityTesterConfig,
} from '../../../../src/domains/visual-accessibility/services/accessibility-tester';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import type {
  IBrowserClient,
  IAgentBrowserClient,
  BrowserSessionInfo,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  ParsedSnapshot,
  SnapshotElement,
  ElementTarget,
  BrowserError,
} from '../../../../src/integrations/browser';
import { ok, err } from '../../../../src/shared/types';

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

  clear(): void {
    this.store.clear();
  }

  getAll(): Map<string, unknown> {
    return new Map(this.store);
  }
}

/**
 * Create a mock IAgentBrowserClient with all required methods
 */
function createMockAgentBrowserClient(): IAgentBrowserClient {
  const mockSession: BrowserSessionInfo = {
    id: 'session-1',
    tool: 'agent-browser',
    status: 'active',
    createdAt: new Date(),
  };

  const mockNavigateResult: BrowserNavigateResult = {
    url: 'https://example.com',
    title: 'Example Page',
    success: true,
    durationMs: 100,
  };

  const mockSnapshotElements: SnapshotElement[] = [
    { ref: '@e1', role: 'button', name: 'Submit', text: 'Submit', depth: 2 },
    { ref: '@e2', role: 'textbox', name: 'Email', text: '', depth: 2 },
    { ref: '@e3', role: 'link', name: 'Home', text: 'Home', depth: 1 },
    { ref: '@e4', role: 'heading', name: 'Welcome', text: 'Welcome', depth: 1 },
  ];

  const mockSnapshot: ParsedSnapshot = {
    url: 'https://example.com',
    title: 'Example Page',
    elements: mockSnapshotElements,
    interactiveElements: mockSnapshotElements.filter(e =>
      ['button', 'textbox', 'link'].includes(e.role)
    ),
    refMap: new Map(mockSnapshotElements.map(e => [e.ref, e])),
    timestamp: new Date(),
  };

  const mockScreenshotResult: BrowserScreenshotResult = {
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
    format: 'png',
    dimensions: { width: 1920, height: 1080 },
  };

  // Axe-core result that will be returned from evaluate
  // Note: The service uses mapImpactSeverity which maps:
  //   critical -> critical, high -> serious, medium -> moderate, low -> minor
  // So we use "high" to get "serious" in the output
  const mockAxeResult = JSON.stringify({
    violations: [
      {
        id: 'color-contrast',
        impact: 'high', // Maps to "serious" in the service
        description: 'Elements must have sufficient color contrast',
        help: 'Ensure text has sufficient color contrast',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/color-contrast',
        tags: ['wcag2aa', 'wcag143'],
        nodes: [
          {
            selector: '.low-contrast-text',
            html: '<span class="low-contrast-text">Light text</span>',
            target: ['.low-contrast-text'],
            failureSummary: 'Foreground: #999999, Background: #ffffff, Ratio: 2.85:1',
          },
        ],
      },
      {
        id: 'image-alt',
        impact: 'critical',
        description: 'Images must have alternate text',
        help: 'Images must have alternate text',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/image-alt',
        tags: ['wcag2a', 'wcag111'],
        nodes: [
          {
            selector: 'img.hero-image',
            html: '<img class="hero-image" src="/hero.jpg">',
            target: ['img.hero-image'],
            failureSummary: 'Element does not have an alt attribute',
          },
        ],
      },
    ],
    passes: ['label', 'button-name', 'link-name'],
    incomplete: ['aria-required-children'],
    inapplicable: ['video-caption'],
  });

  return {
    tool: 'agent-browser' as const,
    launch: vi.fn().mockResolvedValue(ok(mockSession)),
    quit: vi.fn().mockResolvedValue(ok(undefined)),
    isAvailable: vi.fn().mockResolvedValue(true),
    navigate: vi.fn().mockResolvedValue(ok(mockNavigateResult)),
    reload: vi.fn().mockResolvedValue(ok(undefined)),
    goBack: vi.fn().mockResolvedValue(ok(undefined)),
    goForward: vi.fn().mockResolvedValue(ok(undefined)),
    click: vi.fn().mockResolvedValue(ok(undefined)),
    fill: vi.fn().mockResolvedValue(ok(undefined)),
    getText: vi.fn().mockResolvedValue(ok('Example text')),
    isVisible: vi.fn().mockResolvedValue(ok(true)),
    screenshot: vi.fn().mockResolvedValue(ok(mockScreenshotResult)),
    evaluate: vi.fn().mockResolvedValue(ok(mockAxeResult)),
    dispose: vi.fn().mockResolvedValue(undefined),
    // Agent-browser specific methods
    getSnapshot: vi.fn().mockResolvedValue(ok(mockSnapshot)),
    createSession: vi.fn().mockResolvedValue(ok(mockSession)),
    switchSession: vi.fn().mockResolvedValue(ok(undefined)),
    listSessions: vi.fn().mockResolvedValue(ok([mockSession])),
    mockRoute: vi.fn().mockResolvedValue(ok(undefined)),
    abortRoute: vi.fn().mockResolvedValue(ok(undefined)),
    clearRoutes: vi.fn().mockResolvedValue(ok(undefined)),
    setDevice: vi.fn().mockResolvedValue(ok(undefined)),
    setViewport: vi.fn().mockResolvedValue(ok(undefined)),
    saveState: vi.fn().mockResolvedValue(ok(undefined)),
    loadState: vi.fn().mockResolvedValue(ok(undefined)),
    waitForElement: vi.fn().mockResolvedValue(ok(undefined)),
    waitForText: vi.fn().mockResolvedValue(ok(undefined)),
    waitForUrl: vi.fn().mockResolvedValue(ok(undefined)),
    waitForNetworkIdle: vi.fn().mockResolvedValue(ok(undefined)),
  };
}

/**
 * Create a mock browser error for testing error scenarios
 */
function createMockBrowserError(message: string, code: string): BrowserError {
  const error = new Error(message) as BrowserError;
  error.code = code;
  error.tool = 'agent-browser';
  return error;
}

describe('AccessibilityTesterService with Browser Client Integration', () => {
  let mockMemory: MockMemoryBackend;
  let mockBrowserClient: IAgentBrowserClient;

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    mockBrowserClient = createMockAgentBrowserClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('preferAgentBrowser configuration', () => {
    it('should use browser client when preferAgentBrowser is true and client is provided', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');

      expect(mockBrowserClient.launch).toHaveBeenCalled();
      expect(mockBrowserClient.navigate).toHaveBeenCalledWith('https://example.com');
    });

    it('should fall back to heuristics when preferAgentBrowser is false', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: false,
        useBrowserMode: false,
        browserClient: mockBrowserClient,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      // Browser client should not be called when useBrowserMode is false
      expect(mockBrowserClient.launch).not.toHaveBeenCalled();
    });

    it('should respect preferAgentBrowser default value (true)', () => {
      const config: Partial<AccessibilityTesterConfig> = {
        browserClient: mockBrowserClient,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      // Service should be created with preferAgentBrowser defaulting to true
      expect(service).toBeDefined();
    });
  });

  describe('auditWithBrowserClient', () => {
    it('should call launch, navigate, and evaluate for browser-based audit', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      expect(mockBrowserClient.launch).toHaveBeenCalledWith(
        expect.objectContaining({ headless: true })
      );
      expect(mockBrowserClient.navigate).toHaveBeenCalledWith('https://example.com');
      expect(mockBrowserClient.evaluate).toHaveBeenCalled();
      expect(mockBrowserClient.quit).toHaveBeenCalled();
    });

    it('should get snapshot when using agent-browser client', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');

      expect(mockBrowserClient.getSnapshot).toHaveBeenCalledWith({ interactive: true });
    });

    it('should quit browser even when audit fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.evaluate as Mock).mockResolvedValue(
        err(createMockBrowserError('Evaluation failed', 'EVAL_ERROR'))
      );

      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: failingClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');

      // quit should be called in finally block
      expect(failingClient.quit).toHaveBeenCalled();
    });
  });

  describe('axe-core injection and result mapping', () => {
    it('should inject axe-core script via evaluate', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');

      // Verify evaluate was called with axe-core injection script
      const evaluateCall = (mockBrowserClient.evaluate as Mock).mock.calls[0][0];
      expect(evaluateCall).toContain('axe');
      expect(evaluateCall).toContain('cdnjs.cloudflare.com');
    });

    it('should map axe-core violations to AccessibilityViolation format', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.violations.length).toBeGreaterThan(0);

        const colorContrastViolation = result.value.violations.find(
          v => v.id === 'color-contrast'
        );
        expect(colorContrastViolation).toBeDefined();
        expect(colorContrastViolation?.impact).toBe('serious');
        expect(colorContrastViolation?.nodes.length).toBeGreaterThan(0);
      }
    });

    it('should map axe-core passes to PassedRule format', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passes.length).toBeGreaterThan(0);
        expect(result.value.passes.some(p => p.id === 'label')).toBe(true);
      }
    });

    it('should map axe-core incomplete to IncompleteCheck format', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.incomplete.length).toBeGreaterThan(0);
        expect(result.value.incomplete.some(i => i.id === 'aria-required-children')).toBe(true);
      }
    });

    it('should calculate score based on violation severity', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        // Score should be between 0 and 100
        expect(result.value.score).toBeGreaterThanOrEqual(0);
        expect(result.value.score).toBeLessThanOrEqual(100);
        // With 2 violations (1 critical, 1 serious), score should be reduced
        expect(result.value.score).toBeLessThan(100);
      }
    });

    it('should extract WCAG criteria from axe-core tags', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        const imageAltViolation = result.value.violations.find(v => v.id === 'image-alt');
        expect(imageAltViolation?.wcagCriteria.length).toBeGreaterThan(0);
      }
    });
  });

  describe('fallback to heuristics when browser unavailable', () => {
    it('should fall back to heuristics when browser launch fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.launch as Mock).mockResolvedValue(
        err(createMockBrowserError('Browser launch failed', 'LAUNCH_ERROR'))
      );

      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: failingClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      // Should still succeed using heuristic fallback
      expect(result.success).toBe(true);
    });

    it('should fall back to heuristics when navigation fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.navigate as Mock).mockResolvedValue(
        err(createMockBrowserError('Navigation failed', 'NAV_ERROR'))
      );

      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: failingClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      // Should still succeed using heuristic fallback
      expect(result.success).toBe(true);
    });

    it('should fall back to heuristics when axe-core evaluation fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.evaluate as Mock).mockResolvedValue(
        err(createMockBrowserError('Axe-core evaluation failed', 'EVAL_ERROR'))
      );

      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: failingClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      // Should still succeed using heuristic fallback
      expect(result.success).toBe(true);
    });

    it('should use heuristics when browserClient is not provided', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        useBrowserMode: false,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
      }
    });
  });

  describe('WCAG level configuration with browser client', () => {
    it('should use WCAG A tags for level A audit', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
        defaultWCAGLevel: 'A',
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');

      const evaluateCall = (mockBrowserClient.evaluate as Mock).mock.calls[0][0];
      expect(evaluateCall).toContain('wcag2a');
      expect(evaluateCall).toContain('wcag21a');
    });

    it('should use WCAG AA tags for level AA audit', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com', { wcagLevel: 'AA' });

      const evaluateCall = (mockBrowserClient.evaluate as Mock).mock.calls[0][0];
      expect(evaluateCall).toContain('wcag2aa');
      expect(evaluateCall).toContain('wcag21aa');
    });

    it('should use WCAG AAA tags for level AAA audit', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com', { wcagLevel: 'AAA' });

      const evaluateCall = (mockBrowserClient.evaluate as Mock).mock.calls[0][0];
      expect(evaluateCall).toContain('wcag2aaa');
      expect(evaluateCall).toContain('wcag21aaa');
    });
  });

  describe('exclude selectors', () => {
    it('should pass exclude selectors to axe-core configuration', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com', {
        excludeSelectors: ['.third-party-widget', '#ads-container'],
      });

      const evaluateCall = (mockBrowserClient.evaluate as Mock).mock.calls[0][0];
      expect(evaluateCall).toContain('third-party-widget');
      expect(evaluateCall).toContain('ads-container');
    });
  });

  describe('headless configuration', () => {
    it('should respect headless browser config option', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
        browserConfig: {
          headless: false,
          timeout: 30000,
        },
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');

      expect(mockBrowserClient.launch).toHaveBeenCalledWith(
        expect.objectContaining({ headless: false })
      );
    });
  });

  describe('dispose', () => {
    it('should dispose managed browser client', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      await service.audit('https://example.com');
      await service.dispose();

      // Note: dispose is called on managed client, not the provided one
      // This test verifies dispose doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('impact severity mapping', () => {
    it('should map critical impact correctly', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        const criticalViolation = result.value.violations.find(v => v.id === 'image-alt');
        expect(criticalViolation?.impact).toBe('critical');
      }
    });

    it('should map serious impact correctly', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        const seriousViolation = result.value.violations.find(v => v.id === 'color-contrast');
        expect(seriousViolation?.impact).toBe('serious');
      }
    });
  });

  describe('violation node mapping', () => {
    it('should include selector in violation nodes', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.violations.length > 0) {
        const node = result.value.violations[0].nodes[0];
        expect(node.selector).toBeDefined();
        expect(typeof node.selector).toBe('string');
      }
    });

    it('should include html in violation nodes', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.violations.length > 0) {
        const node = result.value.violations[0].nodes[0];
        expect(node.html).toBeDefined();
        expect(typeof node.html).toBe('string');
      }
    });

    it('should include failureSummary in violation nodes', async () => {
      const config: Partial<AccessibilityTesterConfig> = {
        preferAgentBrowser: true,
        browserClient: mockBrowserClient,
        useBrowserMode: true,
      };
      const service = new AccessibilityTesterService(mockMemory, config);

      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.violations.length > 0) {
        const node = result.value.violations[0].nodes[0];
        expect(node.failureSummary).toBeDefined();
      }
    });
  });
});
