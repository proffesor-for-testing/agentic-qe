/**
 * Agentic QE v3 - Vibium Integration Error Classes
 *
 * Error hierarchy for Vibium browser automation integration.
 * Follows the same pattern as RuVector integration for consistency.
 */

/**
 * Base class for all Vibium-related errors
 *
 * @example
 * ```typescript
 * throw new VibiumError('Browser launch failed', 'LAUNCH_ERROR');
 * ```
 */
export class VibiumError extends Error {
  /**
   * Create a new VibiumError
   * @param message - Human-readable error message
   * @param code - Machine-readable error code
   * @param cause - Optional underlying error
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VibiumError';

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VibiumError);
    }

    // Append cause stack trace if available
    if (cause?.stack) {
      this.stack += `\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Thrown when Vibium MCP server is not available
 *
 * This indicates that:
 * - MCP server is not running
 * - MCP client cannot connect to server
 * - Vibium tools are not registered in MCP registry
 *
 * @example
 * ```typescript
 * if (!mcpClient.hasTool('browser_launch')) {
 *   throw new VibiumUnavailableError('Vibium MCP tools not registered');
 * }
 * ```
 */
export class VibiumUnavailableError extends VibiumError {
  constructor(message: string = 'Vibium MCP server is unavailable', cause?: Error) {
    super(message, 'VIBIUM_UNAVAILABLE', cause);
    this.name = 'VibiumUnavailableError';
  }
}

/**
 * Thrown when a browser operation exceeds timeout
 *
 * Common causes:
 * - Page navigation taking too long
 * - Element not appearing within timeout
 * - Network request hanging
 * - Browser unresponsive
 *
 * @example
 * ```typescript
 * // Element not found within 5 seconds
 * throw new VibiumTimeoutError('Element #submit-button not found within 5000ms');
 * ```
 */
export class VibiumTimeoutError extends VibiumError {
  constructor(message: string = 'Browser operation timed out', cause?: Error) {
    super(message, 'VIBIUM_TIMEOUT', cause);
    this.name = 'VibiumTimeoutError';
  }
}

/**
 * Thrown when an element cannot be found on the page
 *
 * This is distinct from VibiumTimeoutError as it indicates
 * the element definitively does not exist (vs timing out while waiting).
 *
 * @example
 * ```typescript
 * const element = await page.querySelector('#missing-button');
 * if (!element) {
 *   throw new VibiumElementNotFoundError('#missing-button');
 * }
 * ```
 */
export class VibiumElementNotFoundError extends VibiumError {
  /** The selector that was used to find the element */
  public readonly selector: string;

  constructor(selector: string, cause?: Error) {
    super(`Element not found: ${selector}`, 'ELEMENT_NOT_FOUND', cause);
    this.name = 'VibiumElementNotFoundError';
    this.selector = selector;
  }
}

/**
 * Thrown when connection to browser fails
 *
 * Common causes:
 * - Browser process crashed
 * - WebSocket connection lost
 * - CDP (Chrome DevTools Protocol) connection failed
 * - Browser not responding to commands
 *
 * @example
 * ```typescript
 * try {
 *   await browser.connect();
 * } catch (err) {
 *   throw new VibiumConnectionError('Failed to connect to Chrome', err);
 * }
 * ```
 */
export class VibiumConnectionError extends VibiumError {
  constructor(message: string = 'Failed to connect to browser', cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'VibiumConnectionError';
  }
}

/**
 * Thrown when Vibium configuration is invalid
 *
 * Examples:
 * - Missing required config fields
 * - Invalid viewport dimensions
 * - Unsupported browser type
 * - Invalid timeout values
 *
 * @example
 * ```typescript
 * if (config.viewport.width <= 0) {
 *   throw new VibiumConfigError('Viewport width must be positive');
 * }
 * ```
 */
export class VibiumConfigError extends VibiumError {
  constructor(message: string, cause?: Error) {
    super(message, 'VIBIUM_CONFIG_ERROR', cause);
    this.name = 'VibiumConfigError';
  }
}

/**
 * Thrown when page navigation fails
 *
 * Common causes:
 * - HTTP error status (4xx, 5xx)
 * - DNS lookup failure
 * - SSL/TLS error
 * - Network timeout
 * - Invalid URL
 *
 * @example
 * ```typescript
 * const response = await page.goto('https://example.com');
 * if (response.status() >= 400) {
 *   throw new VibiumNavigationError('https://example.com', response.status());
 * }
 * ```
 */
export class VibiumNavigationError extends VibiumError {
  public readonly url: string;
  public readonly statusCode?: number;

