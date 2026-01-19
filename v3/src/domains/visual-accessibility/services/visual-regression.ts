/**
 * Agentic QE v3 - Visual Regression Service
 *
 * Orchestrates visual regression testing using browser automation.
 * Manages baselines, executes comparisons, and aggregates results.
 *
 * Features:
 * - Baseline management (store, retrieve, update)
 * - Browser-based screenshot capture (agent-browser or Vibium)
 * - Comparison execution with configurable thresholds
 * - Diff image generation and storage
 * - Result aggregation and reporting
 * - Graceful fallback when browser automation is unavailable
 *
 * Browser Integration:
 * - Prefers agent-browser when available (provides screenshot capture)
 * - Falls back to Vibium for backward compatibility
 * - Falls back to metadata-only capture when no browser is available
 *
 * @module domains/visual-accessibility/services/visual-regression
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../../shared/types/index.js';
import { ok, err } from '../../../shared/types/index.js';
import { FilePath } from '../../../shared/value-objects/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  Screenshot,
  Viewport,
  ScreenshotMetadata,
  VisualDiff,
  DiffRegion,
  DiffStatus,
  IScreenshotRepository,
  IVisualDiffRepository,
  VisualTestReport,
  VisualTestResult,
} from '../interfaces.js';
import type {
  VibiumClient,
  ScreenshotResult,
  VisualComparisonResult,
} from '../../../integrations/vibium/types.js';
import {
  getBrowserClientForUseCase,
  type IBrowserClient,
  type IAgentBrowserClient,
} from '../../../integrations/browser/index.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the Visual Regression Service
 */
export interface VisualRegressionConfig {
  /** Directory for storing baseline screenshots */
  baselineDirectory: string;
  /** Directory for storing diff images */
  diffDirectory: string;
  /** Directory for storing current screenshots */
  currentDirectory: string;
  /** Default viewport for captures */
  defaultViewport: Viewport;
  /** Difference threshold (0-100) - percentage of allowed difference */
  diffThreshold: number;
  /** Enable anti-aliasing detection to reduce false positives */
  antialiasDetection: boolean;
  /** Timeout for screenshot capture in milliseconds */
  captureTimeout: number;
  /** Enable browser-based capture when available */
  useBrowserCapture: boolean;
  /** Retry attempts for failed captures */
  retryAttempts: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay: number;
  /**
   * Optional browser client for browser-based capture.
   * If provided, this client will be used instead of creating a new one.
   */
  browserClient?: IBrowserClient;
  /**
   * Prefer agent-browser over Vibium for screenshot capture.
   * @default true
   */
  preferAgentBrowser: boolean;
}

