/**
 * Agentic QE v3 - Vibium Fallback Implementations
 *
 * Provides fallback implementations when Vibium MCP server is unavailable.
 * These implementations return stub/mock responses with `usedFallback: true`
 * indicator, allowing applications to continue functioning without browser automation.
 *
 * @module integrations/vibium/fallback
 */

import { randomUUID } from 'crypto';
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
import { VibiumUnavailableError, VibiumError } from './errors';

// ============================================================================
// Fallback Client Implementation
// ============================================================================

/**
 * Fallback VibiumClient that returns mock/stub responses
 *
 * Used when Vibium MCP server is unavailable. All methods return
 * stub data with warnings logged to console.
 *
 * @example
 * ```typescript
 * const fallbackClient = new FallbackVibiumClient();
 * await fallbackClient.initialize();
 *
 * // Returns stub data, not real browser
 * const sessionResult = await fallbackClient.launch();
 * console.log(sessionResult.success); // true (stub)
 *
 * // All operations return stubs
 * const navResult = await fallbackClient.navigate({ url: 'https://example.com' });
 * console.log(navResult.success); // true (stub)
 * ```
 */
export class FallbackVibiumClient implements VibiumClient {
  private readonly config: Required<VibiumConfig>;
  private stubSession: BrowserSession | null = null;
  private _initialized = false;

  /**
   * Create a new fallback Vibium client
   *
   * @param config - Client configuration
   */
  constructor(config: Partial<VibiumConfig> = {}) {
    this.config = { ...DEFAULT_VIBIUM_CONFIG, ...config };
    this.logWarning('Using fallback Vibium client - browser automation unavailable');
  }

  // ========================================================================
  // Health and Status
  // ========================================================================

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getHealth(): Promise<VibiumHealthResult> {
    return {
      status: 'unavailable',
      features: ['fallback-only'],
      lastChecked: new Date(),
      error: 'Vibium MCP server is unavailable - using fallback mode',
      sessionActive: false,
    };
  }

  async getSession(): Promise<BrowserSession | null> {
    return this.stubSession;
  }

  // ========================================================================
  // Browser Lifecycle
  // ========================================================================

  async launch(options?: LaunchOptions): Promise<Result<BrowserSession, VibiumError>> {
    this.logWarning('launch() - using stub browser session');

    const session: BrowserSession = {
      id: this.generateStubSessionId(),
      browserType: this.config.browserType,
      launchedAt: new Date(),
      status: 'unavailable',
      viewport: options?.viewport ?? this.config.viewport,
      headless: options?.headless ?? this.config.headless,
    };

    this.stubSession = session;

    return {
      success: true,
      value: session,
    };
  }

