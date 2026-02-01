/**
 * agent-browser Client
 * Full implementation of IAgentBrowserClient interface
 *
 * This client wraps the CLI-based agent-browser tool, providing
 * a type-safe, Result-pattern API for browser automation with
 * snapshot-based element references.
 */

import type { Result } from '../../../shared/types';
import type {
  IAgentBrowserClient,
  BrowserLaunchOptions,
  BrowserSessionInfo,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  ParsedSnapshot,
  ElementTarget,
  SnapshotElement,
} from '../types';
import {
  BrowserError,
  BrowserUnavailableError,
  BrowserTimeoutError,
  BrowserElementNotFoundError,
} from '../types';
import {
  AgentBrowserCommandExecutor,
  isAgentBrowserAvailable,
  type CommandExecutorConfig,
} from './command-executor';
import {
  SnapshotParser,
  getSnapshotParser,
  type ParsedSnapshot as ParserParsedSnapshot,
} from './snapshot-parser';
import {
  AgentBrowserSessionManager,
  type BrowserSessionInfo as SessionManagerInfo,
} from './session-manager';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert ElementTarget or string to a target string for CLI commands
 */
function resolveTarget(target: ElementTarget | string): string {
  if (typeof target === 'string') {
    // If it looks like a ref (@e1, e1), use as-is
    if (/^@?e\d+$/.test(target)) {
      return target.startsWith('@') ? target : `@${target}`;
    }
    // Assume it's a CSS selector
    return target;
  }

  switch (target.type) {
    case 'ref':
      return target.value.startsWith('@') ? target.value : `@${target.value}`;
    case 'css':
      return target.value;
    case 'xpath':
      return `xpath=${target.value}`;
    case 'text':
      return `text=${target.value}`;
    default:
      return (target as { value: string }).value;
  }
}

/**
 * Create a success Result
 */
function ok<T>(value: T): Result<T, BrowserError> {
  return { success: true, value };
}

/**
 * Create an error Result
 */
function err<T>(error: BrowserError): Result<T, BrowserError> {
  return { success: false, error };
}

/**
 * Convert session manager info to BrowserSessionInfo
 */
function toSessionInfo(info: SessionManagerInfo): BrowserSessionInfo {
  return {
    id: info.name,
    tool: 'agent-browser',
    status: info.status,
    currentUrl: info.currentUrl,
    createdAt: info.createdAt,
  };
}

/**
 * Convert parser snapshot to browser types ParsedSnapshot
 */
function toTypedSnapshot(parsed: ParserParsedSnapshot): ParsedSnapshot {
  const elements: SnapshotElement[] = parsed.elements.map((el) => ({
    ref: el.refWithAt,
    role: el.role,
    name: el.name,
    text: el.text,
    depth: el.depth,
  }));

  const interactiveElements: SnapshotElement[] = parsed.interactiveElements.map((el) => ({
    ref: el.refWithAt,
    role: el.role,
    name: el.name,
    text: el.text,
    depth: el.depth,
  }));

  const refMap = new Map<string, SnapshotElement>();
  for (const el of elements) {
    refMap.set(el.ref, el);
  }

  return {
    url: parsed.url ?? '',
    title: parsed.title ?? '',
    elements,
    interactiveElements,
    refMap,
    timestamp: parsed.parsedAt,
  };
}

// ============================================================================
// AgentBrowserClient Implementation
// ============================================================================

/**
 * Configuration options for AgentBrowserClient
 */
export interface AgentBrowserClientConfig {
  /** Run browser in headed mode (show browser window) */
  headed?: boolean;
  /** Command timeout in milliseconds */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Default session name */
  sessionName?: string;
}

/**
 * Agent Browser Client - implements IAgentBrowserClient
 *
 * Provides a full browser automation API using the agent-browser CLI tool.
 * Features:
 * - Snapshot-based element references (@e1, @e2, etc.)
 * - Session management for parallel testing
 * - Network interception and API mocking
 * - Device emulation
 * - Authentication state persistence
 * - Advanced wait strategies
 */
export class AgentBrowserClient implements IAgentBrowserClient {
  readonly tool = 'agent-browser' as const;

  private executor: AgentBrowserCommandExecutor;
  private sessionManager: AgentBrowserSessionManager;
  private snapshotParser: SnapshotParser;
  private config: Required<AgentBrowserClientConfig>;
  private isLaunched = false;
  private currentSessionId: string | null = null;