  constructor(url: string, statusCode?: number, cause?: Error) {
    const message = statusCode
      ? `Navigation failed: ${url} (HTTP ${statusCode})`
      : `Navigation failed: ${url}`;
    super(message, 'NAVIGATION_ERROR', cause);
    this.name = 'VibiumNavigationError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when screenshot capture fails
 *
 * Common causes:
 * - File system permission error
 * - Invalid file path
 * - Insufficient disk space
 * - Element not visible/in viewport
 * - Page not fully loaded
 *
 * @example
 * ```typescript
 * try {
 *   await page.screenshot({ path: '/readonly/dir/screenshot.png' });
 * } catch (err) {
 *   throw new VibiumScreenshotError('Cannot write to readonly directory', err);
 * }
 * ```
 */
export class VibiumScreenshotError extends VibiumError {
  constructor(message: string = 'Failed to capture screenshot', cause?: Error) {
    super(message, 'SCREENSHOT_ERROR', cause);
    this.name = 'VibiumScreenshotError';
  }
}

/**
 * Thrown when element interaction fails
 *
 * Common causes:
 * - Element not visible
 * - Element not enabled/clickable
 * - Element obscured by another element
 * - Element removed from DOM
 * - Element not actionable (display: none, visibility: hidden)
 *
 * @example
 * ```typescript
 * try {
 *   await element.click();
 * } catch (err) {
 *   throw new VibiumInteractionError('click', '#submit-button', err);
 * }
 * ```
 */
export class VibiumInteractionError extends VibiumError {
  public readonly action: string;
  public readonly selector: string;

  constructor(action: string, selector: string, cause?: Error) {
    super(`Failed to ${action} element: ${selector}`, 'INTERACTION_ERROR', cause);
    this.name = 'VibiumInteractionError';
    this.action = action;
    this.selector = selector;
  }
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Check if error is a VibiumError or subclass
 */
export function isVibiumError(error: unknown): error is VibiumError {
  return error instanceof VibiumError;
}

/**
 * Check if error indicates Vibium is unavailable
 */
export function isVibiumUnavailable(error: unknown): error is VibiumUnavailableError {
  return error instanceof VibiumUnavailableError;
}

/**
 * Check if error is a timeout
 */
export function isVibiumTimeout(error: unknown): error is VibiumTimeoutError {
  return error instanceof VibiumTimeoutError;
}

/**
 * Check if error is element not found
 */
export function isElementNotFound(error: unknown): error is VibiumElementNotFoundError {
  return error instanceof VibiumElementNotFoundError;
}

/**
 * Check if error is a connection error
 */
export function isConnectionError(error: unknown): error is VibiumConnectionError {
  return error instanceof VibiumConnectionError;
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a VibiumError from an unknown error
 *
 * @param error - The error to wrap
 * @param defaultMessage - Default message if error message is not available
 * @returns A VibiumError instance
 *
 * @example
 * ```typescript
 * try {
 *   await someBrowserOperation();
 * } catch (err) {
 *   throw createVibiumError(err, 'Browser operation failed');
 * }
 * ```
 */
export function createVibiumError(
  error: unknown,
  defaultMessage: string = 'Unknown Vibium error'
): VibiumError {
  if (isVibiumError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new VibiumError(error.message || defaultMessage, 'UNKNOWN_ERROR', error);
  }

  return new VibiumError(
    typeof error === 'string' ? error : defaultMessage,
    'UNKNOWN_ERROR'
  );
}

/**
 * Create a VibiumUnavailableError with helpful context
 *
 * @param mcpAvailable - Whether MCP client is available
 * @param toolsRegistered - Whether Vibium tools are registered
 * @returns A VibiumUnavailableError with diagnostic information
 */
export function createUnavailableError(
  mcpAvailable: boolean,
  toolsRegistered: boolean
): VibiumUnavailableError {
  if (!mcpAvailable) {
    return new VibiumUnavailableError(
      'MCP client is not available. Ensure MCP server is running.'
    );
  }

  if (!toolsRegistered) {
    return new VibiumUnavailableError(
      'Vibium tools not registered in MCP. Check MCP server configuration.'
    );
  }

  return new VibiumUnavailableError();
}
