/**
 * Agentic QE v3 - Vibium Browser Automation Integration Types
 *
 * Vibium provides browser automation capabilities for visual testing,
 * accessibility testing, and E2E testing via MCP.
 * This is an OPTIONAL dependency - all features work without it.
 *
 * Integration Points:
 * | Vibium Feature          | QE Application                              |
 * |-------------------------|---------------------------------------------|
 * | Browser Launch          | Initialize browser sessions for testing     |
 * | Element Interaction     | Simulate user actions (click, type, etc.)   |
 * | Screenshot Capture      | Visual regression testing                   |
 * | Accessibility Testing   | WCAG compliance validation                  |
 * | E2E Test Execution      | Full user workflow testing                  |
 */

import type { Result, Severity } from '../../shared/types';

// ============================================================================
// Vibium Client Configuration
// ============================================================================

/**
 * Configuration for Vibium browser automation client
 */
export interface VibiumConfig {
  /** Whether Vibium integration is enabled */
  enabled: boolean;
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Default navigation timeout in milliseconds */
  timeout?: number;
  /** Retry attempts for failed browser operations */
  retryAttempts?: number;
  /** Fallback to mock/stub when Vibium unavailable */
  fallbackEnabled?: boolean;
  /** Browser type (chromium, firefox, webkit) */
  browserType?: 'chromium' | 'firefox' | 'webkit';
  /** Viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };
  /** User agent string override */
  userAgent?: string;
  /** Enable browser devtools */
  devtools?: boolean;
  /** Slow down operations by specified milliseconds (for debugging) */
  slowMo?: number;
  /** Screenshot directory for captured images */
  screenshotDir?: string;
}

/**
 * Default Vibium configuration
 *
 * NOTE: Vibium provides browser automation via MCP integration.
 * Uses temporary file storage for screenshots (configurable).
 */
export const DEFAULT_VIBIUM_CONFIG: Required<VibiumConfig> = {
  enabled: true,
  headless: true,
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  fallbackEnabled: true,
  browserType: 'chromium',
  viewport: {
    width: 1280,
    height: 720,
  },
  userAgent: '',
  devtools: false,
  slowMo: 0,
  screenshotDir: '.agentic-qe/screenshots',
};

// ============================================================================
// Browser Session Management
// ============================================================================

/**
 * Connection status for Vibium browser
 */
export type VibiumConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'launching'
  | 'error'
  | 'unavailable';

/**
 * Browser launch options
 */
