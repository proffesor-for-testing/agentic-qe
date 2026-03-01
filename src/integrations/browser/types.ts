/**
 * Unified Browser Automation Types
 * Both Vibium and agent-browser implement IBrowserClient
 *
 * This file provides a common interface for browser automation tools
 * to enable seamless integration with AQE v3. Both Vibium (MCP-based)
 * and agent-browser (CLI-based) implement these interfaces.
 *
 * Integration Points:
 * - Vibium: Real browser control via WebDriver BiDi (MCP)
 * - agent-browser: CLI tool with snapshot refs (@e1, @e2)
 * - E2E Testing: Uses agent-browser for refs and state persistence
 * - Visual Testing: Can use either tool
 * - Accessibility: Can use either tool
 */

import type { Result, Severity } from '../../shared/types';

// ============================================================================
// Element Targeting
// ============================================================================

/**
 * Element targeting - supports both CSS selectors and agent-browser refs
 * Allows polymorphic element selection across different browser tools
 */
export type ElementTarget =
  | { type: 'ref'; value: string }      // @e1, @e2 (agent-browser snapshot refs)
  | { type: 'css'; value: string }      // CSS selector (any tool)
  | { type: 'xpath'; value: string }    // XPath (any tool)
  | { type: 'text'; value: string };    // Text content matching (any tool)

/**
 * Browser tool preference for task selection
 */
export type BrowserToolPreference = 'agent-browser' | 'vibium' | 'auto';

/**
 * Use cases for intelligent tool selection
 * Helps decide which browser tool is better suited for a given task
 */
export type BrowserUseCase =
  | 'e2e-testing'          // Prefer agent-browser (refs, sessions, mocking)
  | 'visual-regression'    // Either (both capture screenshots)
  | 'accessibility'        // Either (both can run accessibility checks)
  | 'api-mocking'          // agent-browser only (network interception)
  | 'responsive-testing'   // agent-browser (device emulation)
  | 'auth-testing';        // agent-browser (state persistence, sessions)

// ============================================================================
// Browser Launch and Session
// ============================================================================

/**
 * Common launch options for browser initialization
 */
export interface BrowserLaunchOptions {
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Device name for emulation (agent-browser only) */
  deviceName?: string;
  /** Session name for state persistence (agent-browser only) */
  sessionName?: string;
  /** Browser type hint (chromium, firefox, webkit) */
  browserType?: 'chromium' | 'firefox' | 'webkit';
  /** Additional browser arguments */
  args?: string[];
}

/**
 * Browser session information
 * Identifies a specific browser instance and its current state
 */
export interface BrowserSessionInfo {
  /** Unique session identifier */
  id: string;
  /** Browser tool used (vibium or agent-browser) */
  tool: 'vibium' | 'agent-browser';
  /** Session status */
  status: 'active' | 'idle' | 'closed';
  /** Current URL */
  currentUrl?: string;
  /** Session creation timestamp */
  createdAt: Date;
}

// ============================================================================
// Navigation and Page Operations
// ============================================================================

/**
 * Result of a navigation operation
 */
export interface BrowserNavigateResult {
  /** Final URL after navigation (may differ due to redirects) */
  url: string;
  /** Page title */
  title: string;
  /** Whether navigation was successful */
  success: boolean;
  /** Navigation duration in milliseconds */
  durationMs: number;
  /** HTTP status code (if available) */
  statusCode?: number;
  /** Error message if navigation failed */
  error?: string;
}

// ============================================================================
// Screenshots and Visual
// ============================================================================

/**
 * Result of a screenshot capture operation
 */
export interface BrowserScreenshotResult {
  /** Base64-encoded image data (if no path specified) */
  base64?: string;
  /** File path (if path was specified) */
  path?: string;
  /** Image format */
  format: 'png' | 'jpeg';
  /** Image dimensions */
  dimensions: { width: number; height: number };
}

// ============================================================================
// Snapshot Elements (agent-browser specific, exposed for E2E)
// ============================================================================