  constructor(config: AgentBrowserClientConfig = {}) {
    this.config = {
      headed: config.headed ?? false,
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
      sessionName: config.sessionName ?? 'default',
    };

    const executorConfig: CommandExecutorConfig = {
      sessionName: this.config.sessionName,
      timeout: this.config.timeout,
      headed: this.config.headed,
      debug: this.config.debug,
    };

    this.executor = new AgentBrowserCommandExecutor(executorConfig);
    this.sessionManager = new AgentBrowserSessionManager({
      headed: this.config.headed,
      timeout: this.config.timeout,
    });
    this.snapshotParser = getSnapshotParser();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Launch a browser instance
   */
  async launch(options?: BrowserLaunchOptions): Promise<Result<BrowserSessionInfo, BrowserError>> {
    try {
      // If already launched, return existing session info (idempotent)
      if (this.isLaunched && this.currentSessionId) {
        const existingSession = this.sessionManager.getSession(this.currentSessionId);
        if (existingSession) {
          // Update viewport if requested
          if (options?.viewport) {
            await this.setViewport(options.viewport.width, options.viewport.height);
          }
          return ok(toSessionInfo(existingSession));
        }
      }

      // Check availability first
      const available = await this.isAvailable();
      if (!available) {
        return err(new BrowserUnavailableError('agent-browser', 'agent-browser CLI is not available'));
      }

      // Create a session with the given options
      const sessionName = options?.sessionName ?? this.config.sessionName;
      const session = await this.sessionManager.createSession({
        name: sessionName,
        headed: options?.headless === false || this.config.headed,
        timeout: this.config.timeout,
      });

      this.currentSessionId = session.name;
      this.isLaunched = true;

      // Update executor to use the new session
      // This ensures all subsequent operations use the correct session
      this.executor = new AgentBrowserCommandExecutor({
        sessionName: session.name,
        timeout: this.config.timeout,
        headed: options?.headless === false || this.config.headed,
        debug: this.config.debug,
      });

      // Set viewport if provided
      if (options?.viewport) {
        await this.setViewport(options.viewport.width, options.viewport.height);
      }

      // Set device if provided
      if (options?.deviceName) {
        await this.setDevice(options.deviceName);
      }

      return ok(toSessionInfo(session));
    } catch (error) {
      const browserError = new BrowserError(
        error instanceof Error ? error.message : String(error),
        'LAUNCH_FAILED',
        'agent-browser',
        error instanceof Error ? error : undefined
      );
      return err(browserError);
    }
  }

  /**
   * Close the browser and terminate the daemon process
   * CRITICAL: This must fully terminate all processes to prevent memory leaks!
   */
  async quit(): Promise<Result<void, BrowserError>> {
    try {
      if (this.currentSessionId) {
        // closeSession now terminates the daemon, not just closes the browser
        const result = await this.sessionManager.closeSession(this.currentSessionId);
        if (!result.success) {
          // Log but don't fail - we'll try force cleanup below
          if (this.config.debug) {
            console.warn(`[agent-browser] Session close warning: ${result.error}`);
          }
        }
      }

      // Extra safety: also terminate via executor if we have one
      if (this.executor) {
        try {
          this.executor.terminateDaemon();
        } catch (error) {
          // Non-critical: best effort daemon termination
          console.debug('[AgentBrowserClient] Daemon termination error:', error instanceof Error ? error.message : error);
        }
      }

      this.isLaunched = false;
      this.currentSessionId = null;
      return ok(undefined);
    } catch (error) {
      // Even on error, try to reset state
      this.isLaunched = false;
      this.currentSessionId = null;

      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'QUIT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Check if agent-browser CLI is available
   */
  async isAvailable(): Promise<boolean> {
    return isAgentBrowserAvailable();
  }

  /**
   * Dispose all resources
   */
  async dispose(): Promise<void> {
    await this.sessionManager.closeAllSessions();
    this.isLaunched = false;
    this.currentSessionId = null;
  }

  // ==========================================================================
  // Navigation
  // ==========================================================================

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<Result<BrowserNavigateResult, BrowserError>> {
    const startTime = Date.now();

    try {
      const result = this.executor.open(url);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Navigation failed', 'NAVIGATION_FAILED', 'agent-browser'));
      }

      // Update session URL
      if (this.currentSessionId) {
        this.sessionManager.updateSessionUrl(this.currentSessionId, url);
      }

      // Get page info for result
      const evalResult = this.executor.eval<{ title: string; url: string }>(
        'JSON.stringify({ title: document.title, url: window.location.href })'
      );

      const pageInfo =
        evalResult.success && evalResult.data
          ? typeof evalResult.data === 'string'
            ? JSON.parse(evalResult.data)
            : evalResult.data
          : { title: '', url };

      return ok({
        url: pageInfo.url || url,
        title: pageInfo.title || '',
        success: true,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'NAVIGATION_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Reload the current page
   */
  async reload(): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.eval<void>('window.location.reload()');

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Reload failed', 'RELOAD_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'RELOAD_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Go back in browser history
   */
  async goBack(): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.eval<void>('window.history.back()');

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Go back failed', 'HISTORY_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'HISTORY_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Go forward in browser history
   */
  async goForward(): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.eval<void>('window.history.forward()');

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Go forward failed', 'HISTORY_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'HISTORY_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Element Interaction
  // ==========================================================================

  /**
   * Click an element
   */
  async click(target: ElementTarget | string): Promise<Result<void, BrowserError>> {
    try {
      const resolvedTarget = resolveTarget(target);
      const result = this.executor.click(resolvedTarget);

      if (!result.success) {
        return err(new BrowserElementNotFoundError('agent-browser', target, new Error(result.error)));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'CLICK_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Fill input field with text
   */
  async fill(target: ElementTarget | string, text: string): Promise<Result<void, BrowserError>> {
    try {
      const resolvedTarget = resolveTarget(target);
      const result = this.executor.fill(resolvedTarget, text);

      if (!result.success) {
        return err(new BrowserElementNotFoundError('agent-browser', target, new Error(result.error)));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'FILL_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Get text content of an element
   */
  async getText(target: ElementTarget | string): Promise<Result<string, BrowserError>> {
    try {
      const resolvedTarget = resolveTarget(target);
      const result = this.executor.getText(resolvedTarget);

      if (!result.success) {
        return err(new BrowserElementNotFoundError('agent-browser', target, new Error(result.error)));
      }

      // Extract actual text from CLI JSON response
      // CLI returns: { text: "value" } or { data: { text: "value" } } or { result: "value" }
      let text = result.data;
      if (text && typeof text === 'object') {
        const obj = text as Record<string, unknown>;
        if ('text' in obj) {
          text = obj.text as string;
        } else if ('data' in obj && typeof obj.data === 'object') {
          const dataObj = obj.data as Record<string, unknown>;
          if ('text' in dataObj) {
            text = dataObj.text as string;
          } else if ('result' in dataObj) {
            text = dataObj.result as string;
          }
        } else if ('result' in obj) {
          text = obj.result as string;
        }
      }

      return ok(String(text ?? ''));
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'GET_TEXT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Check if element is visible
   */
  async isVisible(target: ElementTarget | string): Promise<Result<boolean, BrowserError>> {
    try {
      const resolvedTarget = resolveTarget(target);
      const result = this.executor.isVisible(resolvedTarget);

      if (!result.success) {
        // Element not found means not visible
        return ok(false);
      }

      return ok(Boolean(result.data));
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'VISIBILITY_CHECK_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Screenshots
  // ==========================================================================

  /**
   * Capture a screenshot
   */
  async screenshot(
    options?: { path?: string; fullPage?: boolean }
  ): Promise<Result<BrowserScreenshotResult, BrowserError>> {
    try {
      const result = this.executor.screenshot(options?.path, options?.fullPage);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Screenshot failed', 'SCREENSHOT_FAILED', 'agent-browser'));
      }

      // Get viewport dimensions
      const dimensionsResult = this.executor.eval<{ width: number; height: number }>(
        'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })'
      );

      let dimensions = { width: 1280, height: 720 };
      if (dimensionsResult.success && dimensionsResult.data) {
        const parsed =
          typeof dimensionsResult.data === 'string'
            ? JSON.parse(dimensionsResult.data)
            : dimensionsResult.data;
        dimensions = { width: parsed.width || 1280, height: parsed.height || 720 };
      }

      return ok({
        base64: options?.path ? undefined : String(result.data ?? ''),
        path: options?.path,
        format: 'png',
        dimensions,
      });
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SCREENSHOT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Script Evaluation
  // ==========================================================================

  /**
   * Evaluate JavaScript in the browser context
   */
  async evaluate<T = unknown>(script: string): Promise<Result<T, BrowserError>> {
    try {
      const result = this.executor.eval<T>(script);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Evaluation failed', 'EVAL_FAILED', 'agent-browser'));
      }

      // Extract the actual value from CLI JSON output
      // CLI returns: { data: { result: actualValue }, success: true }
      // or sometimes: { result: actualValue } directly
      let value = result.data as T;
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        // Check if it's the nested { data: { result: ... } } format
        if ('data' in obj && obj.data && typeof obj.data === 'object') {
          const dataObj = obj.data as Record<string, unknown>;
          if ('result' in dataObj) {
            value = dataObj.result as T;
          }
        }
        // Check if it's the { result: ... } format
        else if ('result' in obj) {
          value = obj.result as T;
        }
      }

      return ok(value);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'EVAL_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Snapshots (agent-browser specific)
  // ==========================================================================

  /**
   * Get accessibility snapshot with element refs
   */
  async getSnapshot(
    options?: { interactive?: boolean; depth?: number }
  ): Promise<Result<ParsedSnapshot, BrowserError>> {
    try {
      const result = this.executor.snapshot({
        interactive: options?.interactive,
        depth: options?.depth,
      });

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Snapshot failed', 'SNAPSHOT_FAILED', 'agent-browser'));
      }

      // Parse the snapshot
      let parsed: ParserParsedSnapshot;
      try {
        parsed = this.snapshotParser.parseJson(result.data as string | object);
      } catch {
        // Fall back to text parsing
        parsed = this.snapshotParser.parse(String(result.data));
      }

      // Get current URL and title
      const urlResult = this.executor.eval<string>('window.location.href');
      const titleResult = this.executor.eval<string>('document.title');

      if (urlResult.success) {
        parsed.url = String(urlResult.data);
      }
      if (titleResult.success) {
        parsed.title = String(titleResult.data);
      }

      return ok(toTypedSnapshot(parsed));
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SNAPSHOT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Session Management (agent-browser specific)
  // ==========================================================================

  /**
   * Create a new isolated session
   */
  async createSession(name?: string): Promise<Result<BrowserSessionInfo, BrowserError>> {
    try {
      const session = await this.sessionManager.createSession({ name });
      return ok(toSessionInfo(session));
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SESSION_CREATE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Switch to an existing session
   */
  async switchSession(name: string): Promise<Result<void, BrowserError>> {
    try {
      this.sessionManager.switchSession(name);
      this.currentSessionId = name;

      // Update executor to use new session
      this.executor = new AgentBrowserCommandExecutor({
        sessionName: name,
        timeout: this.config.timeout,
        headed: this.config.headed,
        debug: this.config.debug,
      });

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SESSION_SWITCH_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * List all available sessions
   */
  async listSessions(): Promise<Result<BrowserSessionInfo[], BrowserError>> {
    try {
      const sessions = this.sessionManager.listSessions();
      return ok(sessions.map(toSessionInfo));
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SESSION_LIST_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Network Interception (agent-browser specific)
  // ==========================================================================

  /**
   * Mock network route
   */
  async mockRoute(
    urlPattern: string,
    response: { status?: number; body?: unknown; headers?: Record<string, string> }
  ): Promise<Result<void, BrowserError>> {
    try {
      const mockBody = {
        status: response.status ?? 200,
        body: response.body,
        headers: response.headers,
      };

      const result = this.executor.mockRoute(urlPattern, mockBody);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Mock route failed', 'MOCK_ROUTE_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'MOCK_ROUTE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Abort requests matching a pattern
   */
  async abortRoute(urlPattern: string): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.abortRoute(urlPattern);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Abort route failed', 'ABORT_ROUTE_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'ABORT_ROUTE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Clear all mocked routes
   */
  async clearRoutes(): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.clearRoutes();

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Clear routes failed', 'CLEAR_ROUTES_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'CLEAR_ROUTES_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Device Emulation (agent-browser specific)
  // ==========================================================================

  /**
   * Emulate a specific device
   */
  async setDevice(deviceName: string): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.setDevice(deviceName);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Set device failed', 'SET_DEVICE_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SET_DEVICE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Set custom viewport dimensions
   */
  async setViewport(width: number, height: number): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.setViewport(width, height);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Set viewport failed', 'SET_VIEWPORT_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SET_VIEWPORT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Authentication State Persistence (agent-browser specific)
  // ==========================================================================

  /**
   * Save browser state (cookies, storage, etc.)
   */
  async saveState(path: string): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.saveState(path);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Save state failed', 'SAVE_STATE_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'SAVE_STATE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Load previously saved browser state
   */
  async loadState(path: string): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.loadState(path);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Load state failed', 'LOAD_STATE_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'LOAD_STATE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Advanced Wait Strategies (agent-browser specific)
  // ==========================================================================

  /**
   * Wait for an element to be present
   */
  async waitForElement(
    target: ElementTarget | string,
    timeout?: number
  ): Promise<Result<void, BrowserError>> {
    try {
      const resolvedTarget = resolveTarget(target);
      const result = this.executor.waitForElement(resolvedTarget, timeout);

      if (!result.success) {
        return err(
          new BrowserTimeoutError('agent-browser', `waitForElement(${resolvedTarget})`, new Error(result.error))
        );
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'WAIT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Wait for text to appear on page
   */
  async waitForText(text: string, timeout?: number): Promise<Result<void, BrowserError>> {
    try {
      // The timeout parameter is ignored by the current CLI implementation
      // but we accept it for interface compatibility
      void timeout;

      const result = this.executor.waitForText(text);

      if (!result.success) {
        return err(new BrowserTimeoutError('agent-browser', `waitForText("${text}")`, new Error(result.error)));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'WAIT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Wait for URL to match pattern
   */
  async waitForUrl(pattern: string, timeout?: number): Promise<Result<void, BrowserError>> {
    try {
      // The timeout parameter is ignored by the current CLI implementation
      void timeout;

      const result = this.executor.waitForUrl(pattern);

      if (!result.success) {
        return err(new BrowserTimeoutError('agent-browser', `waitForUrl("${pattern}")`, new Error(result.error)));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'WAIT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Wait for network to idle
   */
  async waitForNetworkIdle(timeout?: number): Promise<Result<void, BrowserError>> {
    try {
      // The timeout parameter is ignored by the current CLI implementation
      void timeout;

      const result = this.executor.waitForNetworkIdle();

      if (!result.success) {
        return err(new BrowserTimeoutError('agent-browser', 'waitForNetworkIdle', new Error(result.error)));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'WAIT_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  // ==========================================================================
  // Trace Recording (agent-browser specific)
  // ==========================================================================

  /**
   * Start trace recording
   *
   * Records browser activity including network requests, console logs,
   * and user interactions. Useful for debugging test failures.
   */
  async startTrace(): Promise<Result<void, BrowserError>> {
    try {
      const result = this.executor.startTrace();

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Start trace failed', 'START_TRACE_FAILED', 'agent-browser'));
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'START_TRACE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Stop trace recording and save to file
   *
   * @param outputPath - Path to save the trace file (.zip recommended)
   * @returns Path where trace was saved
   */
  async stopTrace(outputPath: string): Promise<Result<string, BrowserError>> {
    try {
      const result = this.executor.stopTrace(outputPath);

      if (!result.success) {
        return err(new BrowserError(result.error ?? 'Stop trace failed', 'STOP_TRACE_FAILED', 'agent-browser'));
      }

      return ok(result.data ?? outputPath);
    } catch (error) {
      return err(
        new BrowserError(
          error instanceof Error ? error.message : String(error),
          'STOP_TRACE_FAILED',
          'agent-browser',
          error instanceof Error ? error : undefined
        )
      );
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AgentBrowserClient instance
 */
export function createAgentBrowserClient(config?: AgentBrowserClientConfig): AgentBrowserClient {
  return new AgentBrowserClient(config);
}

// ============================================================================
// Global Cleanup Utility
// ============================================================================

/**
 * Kill all orphan agent-browser daemon and chromium processes
 * Use this in test afterAll hooks as a safety net to prevent memory leaks
 *
 * WARNING: This kills ALL agent-browser processes system-wide!
 * Only use in test environments.
 */
export async function cleanupAllBrowserProcesses(): Promise<void> {
  const { execSync } = await import('child_process');

  try {
    // Kill agent-browser daemons
    execSync('pkill -9 -f "agent-browser.*daemon" 2>/dev/null || true', {
      timeout: 5000,
      stdio: 'ignore'
    });
  } catch (error) {
    // Non-critical: daemon cleanup errors
    console.debug('[AgentBrowserClient] Daemon cleanup error:', error instanceof Error ? error.message : error);
  }

  try {
    // Kill chromium headless shell processes
    execSync('pkill -9 -f "chromium_headless_shell\\|headless_shell" 2>/dev/null || true', {
      timeout: 5000,
      stdio: 'ignore'
    });
  } catch (error) {
    // Non-critical: chromium cleanup errors
    console.debug('[AgentBrowserClient] Chromium cleanup error:', error instanceof Error ? error.message : error);
  }
}