export interface LaunchOptions {
  /** Run in headless mode */
  headless?: boolean;
  /** Enable devtools */
  devtools?: boolean;
  /** Slow down operations (milliseconds) */
  slowMo?: number;
  /** Viewport dimensions */
  viewport?: {
    width: number;
    height: number;
  };
  /** User agent override */
  userAgent?: string;
  /** Additional browser arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Browser session information
 */
export interface BrowserSession {
  /** Session ID */
  id: string;
  /** Browser type */
  browserType: 'chromium' | 'firefox' | 'webkit';
  /** Launch timestamp */
  launchedAt: Date;
  /** Current page URL */
  currentUrl?: string;
  /** Session status */
  status: VibiumConnectionStatus;
  /** Viewport configuration */
  viewport: {
    width: number;
    height: number;
  };
  /** Whether running in headless mode */
  headless: boolean;
}

/**
 * Vibium health check result
 */
export interface VibiumHealthResult {
  status: VibiumConnectionStatus;
  version?: string;
  browserType?: string;
  features: string[];
  latencyMs?: number;
  lastChecked: Date;
  error?: string;
  sessionActive: boolean;
}

// ============================================================================
// Navigation and Page Operations
// ============================================================================

/**
 * Navigation options
 */
export interface NavigateOptions {
  /** URL to navigate to */
  url: string;
  /** Wait until specific load state */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Navigation timeout in milliseconds */
  timeout?: number;
  /** Referer header value */
  referer?: string;
}

/**
 * Navigation result
 */
export interface NavigateResult {
  /** Final URL after navigation (may differ due to redirects) */
  url: string;
  /** HTTP status code */
  statusCode: number;
  /** Page title */
  title: string;
  /** Navigation duration in milliseconds */
  durationMs: number;
  /** Whether navigation was successful */
  success: boolean;
  /** Error message if navigation failed */
  error?: string;
}

/**
 * Page information
 */
export interface PageInfo {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
  /** Page load state */
  loadState: 'loading' | 'loaded' | 'domcontentloaded' | 'networkidle';
}

// ============================================================================
// Element Interaction
// ============================================================================

/**
 * Element selector options
 */
export interface FindOptions {
  /** CSS selector, XPath, or text content */
  selector: string;
  /** Selector type */
  selectorType?: 'css' | 'xpath' | 'text' | 'id' | 'testid';
  /** Wait for element timeout in milliseconds */
  timeout?: number;
  /** Wait for element to be visible */
  visible?: boolean;
  /** Wait for element to be enabled */
  enabled?: boolean;
  /** Match state (attached, visible, hidden, etc.) */
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}

/**
 * Element bounding box
 */
export interface ElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Element information
 */
export interface ElementInfo {
  /** Element selector used to find it */
  selector: string;
  /** Element tag name */
  tagName: string;
  /** Element text content */
  textContent?: string;
  /** Element attributes */
  attributes: Record<string, string>;
  /** Element bounding box */
  boundingBox?: ElementBoundingBox;
  /** Whether element is visible */
  visible: boolean;
  /** Whether element is enabled/interactive */
  enabled: boolean;
  /** ARIA role */
  role?: string;
  /** ARIA label */
  ariaLabel?: string;
}

/**
 * Click options
 */
export interface ClickOptions {
  /** Element selector */
  selector: string;
  /** Button to click (left, right, middle) */
  button?: 'left' | 'right' | 'middle';
  /** Number of clicks */
  clickCount?: number;
  /** Delay between mousedown and mouseup (ms) */
  delay?: number;
  /** Click position relative to element */
  position?: { x: number; y: number };
  /** Modifiers to press during click */
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
  /** Force click even if element is not actionable */
  force?: boolean;
  /** Wait for element timeout */
  timeout?: number;
}

/**
 * Type/input options
 */
export interface TypeOptions {
  /** Element selector */
  selector: string;
  /** Text to type */
  text: string;
  /** Delay between key presses (ms) */
  delay?: number;
  /** Clear existing text before typing */
  clear?: boolean;
  /** Press Enter after typing */
  pressEnter?: boolean;
  /** Wait for element timeout */
  timeout?: number;
}

/**
 * Element interaction result
 */
export interface InteractionResult {
  /** Whether interaction was successful */
  success: boolean;
  /** Element that was interacted with */
  element?: ElementInfo;
  /** Duration of interaction in milliseconds */
  durationMs: number;
  /** Error message if interaction failed */
  error?: string;
}

// ============================================================================
// Screenshot and Visual Testing
// ============================================================================

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  /** Screenshot output path (optional, returns base64 if not specified) */
  path?: string;
  /** Capture full page (scrolls and stitches) */
  fullPage?: boolean;
  /** Clip to specific region */
  clip?: ElementBoundingBox;
  /** Image format */
  format?: 'png' | 'jpeg';
  /** JPEG quality (0-100, only for jpeg format) */
  quality?: number;
  /** Omit background (transparent PNG) */
  omitBackground?: boolean;
  /** Element selector to screenshot (instead of full page) */
  selector?: string;
}

/**
 * Screenshot result
 */
export interface ScreenshotResult {
  /** Base64-encoded image data (if path not specified) */
  base64?: string;
  /** File path (if path was specified) */
  path?: string;
  /** Image format */
  format: 'png' | 'jpeg';
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** File size in bytes */
  sizeBytes: number;
  /** Capture timestamp */
  capturedAt: Date;
}

/**
 * Visual comparison result
 */
export interface VisualComparisonResult {
  /** Whether images match within threshold */
  matches: boolean;
  /** Difference percentage (0-100) */
  differencePercent: number;
  /** Path to diff image (if generated) */
  diffImagePath?: string;
  /** Regions that differ */
  diffRegions: ElementBoundingBox[];
  /** Comparison timestamp */
  comparedAt: Date;
}