/**
 * Element within a snapshot with accessibility information
 * Used by agent-browser to provide semantic element information
 */
export interface SnapshotElement {
  /** Snapshot reference (@e1, @e2, etc.) */
  ref: string;
  /** ARIA role (button, textbox, heading, etc.) */
  role: string;
  /** Accessible name */
  name?: string;
  /** Text content */
  text?: string;
  /** Depth in DOM tree */
  depth: number;
}

/**
 * Parsed snapshot result from agent-browser
 * Provides rich semantic information about page elements
 */
export interface ParsedSnapshot {
  /** URL where snapshot was taken */
  url: string;
  /** Page title */
  title: string;
  /** All elements in snapshot */
  elements: SnapshotElement[];
  /** Only interactive elements */
  interactiveElements: SnapshotElement[];
  /** Map of ref -> element for quick lookup */
  refMap: Map<string, SnapshotElement>;
  /** Snapshot timestamp */
  timestamp: Date;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Unified browser error for both tools
 * Provides a consistent error interface across browser clients
 */
export class BrowserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly tool: 'vibium' | 'agent-browser',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BrowserError';
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BrowserError.prototype);
  }
}

/**
 * Error thrown when browser is unavailable
 */
export class BrowserUnavailableError extends BrowserError {
  constructor(tool: 'vibium' | 'agent-browser', message?: string, cause?: Error) {
    super(message || 'Browser tool is unavailable', 'BROWSER_UNAVAILABLE', tool, cause);
    this.name = 'BrowserUnavailableError';
    Object.setPrototypeOf(this, BrowserUnavailableError.prototype);
  }
}

/**
 * Error thrown when operation times out
 */
export class BrowserTimeoutError extends BrowserError {
  constructor(tool: 'vibium' | 'agent-browser', operation: string, cause?: Error) {
    super(`${operation} timed out`, 'BROWSER_TIMEOUT', tool, cause);
    this.name = 'BrowserTimeoutError';
    Object.setPrototypeOf(this, BrowserTimeoutError.prototype);
  }
}

/**
 * Error thrown when element is not found
 */
export class BrowserElementNotFoundError extends BrowserError {
  constructor(tool: 'vibium' | 'agent-browser', target: ElementTarget | string, cause?: Error) {
    const targetStr = typeof target === 'string' ? target : JSON.stringify(target);
    super(`Element not found: ${targetStr}`, 'ELEMENT_NOT_FOUND', tool, cause);
    this.name = 'BrowserElementNotFoundError';
    Object.setPrototypeOf(this, BrowserElementNotFoundError.prototype);
  }
}

// ============================================================================
// Main Interface - Both tools implement this
// ============================================================================

/**
 * Common browser client interface
 * Both Vibium and agent-browser implement this interface for interchangeability
 *
 * This interface provides the core operations needed for browser automation:
 * - Lifecycle management (launch, quit)
 * - Navigation (navigate, reload, history)
 * - Element interaction (click, fill, getText, isVisible)
 * - Screenshots for visual testing
 * - JavaScript evaluation for custom operations
 *
 * Tool-specific features are available through extended interfaces:
 * - IAgentBrowserClient for agent-browser specific features (snapshots, sessions, mocking)
 */
export interface IBrowserClient {
  /** Identifier for this browser tool */
  readonly tool: 'vibium' | 'agent-browser';

  // ========================================================================
  // Lifecycle
  // ========================================================================

  /**
   * Launch a browser instance
   * @param options Launch configuration
   * @returns Session info or error
   */
  launch(options?: BrowserLaunchOptions): Promise<Result<BrowserSessionInfo, BrowserError>>;

  /**
   * Close the browser
   * @returns Success or error
   */
  quit(): Promise<Result<void, BrowserError>>;

  /**
   * Check if browser tool is available
   * @returns True if tool is installed and ready
   */
  isAvailable(): Promise<boolean>;

  // ========================================================================
  // Navigation
  // ========================================================================

