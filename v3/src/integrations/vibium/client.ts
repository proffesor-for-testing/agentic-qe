/**
 * Agentic QE v3 - Vibium Browser Automation Client Implementation
 *
 * Provides REAL browser automation via Vibium integration.
 * Uses the vibium npm package for actual browser control.
 *
 * @module integrations/vibium/client
 */

import type {
  VibiumClient,
  VibiumConfig,
  VibiumHealthResult,
  BrowserSession,
  LaunchOptions,
  NavigateOptions,
  NavigateResult,
  PageInfo,
  FindOptions,
  ElementInfo,
  ClickOptions,
  TypeOptions,
  InteractionResult,
  ScreenshotOptions,
  ScreenshotResult,
  VisualComparisonResult,
  AccessibilityCheckOptions,
  AccessibilityResult,
} from './types';
import { DEFAULT_VIBIUM_CONFIG } from './types';
import type { Result } from '../../shared/types';
import {
  VibiumError,
  VibiumUnavailableError,
  VibiumTimeoutError,
  VibiumElementNotFoundError,
  VibiumConnectionError,
  VibiumNavigationError,
  VibiumScreenshotError,
  VibiumInteractionError,
  createVibiumError,
} from './errors';
import { toError } from '../../shared/error-utils.js';
import {
  getVibiumFeatureFlags,
  isBrowserModeEnabled,
  isScreenshotCaptureEnabled,
  isAutoRetryEnabled,
  shouldLogPerformanceMetrics,
} from './feature-flags';

// ============================================================================
// Vibium Import (Real Browser Automation)
// ============================================================================

// Import the real Vibium library
// This provides actual browser control via WebDriver BiDi
let vibiumBrowser: typeof import('vibium').browser | null = null;
let vibiumAvailable = false;

// Lazy load Vibium to handle optional dependency gracefully
async function getVibiumBrowser(): Promise<typeof import('vibium').browser | null> {
  if (vibiumBrowser !== null) {
    return vibiumBrowser;
  }

  try {
    const vibium = await import('vibium');
    vibiumBrowser = vibium.browser;
    vibiumAvailable = true;
    return vibiumBrowser;
  } catch (error) {
    console.warn('[Vibium] Failed to load vibium package:', error);
    vibiumAvailable = false;
    return null;
  }
}

// Type for Vibium's Vibe instance
type VibeInstance = Awaited<ReturnType<typeof import('vibium').browser.launch>>;

// ============================================================================
// Retry Utilities
// ============================================================================

/**
 * Execute an operation with automatic retry on failure
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  operationName: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = toError(error);

      if (attempt < maxAttempts) {
        const delayMs = Math.min(100 * Math.pow(2, attempt - 1), 2000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new VibiumError(
    `${operationName} failed after ${maxAttempts} attempts`,
    'RETRY_EXHAUSTED',
    lastError
  );
}

/**
 * Measure operation performance and log if enabled
 */
async function withPerformanceMetric<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await operation();
    if (shouldLogPerformanceMetrics()) {
      console.log(`[Vibium] ${operationName}: ${Date.now() - startTime}ms`);
    }
    return result;
  } catch (error) {
    if (shouldLogPerformanceMetrics()) {
      console.log(
        `[Vibium] ${operationName} failed: ${Date.now() - startTime}ms`,
        error
      );
    }
    throw error;
  }
}

// ============================================================================
// VibiumClient Implementation
// ============================================================================

/**
 * Real Vibium client implementation using the vibium npm package
 *
 * Provides ACTUAL browser automation via WebDriver BiDi protocol.
 * This is NOT a simulation - it controls real browser instances.
 *
 * @example
 * ```typescript
 * const client = new VibiumClientImpl({ enabled: true, headless: true });
 * await client.initialize();
 *
 * // Launch REAL browser
 * const sessionResult = await client.launch({ headless: true });
 * if (sessionResult.success) {
 *   const session = sessionResult.value;
 *   console.log(`Browser launched: ${session.id}`);
 * }
 *
 * // Navigate to URL
 * const navResult = await client.navigate({ url: 'https://example.com' });
 *
 * // Execute JavaScript in browser
 * const result = await client.evaluate('return document.title');
 * ```
 */
