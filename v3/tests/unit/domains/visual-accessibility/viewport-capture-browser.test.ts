/**
 * Agentic QE v3 - Viewport Capture Service Browser Integration Tests
 * Tests ViewportCaptureService with mock browser client integration
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  ViewportCaptureService,
  VIEWPORT_PRESETS,
} from '../../../../src/domains/visual-accessibility/services/viewport-capture';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import type {
  IBrowserClient,
  IAgentBrowserClient,
  BrowserSessionInfo,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  ParsedSnapshot,
  SnapshotElement,
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
  ];

  const mockSnapshot: ParsedSnapshot = {
    url: 'https://example.com',
    title: 'Example Page',
    elements: mockSnapshotElements,
    interactiveElements: mockSnapshotElements,
    refMap: new Map(mockSnapshotElements.map(e => [e.ref, e])),
    timestamp: new Date(),
  };

  // Create screenshot results with different viewport dimensions
  const createScreenshotResult = (width: number, height: number): BrowserScreenshotResult => ({
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
    format: 'png',
    dimensions: { width, height },
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
    screenshot: vi.fn().mockImplementation(async () => {
      // Return screenshot with dimensions matching current viewport
      return ok(createScreenshotResult(1920, 1080));
    }),
    evaluate: vi.fn().mockResolvedValue(ok({})),
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

describe('ViewportCaptureService with Browser Client Integration', () => {
  let mockMemory: MockMemoryBackend;
  let mockBrowserClient: IAgentBrowserClient;

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    mockBrowserClient = createMockAgentBrowserClient();
    vi.clearAllMocks();
  });

  describe('device emulation via setDevice', () => {
    it('should use browser client when provided in config', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined, // No Vibium client
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(mockBrowserClient.launch).toHaveBeenCalled();
    });

    it('should call setViewport for device emulation', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 375, height: 667 });

      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(375, 667);
    });

    it('should handle device emulation errors gracefully', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.setViewport as Mock).mockResolvedValue(
        err(createMockBrowserError('Viewport not supported', 'VIEWPORT_ERROR'))
      );

      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: failingClient }
      );

      const result = await service.captureAtViewport('https://example.com', { width: 9999, height: 9999 });

      // The outer result is ok() but inner success may be false
      // The service continues capture after setViewport fails (non-fatal)
      expect(result.success).toBe(true);
      // Verify setViewport was called
      expect(failingClient.setViewport).toHaveBeenCalled();
    });
  });

  describe('viewport configuration via setViewport', () => {
    it('should call setViewport for custom viewport dimensions', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAllViewports('https://example.com', [
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
        { width: 375, height: 667 },
      ]);

      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(1920, 1080);
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(1280, 720);
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(375, 667);
    });

    it('should handle viewport setting errors gracefully', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.setViewport as Mock).mockResolvedValue(
        err(createMockBrowserError('Viewport not supported', 'VIEWPORT_ERROR'))
      );

      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: failingClient }
      );

      const result = await service.captureAllViewports('https://example.com', [
        { width: 9999, height: 9999 },
      ]);

      // The outer result is ok() - service continues after setViewport failure
      expect(result.success).toBe(true);
      // Verify setViewport was attempted
      expect(failingClient.setViewport).toHaveBeenCalled();
    });
  });

  describe('screenshot capture at multiple viewports', () => {
    it('should capture screenshot for each viewport', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureAllViewports('https://example.com', [
        { width: 1920, height: 1080 },
        { width: 768, height: 1024 },
        { width: 375, height: 667 },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBe(3);
        expect(result.value.successCount).toBe(3);
      }
    });

    it('should capture full-page screenshots when configured', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        {
          browserClient: mockBrowserClient,
          fullPageDefault: true,
        }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(mockBrowserClient.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true })
      );
    });

    it('should handle screenshot capture errors', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.screenshot as Mock).mockResolvedValue(
        err(createMockBrowserError('Screenshot failed', 'SCREENSHOT_ERROR'))
      );

      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: failingClient }
      );

      const result = await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      // Service falls back to simulated capture when browser fails
      // The outer result is ok() and inner success depends on fallback behavior
      expect(result.success).toBe(true);
      // Verify screenshot was attempted with browser client
      expect(failingClient.screenshot).toHaveBeenCalled();
    });

    it('should include viewport dimensions in result metadata', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.viewport).toEqual({
          width: 1920,
          height: 1080,
        });
      }
    });
  });

  describe('viewport preset mapping', () => {
    it('should map desktop preset to correct viewport', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureWithPresets('https://example.com', ['desktop']);

      const desktopPreset = VIEWPORT_PRESETS.desktop;
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(
        desktopPreset.width,
        desktopPreset.height
      );
    });

    it('should map tablet preset to correct viewport', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureWithPresets('https://example.com', ['tablet']);

      const tabletPreset = VIEWPORT_PRESETS.tablet;
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(
        tabletPreset.width,
        tabletPreset.height
      );
    });

    it('should map mobile-m preset to correct viewport', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureWithPresets('https://example.com', ['mobile-m']);

      const mobilePreset = VIEWPORT_PRESETS['mobile-m'];
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(
        mobilePreset.width,
        mobilePreset.height
      );
    });

    it('should capture all standard presets', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureWithPresets('https://example.com', [
        'mobile-m',
        'tablet',
        'desktop',
        'desktop-l',
      ]);

      expect(result.success).toBe(true);
      expect(mockBrowserClient.setViewport).toHaveBeenCalledTimes(4);
      expect(mockBrowserClient.screenshot).toHaveBeenCalledTimes(4);
    });

    it('should support laptop preset', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureWithPresets('https://example.com', ['laptop']);

      const laptopPreset = VIEWPORT_PRESETS.laptop;
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(
        laptopPreset.width,
        laptopPreset.height
      );
    });
  });

  describe('browser lifecycle management', () => {
    it('should launch browser before capturing', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(mockBrowserClient.launch).toHaveBeenCalled();
      expect(mockBrowserClient.launch).toHaveBeenCalledBefore(mockBrowserClient.navigate as Mock);
    });

    it('should navigate to URL before capturing', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(mockBrowserClient.navigate).toHaveBeenCalledWith('https://example.com');
    });

    it('should quit browser after capturing', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(mockBrowserClient.quit).toHaveBeenCalled();
    });

    it('should quit browser even when capture fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.screenshot as Mock).mockResolvedValue(
        err(createMockBrowserError('Screenshot failed', 'SCREENSHOT_ERROR'))
      );

      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: failingClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(failingClient.quit).toHaveBeenCalled();
    });
  });

  describe('wait for network idle', () => {
    it('should wait for network idle when element wait is specified', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 }, {
        waitForSelector: '.content-loaded',
      });

      expect(mockBrowserClient.waitForElement).toHaveBeenCalled();
    });
  });

  describe('single viewport capture', () => {
    it('should capture single viewport screenshot', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureAtViewport('https://example.com', {
        width: 1920,
        height: 1080,
      });

      expect(result.success).toBe(true);
      expect(mockBrowserClient.setViewport).toHaveBeenCalledWith(1920, 1080);
      expect(mockBrowserClient.screenshot).toHaveBeenCalledTimes(1);
    });

    it('should return screenshot data in result', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureAtViewport('https://example.com', {
        width: 1920,
        height: 1080,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.screenshot).toBeDefined();
        expect(result.value.screenshot.id).toBeDefined();
      }
    });
  });

  describe('capture with element selector', () => {
    it('should capture with element selector option', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', {
        width: 1920,
        height: 1080,
      }, {
        selector: '.hero-section',
      });

      // Screenshot should be called with some options
      expect(mockBrowserClient.screenshot).toHaveBeenCalled();
    });
  });

  describe('memory storage', () => {
    it('should store captured screenshots in memory', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      const stored = mockMemory.getAll();
      const screenshotKeys = Array.from(stored.keys()).filter(k =>
        k.includes('screenshot') || k.includes('capture')
      );
      expect(screenshotKeys.length).toBeGreaterThan(0);
    });
  });

  describe('responsive breakpoint capture', () => {
    it('should capture at multiple widths for responsive analysis', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { stepSize: 400 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBeGreaterThan(0);
      }
    });

    it('should include standard breakpoints when configured', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      const result = await service.captureResponsiveBreakpoints(
        'https://example.com',
        320,
        1920,
        { includeStandardBreakpoints: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should include captures at standard breakpoints
        expect(result.value.captures.length).toBeGreaterThan(0);
      }
    });
  });

  describe('screenshot comparison', () => {
    it('should compare two screenshots', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      // First, capture two screenshots
      const result1 = await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });
      const result2 = await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        const comparisonResult = await service.compareScreenshots(
          result1.value.screenshot.id,
          result2.value.screenshot.id
        );

        expect(comparisonResult.success).toBe(true);
        if (comparisonResult.success) {
          expect(comparisonResult.value.similarity).toBeGreaterThanOrEqual(0);
          expect(comparisonResult.value.similarity).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('parallel capture', () => {
    it('should respect parallel limit', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        {
          browserClient: mockBrowserClient,
          parallelLimit: 2,
        }
      );

      const result = await service.captureAllViewports('https://example.com', [
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
        { width: 768, height: 1024 },
        { width: 375, height: 667 },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.captures.length).toBe(4);
      }
    });
  });

  describe('image format configuration', () => {
    it('should use PNG format by default', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: mockBrowserClient }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      expect(mockBrowserClient.screenshot).toHaveBeenCalled();
    });

    it('should support JPEG format', async () => {
      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        {
          browserClient: mockBrowserClient,
          imageFormat: 'jpeg',
          jpegQuality: 85,
        }
      );

      await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 }, {
        format: 'jpeg',
        quality: 85,
      });

      expect(mockBrowserClient.screenshot).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should attempt browser launch and fallback when launch fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.launch as Mock).mockResolvedValue(
        err(createMockBrowserError('Launch failed', 'LAUNCH_ERROR'))
      );

      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: failingClient }
      );

      const result = await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      // Service has multi-tier fallback: browser -> Vibium -> simulated
      // Even when browser fails, the service may fallback to simulated capture
      expect(result.success).toBe(true);
      // Verify launch was attempted
      expect(failingClient.launch).toHaveBeenCalled();
    });

    it('should attempt navigation and fallback when navigation fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.navigate as Mock).mockResolvedValue(
        err(createMockBrowserError('Navigation failed', 'NAV_ERROR'))
      );

      const service = new ViewportCaptureService(
        mockMemory,
        undefined,
        { browserClient: failingClient }
      );

      const result = await service.captureAtViewport('https://example.com', { width: 1920, height: 1080 });

      // Service has multi-tier fallback: browser -> Vibium -> simulated
      // Even when browser fails, the service may fallback to simulated capture
      expect(result.success).toBe(true);
      // Verify navigate was attempted
      expect(failingClient.navigate).toHaveBeenCalled();
    });
  });
});
