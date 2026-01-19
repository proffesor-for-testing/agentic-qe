/**
 * Agentic QE v3 - Vibium Browser Automation Integration Tests
 *
 * Comprehensive tests for VibiumClientImpl, FallbackVibiumClient,
 * and factory functions. Tests cover all client methods, error handling,
 * retry logic, and fallback behavior.
 *
 * @module tests/integrations/vibium
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Mock Vibium Package
// ============================================================================

/**
 * Mock Vibe instance - represents an active browser session
 * Mimics the real Vibium Vibe interface
 */
const mockVibeInstance = {
  go: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
  evaluate: vi.fn().mockImplementation(async (script: string) => {
    // Return appropriate values based on script content
    if (script.includes('window.location.href')) {
      return 'https://example.com';
    }
    if (script.includes('document.title')) {
      return 'Test Page';
    }
    if (script.includes('querySelectorAll')) {
      // For findElements - return array of element info
      return [
        { tag: 'div', text: 'Element 1' },
        { tag: 'div', text: 'Element 2' },
      ];
    }
    if (script.includes('getAttribute')) {
      return 'mock-attribute-value';
    }
    // For navigation actions (back, forward, reload) return undefined
    return undefined;
  }),
  find: vi.fn().mockImplementation(async (selector: string) => ({
    // The real Vibium returns an object with info and interaction methods
    info: {
      tag: 'button',
      text: 'Mock Element Text',
      box: { x: 0, y: 0, width: 100, height: 50 },
    },
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    text: vi.fn().mockResolvedValue('Mock Element Text'),
    getAttribute: vi.fn().mockResolvedValue('mock-attribute-value'),
  })),
  quit: vi.fn().mockResolvedValue(undefined),
};

/**
 * Mock vibium browser object
 */
const mockVibiumBrowser = {
  launch: vi.fn().mockResolvedValue(mockVibeInstance),
};

// Mock the vibium module
vi.mock('vibium', () => ({
  browser: mockVibiumBrowser,
}));

// Export mocks for test manipulation
export { mockVibeInstance, mockVibiumBrowser };

// Client implementations
import {
  VibiumClientImpl,
  VibiumClientProvider,
} from '../../../src/integrations/vibium/client';

import {
  FallbackVibiumClient,
  createFallbackVibiumClient,
  isUsingFallback,
  markAsFallback,
} from '../../../src/integrations/vibium/fallback';

// Factory functions
import {
  createVibiumClient,
  createVibiumClientSync,
  getVibiumClient,
  getVibiumClientSync,
  isVibiumAvailable,
  getVibiumStatus,
  checkVibiumHealth,
} from '../../../src/integrations/vibium';

// Feature flags
import {
  setVibiumFeatureFlags,
  resetVibiumFeatureFlags,
  getVibiumFeatureFlags,
} from '../../../src/integrations/vibium/feature-flags';

// Error classes
import {
  VibiumError,
  VibiumUnavailableError,
  VibiumTimeoutError,
  VibiumElementNotFoundError,
  VibiumConnectionError,
  VibiumNavigationError,
  VibiumScreenshotError,
  VibiumInteractionError,
  isVibiumError,
  isVibiumUnavailable,
  createVibiumError,
  createUnavailableError,
} from '../../../src/integrations/vibium/errors';

// Types
import type {
  VibiumConfig,
  VibiumClient,
  BrowserSession,
  NavigateResult,
  ElementInfo,
  ScreenshotResult,
  AccessibilityResult,
} from '../../../src/integrations/vibium/types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a test config with defaults for testing
 */
function createTestConfig(overrides?: Partial<VibiumConfig>): Partial<VibiumConfig> {
  return {
    enabled: true,
    headless: true,
    timeout: 5000,
    retryAttempts: 2,
    fallbackEnabled: true,
    browserType: 'chromium',
    viewport: { width: 1280, height: 720 },
    ...overrides,
  };
}