export class VibiumClientImpl implements VibiumClient {
  private readonly config: Required<VibiumConfig>;
  private currentSession: BrowserSession | null = null;
  private lastHealthCheck: VibiumHealthResult | null = null;
  private _initialized = false;
  private _available: boolean | null = null;

  // Real Vibium browser instance
  private vibeInstance: VibeInstance | null = null;

  /**
   * Create a new Vibium client
   *
   * @param config - Client configuration
   */
  constructor(config: Partial<VibiumConfig> = {}) {
    this.config = { ...DEFAULT_VIBIUM_CONFIG, ...config };
  }

  // ========================================================================
  // Health and Status
  // ========================================================================

  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    if (this._available !== null) {
      return this._available;
    }

    try {
      // Check if Vibium package is available
      const browser = await getVibiumBrowser();
      this._available = browser !== null;
      return this._available;
    } catch {
      this._available = false;
      return false;
    }
  }

  async getHealth(): Promise<VibiumHealthResult> {
    const lastChecked = new Date();

    if (!this.config.enabled) {
      return {
        status: 'unavailable',
        features: ['fallback-only'],
        lastChecked,
        error: 'Vibium is disabled by configuration',
        sessionActive: false,
      };
    }

    try {
      const isAvailable = await this.isAvailable();

      if (isAvailable) {
        this.lastHealthCheck = {
          status: this.vibeInstance ? 'connected' : 'disconnected',
          version: '0.1.2', // From package.json
          browserType: this.config.browserType,
          features: [
            'browser-launch',
            'navigation',
            'element-interaction',
            'screenshots',
            'script-evaluation',
            'accessibility-testing',
          ],
          latencyMs: 10,
          lastChecked,
          sessionActive: this.vibeInstance !== null,
        };
      } else {
        this.lastHealthCheck = {
          status: 'unavailable',
          features: ['fallback-only'],
          lastChecked,
          error: 'Vibium package not available - install with: npm install vibium',
          sessionActive: false,
        };
      }
    } catch (error) {
      this.lastHealthCheck = {
        status: 'error',
        features: ['fallback-only'],
        lastChecked,
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionActive: false,
      };
    }

    return this.lastHealthCheck;
  }

  async getSession(): Promise<BrowserSession | null> {
    return this.currentSession;
  }

  // ========================================================================
  // Browser Lifecycle
  // ========================================================================

  async launch(options?: LaunchOptions): Promise<Result<BrowserSession, VibiumError>> {
    if (!isBrowserModeEnabled()) {
      return {
        success: false,
        error: new VibiumUnavailableError('Browser mode is disabled by feature flags'),
      };
    }

    const operation = async () => {
      const browser = await getVibiumBrowser();
      if (!browser) {
        throw new VibiumUnavailableError(
          'Vibium package not available. Install with: npm install vibium'
        );
      }

      // Launch REAL browser using Vibium
      const headless = options?.headless ?? this.config.headless;

      this.vibeInstance = await browser.launch({
        headless,
      });

      const session: BrowserSession = {
        id: this.generateSessionId(),
        browserType: this.config.browserType,
        launchedAt: new Date(),
        status: 'connected',
        viewport: options?.viewport ?? this.config.viewport,
        headless,
      };

      this.currentSession = session;
      return session;
    };

    try {
      const session = isAutoRetryEnabled()
        ? await withRetry(
            () => withPerformanceMetric(operation, 'browser_launch'),
            this.config.retryAttempts,
            'browser_launch'
          )
        : await withPerformanceMetric(operation, 'browser_launch');

      return { success: true, value: session };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to launch browser');
      return { success: false, error: vibiumError };
    }
  }

  async quit(): Promise<Result<void, VibiumError>> {
    if (!this.vibeInstance) {
      return {
        success: false,
        error: new VibiumConnectionError('No active browser session'),
      };
    }

    const operation = async () => {
      if (this.vibeInstance) {
        await this.vibeInstance.quit();
        this.vibeInstance = null;
      }
      this.currentSession = null;
    };

    try {
      await withPerformanceMetric(operation, 'browser_quit');
      return { success: true, value: undefined };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to quit browser');
      return { success: false, error: vibiumError };
    }
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  async navigate(options: NavigateOptions): Promise<Result<NavigateResult, VibiumError>> {
    this.ensureSession();

    const operation = async () => {
      const startTime = Date.now();

      // Use real Vibium navigation
      await this.vibeInstance!.go(options.url);

      // Get page title via evaluate
      let title = '';
      try {
        title = await this.vibeInstance!.evaluate<string>('document.title');
      } catch {
        title = 'Unknown';
      }

      const result: NavigateResult = {
        url: options.url,
        statusCode: 200, // Vibium doesn't expose status codes directly
        title,
        durationMs: Date.now() - startTime,
        success: true,
      };

      if (this.currentSession) {
        this.currentSession.currentUrl = options.url;
      }

      return result;
    };

    try {
      const result = isAutoRetryEnabled()
        ? await withRetry(
            () => withPerformanceMetric(operation, 'page_navigate'),
            this.config.retryAttempts,
            'page_navigate'
          )
        : await withPerformanceMetric(operation, 'page_navigate');

      return { success: true, value: result };
    } catch (error) {
      const vibiumError = new VibiumNavigationError(options.url, undefined,
        error instanceof Error ? error : undefined);
      return { success: false, error: vibiumError };
    }
  }

  async getPageInfo(): Promise<Result<PageInfo, VibiumError>> {
    this.ensureSession();

    try {
      // Get page info via evaluate
      const url = await this.vibeInstance!.evaluate<string>('window.location.href');
      const title = await this.vibeInstance!.evaluate<string>('document.title');

      const pageInfo: PageInfo = {
        url,
        title,
        viewport: this.config.viewport,
        loadState: 'loaded',
      };

      return { success: true, value: pageInfo };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to get page info');
      return { success: false, error: vibiumError };
    }
  }

  async goBack(): Promise<Result<void, VibiumError>> {
    this.ensureSession();

    try {
      await this.vibeInstance!.evaluate('window.history.back()');
      return { success: true, value: undefined };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to go back');
      return { success: false, error: vibiumError };
    }
  }

  async goForward(): Promise<Result<void, VibiumError>> {
    this.ensureSession();

    try {
      await this.vibeInstance!.evaluate('window.history.forward()');
      return { success: true, value: undefined };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to go forward');
      return { success: false, error: vibiumError };
    }
  }

  async reload(): Promise<Result<void, VibiumError>> {
    this.ensureSession();

    try {
      await this.vibeInstance!.evaluate('window.location.reload()');
      return { success: true, value: undefined };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to reload page');
      return { success: false, error: vibiumError };
    }
  }

  // ========================================================================
  // Element Interaction
  // ========================================================================

  async findElement(options: FindOptions): Promise<Result<ElementInfo, VibiumError>> {
    this.ensureSession();

    try {
      const element = await this.vibeInstance!.find(options.selector, {
        timeout: options.timeout ?? this.config.timeout,
      });

      const elementInfo: ElementInfo = {
        selector: options.selector,
        tagName: element.info.tag,
        textContent: element.info.text,
        attributes: {},
        boundingBox: element.info.box,
        visible: true,
        enabled: true,
      };

      return { success: true, value: elementInfo };
    } catch (error) {
      const vibiumError = new VibiumElementNotFoundError(
        options.selector,
        error instanceof Error ? error : undefined
      );
      return { success: false, error: vibiumError };
    }
  }

  async findElements(options: FindOptions): Promise<Result<ElementInfo[], VibiumError>> {
    this.ensureSession();

    try {
      // Vibium doesn't have findAll, use evaluate to get all matching elements
      // Escape backslashes first, then single quotes
      const escapedSelector = options.selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const elements = await this.vibeInstance!.evaluate<Array<{ tag: string; text: string }>>(`
        Array.from(document.querySelectorAll('${escapedSelector}'))
          .map(el => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim() || ''
          }))
      `);

      const elementInfos: ElementInfo[] = elements.map((el, index) => ({
        selector: `${options.selector}:nth-child(${index + 1})`,
        tagName: el.tag,
        textContent: el.text,
        attributes: {},
        visible: true,
        enabled: true,
      }));

      return { success: true, value: elementInfos };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to find elements');
      return { success: false, error: vibiumError };
    }
  }

  async click(options: ClickOptions): Promise<Result<InteractionResult, VibiumError>> {
    this.ensureSession();

    const startTime = Date.now();

    try {
      const element = await this.vibeInstance!.find(options.selector, {
        timeout: options.timeout ?? this.config.timeout,
      });

      await element.click({
        timeout: options.timeout ?? this.config.timeout,
      });

      const result: InteractionResult = {
        success: true,
        durationMs: Date.now() - startTime,
      };

      return { success: true, value: result };
    } catch (error) {
      const vibiumError = new VibiumInteractionError(
        'click',
        options.selector,
        error instanceof Error ? error : undefined
      );
      return { success: false, error: vibiumError };
    }
  }

  async type(options: TypeOptions): Promise<Result<InteractionResult, VibiumError>> {
    this.ensureSession();

    const startTime = Date.now();

    try {
      const element = await this.vibeInstance!.find(options.selector, {
        timeout: options.timeout ?? this.config.timeout,
      });

      // Clear existing text if requested
      if (options.clear) {
        // Escape backslashes first, then single quotes
        const escapedSel = options.selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        await this.vibeInstance!.evaluate(`
          const el = document.querySelector('${escapedSel}');
          if (el) el.value = '';
        `);
      }

      await element.type(options.text, {
        timeout: options.timeout ?? this.config.timeout,
      });

      const result: InteractionResult = {
        success: true,
        durationMs: Date.now() - startTime,
      };

      return { success: true, value: result };
    } catch (error) {
      const vibiumError = new VibiumInteractionError(
        'type',
        options.selector,
        error instanceof Error ? error : undefined
      );
      return { success: false, error: vibiumError };
    }
  }

  async getText(selector: string): Promise<Result<string, VibiumError>> {
    this.ensureSession();

    try {
      const element = await this.vibeInstance!.find(selector);
      const text = await element.text();
      return { success: true, value: text };
    } catch (error) {
      const vibiumError = createVibiumError(error, `Failed to get text from ${selector}`);
      return { success: false, error: vibiumError };
    }
  }

  async getAttribute(selector: string, attribute: string): Promise<Result<string, VibiumError>> {
    this.ensureSession();

    try {
      const element = await this.vibeInstance!.find(selector);
      const value = await element.getAttribute(attribute);
      return { success: true, value: value ?? '' };
    } catch (error) {
      const vibiumError = createVibiumError(error, `Failed to get attribute ${attribute} from ${selector}`);
      return { success: false, error: vibiumError };
    }
  }

  async waitForElement(
    selector: string,
    options?: { timeout?: number; state?: 'attached' | 'visible' }
  ): Promise<Result<ElementInfo, VibiumError>> {
    this.ensureSession();

    try {
      const element = await this.vibeInstance!.find(selector, {
        timeout: options?.timeout ?? this.config.timeout,
      });

      const elementInfo: ElementInfo = {
        selector,
        tagName: element.info.tag,
        textContent: element.info.text,
        attributes: {},
        boundingBox: element.info.box,
        visible: true,
        enabled: true,
      };

      return { success: true, value: elementInfo };
    } catch (error) {
      const vibiumError = new VibiumTimeoutError(
        `Element ${selector} not found within timeout`,
        error instanceof Error ? error : undefined
      );
      return { success: false, error: vibiumError };
    }
  }

  // ========================================================================
  // Screenshots and Visual
  // ========================================================================

  async screenshot(options?: ScreenshotOptions): Promise<Result<ScreenshotResult, VibiumError>> {
    this.ensureSession();

    if (!isScreenshotCaptureEnabled()) {
      return {
        success: false,
        error: new VibiumScreenshotError('Screenshot capture is disabled by feature flags'),
      };
    }

    try {
      // Use real Vibium screenshot
      const buffer = await this.vibeInstance!.screenshot();
      const base64 = buffer.toString('base64');

      // Save to file if path specified
      if (options?.path) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.path, buffer);
      }

      const result: ScreenshotResult = {
        base64: options?.path ? undefined : base64,
        path: options?.path,
        format: options?.format ?? 'png',
        dimensions: this.config.viewport,
        sizeBytes: buffer.length,
        capturedAt: new Date(),
      };

      return { success: true, value: result };
    } catch (error) {
      const vibiumError = new VibiumScreenshotError(
        'Failed to capture screenshot',
        error instanceof Error ? error : undefined
      );
      return { success: false, error: vibiumError };
    }
  }

  async compareScreenshots(
    baseline: string,
    current: string,
    threshold: number = 0.01
  ): Promise<Result<VisualComparisonResult, VibiumError>> {
    // Visual comparison requires external library (not part of core Vibium)
    // Return a basic comparison result
    try {
      const fs = await import('fs/promises');
      const baselineBuffer = await fs.readFile(baseline);
      const currentBuffer = await fs.readFile(current);

      // Simple byte-level comparison
      const matches = baselineBuffer.equals(currentBuffer);

      const result: VisualComparisonResult = {
        matches,
        differencePercent: matches ? 0 : 100,
        diffRegions: [],
        comparedAt: new Date(),
      };

      return { success: true, value: result };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to compare screenshots');
      return { success: false, error: vibiumError };
    }
  }

  // ========================================================================
  // Script Evaluation (KEY FOR AXE-CORE)
  // ========================================================================

  /**
   * Execute JavaScript in the browser page context.
   * This is the KEY method for axe-core integration.
   *
   * @param script - JavaScript code to execute
   * @param timeout - Execution timeout in milliseconds
   * @returns Result containing the script return value
   */
  async evaluate<T = unknown>(script: string, timeout?: number): Promise<Result<T, VibiumError>> {
    this.ensureSession();

    try {
      // Use real Vibium evaluate method
      const result = await this.vibeInstance!.evaluate<T>(script);
      return { success: true, value: result };
    } catch (error) {
      const vibiumError = createVibiumError(error, 'Failed to evaluate script');
      return { success: false, error: vibiumError };
    }
  }

  // ========================================================================
  // Accessibility
  // ========================================================================

  async checkAccessibility(
    options?: AccessibilityCheckOptions
  ): Promise<Result<AccessibilityResult, VibiumError>> {
    this.ensureSession();

    // Accessibility checking requires axe-core injection via evaluate
    // This is handled by the axe-core-integration module
    // Return a stub that indicates the method should use axe-core integration
    return {
      success: false,
      error: new VibiumError(
        'Use axe-core-integration module for accessibility testing. ' +
        'Call injectAxeCore() then runAxeAudit() using client.evaluate().',
        'USE_AXE_CORE_INTEGRATION'
      ),
    };
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  async initialize(): Promise<void> {
    // Pre-load Vibium to check availability
    await getVibiumBrowser();
    this._initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.vibeInstance) {
      try {
        await this.vibeInstance.quit();
      } catch (error) {
        // Non-critical: Vibium disposal errors
        console.debug('[VibiumClient] Disposal error:', error instanceof Error ? error.message : error);
      }
      this.vibeInstance = null;
    }
    this.currentSession = null;
    this._initialized = false;
    this._available = null;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Ensure browser session is active
   */
  private ensureSession(): void {
    if (!this.vibeInstance) {
      throw new VibiumConnectionError('No active browser session. Call launch() first.');
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `vibium-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Singleton Provider
// ============================================================================

/**
 * Singleton provider for VibiumClient instances
 *
 * Manages a global VibiumClient instance with lazy initialization.
 */
export class VibiumClientProvider {
  private static instance: VibiumClientProvider | null = null;
  private client: VibiumClientImpl | null = null;
  private config: Partial<VibiumConfig>;

  private constructor(config: Partial<VibiumConfig> = {}) {
    this.config = config;
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<VibiumConfig>): VibiumClientProvider {
    if (!VibiumClientProvider.instance) {
      VibiumClientProvider.instance = new VibiumClientProvider(config);
    }
    return VibiumClientProvider.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    if (VibiumClientProvider.instance?.client) {
      VibiumClientProvider.instance.client.dispose();
    }
    VibiumClientProvider.instance = null;
  }

  /**
   * Get or create client instance
   */
  async getClient(): Promise<VibiumClient> {
    if (!this.client) {
      this.client = new VibiumClientImpl(this.config);
      await this.client.initialize();
    }
    return this.client;
  }

  /**
   * Get client synchronously (must be initialized first)
   */
  getClientSync(): VibiumClient {
    if (!this.client) {
      this.client = new VibiumClientImpl(this.config);
    }
    return this.client;
  }

  /**
   * Get a copy of the current configuration
   */
  getConfig(): Partial<VibiumConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration and clear client (new client will be created with new config)
   */
  configure(newConfig: Partial<VibiumConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Clear client so new one gets created with new config
    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
  }

  /**
   * Dispose client resources
   */
  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.dispose();
      this.client = null;
    }
  }
}
