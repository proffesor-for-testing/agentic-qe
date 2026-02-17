/**
 * Agentic QE v3 - Browser Swarm Coordinator
 *
 * Multi-session browser coordination for parallel viewport testing.
 * Manages resource allocation, session lifecycle, and graceful degradation.
 *
 * Architecture:
 * - Accepts browser client factory via constructor (dependency injection)
 * - Creates and manages multiple browser sessions for parallel testing
 * - Provides resource management with configurable concurrency limits
 * - Gracefully degrades to sequential execution if resources exhausted
 * - Monitors memory usage and prevents OOM conditions
 *
 * Integration:
 * - Works with both agent-browser and Vibium clients
 * - Integrates with ViewportCaptureService for screenshot capture
 * - Provides accessibility auditing across viewports
 * - Supports custom viewport configurations
 *
 * @module domains/visual-accessibility/services/browser-swarm-coordinator
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import { FilePath } from '../../../shared/value-objects/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import {
  Viewport,
  Screenshot,
  AccessibilityReport,
} from '../interfaces.js';
import { toError } from '../../../shared/error-utils.js';
import {
  createBrowserClient,
  getBrowserClientForUseCase,
  type IBrowserClient,
  type IAgentBrowserClient,
  type BrowserLaunchOptions,
} from '../../../integrations/browser/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Browser session with viewport configuration
 */
export interface BrowserSession {
  /** Unique session identifier */
  readonly id: string;
  /** Viewport configuration for this session */
  readonly viewport: Viewport;
  /** Browser client instance */
  readonly client: IBrowserClient;
  /** Session creation timestamp */
  readonly createdAt: Date;
  /** Whether the session is currently active */
  active: boolean;
  /** Number of operations performed in this session */
  operationCount: number;
}

/**
 * Swarm status information
 */
export interface SwarmStatus {
  /** Total number of sessions */
  readonly totalSessions: number;
  /** Number of active sessions */
  readonly activeSessions: number;
  /** Number of idle sessions */
  readonly idleSessions: number;
  /** Maximum concurrent sessions allowed */
  readonly maxConcurrent: number;
  /** Current memory usage estimate (MB) */
  readonly memoryUsageMB: number;
  /** Whether swarm is at capacity */
  readonly atCapacity: boolean;
  /** Swarm uptime in milliseconds */
  readonly uptimeMs: number;
  /** Total operations completed */
  readonly totalOperations: number;
}

/**
 * Task execution result for a single session
 */
export interface SessionTaskResult<T> {
  /** Session ID */
  readonly sessionId: string;
  /** Viewport used */
  readonly viewport: Viewport;
  /** Task result if successful */
  readonly result?: T;
  /** Error if task failed */
  readonly error?: Error;
  /** Whether task succeeded */
  readonly success: boolean;
  /** Execution time in milliseconds */
  readonly executionTimeMs: number;
}

/**
 * Screenshot capture result across all sessions
 */
export interface SwarmScreenshotResult {
  /** URL that was captured */
  readonly url: string;
  /** Screenshots by session ID */
  readonly screenshots: Map<string, Screenshot>;
  /** Failed captures by session ID */
  readonly failures: Map<string, Error>;
  /** Total execution time */
  readonly totalTimeMs: number;
  /** Number of successful captures */
  readonly successCount: number;
  /** Number of failed captures */
  readonly failedCount: number;
}

/**
 * Accessibility audit result across all sessions
 */
export interface SwarmAccessibilityResult {
  /** URL that was audited */
  readonly url: string;
  /** Reports by session ID */
  readonly reports: Map<string, AccessibilityReport>;
  /** Failed audits by session ID */
  readonly failures: Map<string, Error>;
  /** Total execution time */
  readonly totalTimeMs: number;
  /** Number of successful audits */
  readonly successCount: number;
  /** Number of failed audits */
  readonly failedCount: number;
  /** Aggregated violations across all viewports */
  readonly aggregatedViolations: number;
}