  /**
   * Navigate to a URL
   * @param url URL to navigate to
   * @returns Navigation result or error
   */
  navigate(url: string): Promise<Result<BrowserNavigateResult, BrowserError>>;

  /**
   * Reload the current page
   * @returns Success or error
   */
  reload(): Promise<Result<void, BrowserError>>;

  /**
   * Go back in browser history
   * @returns Success or error
   */
  goBack(): Promise<Result<void, BrowserError>>;

  /**
   * Go forward in browser history
   * @returns Success or error
   */
  goForward(): Promise<Result<void, BrowserError>>;

  // ========================================================================
  // Element Interaction
  // ========================================================================

  /**
   * Click an element
   * @param target Element target (ref, CSS selector, xpath, or string)
   * @returns Success or error
   */
  click(target: ElementTarget | string): Promise<Result<void, BrowserError>>;

  /**
   * Fill input field with text
   * @param target Element target
   * @param text Text to enter
   * @returns Success or error
   */
  fill(target: ElementTarget | string, text: string): Promise<Result<void, BrowserError>>;

  /**
   * Get text content of an element
   * @param target Element target
   * @returns Text content or error
   */
  getText(target: ElementTarget | string): Promise<Result<string, BrowserError>>;

  /**
   * Check if element is visible
   * @param target Element target
   * @returns Visibility status or error
   */
  isVisible(target: ElementTarget | string): Promise<Result<boolean, BrowserError>>;

  // ========================================================================
  // Screenshots
  // ========================================================================

  /**
   * Capture a screenshot
   * @param options Screenshot options (path, fullPage)
   * @returns Screenshot result or error
   */
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Result<BrowserScreenshotResult, BrowserError>>;

  // ========================================================================
  // Script Evaluation
  // ========================================================================

  /**
   * Evaluate JavaScript in the browser context
   * Used for custom operations, axe-core integration, etc.
   *
   * @param script JavaScript code to execute
   * @returns Script result or error
   *
   * @example
   * ```typescript
   * // Check for custom attribute
   * const hasAttribute = await client.evaluate(
   *   `document.querySelector('body').hasAttribute('data-theme')`
   * );
   *
   * // Inject library
   * await client.evaluate(`
   *   const script = document.createElement('script');
   *   script.src = 'https://cdn.example.com/library.js';
   *   document.head.appendChild(script);
   * `);
   * ```
   */
  evaluate<T = unknown>(script: string): Promise<Result<T, BrowserError>>;

  // ========================================================================
  // Cleanup
  // ========================================================================

  /**
   * Dispose browser resources
   * Called when client is no longer needed
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Extended Interface for agent-browser specific features
// ============================================================================

/**
 * Extended browser client interface for agent-browser specific features
 * Provides additional capabilities beyond the common interface:
 * - Snapshot-based element references (@e1, @e2, etc.)
 * - Session management for state persistence
 * - Network interception and API mocking
 * - Device emulation
 * - Authentication state persistence
 * - Advanced wait strategies
 */
export interface IAgentBrowserClient extends IBrowserClient {
  readonly tool: 'agent-browser';

  // ========================================================================
  // Snapshots (agent-browser specific)
  // ========================================================================

  /**
   * Parse current page snapshot with element refs
   * Returns a parsed snapshot containing elements with @e1, @e2 style refs
   *
   * @param options Snapshot options
   * @returns Parsed snapshot with ref map or error
   *
   * @example
   * ```typescript
   * const snapshot = await client.getSnapshot({ interactive: true });
   * if (snapshot.success) {
   *   const element = snapshot.value.refMap.get('@e1');
   *   console.log(`Element: ${element?.role} - ${element?.name}`);
   * }
   * ```
   */
  getSnapshot(options?: {
    interactive?: boolean; // Only interactive elements
    depth?: number;        // Maximum DOM depth
  }): Promise<Result<ParsedSnapshot, BrowserError>>;