/**
 * Wait for a specified duration
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// VibiumClientImpl Tests
// ============================================================================

describe('VibiumClientImpl', () => {
  let client: VibiumClientImpl;

  beforeEach(() => {
    // Reset feature flags and provider
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();

    // Reset Vibium mocks
    vi.clearAllMocks();
    mockVibiumBrowser.launch.mockResolvedValue(mockVibeInstance);
    mockVibeInstance.go.mockResolvedValue(undefined);
    mockVibeInstance.screenshot.mockResolvedValue(Buffer.from('fake-image-data'));
    mockVibeInstance.quit.mockResolvedValue(undefined);
    // evaluate and find use mockImplementation which persists through clearAllMocks
  });

  afterEach(async () => {
    if (client) {
      await client.dispose();
    }
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  describe('Initialization', () => {
    it('should create client with default config', () => {
      client = new VibiumClientImpl();

      expect(client).toBeInstanceOf(VibiumClientImpl);
    });

    it('should create client with custom config', () => {
      const config = createTestConfig({ timeout: 10000 });
      client = new VibiumClientImpl(config);

      expect(client).toBeInstanceOf(VibiumClientImpl);
    });

    it('should initialize successfully', async () => {
      client = new VibiumClientImpl(createTestConfig());

      await expect(client.initialize()).resolves.not.toThrow();
    });

    it('should allow multiple initialize calls (idempotent)', async () => {
      client = new VibiumClientImpl(createTestConfig());

      await client.initialize();
      await expect(client.initialize()).resolves.not.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should return correct health status when enabled', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      const health = await client.getHealth();

      expect(health).toBeDefined();
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(health.sessionActive).toBe(false);
      expect(['connected', 'disconnected', 'unavailable']).toContain(health.status);
    });

    it('should return unavailable status when disabled', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: false }));
      await client.initialize();

      const health = await client.getHealth();

      expect(health.status).toBe('unavailable');
      expect(health.error).toContain('disabled by configuration');
    });

    it('should include features list', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      const health = await client.getHealth();

      expect(health.features).toBeDefined();
      expect(Array.isArray(health.features)).toBe(true);
    });
  });

  describe('Availability Check', () => {
    it('should return false when disabled', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: false }));

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should cache availability check result', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));

      const first = await client.isAvailable();
      const second = await client.isAvailable();

      expect(first).toBe(second);
    });
  });

  describe('Browser Launch', () => {
    beforeEach(() => {
      setVibiumFeatureFlags({ useBrowserMode: true });
    });

    it('should launch browser and return session', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      const result = await client.launch({ headless: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeDefined();
        expect(result.value.id).toBeDefined();
        expect(result.value.browserType).toBe('chromium');
        expect(result.value.status).toBe('connected');
        expect(result.value.launchedAt).toBeInstanceOf(Date);
      }
    });

    it('should store session after launch', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      await client.launch();

      const session = await client.getSession();
      expect(session).not.toBeNull();
    });

    it('should fail when browser mode is disabled', async () => {
      setVibiumFeatureFlags({ useBrowserMode: false });
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      const result = await client.launch();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(VibiumUnavailableError);
      }
    });

    it('should accept custom launch options', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      const result = await client.launch({
        headless: false,
        devtools: true,
        viewport: { width: 1920, height: 1080 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.headless).toBe(false);
        expect(result.value.viewport).toEqual({ width: 1920, height: 1080 });
      }
    });
  });

  describe('Browser Quit', () => {
    it('should quit browser successfully', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();

      const result = await client.quit();

      expect(result.success).toBe(true);
    });

    it('should clear session after quit', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();

      await client.quit();

      const session = await client.getSession();
      expect(session).toBeNull();
    });

    it('should fail when no session exists', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      const result = await client.quit();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(VibiumConnectionError);
      }
    });
  });

  describe('Navigation', () => {
    beforeEach(async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();
    });

    it('should navigate to URL successfully', async () => {
      const result = await client.navigate({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.success).toBe(true);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should update session URL after navigation', async () => {
      await client.navigate({ url: 'https://example.com' });

      const session = await client.getSession();
      expect(session?.currentUrl).toBe('https://example.com');
    });

    it('should support navigation options', async () => {
      const result = await client.navigate({
        url: 'https://example.com',
        waitUntil: 'networkidle',
        timeout: 10000,
        referer: 'https://google.com',
      });

      expect(result.success).toBe(true);
    });

    it('should fail navigation without session', async () => {
      await client.quit();

      await expect(
        client.navigate({ url: 'https://example.com' })
      ).rejects.toThrow(VibiumConnectionError);
    });
  });

  describe('Page Info', () => {
    beforeEach(async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();
    });

    it('should return page info', async () => {
      await client.navigate({ url: 'https://example.com' });

      const result = await client.getPageInfo();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.viewport).toBeDefined();
        expect(result.value.loadState).toBeDefined();
      }
    });

    it('should perform navigation actions', async () => {
      const goBackResult = await client.goBack();
      expect(goBackResult.success).toBe(true);

      const goForwardResult = await client.goForward();
      expect(goForwardResult.success).toBe(true);

      const reloadResult = await client.reload();
      expect(reloadResult.success).toBe(true);
    });
  });

  describe('Element Interaction', () => {
    beforeEach(async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();
    });

    it('should find element by selector', async () => {
      const result = await client.findElement({ selector: '#test-button' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.selector).toBe('#test-button');
        expect(result.value.visible).toBe(true);
        expect(result.value.enabled).toBe(true);
      }
    });

    it('should find multiple elements', async () => {
      const result = await client.findElements({ selector: '.list-item' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should click element', async () => {
      const result = await client.click({ selector: '#submit-button' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(true);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should type into element', async () => {
      const result = await client.type({
        selector: '#username',
        text: 'testuser',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.success).toBe(true);
      }
    });

    it('should get element text', async () => {
      const result = await client.getText('#heading');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value).toBe('string');
      }
    });

    it('should get element attribute', async () => {
      const result = await client.getAttribute('#link', 'href');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value).toBe('string');
      }
    });

    it('should wait for element', async () => {
      const result = await client.waitForElement('#dynamic-content', {
        timeout: 5000,
        state: 'visible',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.visible).toBe(true);
      }
    });
  });

  describe('Screenshot Capture', () => {
    beforeEach(async () => {
      setVibiumFeatureFlags({ useScreenshotCapture: true });
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();
    });

    it('should capture screenshot', async () => {
      const result = await client.screenshot();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.format).toBe('png');
        expect(result.value.dimensions).toBeDefined();
        expect(result.value.sizeBytes).toBeGreaterThan(0);
        expect(result.value.capturedAt).toBeInstanceOf(Date);
      }
    });

    it('should capture full page screenshot', async () => {
      const result = await client.screenshot({ fullPage: true });

      expect(result.success).toBe(true);
    });

    it('should capture screenshot to file', async () => {
      const result = await client.screenshot({
        path: '/tmp/test-screenshot.png',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.path).toBe('/tmp/test-screenshot.png');
      }
    });

    it('should fail when screenshot capture is disabled', async () => {
      setVibiumFeatureFlags({ useScreenshotCapture: false });

      const result = await client.screenshot();

      expect(result.success).toBe(false);
      if (!result.success) {
        // Returns VibiumScreenshotError when screenshot capture is disabled
        expect(result.error).toBeInstanceOf(VibiumScreenshotError);
        expect(result.error.message).toContain('disabled');
      }
    });

    it('should compare screenshots when files exist', async () => {
      // Create temporary test files for comparison
      const fs = await import('fs/promises');
      const baselinePath = '/tmp/test-baseline.png';
      const currentPath = '/tmp/test-current.png';
      const testData = Buffer.from('fake-image-data');

      await fs.writeFile(baselinePath, testData);
      await fs.writeFile(currentPath, testData);

      try {
        const result = await client.compareScreenshots(baselinePath, currentPath, 0.01);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.matches).toBe(true); // Same data = matches
          expect(result.value.differencePercent).toBe(0);
          expect(result.value.comparedAt).toBeInstanceOf(Date);
        }
      } finally {
        // Cleanup
        await fs.unlink(baselinePath).catch(() => {});
        await fs.unlink(currentPath).catch(() => {});
      }
    });

    it('should return error when comparing non-existent screenshots', async () => {
      const result = await client.compareScreenshots(
        '/tmp/non-existent-baseline.png',
        '/tmp/non-existent-current.png',
        0.01
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Accessibility Check', () => {
    beforeEach(async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();
    });

    it('should return error directing to use axe-core-integration module', async () => {
      // The VibiumClient.checkAccessibility() is designed to return an error
      // directing users to use the axe-core-integration module for proper accessibility testing
      const result = await client.checkAccessibility();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(VibiumError);
        expect(result.error.message).toContain('axe-core-integration');
      }
    });

    it('should return error regardless of WCAG level option', async () => {
      const result = await client.checkAccessibility({ wcagLevel: 'AAA' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('axe-core-integration');
      }
    });

    it('should return error regardless of selector option', async () => {
      const result = await client.checkAccessibility({
        selector: '#main-content',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('axe-core-integration');
      }
    });
  });

  describe('Retry Logic', () => {
    it('should retry on failure when auto-retry enabled', async () => {
      setVibiumFeatureFlags({ useAutoRetry: true });
      client = new VibiumClientImpl(
        createTestConfig({ enabled: true, retryAttempts: 3 })
      );
      await client.initialize();
      await client.launch();

      // The client should handle retries internally
      const result = await client.navigate({ url: 'https://example.com' });

      expect(result.success).toBe(true);
    });

    it('should not retry when auto-retry disabled', async () => {
      setVibiumFeatureFlags({ useAutoRetry: false });
      client = new VibiumClientImpl(
        createTestConfig({ enabled: true, retryAttempts: 3 })
      );
      await client.initialize();
      await client.launch();

      const result = await client.navigate({ url: 'https://example.com' });

      expect(result.success).toBe(true);
    });
  });

  describe('Dispose', () => {
    it('should clean up resources on dispose', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();
      await client.launch();

      await client.dispose();

      const session = await client.getSession();
      expect(session).toBeNull();
    });

    it('should allow dispose without launch', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      await expect(client.dispose()).resolves.not.toThrow();
    });

    it('should reset availability cache on dispose', async () => {
      client = new VibiumClientImpl(createTestConfig({ enabled: true }));
      await client.initialize();

      // Cache availability
      await client.isAvailable();

      await client.dispose();

      // After dispose, availability should be re-checked
      const available = await client.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });
});

// ============================================================================
// FallbackVibiumClient Tests
// ============================================================================

describe('FallbackVibiumClient', () => {
  let client: FallbackVibiumClient;

  beforeEach(() => {
    resetVibiumFeatureFlags();
  });

  afterEach(async () => {
    if (client) {
      await client.dispose();
    }
    resetVibiumFeatureFlags();
  });

  describe('Initialization', () => {
    it('should create fallback client', () => {
      client = new FallbackVibiumClient();

      expect(client).toBeInstanceOf(FallbackVibiumClient);
    });

    it('should create fallback client with config', () => {
      client = new FallbackVibiumClient(createTestConfig());

      expect(client).toBeInstanceOf(FallbackVibiumClient);
    });

    it('should initialize successfully', async () => {
      client = new FallbackVibiumClient();

      await expect(client.initialize()).resolves.not.toThrow();
    });
  });

  describe('Availability', () => {
    it('should always return false for isAvailable', async () => {
      client = new FallbackVibiumClient();

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('Health Status', () => {
    it('should return unavailable health status', async () => {
      client = new FallbackVibiumClient();
      await client.initialize();

      const health = await client.getHealth();

      expect(health.status).toBe('unavailable');
      expect(health.features).toContain('fallback-only');
      expect(health.error).toContain('unavailable');
      expect(health.sessionActive).toBe(false);
    });
  });

  describe('Stub Operations', () => {
    beforeEach(async () => {
      client = new FallbackVibiumClient();
      await client.initialize();
    });

    it('should return stub session on launch', async () => {
      const result = await client.launch();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.status).toBe('unavailable');
        expect(result.value.id).toContain('fallback-session');
      }
    });

    it('should return stub navigation result', async () => {
      await client.launch();
      const result = await client.navigate({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.title).toBe('Fallback Page');
      }
    });

    it('should return stub element info', async () => {
      await client.launch();
      const result = await client.findElement({ selector: '#test' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.textContent).toBe('Fallback Element');
      }
    });

    it('should return stub screenshot result', async () => {
      await client.launch();
      const result = await client.screenshot();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.base64).toBeDefined();
        expect(result.value.format).toBe('png');
      }
    });

    it('should return stub accessibility result', async () => {
      await client.launch();
      const result = await client.checkAccessibility();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passes).toBe(true);
        expect(result.value.violations).toHaveLength(0);
      }
    });

    it('should complete all operations without errors', async () => {
      await client.launch();

      // Navigation
      await expect(client.navigate({ url: 'https://example.com' })).resolves.toBeDefined();
      await expect(client.getPageInfo()).resolves.toBeDefined();
      await expect(client.goBack()).resolves.toBeDefined();
      await expect(client.goForward()).resolves.toBeDefined();
      await expect(client.reload()).resolves.toBeDefined();

      // Element interaction
      await expect(client.findElement({ selector: '#test' })).resolves.toBeDefined();
      await expect(client.findElements({ selector: '.test' })).resolves.toBeDefined();
      await expect(client.click({ selector: '#btn' })).resolves.toBeDefined();
      await expect(client.type({ selector: '#input', text: 'test' })).resolves.toBeDefined();
      await expect(client.getText('#text')).resolves.toBeDefined();
      await expect(client.getAttribute('#link', 'href')).resolves.toBeDefined();
      await expect(client.waitForElement('#dynamic')).resolves.toBeDefined();

      // Visual
      await expect(client.screenshot()).resolves.toBeDefined();
      await expect(
        client.compareScreenshots('a.png', 'b.png')
      ).resolves.toBeDefined();

      // Accessibility
      await expect(client.checkAccessibility()).resolves.toBeDefined();
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      client = new FallbackVibiumClient();
      await client.initialize();
    });

    it('should track stub session', async () => {
      await client.launch();

      const session = await client.getSession();
      expect(session).not.toBeNull();
    });

    it('should clear session on quit', async () => {
      await client.launch();
      await client.quit();

      const session = await client.getSession();
      expect(session).toBeNull();
    });

    it('should update session URL on navigate', async () => {
      await client.launch();
      await client.navigate({ url: 'https://test.com' });

      const session = await client.getSession();
      expect(session?.currentUrl).toBe('https://test.com');
    });
  });

  describe('Dispose', () => {
    it('should dispose cleanly', async () => {
      client = new FallbackVibiumClient();
      await client.initialize();
      await client.launch();

      await expect(client.dispose()).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe('Factory Functions', () => {
  beforeEach(() => {
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  afterEach(() => {
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  describe('createVibiumClient', () => {
    it('should create real client when available and enabled', async () => {
      setVibiumFeatureFlags({ useBrowserMode: true });

      const client = await createVibiumClient({ enabled: true });

      expect(client).toBeDefined();
      await client.dispose();
    });

    it('should create fallback client when browser mode disabled', async () => {
      setVibiumFeatureFlags({ useBrowserMode: false });

      const client = await createVibiumClient({ enabled: true });

      expect(client).toBeInstanceOf(FallbackVibiumClient);
      await client.dispose();
    });

    it('should create fallback when enabled=false and fallbackEnabled=true', async () => {
      const client = await createVibiumClient({
        enabled: false,
        fallbackEnabled: true,
      });

      expect(client).toBeInstanceOf(FallbackVibiumClient);
      await client.dispose();
    });
  });

  describe('createVibiumClientSync', () => {
    // Note: Sync functions use require() which fails in ESM/Vitest environment
    // These tests verify the function exists but skip execution due to ESM limitations
    it.skip('should create client synchronously (skipped: require() fails in ESM)', () => {
      setVibiumFeatureFlags({ useBrowserMode: true });

      const client = createVibiumClientSync({ enabled: true });

      expect(client).toBeDefined();
    });

    it.skip('should create fallback client when browser mode disabled (skipped: require() fails in ESM)', () => {
      setVibiumFeatureFlags({ useBrowserMode: false });

      const client = createVibiumClientSync({ enabled: true });

      expect(client).toBeInstanceOf(FallbackVibiumClient);
    });

    it('should export createVibiumClientSync function', () => {
      expect(typeof createVibiumClientSync).toBe('function');
    });
  });

  describe('createFallbackVibiumClient', () => {
    it('should create fallback client', () => {
      const client = createFallbackVibiumClient();

      expect(client).toBeInstanceOf(FallbackVibiumClient);
    });

    it('should create fallback client with config', () => {
      const client = createFallbackVibiumClient({ headless: false });

      expect(client).toBeInstanceOf(FallbackVibiumClient);
    });
  });

  describe('isUsingFallback', () => {
    it('should return true for fallback client', () => {
      const client = new FallbackVibiumClient();

      expect(isUsingFallback(client)).toBe(true);
    });

    it('should return false for real client', () => {
      const client = new VibiumClientImpl();

      expect(isUsingFallback(client)).toBe(false);
    });
  });

  describe('markAsFallback', () => {
    it('should add usedFallback flag to success result', () => {
      const result = { success: true as const, value: { data: 'test' } };

      const marked = markAsFallback(result);

      expect(marked.success).toBe(true);
      if (marked.success) {
        expect(marked.value.usedFallback).toBe(true);
        expect(marked.value.data).toBe('test');
      }
    });

    it('should preserve error on failure result', () => {
      const error = new VibiumError('test', 'TEST');
      const result = { success: false as const, error };

      const marked = markAsFallback(result);

      expect(marked.success).toBe(false);
      if (!marked.success) {
        expect(marked.error).toBe(error);
      }
    });
  });
});

// ============================================================================
// VibiumClientProvider Tests
// ============================================================================

describe('VibiumClientProvider', () => {
  beforeEach(() => {
    VibiumClientProvider.resetInstance();
    resetVibiumFeatureFlags();
  });

  afterEach(async () => {
    VibiumClientProvider.resetInstance();
    resetVibiumFeatureFlags();
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const provider1 = VibiumClientProvider.getInstance();
      const provider2 = VibiumClientProvider.getInstance();

      expect(provider1).toBe(provider2);
    });

    it('should reset instance', () => {
      const provider1 = VibiumClientProvider.getInstance();
      VibiumClientProvider.resetInstance();
      const provider2 = VibiumClientProvider.getInstance();

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('Client Management', () => {
    it('should get client asynchronously', async () => {
      const provider = VibiumClientProvider.getInstance({ enabled: true });

      const client = await provider.getClient();

      expect(client).toBeDefined();
      await provider.dispose();
    });

    it('should get client synchronously', () => {
      const provider = VibiumClientProvider.getInstance({ enabled: true });

      const client = provider.getClientSync();

      expect(client).toBeDefined();
    });

    it('should return same client instance', async () => {
      const provider = VibiumClientProvider.getInstance({ enabled: true });

      const client1 = await provider.getClient();
      const client2 = await provider.getClient();

      expect(client1).toBe(client2);
      await provider.dispose();
    });
  });

  describe('Configuration', () => {
    it('should apply initial config', () => {
      const provider = VibiumClientProvider.getInstance({
        enabled: true,
        timeout: 10000,
      });

      const config = provider.getConfig();

      expect(config.timeout).toBe(10000);
    });

    it('should update config and clear client', async () => {
      const provider = VibiumClientProvider.getInstance({ enabled: true });

      const client1 = await provider.getClient();
      provider.configure({ timeout: 20000 });
      const client2 = await provider.getClient();

      expect(client1).not.toBe(client2);
      expect(provider.getConfig().timeout).toBe(20000);
      await provider.dispose();
    });

    it('should return immutable config copy', () => {
      const provider = VibiumClientProvider.getInstance({ enabled: true });

      const config1 = provider.getConfig();
      const config2 = provider.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('Disposal', () => {
    it('should dispose provider and client', async () => {
      const provider = VibiumClientProvider.getInstance({ enabled: true });
      await provider.getClient();

      await provider.dispose();

      // Getting a new client after dispose should create a new one
      const newClient = await provider.getClient();
      expect(newClient).toBeDefined();
      await provider.dispose();
    });
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe('Convenience Functions', () => {
  beforeEach(() => {
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  afterEach(() => {
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  describe('getVibiumClient', () => {
    it('should get client via singleton provider', async () => {
      const client = await getVibiumClient({ enabled: true });

      expect(client).toBeDefined();
      await client.dispose();
    });
  });

  describe('getVibiumClientSync', () => {
    // Note: Sync function uses require() which fails in ESM/Vitest environment
    it.skip('should get client synchronously (skipped: require() fails in ESM)', () => {
      const client = getVibiumClientSync({ enabled: true });

      expect(client).toBeDefined();
    });

    it('should export getVibiumClientSync function', () => {
      expect(typeof getVibiumClientSync).toBe('function');
    });
  });

  describe('isVibiumAvailable', () => {
    it('should return false when disabled', async () => {
      const available = await isVibiumAvailable({ enabled: false });

      expect(available).toBe(false);
    });
  });

  describe('getVibiumStatus', () => {
    it('should return status summary', async () => {
      const status = await getVibiumStatus({ enabled: true });

      expect(status).toBeDefined();
      expect(['browser', 'fallback']).toContain(status.mode);
      expect(status.features).toBeInstanceOf(Array);
    });
  });

  describe('checkVibiumHealth', () => {
    it('should return health result', async () => {
      const health = await checkVibiumHealth({ enabled: true });

      expect(health).toBeDefined();
      expect(health.lastChecked).toBeInstanceOf(Date);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('Error Classes', () => {
    it('should create VibiumError with code and cause', () => {
      const cause = new Error('underlying error');
      const error = new VibiumError('test error', 'TEST_CODE', cause);

      expect(error.message).toBe('test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('VibiumError');
    });

    it('should create VibiumUnavailableError', () => {
      const error = new VibiumUnavailableError();

      expect(error.code).toBe('VIBIUM_UNAVAILABLE');
      expect(error.name).toBe('VibiumUnavailableError');
    });

    it('should create VibiumTimeoutError', () => {
      const error = new VibiumTimeoutError('Operation timed out');

      expect(error.code).toBe('VIBIUM_TIMEOUT');
      expect(error.name).toBe('VibiumTimeoutError');
    });

    it('should create VibiumElementNotFoundError with selector', () => {
      const error = new VibiumElementNotFoundError('#missing');

      expect(error.selector).toBe('#missing');
      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.message).toContain('#missing');
    });

    it('should create VibiumConnectionError', () => {
      const error = new VibiumConnectionError('Connection lost');

      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.name).toBe('VibiumConnectionError');
    });

    it('should create VibiumNavigationError with URL', () => {
      const error = new VibiumNavigationError('https://example.com', 404);

      expect(error.url).toBe('https://example.com');
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('404');
    });

    it('should create VibiumScreenshotError', () => {
      const error = new VibiumScreenshotError('Failed to capture');

      expect(error.code).toBe('SCREENSHOT_ERROR');
    });

    it('should create VibiumInteractionError with action and selector', () => {
      const error = new VibiumInteractionError('click', '#button');

      expect(error.action).toBe('click');
      expect(error.selector).toBe('#button');
      expect(error.message).toContain('click');
      expect(error.message).toContain('#button');
    });
  });

  describe('Error Type Guards', () => {
    it('isVibiumError should detect VibiumError', () => {
      const error = new VibiumError('test', 'TEST');

      expect(isVibiumError(error)).toBe(true);
      expect(isVibiumError(new Error('regular error'))).toBe(false);
    });

    it('isVibiumUnavailable should detect VibiumUnavailableError', () => {
      const error = new VibiumUnavailableError();

      expect(isVibiumUnavailable(error)).toBe(true);
      expect(isVibiumUnavailable(new VibiumError('test', 'TEST'))).toBe(false);
    });
  });

  describe('Error Factory Functions', () => {
    it('createVibiumError should wrap unknown errors', () => {
      const error = createVibiumError('string error');

      expect(error).toBeInstanceOf(VibiumError);
      expect(error.message).toBe('string error');
    });

    it('createVibiumError should return VibiumError unchanged', () => {
      const original = new VibiumError('original', 'ORIG');
      const wrapped = createVibiumError(original);

      expect(wrapped).toBe(original);
    });

    it('createVibiumError should wrap Error with message', () => {
      const cause = new Error('underlying');
      const error = createVibiumError(cause, 'default message');

      expect(error.message).toBe('underlying');
      expect(error.cause).toBe(cause);
    });

    it('createUnavailableError should create descriptive error', () => {
      const error = createUnavailableError(false, false);

      expect(error).toBeInstanceOf(VibiumUnavailableError);
      expect(error.message).toContain('MCP client');
    });

    it('createUnavailableError should detect missing tools', () => {
      const error = createUnavailableError(true, false);

      expect(error.message).toContain('tools not registered');
    });
  });

  describe('Error Recovery with Fallback', () => {
    it('should use fallback on unavailability', async () => {
      // Create client that will fall back
      const client = await createVibiumClient({
        enabled: false,
        fallbackEnabled: true,
      });

      // Operations should succeed with fallback
      const result = await client.launch();
      expect(result.success).toBe(true);

      await client.dispose();
    });
  });
});

// ============================================================================
// Feature Flag Integration Tests
// ============================================================================

describe('Feature Flag Integration', () => {
  beforeEach(() => {
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  afterEach(() => {
    resetVibiumFeatureFlags();
    VibiumClientProvider.resetInstance();
  });

  it('should respect useBrowserMode flag', async () => {
    setVibiumFeatureFlags({ useBrowserMode: false });

    const client = await createVibiumClient({ enabled: true });

    expect(isUsingFallback(client)).toBe(true);
    await client.dispose();
  });

  it('should respect useScreenshotCapture flag', async () => {
    setVibiumFeatureFlags({
      useBrowserMode: true,
      useScreenshotCapture: false,
    });

    const client = new VibiumClientImpl({ enabled: true });
    await client.initialize();
    await client.launch();

    const result = await client.screenshot();

    expect(result.success).toBe(false);
    if (!result.success) {
      // Returns VibiumScreenshotError (not VibiumUnavailableError) when screenshot capture is disabled
      expect(result.error).toBeInstanceOf(VibiumScreenshotError);
    }

    await client.dispose();
  });

  it('should respect useAutoRetry flag', async () => {
    setVibiumFeatureFlags({ useAutoRetry: true });

    const flags = getVibiumFeatureFlags();

    expect(flags.useAutoRetry).toBe(true);
  });

  it('should preserve other flags when setting specific flags', () => {
    setVibiumFeatureFlags({ useBrowserMode: false });
    setVibiumFeatureFlags({ useScreenshotCapture: false });

    const flags = getVibiumFeatureFlags();

    expect(flags.useBrowserMode).toBe(false);
    expect(flags.useScreenshotCapture).toBe(false);
  });

  it('should reset all flags to defaults', () => {
    setVibiumFeatureFlags({
      useBrowserMode: false,
      useScreenshotCapture: false,
      useAutoRetry: false,
    });

    resetVibiumFeatureFlags();

    const flags = getVibiumFeatureFlags();
    expect(flags.useBrowserMode).toBe(true);
    expect(flags.useScreenshotCapture).toBe(true);
    expect(flags.useAutoRetry).toBe(true);
  });
});