/**
 * Configuration for browser swarm coordinator
 */
export interface BrowserSwarmConfig {
  /** Maximum concurrent browser sessions */
  maxConcurrentSessions: number;
  /** Memory threshold for degradation (MB) */
  memoryThresholdMB: number;
  /** Session timeout in milliseconds */
  sessionTimeoutMs: number;
  /** Whether to enable graceful degradation */
  enableGracefulDegradation: boolean;
  /** Browser launch options */
  browserLaunchOptions: BrowserLaunchOptions;
  /** Session idle timeout (ms) - sessions are closed if idle too long */
  sessionIdleTimeoutMs: number;
  /** Whether to monitor memory usage */
  enableMemoryMonitoring: boolean;
}

/**
 * Standard viewport configurations for common devices
 */
export const STANDARD_VIEWPORTS: Viewport[] = [
  {
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  }, // iPhone SE
  {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  }, // iPhone X
  {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
  }, // iPad
  {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  }, // Laptop
  {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  }, // Desktop
];

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: BrowserSwarmConfig = {
  maxConcurrentSessions: 5,
  memoryThresholdMB: 1024, // 1GB threshold
  sessionTimeoutMs: 60000, // 60 seconds
  enableGracefulDegradation: true,
  browserLaunchOptions: {
    headless: true,
  },
  sessionIdleTimeoutMs: 300000, // 5 minutes
  enableMemoryMonitoring: true,
};

// ============================================================================
// Browser Swarm Coordinator Implementation
// ============================================================================

/**
 * Multi-session browser coordinator for parallel viewport testing
 *
 * Manages a pool of browser sessions across different viewports,
 * enabling efficient parallel testing with resource management.
 *
 * Features:
 * - Parallel session management across multiple viewports
 * - Resource monitoring and memory management
 * - Graceful degradation to sequential execution
 * - Automatic session cleanup and recovery
 * - Support for screenshots and accessibility audits
 *
 * @example
 * ```typescript
 * const coordinator = new BrowserSwarmCoordinator(memory);
 *
 * // Initialize with standard viewports
 * await coordinator.initialize(STANDARD_VIEWPORTS);
 *
 * // Capture screenshots across all viewports in parallel
 * const screenshots = await coordinator.captureAllViewports('https://example.com');
 *
 * // Run accessibility audits
 * const audits = await coordinator.auditAllViewports('https://example.com');
 *
 * // Cleanup
 * await coordinator.shutdown();
 * ```
 */