  // ========================================================================
  // Session Management (agent-browser specific)
  // ========================================================================

  /**
   * Create a new isolated session
   * Each session maintains its own state, cookies, storage, etc.
   *
   * @param name Optional session name
   * @returns Session info or error
   */
  createSession(name?: string): Promise<Result<BrowserSessionInfo, BrowserError>>;

  /**
   * Switch to an existing session
   * @param name Session name or ID
   * @returns Success or error
   */
  switchSession(name: string): Promise<Result<void, BrowserError>>;

  /**
   * List all available sessions
   * @returns Array of session info or error
   */
  listSessions(): Promise<Result<BrowserSessionInfo[], BrowserError>>;

  // ========================================================================
  // Network Interception (agent-browser specific)
  // ========================================================================

  /**
   * Intercept and mock API requests
   * @param urlPattern URL pattern to intercept (supports wildcards)
   * @param response Mock response data
   * @returns Success or error
   *
   * @example
   * ```typescript
   * await client.mockRoute('/api/users/**', {
   *   status: 200,
   *   body: { id: 1, name: 'John' }
   * });
   * ```
   */
  mockRoute(
    urlPattern: string,
    response: { status?: number; body?: unknown; headers?: Record<string, string> }
  ): Promise<Result<void, BrowserError>>;

  /**
   * Abort requests matching a pattern
   * @param urlPattern URL pattern to abort
   * @returns Success or error
   */
  abortRoute(urlPattern: string): Promise<Result<void, BrowserError>>;

  /**
   * Clear all mocked routes
   * @returns Success or error
   */
  clearRoutes(): Promise<Result<void, BrowserError>>;

  // ========================================================================
  // Device Emulation (agent-browser specific)
  // ========================================================================

  /**
   * Emulate a specific device
   * @param deviceName Device name (e.g., 'iPhone 12', 'Pixel 5')
   * @returns Success or error
   */
  setDevice(deviceName: string): Promise<Result<void, BrowserError>>;

  /**
   * Set custom viewport dimensions
   * @param width Viewport width
   * @param height Viewport height
   * @returns Success or error
   */
  setViewport(width: number, height: number): Promise<Result<void, BrowserError>>;

  // ========================================================================
  // Authentication State Persistence (agent-browser specific)
  // ========================================================================

  /**
   * Save browser state (cookies, storage, etc.)
   * Useful for persisting authentication state between sessions
   *
   * @param path File path to save state
   * @returns Success or error
   *
   * @example
   * ```typescript
   * // Save authenticated state
   * await client.saveState('./auth-state.json');
   * // Later, load in new session
   * await client.loadState('./auth-state.json');
   * ```
   */
  saveState(path: string): Promise<Result<void, BrowserError>>;

  /**
   * Load previously saved browser state
   * @param path File path to load state from
   * @returns Success or error
   */
  loadState(path: string): Promise<Result<void, BrowserError>>;

  // ========================================================================
  // Advanced Wait Strategies (agent-browser specific)
  // ========================================================================

  /**
   * Wait for an element to be present
   * @param target Element target
   * @param timeout Timeout in milliseconds
   * @returns Success or error
   */
  waitForElement(target: ElementTarget | string, timeout?: number): Promise<Result<void, BrowserError>>;

  /**
   * Wait for text to appear on page
   * @param text Text to wait for
   * @param timeout Timeout in milliseconds
   * @returns Success or error
   */
  waitForText(text: string, timeout?: number): Promise<Result<void, BrowserError>>;

  /**
   * Wait for URL to match pattern
   * @param pattern URL pattern
   * @param timeout Timeout in milliseconds
   * @returns Success or error
   */
  waitForUrl(pattern: string, timeout?: number): Promise<Result<void, BrowserError>>;

  /**
   * Wait for network to idle
   * No new requests for specified period
   *
   * @param timeout Timeout in milliseconds
   * @returns Success or error
   */
  waitForNetworkIdle(timeout?: number): Promise<Result<void, BrowserError>>;
}