// ============================================================================
// Accessibility Testing
// ============================================================================

/**
 * Accessibility check options
 */
export interface AccessibilityCheckOptions {
  /** URL or selector to check */
  target?: string;
  /** WCAG level (A, AA, AAA) */
  wcagLevel?: 'A' | 'AA' | 'AAA';
  /** Rules to include/exclude */
  rules?: {
    include?: string[];
    exclude?: string[];
  };
  /** Element selector to check (instead of full page) */
  selector?: string;
}

/**
 * Accessibility violation
 */
export interface AccessibilityViolation {
  /** Violation ID */
  id: string;
  /** Rule that was violated */
  rule: string;
  /** WCAG success criterion */
  wcagCriterion?: string;
  /** Impact level */
  impact: Severity;
  /** Violation description */
  description: string;
  /** Help text */
  help: string;
  /** Help URL for more information */
  helpUrl?: string;
  /** Elements that violate the rule */
  nodes: Array<{
    selector: string;
    html: string;
    target: string[];
    failureSummary: string;
  }>;
}

/**
 * Accessibility check result
 */
export interface AccessibilityResult {
  /** Whether page passes accessibility checks */
  passes: boolean;
  /** Violations found */
  violations: AccessibilityViolation[];
  /** Number of violations by severity */
  violationsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  /** Passed rules */
  passedRules: string[];
  /** Incomplete checks (need manual review) */
  incompleteRules: string[];
  /** Check timestamp */
  checkedAt: Date;
}

// ============================================================================
// Vibium Client Interface
// ============================================================================

/**
 * Main Vibium client interface for browser automation
 */
export interface VibiumClient {
  // Health and Status
  /** Check if Vibium is available */
  isAvailable(): Promise<boolean>;
  /** Get health status */
  getHealth(): Promise<VibiumHealthResult>;
  /** Get current session information */
  getSession(): Promise<BrowserSession | null>;

  // Browser Lifecycle
  /** Launch browser */
  launch(options?: LaunchOptions): Promise<Result<BrowserSession, VibiumError>>;
  /** Close browser */
  quit(): Promise<Result<void, VibiumError>>;

  // Navigation
  /** Navigate to URL */
  navigate(options: NavigateOptions): Promise<Result<NavigateResult, VibiumError>>;
  /** Get current page information */
  getPageInfo(): Promise<Result<PageInfo, VibiumError>>;
  /** Go back in history */
  goBack(): Promise<Result<void, VibiumError>>;
  /** Go forward in history */
  goForward(): Promise<Result<void, VibiumError>>;
  /** Reload current page */
  reload(): Promise<Result<void, VibiumError>>;

  // Element Interaction
  /** Find element on page */
  findElement(options: FindOptions): Promise<Result<ElementInfo, VibiumError>>;
  /** Find multiple elements */
  findElements(options: FindOptions): Promise<Result<ElementInfo[], VibiumError>>;
  /** Click element */
  click(options: ClickOptions): Promise<Result<InteractionResult, VibiumError>>;
  /** Type text into element */
  type(options: TypeOptions): Promise<Result<InteractionResult, VibiumError>>;
  /** Get element text */
  getText(selector: string): Promise<Result<string, VibiumError>>;
  /** Get element attribute */
  getAttribute(selector: string, attribute: string): Promise<Result<string, VibiumError>>;
  /** Wait for element to appear */
  waitForElement(
    selector: string,
    options?: { timeout?: number; state?: 'attached' | 'visible' }
  ): Promise<Result<ElementInfo, VibiumError>>;

  // Screenshots and Visual
  /** Capture screenshot */
  screenshot(options?: ScreenshotOptions): Promise<Result<ScreenshotResult, VibiumError>>;
  /** Compare two screenshots */
  compareScreenshots(
    baseline: string,
    current: string,
    threshold?: number
  ): Promise<Result<VisualComparisonResult, VibiumError>>;

  // Accessibility
  /** Run accessibility checks */
  checkAccessibility(
    options?: AccessibilityCheckOptions
  ): Promise<Result<AccessibilityResult, VibiumError>>;