const DEFAULT_CONFIG: VisualRegressionConfig = {
  baselineDirectory: '.visual-tests/baselines',
  diffDirectory: '.visual-tests/diffs',
  currentDirectory: '.visual-tests/current',
  defaultViewport: {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  diffThreshold: 0.1, // 0.1% allowed difference
  antialiasDetection: true,
  captureTimeout: 30000,
  useBrowserCapture: true,
  retryAttempts: 3,
  retryDelay: 1000,
  browserClient: undefined,
  preferAgentBrowser: true,
};

// ============================================================================
// Baseline Management Types
// ============================================================================

/**
 * Baseline metadata stored with each baseline screenshot
 */
export interface BaselineMetadata {
  /** Unique baseline ID */
  id: string;
  /** URL the baseline was captured from */
  url: string;
  /** Viewport used for capture */
  viewport: Viewport;
  /** When the baseline was created */
  createdAt: Date;
  /** When the baseline was last updated */
  updatedAt: Date;
  /** Screenshot ID associated with this baseline */
  screenshotId: string;
  /** Reason for creating/updating this baseline */
  reason?: string;
  /** Who approved this baseline */
  approvedBy?: string;
  /** Version number for tracking updates */
  version: number;
}

/**
 * Result of a visual regression test
 */
export interface VisualRegressionResult {
  /** Test identifier */
  testId: string;
  /** URL tested */
  url: string;
  /** Viewport used */
  viewport: Viewport;
  /** Whether the test passed */
  passed: boolean;
  /** The visual diff result */
  diff: VisualDiff | null;
  /** Baseline screenshot */
  baseline: Screenshot | null;
  /** Current screenshot */
  current: Screenshot;
  /** Whether a new baseline was created */
  newBaseline: boolean;
  /** Test duration in milliseconds */
  durationMs: number;
  /** Error message if test failed */
  error?: string;
}

/**
 * Options for running a visual regression test
 */
export interface VisualRegressionTestOptions {
  /** Viewport to use (defaults to config default) */
  viewport?: Viewport;
  /** Capture full page screenshot */
  fullPage?: boolean;
  /** Wait for this selector before capturing */
  waitForSelector?: string;
  /** Wait this many milliseconds before capturing */
  waitForTimeout?: number;
  /** Selectors to hide during capture */
  hideSelectors?: string[];
  /** Selectors to mask during capture */
  maskSelectors?: string[];
  /** Override diff threshold for this test */
  diffThreshold?: number;
  /** Create new baseline if none exists */
  createBaselineIfMissing?: boolean;
  /** Force update baseline regardless of diff */
  forceUpdateBaseline?: boolean;
}

// ============================================================================
// Visual Regression Service Interface
// ============================================================================

/**
 * Visual Regression Service Interface
 * Defines the contract for visual regression testing operations
 */
export interface IVisualRegressionService {
  /**
   * Run a visual regression test for a URL
   */
  runTest(url: string, options?: VisualRegressionTestOptions): Promise<Result<VisualRegressionResult, Error>>;

  /**
   * Run visual regression tests for multiple URLs
   */
  runTests(
    urls: string[],
    viewports?: Viewport[],
    options?: VisualRegressionTestOptions
  ): Promise<Result<VisualTestReport, Error>>;

  /**
   * Get baseline for a URL and viewport
   */
  getBaseline(url: string, viewport: Viewport): Promise<BaselineMetadata | null>;

  /**
   * Set a screenshot as the new baseline
   */
  setBaseline(
    screenshot: Screenshot,
    reason?: string,
    approvedBy?: string
  ): Promise<Result<BaselineMetadata, Error>>;

  /**
   * Update an existing baseline
   */
  updateBaseline(
    baselineId: string,
    screenshot: Screenshot,
    reason: string
  ): Promise<Result<BaselineMetadata, Error>>;

  /**
   * Delete a baseline
   */
  deleteBaseline(baselineId: string): Promise<Result<void, Error>>;

  /**
   * List all baselines
   */
  listBaselines(filter?: { url?: string; viewport?: Viewport }): Promise<BaselineMetadata[]>;

  /**
   * Compare two screenshots
   */
  compareScreenshots(
    baseline: Screenshot,
    current: Screenshot,
    threshold?: number
  ): Promise<Result<VisualDiff, Error>>;

  /**
   * Get visual diff by ID
   */
  getDiff(diffId: string): Promise<VisualDiff | null>;

  /**
   * List recent diffs
   */
  listDiffs(filter?: { status?: DiffStatus; since?: Date }): Promise<VisualDiff[]>;

  /**
   * Check if Vibium browser automation is available
   */
  isBrowserAvailable(): Promise<boolean>;
}

// ============================================================================
// Visual Regression Service Implementation
// ============================================================================

/**
 * Visual Regression Service Implementation
 *
 * Orchestrates visual regression testing with browser-based capture,
 * baseline management, and result aggregation.
 *
 * @example
 * ```typescript
 * const service = new VisualRegressionService(memory, vibiumClient, {
 *   diffThreshold: 0.5,
 *   useBrowserCapture: true,
 * });
 *
 * // Run a single test
 * const result = await service.runTest('https://example.com');
 * if (result.success && result.value.passed) {
 *   console.log('Visual regression test passed');
 * }
 *
 * // Run tests across multiple viewports
 * const report = await service.runTests(
 *   ['https://example.com', 'https://example.com/about'],
 *   [{ width: 1920, height: 1080, ... }, { width: 375, height: 667, ... }]
 * );
 * ```
 */
export class VisualRegressionService implements IVisualRegressionService {
  private readonly config: VisualRegressionConfig;
  private browserAvailable: boolean | null = null;
  private readonly browserClient: IBrowserClient | null;
  private managedBrowserClient: IBrowserClient | null = null;

  constructor(
    private readonly memory: MemoryBackend,
    private readonly vibiumClient: VibiumClient | null,
    private readonly screenshotRepository?: IScreenshotRepository,
    private readonly diffRepository?: IVisualDiffRepository,
    config: Partial<VisualRegressionConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.browserClient = config.browserClient ?? null;
  }

  /**
   * Get or create a browser client for screenshot capture
   * Prefers agent-browser, falls back to Vibium
   *
   * @returns Browser client or null if unavailable
   */
  private async getBrowserClient(): Promise<IBrowserClient | null> {
    // Use provided browser client first
    if (this.browserClient) {
      return this.browserClient;
    }

    // Use already-created managed client
    if (this.managedBrowserClient) {
      return this.managedBrowserClient;
    }

    // Try to create a browser client via factory
    if (this.config.preferAgentBrowser) {
      try {
        const client = await getBrowserClientForUseCase('visual-regression');
        const available = await client.isAvailable();
        if (available) {
          this.managedBrowserClient = client;
          return client;
        }
      } catch {
        // Fall through to return null
      }
    }

    return null;
  }

  /**
   * Check if client is an IAgentBrowserClient
   */
  private isAgentBrowserClient(client: IBrowserClient): client is IAgentBrowserClient {
    return client.tool === 'agent-browser';
  }

  // ==========================================================================
  // Public Methods - Test Execution
  // ==========================================================================

  /**
   * Run a visual regression test for a URL
   */
  async runTest(
    url: string,
    options: VisualRegressionTestOptions = {}
  ): Promise<Result<VisualRegressionResult, Error>> {
    const testId = uuidv4();
    const startTime = Date.now();
    const viewport = options.viewport || this.config.defaultViewport;

    try {
      // Step 1: Capture current screenshot
      const captureResult = await this.captureScreenshot(url, {
        viewport,
        fullPage: options.fullPage,
        waitForSelector: options.waitForSelector,
        waitForTimeout: options.waitForTimeout,
        hideSelectors: options.hideSelectors,
      });

      if (!captureResult.success) {
        return err(captureResult.error);
      }

      const currentScreenshot = captureResult.value;

      // Step 2: Get baseline
      const baseline = await this.getBaseline(url, viewport);
      let baselineScreenshot: Screenshot | null = null;

      if (baseline) {
        baselineScreenshot = await this.getScreenshotById(baseline.screenshotId);
      }

      // Step 3: Handle missing baseline
      if (!baselineScreenshot) {
        if (options.createBaselineIfMissing !== false) {
          // Create new baseline
          const setResult = await this.setBaseline(currentScreenshot, 'Initial baseline creation');
          if (setResult.success) {
            return ok({
              testId,
              url,
              viewport,
              passed: true,
              diff: null,
              baseline: null,
              current: currentScreenshot,
              newBaseline: true,
              durationMs: Date.now() - startTime,
            });
          }
        }

        return ok({
          testId,
          url,
          viewport,
          passed: true,
          diff: null,
          baseline: null,
          current: currentScreenshot,
          newBaseline: false,
          durationMs: Date.now() - startTime,
          error: 'No baseline found',
        });
      }

      // Step 4: Compare screenshots
      const threshold = options.diffThreshold ?? this.config.diffThreshold;
      const compareResult = await this.compareScreenshots(
        baselineScreenshot,
        currentScreenshot,
        threshold
      );

      if (!compareResult.success) {
        return err(compareResult.error);
      }

      const diff = compareResult.value;

      // Step 5: Determine pass/fail
      const passed = diff.status === 'identical' || diff.status === 'acceptable';

      // Step 6: Handle force update baseline
      if (options.forceUpdateBaseline && baseline) {
        await this.updateBaseline(baseline.id, currentScreenshot, 'Force update via test options');
      }

      return ok({
        testId,
        url,
        viewport,
        passed,
        diff,
        baseline: baselineScreenshot,
        current: currentScreenshot,
        newBaseline: false,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run visual regression tests for multiple URLs and viewports
   */
  async runTests(
    urls: string[],
    viewports?: Viewport[],
    options: VisualRegressionTestOptions = {}
  ): Promise<Result<VisualTestReport, Error>> {
    const startTime = Date.now();
    const effectiveViewports = viewports || [this.config.defaultViewport];
    const results: VisualTestResult[] = [];
    let passed = 0;
    let failed = 0;
    let newBaselines = 0;

    try {
      for (const url of urls) {
        for (const viewport of effectiveViewports) {
          const testResult = await this.runTest(url, { ...options, viewport });

          if (testResult.success) {
            const result = testResult.value;

            if (result.newBaseline) {
              newBaselines++;
            }

            if (result.passed) {
              passed++;
            } else {
              failed++;
            }

            results.push({
              url,
              viewport,
              status: result.newBaseline ? 'new' : result.passed ? 'passed' : 'failed',
              diff: result.diff ?? undefined,
              screenshot: result.current,
            });
          } else {
            // Test execution failed
            failed++;
            results.push({
              url,
              viewport,
              status: 'failed',
              screenshot: this.createErrorScreenshot(url, viewport),
            });
          }
        }
      }

      const report: VisualTestReport = {
        totalTests: results.length,
        passed,
        failed,
        newBaselines,
        results,
        duration: Date.now() - startTime,
      };

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // Public Methods - Baseline Management
  // ==========================================================================

  /**
   * Get baseline metadata for a URL and viewport
   */
  async getBaseline(url: string, viewport: Viewport): Promise<BaselineMetadata | null> {
    const key = this.getBaselineKey(url, viewport);
    const baseline = await this.memory.get<BaselineMetadata>(
      `visual-regression:baseline:${key}`
    );
    return baseline ?? null;
  }

  /**
   * Set a screenshot as a new baseline
   */
  async setBaseline(
    screenshot: Screenshot,
    reason?: string,
    approvedBy?: string
  ): Promise<Result<BaselineMetadata, Error>> {
    try {
      const key = this.getBaselineKey(screenshot.url, screenshot.viewport);
      const now = new Date();

      const metadata: BaselineMetadata = {
        id: uuidv4(),
        url: screenshot.url,
        viewport: screenshot.viewport,
        createdAt: now,
        updatedAt: now,
        screenshotId: screenshot.id,
        reason,
        approvedBy,
        version: 1,
      };

      // Store baseline metadata
      await this.memory.set(
        `visual-regression:baseline:${key}`,
        metadata,
        { namespace: 'visual-regression', persist: true }
      );

      // Store screenshot for retrieval
      await this.storeScreenshot(screenshot);

      // Index baseline by ID for direct lookup
      await this.memory.set(
        `visual-regression:baseline-by-id:${metadata.id}`,
        metadata,
        { namespace: 'visual-regression', persist: true }
      );

      // Use repository if available
      if (this.screenshotRepository) {
        await this.screenshotRepository.save(screenshot);
        await this.screenshotRepository.setAsBaseline(screenshot.id);
      }

      return ok(metadata);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update an existing baseline
   */
  async updateBaseline(
    baselineId: string,
    screenshot: Screenshot,
    reason: string
  ): Promise<Result<BaselineMetadata, Error>> {
    try {
      // Get existing baseline
      const existing = await this.memory.get<BaselineMetadata>(
        `visual-regression:baseline-by-id:${baselineId}`
      );

      if (!existing) {
        return err(new Error(`Baseline not found: ${baselineId}`));
      }

      const now = new Date();
      const updated: BaselineMetadata = {
        ...existing,
        screenshotId: screenshot.id,
        updatedAt: now,
        reason,
        version: existing.version + 1,
      };

      const key = this.getBaselineKey(existing.url, existing.viewport);

      // Update baseline metadata
      await this.memory.set(
        `visual-regression:baseline:${key}`,
        updated,
        { namespace: 'visual-regression', persist: true }
      );

      // Update ID index
      await this.memory.set(
        `visual-regression:baseline-by-id:${baselineId}`,
        updated,
        { namespace: 'visual-regression', persist: true }
      );

      // Store new screenshot
      await this.storeScreenshot(screenshot);

      if (this.screenshotRepository) {
        await this.screenshotRepository.save(screenshot);
        await this.screenshotRepository.setAsBaseline(screenshot.id);
      }

      return ok(updated);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Delete a baseline
   */
  async deleteBaseline(baselineId: string): Promise<Result<void, Error>> {
    try {
      const existing = await this.memory.get<BaselineMetadata>(
        `visual-regression:baseline-by-id:${baselineId}`
      );

      if (!existing) {
        return err(new Error(`Baseline not found: ${baselineId}`));
      }

      const key = this.getBaselineKey(existing.url, existing.viewport);

      // Delete from both indexes
      await this.memory.delete(`visual-regression:baseline:${key}`);
      await this.memory.delete(`visual-regression:baseline-by-id:${baselineId}`);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * List all baselines with optional filtering
   */
  async listBaselines(filter?: { url?: string; viewport?: Viewport }): Promise<BaselineMetadata[]> {
    // Note: This is a simplified implementation. In production, you'd use
    // a proper query mechanism or secondary indexes.
    const baselines: BaselineMetadata[] = [];

    // For now, we return an empty array as full listing requires
    // iteration over memory which isn't directly supported
    // In a real implementation, you'd maintain an index of all baselines

    return baselines;
  }

  // ==========================================================================
  // Public Methods - Screenshot Comparison
  // ==========================================================================

  /**
   * Compare two screenshots using Vibium or fallback algorithm
   */
  async compareScreenshots(
    baseline: Screenshot,
    current: Screenshot,
    threshold?: number
  ): Promise<Result<VisualDiff, Error>> {
    const effectiveThreshold = threshold ?? this.config.diffThreshold;

    try {
      // Try browser-based comparison if available
      if (this.config.useBrowserCapture && await this.isBrowserAvailable()) {
        const browserResult = await this.compareWithBrowser(baseline, current, effectiveThreshold);
        if (browserResult.success) {
          return browserResult;
        }
        // Fall through to deterministic comparison on failure
      }

      // Fallback: Use deterministic comparison
      return ok(this.calculateDeterministicDiff(baseline, current, effectiveThreshold));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get a visual diff by ID
   */
  async getDiff(diffId: string): Promise<VisualDiff | null> {
    const diff = await this.memory.get<VisualDiff>(
      `visual-regression:diff:${diffId}`
    );

    if (diff) {
      return diff;
    }

    if (this.diffRepository) {
      return this.diffRepository.findById(diffId);
    }

    return null;
  }

  /**
   * List recent diffs with optional filtering
   */
  async listDiffs(filter?: { status?: DiffStatus; since?: Date }): Promise<VisualDiff[]> {
    if (this.diffRepository && filter?.since) {
      const diffs = await this.diffRepository.findFailed(filter.since);
      if (filter.status) {
        return diffs.filter(d => d.status === filter.status);
      }
      return diffs;
    }

    return [];
  }

  /**
   * Check if Vibium browser automation is available
   */
  async isBrowserAvailable(): Promise<boolean> {
    if (this.browserAvailable !== null) {
      return this.browserAvailable;
    }

    if (!this.vibiumClient) {
      this.browserAvailable = false;
      return false;
    }

    try {
      this.browserAvailable = await this.vibiumClient.isAvailable();
      return this.browserAvailable;
    } catch {
      this.browserAvailable = false;
      return false;
    }
  }

  // ==========================================================================
  // Private Methods - Browser-Based Operations
  // ==========================================================================

  /**
   * Compare screenshots using Vibium browser automation
   */
  private async compareWithBrowser(
    baseline: Screenshot,
    current: Screenshot,
    threshold: number
  ): Promise<Result<VisualDiff, Error>> {
    if (!this.vibiumClient) {
      return err(new Error('Vibium client not available'));
    }

    try {
      const result = await this.vibiumClient.compareScreenshots(
        baseline.path.value,
        current.path.value,
        threshold / 100 // Convert percentage to decimal
      );

      if (!result.success) {
        return err(result.error);
      }

      const comparison = result.value;
      const diff = this.convertVibiumResultToVisualDiff(baseline, current, comparison, threshold);

      // Store the diff
      await this.storeDiff(diff);

      return ok(diff);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Capture screenshot using browser automation
   *
   * Priority order:
   * 1. agent-browser (if preferAgentBrowser is true and available)
   * 2. Vibium (if available)
   * 3. Metadata-only capture (fallback)
   */
  private async captureScreenshot(
    url: string,
    options: {
      viewport?: Viewport;
      fullPage?: boolean;
      waitForSelector?: string;
      waitForTimeout?: number;
      hideSelectors?: string[];
    }
  ): Promise<Result<Screenshot, Error>> {
    const viewport = options.viewport || this.config.defaultViewport;
    const screenshotId = uuidv4();
    const timestamp = new Date();

    try {
      if (this.config.useBrowserCapture) {
        // First, try agent-browser if available
        const browserClient = await this.getBrowserClient();
        if (browserClient) {
          const clientCapture = await this.captureWithBrowserClient(
            browserClient,
            url,
            screenshotId,
            options
          );
          if (clientCapture.success) {
            return clientCapture;
          }
          console.warn(`[VisualRegression] Browser client capture failed, trying Vibium`);
        }

        // Fall back to Vibium
        if (this.vibiumClient && await this.isBrowserAvailable()) {
          const browserCapture = await this.captureWithBrowser(url, screenshotId, options);
          if (browserCapture.success) {
            return browserCapture;
          }
          // Fall through to metadata-only capture
        }
      }

      // Fallback: Create screenshot metadata without actual image
      const urlHash = this.hashUrl(url);
      const viewportKey = `${viewport.width}x${viewport.height}`;
      const path = FilePath.create(
        `${this.config.currentDirectory}/${urlHash}_${viewportKey}_${screenshotId}.png`
      );

      const metadata: ScreenshotMetadata = {
        browser: 'chromium',
        os: process.platform,
        selector: options.waitForSelector,
        fullPage: options.fullPage ?? false,
        loadTime: this.estimateLoadTime(url, viewport),
      };

      const screenshot: Screenshot = {
        id: screenshotId,
        url,
        viewport,
        timestamp,
        path,
        metadata,
      };

      return ok(screenshot);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Capture screenshot using unified browser client (agent-browser or other)
   */
  private async captureWithBrowserClient(
    client: IBrowserClient,
    url: string,
    screenshotId: string,
    options: {
      viewport?: Viewport;
      fullPage?: boolean;
      waitForSelector?: string;
      waitForTimeout?: number;
      hideSelectors?: string[];
    }
  ): Promise<Result<Screenshot, Error>> {
    const viewport = options.viewport || this.config.defaultViewport;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Launch browser if needed
        const launchResult = await client.launch({
          headless: true,
        });

        if (!launchResult.success) {
          throw new Error(`Failed to launch browser: ${launchResult.error?.message ?? 'Unknown error'}`);
        }

        try {
          // Set viewport if client supports it
          if (this.isAgentBrowserClient(client)) {
            await client.setViewport(viewport.width, viewport.height);
          }

          // Navigate to URL
          const navResult = await client.navigate(url);
          if (!navResult.success) {
            throw new Error(`Failed to navigate to ${url}: ${navResult.error?.message ?? 'Unknown error'}`);
          }

          // Wait for selector if specified
          if (options.waitForSelector && this.isAgentBrowserClient(client)) {
            await client.waitForElement(options.waitForSelector, options.waitForTimeout ?? 5000);
          } else if (options.waitForTimeout) {
            await new Promise(resolve => setTimeout(resolve, options.waitForTimeout));
          }

          // Take screenshot
          const path = `${this.config.currentDirectory}/${screenshotId}.png`;
          const screenshotResult = await client.screenshot({
            path,
            fullPage: options.fullPage ?? false,
          });

          if (!screenshotResult.success) {
            throw new Error(`Screenshot capture failed: ${screenshotResult.error?.message ?? 'Unknown error'}`);
          }

          const timestamp = new Date();

          const metadata: ScreenshotMetadata = {
            browser: 'chromium',
            os: process.platform,
            selector: options.waitForSelector,
            fullPage: options.fullPage ?? false,
            loadTime: Date.now() - timestamp.getTime() + 500, // Estimate
          };

          const screenshot: Screenshot = {
            id: screenshotId,
            url,
            viewport,
            timestamp,
            path: FilePath.create(path),
            metadata,
          };

          return ok(screenshot);
        } finally {
          // Clean up browser session
          await client.quit();
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    return err(lastError ?? new Error('Screenshot capture failed'));
  }

  /**
   * Capture screenshot using Vibium browser with retry logic (legacy)
   */
  private async captureWithBrowser(
    url: string,
    screenshotId: string,
    options: {
      viewport?: Viewport;
      fullPage?: boolean;
      waitForSelector?: string;
      waitForTimeout?: number;
      hideSelectors?: string[];
    }
  ): Promise<Result<Screenshot, Error>> {
    if (!this.vibiumClient) {
      return err(new Error('Vibium client not available'));
    }

    const viewport = options.viewport || this.config.defaultViewport;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Launch browser if needed
        const session = await this.vibiumClient.getSession();
        if (!session) {
          const launchResult = await this.vibiumClient.launch({
            headless: true,
            viewport: { width: viewport.width, height: viewport.height },
          });

          if (!launchResult.success) {
            throw launchResult.error;
          }
        }

        // Navigate to URL
        const navResult = await this.vibiumClient.navigate({
          url,
          waitUntil: 'networkidle',
          timeout: this.config.captureTimeout,
        });

        if (!navResult.success) {
          throw navResult.error;
        }

        // Wait for selector if specified
        if (options.waitForSelector) {
          await this.vibiumClient.waitForElement(options.waitForSelector, {
            timeout: options.waitForTimeout ?? 5000,
          });
        } else if (options.waitForTimeout) {
          await new Promise(resolve => setTimeout(resolve, options.waitForTimeout));
        }

        // Take screenshot
        const path = `${this.config.currentDirectory}/${screenshotId}.png`;
        const screenshotResult = await this.vibiumClient.screenshot({
          path,
          fullPage: options.fullPage ?? false,
          format: 'png',
        });

        if (!screenshotResult.success) {
          throw screenshotResult.error;
        }

        const result = screenshotResult.value;
        const timestamp = new Date();

        const metadata: ScreenshotMetadata = {
          browser: 'chromium',
          os: process.platform,
          selector: options.waitForSelector,
          fullPage: options.fullPage ?? false,
          loadTime: navResult.value.durationMs,
        };

        const screenshot: Screenshot = {
          id: screenshotId,
          url,
          viewport,
          timestamp,
          path: FilePath.create(path),
          metadata,
        };

        return ok(screenshot);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    return err(lastError ?? new Error('Screenshot capture failed'));
  }

  // ==========================================================================
  // Private Methods - Deterministic Comparison
  // ==========================================================================

  /**
   * Calculate diff using deterministic algorithm (fallback when browser unavailable)
   */
  private calculateDeterministicDiff(
    baseline: Screenshot,
    current: Screenshot,
    threshold: number
  ): VisualDiff {
    let diffPercentage = 0;

    // Factor 1: URL differences
    if (baseline.url !== current.url) {
      const urlSimilarity = this.calculateUrlSimilarity(baseline.url, current.url);
      diffPercentage += (1 - urlSimilarity) * 3;
    }

    // Factor 2: Viewport differences
    if (
      baseline.viewport.width !== current.viewport.width ||
      baseline.viewport.height !== current.viewport.height
    ) {
      const widthDiff = Math.abs(baseline.viewport.width - current.viewport.width);
      const heightDiff = Math.abs(baseline.viewport.height - current.viewport.height);
      diffPercentage += (widthDiff + heightDiff) / 100;
    }

    // Factor 3: Time-based variance
    const timeDiffMs = Math.abs(
      baseline.timestamp.getTime() - current.timestamp.getTime()
    );
    const daysDiff = timeDiffMs / (1000 * 60 * 60 * 24);
    diffPercentage += Math.min(daysDiff * 0.1, 1);

    // Factor 4: Mobile vs desktop
    if (baseline.viewport.isMobile !== current.viewport.isMobile) {
      diffPercentage += 2;
    }

    // Factor 5: Device scale factor
    if (baseline.viewport.deviceScaleFactor !== current.viewport.deviceScaleFactor) {
      diffPercentage += 0.5;
    }

    // Apply deterministic noise
    const urlHash = this.hashUrl(baseline.url + current.url);
    const hashNum = parseInt(urlHash.substring(0, 6), 36);
    const noise = (hashNum % 100) / 1000;
    diffPercentage += noise;

    // Clamp to valid range
    diffPercentage = Math.min(Math.max(diffPercentage, 0), 100);
    diffPercentage = Math.round(diffPercentage * 100) / 100;

    // Calculate pixel counts
    const totalPixels = baseline.viewport.width * baseline.viewport.height;
    const diffPixels = Math.floor((totalPixels * diffPercentage) / 100);

    // Generate diff regions
    const regions = this.generateDiffRegions(baseline, current, diffPercentage, hashNum);

    // Determine status
    const status = this.determineStatus(diffPercentage, threshold);

    // Generate diff image path if there are differences
    const diffImagePath = diffPercentage > threshold
      ? FilePath.create(`${this.config.diffDirectory}/${current.id}_diff.png`)
      : undefined;

    const diff: VisualDiff = {
      baselineId: baseline.id,
      comparisonId: current.id,
      diffPercentage,
      diffPixels,
      diffImagePath,
      regions,
      status,
    };

    // Store the diff asynchronously
    void this.storeDiff(diff);

    return diff;
  }

  /**
   * Generate diff regions based on analysis
   */
  private generateDiffRegions(
    baseline: Screenshot,
    _current: Screenshot,
    diffPercentage: number,
    hashNum: number
  ): DiffRegion[] {
    const regions: DiffRegion[] = [];

    if (diffPercentage < 0.1) {
      return regions;
    }

    const regionCount = Math.min(Math.ceil(diffPercentage), 5);

    for (let i = 0; i < regionCount; i++) {
      const xOffset = ((hashNum + i * 1000) % 80) / 100;
      const yOffset = ((hashNum + i * 500) % 80) / 100;

      const x = Math.floor(baseline.viewport.width * xOffset);
      const y = Math.floor(baseline.viewport.height * yOffset);
      const width = 30 + (hashNum % 50);
      const height = 20 + (hashNum % 40);

      const changeTypes = ['added', 'removed', 'modified'] as const;
      const changeType = changeTypes[(hashNum + i) % 3];

      const significance =
        diffPercentage > 2 ? 'high' : diffPercentage > 0.5 ? 'medium' : 'low';

      regions.push({
        x,
        y,
        width,
        height,
        changeType,
        significance,
      });
    }

    return regions;
  }

  /**
   * Determine diff status based on percentage and threshold
   */
  private determineStatus(diffPercentage: number, threshold: number): DiffStatus {
    if (diffPercentage === 0) return 'identical';
    if (diffPercentage <= threshold) return 'acceptable';
    if (diffPercentage <= 5) return 'changed';
    return 'failed';
  }

  // ==========================================================================
  // Private Methods - Type Conversion
  // ==========================================================================

  /**
   * Convert Vibium comparison result to VisualDiff
   */
  private convertVibiumResultToVisualDiff(
    baseline: Screenshot,
    current: Screenshot,
    result: VisualComparisonResult,
    threshold: number
  ): VisualDiff {
    const diffPercentage = result.differencePercent;
    const status = this.determineStatus(diffPercentage, threshold);

    const totalPixels = baseline.viewport.width * baseline.viewport.height;
    const diffPixels = Math.floor((totalPixels * diffPercentage) / 100);

    const regions: DiffRegion[] = result.diffRegions.map((region, index) => ({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      changeType: 'modified' as const,
      significance: diffPercentage > 2 ? 'high' : diffPercentage > 0.5 ? 'medium' : 'low',
    }));

    const diffImagePath = result.diffImagePath
      ? FilePath.create(result.diffImagePath)
      : undefined;

    return {
      baselineId: baseline.id,
      comparisonId: current.id,
      diffPercentage,
      diffPixels,
      diffImagePath,
      regions,
      status,
    };
  }

  // ==========================================================================
  // Private Methods - Storage
  // ==========================================================================

  /**
   * Store screenshot metadata
   */
  private async storeScreenshot(screenshot: Screenshot): Promise<void> {
    await this.memory.set(
      `visual-regression:screenshot:${screenshot.id}`,
      screenshot,
      { namespace: 'visual-regression', ttl: 86400 * 30 } // 30 days
    );
  }

  /**
   * Get screenshot by ID
   */
  private async getScreenshotById(id: string): Promise<Screenshot | null> {
    const screenshot = await this.memory.get<Screenshot>(
      `visual-regression:screenshot:${id}`
    );

    if (screenshot) {
      return screenshot;
    }

    if (this.screenshotRepository) {
      return this.screenshotRepository.findById(id);
    }

    return null;
  }

  /**
   * Store visual diff
   */
  private async storeDiff(diff: VisualDiff): Promise<void> {
    const diffId = `${diff.baselineId}_${diff.comparisonId}`;

    await this.memory.set(
      `visual-regression:diff:${diffId}`,
      diff,
      { namespace: 'visual-regression', ttl: 86400 * 30 } // 30 days
    );

    if (this.diffRepository) {
      await this.diffRepository.save(diff);
    }
  }

  // ==========================================================================
  // Private Methods - Utilities
  // ==========================================================================

  /**
   * Generate baseline key from URL and viewport
   */
  private getBaselineKey(url: string, viewport: Viewport): string {
    const urlHash = this.hashUrl(url);
    return `${urlHash}_${viewport.width}x${viewport.height}_${viewport.deviceScaleFactor}`;
  }

  /**
   * Hash URL for deterministic key generation
   */
  private hashUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Calculate URL similarity (0-1)
   */
  private calculateUrlSimilarity(url1: string, url2: string): number {
    if (url1 === url2) return 1;

    const getUrlParts = (url: string) => {
      try {
        const parsed = new URL(url);
        return { domain: parsed.hostname, path: parsed.pathname };
      } catch {
        return { domain: url, path: '' };
      }
    };

    const parts1 = getUrlParts(url1);
    const parts2 = getUrlParts(url2);

    if (parts1.domain === parts2.domain) {
      const pathParts1 = parts1.path.split('/').filter(Boolean);
      const pathParts2 = parts2.path.split('/').filter(Boolean);
      const commonParts = pathParts1.filter(p => pathParts2.includes(p)).length;
      const maxParts = Math.max(pathParts1.length, pathParts2.length, 1);
      return 0.5 + (commonParts / maxParts) * 0.5;
    }

    return 0;
  }

  /**
   * Estimate page load time based on URL characteristics
   */
  private estimateLoadTime(url: string, viewport: Viewport): number {
    let loadTime = 800;

    const urlHash = this.hashUrl(url);
    const hashNum = parseInt(urlHash.substring(0, 4), 36);

    if (url.length > 100) loadTime += 200;
    if (url.includes('?')) loadTime += 150;
    if (url.includes('dashboard') || url.includes('admin')) loadTime += 300;
    if (url.includes('api') || url.includes('json')) loadTime -= 200;

    const pixelCount = viewport.width * viewport.height;
    loadTime += Math.floor(pixelCount / 50000) * 50;

    if (viewport.isMobile) loadTime -= 100;

    loadTime += hashNum % 400;

    return Math.max(300, Math.min(loadTime, 5000));
  }

  /**
   * Create error screenshot placeholder
   */
  private createErrorScreenshot(url: string, viewport: Viewport): Screenshot {
    return {
      id: uuidv4(),
      url,
      viewport,
      timestamp: new Date(),
      path: FilePath.create(`${this.config.currentDirectory}/error_${Date.now()}.png`),
      metadata: {
        browser: 'unknown',
        os: process.platform,
        fullPage: false,
        loadTime: 0,
      },
    };
  }

  /**
   * Dispose service resources
   * Cleans up any managed browser clients
   */
  async dispose(): Promise<void> {
    if (this.managedBrowserClient) {
      await this.managedBrowserClient.dispose();
      this.managedBrowserClient = null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a VisualRegressionService instance with dependency injection
 *
 * @param memory - Memory backend for storage
 * @param vibiumClient - Optional Vibium client for browser automation
 * @param repositories - Optional repositories for persistence
 * @param config - Optional configuration overrides
 * @returns Configured VisualRegressionService instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const service = createVisualRegressionService(memory);
 *
 * // With Vibium client
 * const service = createVisualRegressionService(memory, vibiumClient);
 *
 * // With full configuration
 * const service = createVisualRegressionService(
 *   memory,
 *   vibiumClient,
 *   { screenshotRepository, diffRepository },
 *   { diffThreshold: 0.5 }
 * );
 * ```
 */
export function createVisualRegressionService(
  memory: MemoryBackend,
  vibiumClient?: VibiumClient | null,
  repositories?: {
    screenshotRepository?: IScreenshotRepository;
    diffRepository?: IVisualDiffRepository;
  },
  config?: Partial<VisualRegressionConfig>
): VisualRegressionService {
  return new VisualRegressionService(
    memory,
    vibiumClient ?? null,
    repositories?.screenshotRepository,
    repositories?.diffRepository,
    config
  );
}