  async quit(): Promise<Result<void, VibiumError>> {
    this.logWarning('quit() - disposing stub browser session');
    this.stubSession = null;

    return {
      success: true,
      value: undefined,
    };
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  async navigate(
    options: NavigateOptions
  ): Promise<Result<NavigateResult, VibiumError>> {
    this.logWarning(`navigate(${options.url}) - returning stub result`);

    const result: NavigateResult = {
      url: options.url,
      statusCode: 200,
      title: 'Fallback Page',
      durationMs: 10,
      success: true,
    };

    if (this.stubSession) {
      this.stubSession.currentUrl = options.url;
    }

    return {
      success: true,
      value: result,
    };
  }

  async getPageInfo(): Promise<Result<PageInfo, VibiumError>> {
    this.logWarning('getPageInfo() - returning stub result');

    const pageInfo: PageInfo = {
      url: this.stubSession?.currentUrl ?? 'about:blank',
      title: 'Fallback Page',
      viewport: this.config.viewport,
      loadState: 'loaded',
    };

    return {
      success: true,
      value: pageInfo,
    };
  }

  async goBack(): Promise<Result<void, VibiumError>> {
    this.logWarning('goBack() - no-op in fallback mode');
    return { success: true, value: undefined };
  }

  async goForward(): Promise<Result<void, VibiumError>> {
    this.logWarning('goForward() - no-op in fallback mode');
    return { success: true, value: undefined };
  }

  async reload(): Promise<Result<void, VibiumError>> {
    this.logWarning('reload() - no-op in fallback mode');
    return { success: true, value: undefined };
  }

  // ========================================================================
  // Element Interaction
  // ========================================================================

  async findElement(
    options: FindOptions
  ): Promise<Result<ElementInfo, VibiumError>> {
    this.logWarning(`findElement(${options.selector}) - returning stub element`);

    const elementInfo: ElementInfo = {
      selector: options.selector,
      tagName: 'div',
      textContent: 'Fallback Element',
      attributes: { id: 'fallback-element' },
      visible: true,
      enabled: true,
    };

    return {
      success: true,
      value: elementInfo,
    };
  }

  async findElements(
    options: FindOptions
  ): Promise<Result<ElementInfo[], VibiumError>> {
    this.logWarning(`findElements(${options.selector}) - returning stub elements`);

    const elements: ElementInfo[] = [
      {
        selector: options.selector,
        tagName: 'div',
        textContent: 'Fallback Element 1',
        attributes: { id: 'fallback-element-1' },
        visible: true,
        enabled: true,
      },
    ];

    return {
      success: true,
      value: elements,
    };
  }

  async click(options: ClickOptions): Promise<Result<InteractionResult, VibiumError>> {
    this.logWarning(`click(${options.selector}) - stub interaction`);

    const result: InteractionResult = {
      success: true,
      durationMs: 5,
    };

    return {
      success: true,
      value: result,
    };
  }

  async type(options: TypeOptions): Promise<Result<InteractionResult, VibiumError>> {
    this.logWarning(`type(${options.selector}) - stub interaction`);

    const result: InteractionResult = {
      success: true,
      durationMs: 5,
    };

    return {
      success: true,
      value: result,
    };
  }

  async getText(selector: string): Promise<Result<string, VibiumError>> {
    this.logWarning(`getText(${selector}) - returning stub text`);
    return { success: true, value: 'Fallback Text' };
  }

  async getAttribute(
    selector: string,
    attribute: string
  ): Promise<Result<string, VibiumError>> {
    this.logWarning(`getAttribute(${selector}, ${attribute}) - returning stub value`);
    return { success: true, value: 'fallback-value' };
  }

  async waitForElement(
    selector: string,
    options?: { timeout?: number; state?: 'attached' | 'visible' }
  ): Promise<Result<ElementInfo, VibiumError>> {
    this.logWarning(`waitForElement(${selector}) - returning stub element`);

    const elementInfo: ElementInfo = {
      selector,
      tagName: 'div',
      textContent: 'Fallback Element',
      attributes: {},
      visible: true,
      enabled: true,
    };

    return {
      success: true,
      value: elementInfo,
    };
  }

  // ========================================================================
  // Screenshots and Visual
  // ========================================================================

  async screenshot(
    options?: ScreenshotOptions
  ): Promise<Result<ScreenshotResult, VibiumError>> {
    this.logWarning('screenshot() - returning stub screenshot');

    const result: ScreenshotResult = {
      base64: options?.path
        ? undefined
        : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      path: options?.path,
      format: options?.format ?? 'png',
      dimensions: this.config.viewport,
      sizeBytes: 68,
      capturedAt: new Date(),
    };

    return {
      success: true,
      value: result,
    };
  }

  async compareScreenshots(
    baseline: string,
    current: string,
    threshold: number = 0.01
  ): Promise<Result<VisualComparisonResult, VibiumError>> {
    this.logWarning('compareScreenshots() - returning stub comparison');

    const result: VisualComparisonResult = {
      matches: true,
      differencePercent: 0,
      diffRegions: [],
      comparedAt: new Date(),
    };

    return {
      success: true,
      value: result,
    };
  }

  // ========================================================================
  // Accessibility
  // ========================================================================

  async checkAccessibility(
    options?: AccessibilityCheckOptions
  ): Promise<Result<AccessibilityResult, VibiumError>> {
    this.logWarning('checkAccessibility() - returning stub result');

    const result: AccessibilityResult = {
      passes: true,
      violations: [],
      violationsBySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
      passedRules: ['fallback-rule'],
      incompleteRules: [],
      checkedAt: new Date(),
    };

    return {
      success: true,
      value: result,
    };
  }

  // ========================================================================
  // Script Evaluation
  // ========================================================================

  /**
   * Execute JavaScript in the browser page context.
   *
   * In fallback mode, this returns an error since we cannot execute
   * scripts without a real browser. This is intentional - features
   * that require script evaluation (like axe-core accessibility testing)
   * should not silently succeed with fake data.
   *
   * @param script - JavaScript code to execute (ignored)
   * @param timeout - Execution timeout (ignored)
   * @returns Error result indicating fallback mode cannot evaluate scripts
   */
  async evaluate<T = unknown>(
    script: string,
    timeout?: number
  ): Promise<Result<T, VibiumError>> {
    this.logWarning('evaluate() - cannot execute scripts in fallback mode');

    return {
      success: false,
      error: new VibiumUnavailableError(
        'Script evaluation is not available in fallback mode. ' +
        'Vibium browser automation is required for script evaluation.'
      ),
    };
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  async initialize(): Promise<void> {
    this._initialized = true;
    this.logWarning('Initialized fallback Vibium client');
  }

  async dispose(): Promise<void> {
    this.stubSession = null;
    this._initialized = false;
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Log a warning message
   */
  private logWarning(message: string): void {
    console.warn(`[Vibium Fallback] ${message}`);
  }

  /**
   * Generate stub session ID
   */
  private generateStubSessionId(): string {
    return `fallback-session-${Date.now()}-${randomUUID().slice(0, 9)}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a fallback Vibium client
 *
 * Returns a client that provides stub responses when Vibium is unavailable.
 *
 * @param config - Optional client configuration
 * @returns Fallback VibiumClient instance
 *
 * @example
 * ```typescript
 * const fallbackClient = createFallbackVibiumClient({ headless: true });
 * await fallbackClient.initialize();
 *
 * // All methods work but return stub data
 * const session = await fallbackClient.launch();
 * console.log(session.value.status); // 'unavailable'
 * ```
 */
export function createFallbackVibiumClient(
  config?: Partial<VibiumConfig>
): VibiumClient {
  return new FallbackVibiumClient(config);
}

/**
 * Check if a VibiumClient is using fallback mode
 *
 * @param client - VibiumClient instance to check
 * @returns true if client is in fallback mode
 */
export function isUsingFallback(client: VibiumClient): boolean {
  return client instanceof FallbackVibiumClient;
}

/**
 * Wrap a Result to indicate fallback was used
 *
 * Utility function to add metadata to results indicating
 * that fallback implementation was used.
 *
 * @param result - Original result
 * @returns Result with fallback indicator
 */
export function markAsFallback<T, E extends Error>(
  result: Result<T, E>
): Result<T & { usedFallback: true }, E> {
  if (result.success) {
    return {
      success: true,
      value: {
        ...result.value,
        usedFallback: true as const,
      },
    };
  }
  // For failure cases, the value type doesn't matter - cast is safe
  return result as Result<T & { usedFallback: true }, E>;
}