  // Script Evaluation
  /**
   * Execute JavaScript in the browser page context.
   * This is essential for injecting and running axe-core accessibility tests.
   *
   * @param script - JavaScript code to execute
   * @param timeout - Execution timeout in milliseconds (default: 30000)
   * @returns Result containing the script return value or error
   *
   * @example
   * ```typescript
   * // Check if axe-core is loaded
   * const result = await client.evaluate("return typeof axe !== 'undefined'");
   * if (result.success && result.value === true) {
   *   console.log('axe-core is loaded');
   * }
   *
   * // Inject a script
   * await client.evaluate(`
   *   const script = document.createElement('script');
   *   script.src = 'https://cdn.example.com/library.js';
   *   document.head.appendChild(script);
   * `);
   * ```
   */
  evaluate<T = unknown>(script: string, timeout?: number): Promise<Result<T, VibiumError>>;

  // Lifecycle
  /** Initialize client */
  initialize(): Promise<void>;
  /** Dispose client resources */
  dispose(): Promise<void>;
}

// ============================================================================
// Wait and Polling
// ============================================================================

/**
 * Wait for condition options
 */
export interface WaitForOptions {
  /** Condition to wait for */
  condition: () => Promise<boolean>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Polling interval in milliseconds */
  interval?: number;
  /** Error message if timeout occurs */
  timeoutMessage?: string;
}

/**
 * Page load metrics
 */
export interface PageLoadMetrics {
  /** DNS lookup time (ms) */
  dnsLookup: number;
  /** TCP connection time (ms) */
  tcpConnection: number;
  /** TLS negotiation time (ms) */
  tlsNegotiation?: number;
  /** Time to first byte (ms) */
  timeToFirstByte: number;
  /** DOM content loaded time (ms) */
  domContentLoaded: number;
  /** Full page load time (ms) */
  loadComplete: number;
  /** First contentful paint (ms) */
  firstContentfulPaint?: number;
  /** Largest contentful paint (ms) */
  largestContentfulPaint?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Vibium error types
 */
export class VibiumError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VibiumError';
  }
}

export class VibiumUnavailableError extends VibiumError {
  constructor(message: string = 'Vibium MCP server is unavailable', cause?: Error) {
    super(message, 'VIBIUM_UNAVAILABLE', cause);
    this.name = 'VibiumUnavailableError';
  }
}

export class VibiumTimeoutError extends VibiumError {
  constructor(message: string = 'Browser operation timed out', cause?: Error) {
    super(message, 'VIBIUM_TIMEOUT', cause);
    this.name = 'VibiumTimeoutError';
  }
}

export class VibiumElementNotFoundError extends VibiumError {
  constructor(selector: string, cause?: Error) {
    super(`Element not found: ${selector}`, 'ELEMENT_NOT_FOUND', cause);
    this.name = 'VibiumElementNotFoundError';
  }
}

export class VibiumConnectionError extends VibiumError {
  constructor(message: string = 'Failed to connect to browser', cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'VibiumConnectionError';
  }
}

export class VibiumConfigError extends VibiumError {
  constructor(message: string, cause?: Error) {
    super(message, 'VIBIUM_CONFIG_ERROR', cause);
    this.name = 'VibiumConfigError';
  }
}

export class VibiumNavigationError extends VibiumError {
  constructor(url: string, statusCode?: number, cause?: Error) {
    const message = statusCode
      ? `Navigation failed: ${url} (HTTP ${statusCode})`
      : `Navigation failed: ${url}`;
    super(message, 'NAVIGATION_ERROR', cause);
    this.name = 'VibiumNavigationError';
  }
}

export class VibiumScreenshotError extends VibiumError {
  constructor(message: string = 'Failed to capture screenshot', cause?: Error) {
    super(message, 'SCREENSHOT_ERROR', cause);
    this.name = 'VibiumScreenshotError';
  }
}

export class VibiumInteractionError extends VibiumError {
  constructor(action: string, selector: string, cause?: Error) {
    super(`Failed to ${action} element: ${selector}`, 'INTERACTION_ERROR', cause);
    this.name = 'VibiumInteractionError';
  }
}