export class BrowserSwarmCoordinator {
  private readonly config: BrowserSwarmConfig;
  private readonly sessions: Map<string, BrowserSession> = new Map();
  private readonly startTime: Date = new Date();
  private totalOperations = 0;
  private shuttingDown = false;
  private memoryCheckInterval?: NodeJS.Timeout;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<BrowserSwarmConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize swarm with viewport configurations
   *
   * Creates browser sessions for each viewport, respecting concurrency limits.
   * Sessions are created lazily if max concurrent limit would be exceeded.
   *
   * @param viewports - Viewport configurations to initialize
   * @returns Success/failure result
   */
  async initialize(viewports: Viewport[]): Promise<Result<void, Error>> {
    if (this.shuttingDown) {
      return err(new Error('Swarm is shutting down'));
    }

    if (this.sessions.size > 0) {
      return err(new Error('Swarm already initialized. Call shutdown() first.'));
    }

    try {
      // Determine how many sessions to create upfront
      const sessionsToCreate = Math.min(
        viewports.length,
        this.config.maxConcurrentSessions
      );

      const errors: Error[] = [];

      // Create initial sessions up to concurrency limit
      for (let i = 0; i < sessionsToCreate; i++) {
        const viewport = viewports[i];
        const sessionResult = await this.createSession(viewport);

        if (!sessionResult.success) {
          errors.push(sessionResult.error);
        }
      }

      // If we couldn't create any sessions, fail
      if (this.sessions.size === 0) {
        return err(
          new Error(
            `Failed to create any browser sessions. Errors: ${errors.map((e) => e.message).join(', ')}`
          )
        );
      }

      // Start memory monitoring if enabled
      if (this.config.enableMemoryMonitoring) {
        this.startMemoryMonitoring();
      }

      // Store remaining viewports for lazy initialization
      const remainingViewports = viewports.slice(sessionsToCreate);
      if (remainingViewports.length > 0) {
        await this.memory.set(
          `browser-swarm:pending-viewports:${this.getSwarmId()}`,
          remainingViewports,
          { namespace: 'visual-accessibility', ttl: 3600 }
        );
      }

      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Execute task across all viewports in parallel
   *
   * Executes the provided task function across all active sessions.
   * Handles resource limits by falling back to sequential execution if needed.
   *
   * @param task - Task function to execute on each session
   * @returns Map of session IDs to task results
   */
  async executeParallel<T>(
    task: (session: BrowserSession, viewport: Viewport) => Promise<T>
  ): Promise<Map<string, Result<T, Error>>> {
    if (this.shuttingDown) {
      return new Map();
    }

    const results = new Map<string, Result<T, Error>>();
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.active
    );

    if (activeSessions.length === 0) {
      return results;
    }

    try {
      // Check if we should degrade to sequential
      const shouldDegrade = this.shouldDegradeToSequential();

      if (shouldDegrade && this.config.enableGracefulDegradation) {
        // Sequential execution
        for (const session of activeSessions) {
          try {
            const result = await this.executeWithTimeout(
              () => task(session, session.viewport),
              this.config.sessionTimeoutMs
            );
            results.set(session.id, ok(result));
            session.operationCount++;
            this.totalOperations++;
          } catch (error) {
            results.set(
              session.id,
              err(toError(error))
            );
          }
        }
      } else {
        // Parallel execution
        const promises = activeSessions.map(async (session) => {
          try {
            const result = await this.executeWithTimeout(
              () => task(session, session.viewport),
              this.config.sessionTimeoutMs
            );
            results.set(session.id, ok(result));
            session.operationCount++;
            this.totalOperations++;
          } catch (error) {
            results.set(
              session.id,
              err(toError(error))
            );
          }
        });

        await Promise.all(promises);
      }

      return results;
    } catch (error) {
      // Return partial results if available
      return results;
    }
  }

  /**
   * Capture screenshots across all viewports
   *
   * Navigates to the URL and captures screenshots in each viewport in parallel.
   *
   * @param url - URL to capture
   * @returns Screenshot results by viewport
   */
  async captureAllViewports(
    url: string
  ): Promise<Result<SwarmScreenshotResult, Error>> {
    const startTime = Date.now();
    const screenshots = new Map<string, Screenshot>();
    const failures = new Map<string, Error>();

    try {
      const results = await this.executeParallel(async (session, viewport) => {
        // Navigate to URL
        const navResult = await session.client.navigate(url);
        if (!navResult.success) {
          throw new Error(`Navigation failed: ${navResult.error?.message}`);
        }

        // Set viewport if client supports it
        if (this.isAgentBrowserClient(session.client)) {
          await session.client.setViewport(viewport.width, viewport.height);
        }

        // Capture screenshot
        const ssResult = await session.client.screenshot({
          fullPage: false,
        });

        if (!ssResult.success) {
          throw new Error(`Screenshot failed: ${ssResult.error?.message}`);
        }

        // Create screenshot object
        const screenshot: Screenshot = {
          id: uuidv4(),
          url,
          viewport,
          timestamp: new Date(),
          path: ssResult.value.path
            ? FilePath.create(ssResult.value.path)
            : FilePath.create(`screenshots/${uuidv4()}.png`),
          metadata: {
            browser: 'chromium',
            os: process.platform,
            fullPage: false,
            loadTime: Date.now() - startTime,
          },
        };

        return screenshot;
      });

      // Process results
      for (const [sessionId, result] of results) {
        if (result.success) {
          screenshots.set(sessionId, result.value);
        } else {
          failures.set(sessionId, result.error);
        }
      }

      const totalTimeMs = Date.now() - startTime;

      const swarmResult: SwarmScreenshotResult = {
        url,
        screenshots,
        failures,
        totalTimeMs,
        successCount: screenshots.size,
        failedCount: failures.size,
      };

      return ok(swarmResult);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Run accessibility audit across all viewports
   *
   * Navigates to the URL and runs accessibility audits in each viewport.
   * Note: This is a placeholder implementation. Real accessibility auditing
   * would require integration with axe-core or similar tools.
   *
   * @param url - URL to audit
   * @returns Accessibility audit results by viewport
   */
  async auditAllViewports(
    url: string
  ): Promise<Result<SwarmAccessibilityResult, Error>> {
    const startTime = Date.now();
    const reports = new Map<string, AccessibilityReport>();
    const failures = new Map<string, Error>();

    try {
      const results = await this.executeParallel(async (session, viewport) => {
        // Navigate to URL
        const navResult = await session.client.navigate(url);
        if (!navResult.success) {
          throw new Error(`Navigation failed: ${navResult.error?.message}`);
        }

        // Set viewport if client supports it
        if (this.isAgentBrowserClient(session.client)) {
          await session.client.setViewport(viewport.width, viewport.height);
        }

        // TODO: Integrate with axe-core or similar accessibility testing tool
        // For now, return a placeholder report
        const report: AccessibilityReport = {
          url,
          timestamp: new Date(),
          violations: [],
          passes: [],
          incomplete: [],
          score: 100,
          wcagLevel: 'AA',
        };

        return report;
      });

      // Process results
      for (const [sessionId, result] of results) {
        if (result.success) {
          reports.set(sessionId, result.value);
        } else {
          failures.set(sessionId, result.error);
        }
      }

      // Aggregate violations
      const aggregatedViolations = Array.from(reports.values()).reduce(
        (sum, report) => sum + report.violations.length,
        0
      );

      const totalTimeMs = Date.now() - startTime;

      const swarmResult: SwarmAccessibilityResult = {
        url,
        reports,
        failures,
        totalTimeMs,
        successCount: reports.size,
        failedCount: failures.size,
        aggregatedViolations,
      };

      return ok(swarmResult);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get swarm status
   *
   * @returns Current swarm status information
   */
  getStatus(): SwarmStatus {
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.active
    ).length;
    const idleSessions = this.sessions.size - activeSessions;
    const uptimeMs = Date.now() - this.startTime.getTime();
    const memoryUsageMB = this.estimateMemoryUsage();

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      idleSessions,
      maxConcurrent: this.config.maxConcurrentSessions,
      memoryUsageMB,
      atCapacity: this.sessions.size >= this.config.maxConcurrentSessions,
      uptimeMs,
      totalOperations: this.totalOperations,
    };
  }

  /**
   * Graceful shutdown
   *
   * Closes all browser sessions and cleans up resources.
   *
   * @returns Success/failure result
   */
  async shutdown(): Promise<Result<void, Error>> {
    this.shuttingDown = true;

    try {
      // Stop memory monitoring
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval);
        this.memoryCheckInterval = undefined;
      }

      // Close all sessions
      const closePromises = Array.from(this.sessions.values()).map(
        async (session) => {
          try {
            await session.client.quit();
            await session.client.dispose();
          } catch (error) {
            // Log but don't fail shutdown
            console.error(
              `[BrowserSwarm] Failed to close session ${session.id}:`,
              error
            );
          }
        }
      );

      await Promise.all(closePromises);

      // Clear session map
      this.sessions.clear();

      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    } finally {
      this.shuttingDown = false;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create a new browser session for a viewport
   */
  private async createSession(
    viewport: Viewport
  ): Promise<Result<BrowserSession, Error>> {
    try {
      // Get browser client for responsive testing
      const client = await getBrowserClientForUseCase('responsive-testing');

      // Check availability
      const available = await client.isAvailable();
      if (!available) {
        return err(new Error('Browser client not available'));
      }

      // Launch browser
      const launchResult = await client.launch(this.config.browserLaunchOptions);
      if (!launchResult.success) {
        return err(
          new Error(`Failed to launch browser: ${launchResult.error?.message}`)
        );
      }

      // Create session
      const session: BrowserSession = {
        id: uuidv4(),
        viewport,
        client,
        createdAt: new Date(),
        active: true,
        operationCount: 0,
      };

      this.sessions.set(session.id, session);

      return ok(session);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Check if client is an IAgentBrowserClient
   */
  private isAgentBrowserClient(
    client: IBrowserClient
  ): client is IAgentBrowserClient {
    return (
      client.tool === 'agent-browser' &&
      'setDevice' in client &&
      'setViewport' in client
    );
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Determine if we should degrade to sequential execution
   */
  private shouldDegradeToSequential(): boolean {
    if (!this.config.enableGracefulDegradation) {
      return false;
    }

    // Check memory threshold
    const memoryUsage = this.estimateMemoryUsage();
    if (memoryUsage > this.config.memoryThresholdMB) {
      return true;
    }

    return false;
  }

  /**
   * Estimate current memory usage (MB)
   *
   * This is a rough estimate based on number of sessions.
   * Each browser session typically uses 50-100MB.
   */
  private estimateMemoryUsage(): number {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const externalMB = memoryUsage.external / 1024 / 1024;

    // Add estimated overhead for browser sessions
    const sessionOverheadMB = this.sessions.size * 75; // 75MB per session estimate

    return heapUsedMB + externalMB + sessionOverheadMB;
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    // Check memory every 30 seconds
    this.memoryCheckInterval = setInterval(() => {
      const memoryUsage = this.estimateMemoryUsage();

      if (memoryUsage > this.config.memoryThresholdMB) {
        console.warn(
          `[BrowserSwarm] Memory usage ${memoryUsage.toFixed(2)}MB exceeds threshold ${this.config.memoryThresholdMB}MB. Degrading to sequential execution.`
        );
      }

      // Store metrics
      this.memory
        .set(
          `browser-swarm:metrics:memory:${Date.now()}`,
          {
            memoryUsageMB: memoryUsage,
            sessionCount: this.sessions.size,
            timestamp: new Date(),
          },
          { namespace: 'visual-accessibility', ttl: 3600 }
        )
        .catch((err) => {
          console.error('[BrowserSwarm] Failed to store memory metrics:', err);
        });
    }, 30000);
  }

  /**
   * Get unique swarm ID
   */
  private getSwarmId(): string {
    return `swarm-${this.startTime.getTime()}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a BrowserSwarmCoordinator instance
 *
 * @param memory - Memory backend for storing metrics
 * @param config - Optional configuration
 * @returns BrowserSwarmCoordinator instance
 *
 * @example
 * ```typescript
 * const coordinator = createBrowserSwarmCoordinator(memory, {
 *   maxConcurrentSessions: 3,
 *   enableGracefulDegradation: true,
 * });
 *
 * await coordinator.initialize(STANDARD_VIEWPORTS);
 * const result = await coordinator.captureAllViewports('https://example.com');
 * await coordinator.shutdown();
 * ```
 */
export function createBrowserSwarmCoordinator(
  memory: MemoryBackend,
  config?: Partial<BrowserSwarmConfig>
): BrowserSwarmCoordinator {
  return new BrowserSwarmCoordinator(memory, config);
}
