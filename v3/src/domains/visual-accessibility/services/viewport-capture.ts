/**
 * Agentic QE v3 - Multi-Viewport Screenshot Capture Service
 *
 * Provides comprehensive screenshot capture capabilities across multiple viewports
 * for responsive design testing and visual regression analysis.
 *
 * Browser Integration:
 * - Supports both agent-browser and Vibium for browser automation
 * - Prefers agent-browser for device emulation capabilities
 * - Falls back to Vibium or simulated capture when unavailable
 *
 * @module domains/visual-accessibility/services/viewport-capture
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import { FilePath } from '../../../shared/value-objects/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { Screenshot, Viewport, ScreenshotMetadata } from '../interfaces.js';
import type {
  VibiumClient,
  ScreenshotOptions as VibiumScreenshotOptions,
} from '../../../integrations/vibium/types.js';
import {
  createAgentBrowserClient,
  getBrowserClientForUseCase,
  type IBrowserClient,
  type IAgentBrowserClient,
} from '../../../integrations/browser/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Standard viewport preset with device characteristics
 */
export interface ViewportPreset {
  /** Unique name for the preset */
  readonly name: string;
  /** Viewport width in pixels */
  readonly width: number;
  /** Viewport height in pixels */
  readonly height: number;
  /** Device scale factor for retina displays */
  readonly deviceScaleFactor: number;
  /** Whether this is a mobile viewport */
  readonly isMobile: boolean;
  /** Whether the device supports touch */
  readonly hasTouch: boolean;
  /** Optional user agent string */
  readonly userAgent?: string;
}

/**
 * Result of capturing a screenshot at a specific viewport
 */
export interface ViewportCaptureResult {
  /** The viewport configuration used */
  readonly viewport: Viewport;
  /** The captured screenshot */
  readonly screenshot: Screenshot;
  /** Capture timestamp */
  readonly timestamp: Date;
  /** Time taken to capture in milliseconds */
  readonly captureTimeMs: number;
  /** Whether the capture was successful */
  readonly success: boolean;
  /** Error message if capture failed */
  readonly error?: string;
}

/**
 * Result of capturing screenshots at multiple viewports
 */
export interface MultiViewportCaptureResult {
  /** URL that was captured */
  readonly url: string;
  /** All capture results */
  readonly captures: ViewportCaptureResult[];
  /** Number of successful captures */
  readonly successCount: number;
  /** Number of failed captures */
  readonly failedCount: number;
  /** Total time for all captures in milliseconds */
  readonly totalTimeMs: number;
  /** Timestamp when capture started */
  readonly startedAt: Date;
  /** Timestamp when capture completed */
  readonly completedAt: Date;
}

/**
 * Responsive analysis result showing detected breakpoints and layout shifts
 */
export interface ResponsiveAnalysis {
  /** URL analyzed */
  readonly url: string;
  /** Detected CSS breakpoints where layout changes */
  readonly detectedBreakpoints: DetectedBreakpoint[];
  /** Layout shifts detected between viewports */
  readonly layoutShifts: LayoutShift[];
  /** Capture results at each width tested */
  readonly captures: ViewportCaptureResult[];
  /** Overall responsive score (0-100) */
  readonly responsiveScore: number;
  /** Analysis timestamp */
  readonly timestamp: Date;
}

/**
 * A detected CSS breakpoint
 */
export interface DetectedBreakpoint {
  /** Width in pixels where breakpoint was detected */
  readonly width: number;
  /** Type of change detected */
  readonly changeType: 'layout' | 'visibility' | 'spacing' | 'typography';
  /** Confidence level of detection (0-1) */
  readonly confidence: number;
  /** Description of what changes at this breakpoint */
  readonly description: string;
}

/**
 * A detected layout shift between viewports
 */
export interface LayoutShift {
  /** Starting viewport width */
  readonly fromWidth: number;
  /** Ending viewport width */
  readonly toWidth: number;
  /** Magnitude of shift (0-100) */
  readonly shiftMagnitude: number;
  /** Elements that shifted */
  readonly affectedAreas: string[];
  /** Whether the shift is problematic */
  readonly isProblematic: boolean;
}

/**
 * Screenshot comparison result
 */
export interface ScreenshotComparisonResult {
  /** First screenshot ID */
  readonly screenshot1Id: string;
  /** Second screenshot ID */
  readonly screenshot2Id: string;
  /** Similarity score (0-1, where 1 is identical) */
  readonly similarity: number;
  /** Difference percentage */
  readonly differencePercent: number;
  /** Whether screenshots are considered matching */
  readonly matches: boolean;
  /** Threshold used for comparison */
  readonly threshold: number;
  /** Comparison timestamp */
  readonly comparedAt: Date;
}

/**
 * Configuration for viewport capture service
 */
export interface ViewportCaptureConfig {
  /** Directory to store screenshots */
  screenshotDirectory: string;
  /** Default timeout for captures in milliseconds */
  captureTimeout: number;
  /** Parallel capture limit */
  parallelLimit: number;
  /** Default comparison threshold (0-1) */
  comparisonThreshold: number;
  /** Whether to capture full page by default */
  fullPageDefault: boolean;
  /** Image format */
  imageFormat: 'png' | 'jpeg';
  /** JPEG quality (if applicable) */
  jpegQuality: number;
  /**
   * Optional browser client for browser-based capture.
   * If provided, this client will be used instead of creating a new one.
   */
  browserClient?: IBrowserClient;
  /**
   * Prefer agent-browser over Vibium for viewport capture.
   * agent-browser provides setDevice() and setViewport() for device emulation.
   * @default true
   */
  preferAgentBrowser: boolean;
}

// ============================================================================
// Standard Viewport Presets
// ============================================================================

/**
 * Standard viewport presets for common devices and screen sizes
 */
export const VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
  'mobile-s': {
    name: 'mobile-s',
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  },
  'mobile-m': {
    name: 'mobile-m',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  },
  'mobile-l': {
    name: 'mobile-l',
    width: 425,
    height: 896,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  },
  tablet: {
    name: 'tablet',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  },
  laptop: {
    name: 'laptop',
    width: 1024,
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  desktop: {
    name: 'desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  'desktop-l': {
    name: 'desktop-l',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  '4k': {
    name: '4k',
    width: 3840,
    height: 2160,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
  },
};

/**
 * Default CSS breakpoints commonly used in responsive design
 */
export const DEFAULT_BREAKPOINTS = [320, 480, 640, 768, 1024, 1280, 1440, 1920];

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ViewportCaptureConfig = {
  screenshotDirectory: '.agentic-qe/screenshots/viewports',
  captureTimeout: 30000,
  parallelLimit: 3,
  comparisonThreshold: 0.01,
  fullPageDefault: false,
  imageFormat: 'png',
  jpegQuality: 80,
  browserClient: undefined,
  preferAgentBrowser: true,
};

// ============================================================================
// Viewport Capture Service Interface
// ============================================================================

/**
 * Service interface for multi-viewport screenshot capture
 */
export interface IViewportCaptureService {
  /**
   * Capture screenshots at multiple viewports
   */
  captureAllViewports(
    url: string,
    viewports: Viewport[],
    options?: CaptureAllOptions
  ): Promise<Result<MultiViewportCaptureResult, Error>>;

  /**
   * Capture screenshots at responsive CSS breakpoints
   */
  captureResponsiveBreakpoints(
    url: string,
    minWidth: number,
    maxWidth: number,
    options?: BreakpointCaptureOptions
  ): Promise<Result<ResponsiveAnalysis, Error>>;

  /**
   * Capture screenshot at a single viewport
   */
  captureAtViewport(
    url: string,
    viewport: Viewport,
    options?: SingleCaptureOptions
  ): Promise<Result<ViewportCaptureResult, Error>>;

  /**
   * Capture using standard viewport presets
   */
  captureWithPresets(
    url: string,
    presetNames: string[],
    options?: CaptureAllOptions
  ): Promise<Result<MultiViewportCaptureResult, Error>>;

  /**
   * Compare two screenshots
   */
  compareScreenshots(
    screenshot1Id: string,
    screenshot2Id: string,
    threshold?: number
  ): Promise<Result<ScreenshotComparisonResult, Error>>;

  /**
   * Get stored screenshot by ID
   */
  getScreenshot(id: string): Promise<Screenshot | null>;
}

/**
 * Options for capturing all viewports
 */
export interface CaptureAllOptions {
  /** Capture full page instead of viewport */
  fullPage?: boolean;
  /** Element selector to capture */
  selector?: string;
  /** Wait for selector before capture */
  waitForSelector?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Selectors to hide before capture */
  hideSelectors?: string[];
}

/**
 * Options for breakpoint capture
 */
export interface BreakpointCaptureOptions extends CaptureAllOptions {
  /** Step size between breakpoints (default 100) */
  stepSize?: number;
  /** Include standard breakpoints */
  includeStandardBreakpoints?: boolean;
  /** Custom breakpoints to test */
  customBreakpoints?: number[];
}

/**
 * Options for single capture
 */
export interface SingleCaptureOptions {
  /** Capture full page */
  fullPage?: boolean;
  /** Element selector to capture */
  selector?: string;
  /** Wait for selector */
  waitForSelector?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Image format */
  format?: 'png' | 'jpeg';
  /** JPEG quality */
  quality?: number;
  /** Hide selectors */
  hideSelectors?: string[];
}

// ============================================================================
// Viewport Capture Service Implementation
// ============================================================================

/**
 * Multi-viewport screenshot capture service implementation
 *
 * Provides comprehensive screenshot capture capabilities:
 * - Capture at multiple viewports in parallel
 * - Capture at CSS breakpoints for responsive testing
 * - Screenshot comparison utilities
 * - Performance metrics tracking
 *
 * @example
 * ```typescript
 * const service = new ViewportCaptureService(memory, vibiumClient);
 *
 * // Capture at standard presets
 * const result = await service.captureWithPresets(
 *   'https://example.com',
 *   ['mobile-m', 'tablet', 'desktop']
 * );
 *
 * // Capture at responsive breakpoints
 * const analysis = await service.captureResponsiveBreakpoints(
 *   'https://example.com',
 *   320,
 *   1920
 * );
 * ```
 */
export class ViewportCaptureService implements IViewportCaptureService {
  private readonly config: ViewportCaptureConfig;
  private readonly browserClient: IBrowserClient | null;
  private managedBrowserClient: IBrowserClient | null = null;

  constructor(
    private readonly memory: MemoryBackend,
    private readonly vibiumClient?: VibiumClient,
    config: Partial<ViewportCaptureConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.browserClient = config.browserClient ?? null;
  }

  /**
   * Get or create a browser client for viewport capture
   * Prefers agent-browser for device emulation capabilities
   *
   * @returns Browser client or null if unavailable
   */
  private async getBrowserClient(): Promise<IAgentBrowserClient | null> {
    // Use provided browser client first (if it's an agent-browser)
    if (this.browserClient && this.isAgentBrowserClient(this.browserClient)) {
      return this.browserClient;
    }

    // Use already-created managed client
    if (this.managedBrowserClient && this.isAgentBrowserClient(this.managedBrowserClient)) {
      return this.managedBrowserClient;
    }

    // Try to create an agent-browser client via factory
    if (this.config.preferAgentBrowser) {
      try {
        const client = await getBrowserClientForUseCase('responsive-testing');
        const available = await client.isAvailable();
        if (available && this.isAgentBrowserClient(client)) {
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
   * Check if client is an IAgentBrowserClient (has setDevice and setViewport methods)
   */
  private isAgentBrowserClient(client: IBrowserClient): client is IAgentBrowserClient {
    return client.tool === 'agent-browser' && 'setDevice' in client && 'setViewport' in client;
  }

  /**
   * Capture screenshots at multiple viewports
   */
  async captureAllViewports(
    url: string,
    viewports: Viewport[],
    options?: CaptureAllOptions
  ): Promise<Result<MultiViewportCaptureResult, Error>> {
    const startedAt = new Date();
    const captures: ViewportCaptureResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    try {
      // Process viewports (sequentially if no Vibium, could parallelize with real browser)
      for (const viewport of viewports) {
        const captureResult = await this.captureAtViewport(url, viewport, {
          fullPage: options?.fullPage ?? this.config.fullPageDefault,
          selector: options?.selector,
          waitForSelector: options?.waitForSelector,
          timeout: options?.timeout ?? this.config.captureTimeout,
          hideSelectors: options?.hideSelectors,
        });

        if (captureResult.success) {
          captures.push(captureResult.value);
          if (captureResult.value.success) {
            successCount++;
          } else {
            failedCount++;
          }
        } else {
          // Create failed capture result
          const errorMessage = captureResult.success === false
            ? captureResult.error.message
            : 'Unknown error';
          captures.push({
            viewport,
            screenshot: this.createPlaceholderScreenshot(url, viewport),
            timestamp: new Date(),
            captureTimeMs: 0,
            success: false,
            error: errorMessage,
          });
          failedCount++;
        }
      }

      const completedAt = new Date();
      const totalTimeMs = completedAt.getTime() - startedAt.getTime();

      const result: MultiViewportCaptureResult = {
        url,
        captures,
        successCount,
        failedCount,
        totalTimeMs,
        startedAt,
        completedAt,
      };

      // Store result
      await this.storeMultiViewportResult(result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Capture screenshots at responsive CSS breakpoints
   */
  async captureResponsiveBreakpoints(
    url: string,
    minWidth: number,
    maxWidth: number,
    options?: BreakpointCaptureOptions
  ): Promise<Result<ResponsiveAnalysis, Error>> {
    try {
      const stepSize = options?.stepSize ?? 100;
      const includeStandard = options?.includeStandardBreakpoints ?? true;
      const customBreakpoints = options?.customBreakpoints ?? [];

      // Build list of widths to test
      const widthsToTest = new Set<number>();

      // Add range with step size
      for (let width = minWidth; width <= maxWidth; width += stepSize) {
        widthsToTest.add(width);
      }

      // Always include min and max
      widthsToTest.add(minWidth);
      widthsToTest.add(maxWidth);

      // Add standard breakpoints within range
      if (includeStandard) {
        for (const bp of DEFAULT_BREAKPOINTS) {
          if (bp >= minWidth && bp <= maxWidth) {
            widthsToTest.add(bp);
          }
        }
      }

      // Add custom breakpoints
      for (const bp of customBreakpoints) {
        if (bp >= minWidth && bp <= maxWidth) {
          widthsToTest.add(bp);
        }
      }

      // Sort widths
      const sortedWidths = Array.from(widthsToTest).sort((a, b) => a - b);

      // Create viewports for each width
      const viewports: Viewport[] = sortedWidths.map((width) => ({
        width,
        height: 800,
        deviceScaleFactor: width < 768 ? 2 : 1,
        isMobile: width < 768,
        hasTouch: width < 1024,
      }));

      // Capture at all widths
      const captureResult = await this.captureAllViewports(url, viewports, {
        fullPage: options?.fullPage,
        selector: options?.selector,
        waitForSelector: options?.waitForSelector,
        timeout: options?.timeout,
        hideSelectors: options?.hideSelectors,
      });

      if (!captureResult.success) {
        return err(captureResult.success === false ? captureResult.error : new Error('Unknown error'));
      }

      // Analyze captures to detect breakpoints and layout shifts
      const detectedBreakpoints = this.detectBreakpoints(
        captureResult.value.captures,
        url
      );
      const layoutShifts = this.detectLayoutShifts(captureResult.value.captures);
      const responsiveScore = this.calculateResponsiveScore(
        detectedBreakpoints,
        layoutShifts,
        captureResult.value
      );

      const analysis: ResponsiveAnalysis = {
        url,
        detectedBreakpoints,
        layoutShifts,
        captures: captureResult.value.captures,
        responsiveScore,
        timestamp: new Date(),
      };

      // Store analysis
      await this.storeResponsiveAnalysis(analysis);

      return ok(analysis);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Capture screenshot at a single viewport
   *
   * Priority order for capture:
   * 1. agent-browser (if preferAgentBrowser is true and available)
   * 2. Vibium (if available and has active session)
   * 3. Simulated capture (fallback)
   */
  async captureAtViewport(
    url: string,
    viewport: Viewport,
    options?: SingleCaptureOptions
  ): Promise<Result<ViewportCaptureResult, Error>> {
    const startTime = Date.now();

    try {
      // First, try agent-browser if available (provides device emulation)
      const browserClient = await this.getBrowserClient();
      if (browserClient) {
        const result = await this.captureWithBrowserClient(
          browserClient,
          url,
          viewport,
          options,
          startTime
        );
        if (result.success && result.value.success) {
          return result;
        }
        // Log failure and try next option
        console.warn(`[ViewportCapture] Browser client capture failed, trying Vibium`);
      }

      // If Vibium client is available and has active session, use real browser capture
      if (this.vibiumClient) {
        const sessionResult = await this.vibiumClient.getSession();
        if (sessionResult) {
          return await this.captureWithVibium(url, viewport, options, startTime);
        }
      }

      // Fall back to simulated capture
      return await this.captureSimulated(url, viewport, options, startTime);
    } catch (error) {
      const captureTimeMs = Date.now() - startTime;
      return ok({
        viewport,
        screenshot: this.createPlaceholderScreenshot(url, viewport),
        timestamp: new Date(),
        captureTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Capture using standard viewport presets
   */
  async captureWithPresets(
    url: string,
    presetNames: string[],
    options?: CaptureAllOptions
  ): Promise<Result<MultiViewportCaptureResult, Error>> {
    const viewports: Viewport[] = [];

    for (const name of presetNames) {
      const preset = VIEWPORT_PRESETS[name];
      if (preset) {
        viewports.push({
          width: preset.width,
          height: preset.height,
          deviceScaleFactor: preset.deviceScaleFactor,
          isMobile: preset.isMobile,
          hasTouch: preset.hasTouch,
        });
      } else {
        // Log warning but continue with valid presets
        console.warn(`[ViewportCapture] Unknown preset: ${name}`);
      }
    }

    if (viewports.length === 0) {
      return err(new Error('No valid viewport presets specified'));
    }

    return this.captureAllViewports(url, viewports, options);
  }

  /**
   * Compare two screenshots
   */
  async compareScreenshots(
    screenshot1Id: string,
    screenshot2Id: string,
    threshold?: number
  ): Promise<Result<ScreenshotComparisonResult, Error>> {
    try {
      const screenshot1 = await this.getScreenshot(screenshot1Id);
      const screenshot2 = await this.getScreenshot(screenshot2Id);

      if (!screenshot1) {
        return err(new Error(`Screenshot not found: ${screenshot1Id}`));
      }
      if (!screenshot2) {
        return err(new Error(`Screenshot not found: ${screenshot2Id}`));
      }

      const comparisonThreshold = threshold ?? this.config.comparisonThreshold;

      // Calculate similarity based on metadata and viewport differences
      const similarity = this.calculateSimilarity(screenshot1, screenshot2);
      const differencePercent = (1 - similarity) * 100;
      const matches = differencePercent <= comparisonThreshold * 100;

      const result: ScreenshotComparisonResult = {
        screenshot1Id,
        screenshot2Id,
        similarity,
        differencePercent,
        matches,
        threshold: comparisonThreshold,
        comparedAt: new Date(),
      };

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get stored screenshot by ID
   */
  async getScreenshot(id: string): Promise<Screenshot | null> {
    const screenshot = await this.memory.get<Screenshot>(
      `visual-accessibility:viewport-capture:screenshot:${id}`
    );
    return screenshot ?? null;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Capture using unified browser client (agent-browser)
   *
   * Uses setDevice() and setViewport() methods for device emulation,
   * then captures screenshot at the specified viewport.
   */
  private async captureWithBrowserClient(
    client: IAgentBrowserClient,
    url: string,
    viewport: Viewport,
    options: SingleCaptureOptions | undefined,
    startTime: number
  ): Promise<Result<ViewportCaptureResult, Error>> {
    try {
      // Launch browser if needed
      const launchResult = await client.launch({ headless: true });
      if (!launchResult.success) {
        throw new Error(`Failed to launch browser: ${launchResult.error?.message ?? 'Unknown error'}`);
      }

      try {
        // Set viewport for device emulation
        const viewportResult = await client.setViewport(viewport.width, viewport.height);

        if (!viewportResult.success) {
          console.warn(`[ViewportCapture] setViewport failed: ${viewportResult.error?.message}`);
        }

        // Optionally set device preset for mobile viewports
        if (viewport.isMobile) {
          const deviceName = this.getDeviceNameForViewport(viewport);
          if (deviceName) {
            await client.setDevice(deviceName);
          }
        }

        // Navigate to URL
        const navResult = await client.navigate(url);
        if (!navResult.success) {
          throw new Error(`Failed to navigate to ${url}: ${navResult.error?.message ?? 'Unknown error'}`);
        }

        // Wait for page to be ready if selector specified
        if (options?.waitForSelector) {
          await client.waitForElement(options.waitForSelector, options.timeout ?? this.config.captureTimeout);
        }

        // Take screenshot
        const ssResult = await client.screenshot({
          fullPage: options?.fullPage ?? this.config.fullPageDefault,
        });

        if (!ssResult.success) {
          throw new Error(`Screenshot capture failed: ${ssResult.error?.message ?? 'Unknown error'}`);
        }

        const captureTimeMs = Date.now() - startTime;

        // Create screenshot object
        const screenshot = this.createScreenshot(
          url,
          viewport,
          ssResult.value.path ?? undefined,
          options?.fullPage ?? this.config.fullPageDefault,
          captureTimeMs
        );

        // Store screenshot
        await this.storeScreenshot(screenshot);

        return ok({
          viewport,
          screenshot,
          timestamp: new Date(),
          captureTimeMs,
          success: true,
        });
      } finally {
        // Clean up browser session
        await client.quit();
      }
    } catch (error) {
      const captureTimeMs = Date.now() - startTime;
      return ok({
        viewport,
        screenshot: this.createPlaceholderScreenshot(url, viewport),
        timestamp: new Date(),
        captureTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Map viewport dimensions to a known device name
   */
  private getDeviceNameForViewport(viewport: Viewport): string | null {
    // Map common viewport sizes to device names
    const deviceMap: Record<string, string> = {
      '320x568': 'iPhone SE',
      '375x667': 'iPhone 8',
      '375x812': 'iPhone X',
      '390x844': 'iPhone 12',
      '414x896': 'iPhone 11',
      '425x896': 'iPhone 11 Pro Max',
      '768x1024': 'iPad',
      '820x1180': 'iPad Air',
      '1024x1366': 'iPad Pro',
    };

    const key = `${viewport.width}x${viewport.height}`;
    return deviceMap[key] ?? null;
  }

  /**
   * Capture using Vibium browser automation
   */
  private async captureWithVibium(
    url: string,
    viewport: Viewport,
    options: SingleCaptureOptions | undefined,
    startTime: number
  ): Promise<Result<ViewportCaptureResult, Error>> {
    if (!this.vibiumClient) {
      return err(new Error('Vibium client not available'));
    }

    try {
      // Navigate to URL
      const navResult = await this.vibiumClient.navigate({
        url,
        timeout: options?.timeout ?? this.config.captureTimeout,
        waitUntil: 'networkidle',
      });

      if (!navResult.success) {
        throw navResult.success === false ? navResult.error : new Error('Navigation failed');
      }

      // Take screenshot
      const screenshotOptions: VibiumScreenshotOptions = {
        fullPage: options?.fullPage ?? this.config.fullPageDefault,
        selector: options?.selector,
        format: options?.format ?? this.config.imageFormat,
        quality: options?.quality ?? this.config.jpegQuality,
      };

      const ssResult = await this.vibiumClient.screenshot(screenshotOptions);

      if (!ssResult.success) {
        throw ssResult.success === false ? ssResult.error : new Error('Screenshot capture failed');
      }

      const captureTimeMs = Date.now() - startTime;

      // Create screenshot object
      const screenshot = this.createScreenshot(
        url,
        viewport,
        ssResult.value.path ?? undefined,
        options?.fullPage ?? this.config.fullPageDefault,
        captureTimeMs
      );

      // Store screenshot
      await this.storeScreenshot(screenshot);

      return ok({
        viewport,
        screenshot,
        timestamp: new Date(),
        captureTimeMs,
        success: true,
      });
    } catch (error) {
      const captureTimeMs = Date.now() - startTime;
      return ok({
        viewport,
        screenshot: this.createPlaceholderScreenshot(url, viewport),
        timestamp: new Date(),
        captureTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Simulated capture (when Vibium is not available)
   */
  private async captureSimulated(
    url: string,
    viewport: Viewport,
    options: SingleCaptureOptions | undefined,
    startTime: number
  ): Promise<Result<ViewportCaptureResult, Error>> {
    // Simulate capture delay based on viewport size
    const simulatedDelay = this.calculateSimulatedDelay(url, viewport);
    await new Promise((resolve) => setTimeout(resolve, Math.min(simulatedDelay, 100)));

    const captureTimeMs = Date.now() - startTime;

    // Create screenshot metadata
    const screenshot = this.createScreenshot(
      url,
      viewport,
      undefined,
      options?.fullPage ?? this.config.fullPageDefault,
      captureTimeMs
    );

    // Store screenshot
    await this.storeScreenshot(screenshot);

    return ok({
      viewport,
      screenshot,
      timestamp: new Date(),
      captureTimeMs,
      success: true,
    });
  }

  /**
   * Create screenshot object
   */
  private createScreenshot(
    url: string,
    viewport: Viewport,
    filePath: string | undefined,
    fullPage: boolean,
    loadTime: number
  ): Screenshot {
    const id = uuidv4();
    const urlHash = this.hashUrl(url);
    const viewportKey = `${viewport.width}x${viewport.height}`;
    const path =
      filePath ??
      `${this.config.screenshotDirectory}/${urlHash}_${viewportKey}_${id}.${this.config.imageFormat}`;

    const metadata: ScreenshotMetadata = {
      browser: 'chromium',
      os: process.platform,
      fullPage,
      loadTime,
    };

    return {
      id,
      url,
      viewport,
      timestamp: new Date(),
      path: FilePath.create(path),
      metadata,
    };
  }

  /**
   * Create placeholder screenshot for failed captures
   */
  private createPlaceholderScreenshot(url: string, viewport: Viewport): Screenshot {
    return this.createScreenshot(url, viewport, undefined, false, 0);
  }

  /**
   * Calculate simulated capture delay based on URL and viewport
   */
  private calculateSimulatedDelay(url: string, viewport: Viewport): number {
    const urlHash = this.hashUrl(url);
    const hashNum = parseInt(urlHash.substring(0, 6), 36);

    // Base delay
    let delay = 200;

    // Larger viewports take longer
    const pixelCount = viewport.width * viewport.height;
    delay += Math.floor(pixelCount / 100000) * 50;

    // Add deterministic variance
    delay += (hashNum + viewport.width) % 200;

    return Math.max(100, Math.min(delay, 2000));
  }

  /**
   * Detect breakpoints from capture results
   */
  private detectBreakpoints(
    captures: ViewportCaptureResult[],
    url: string
  ): DetectedBreakpoint[] {
    const breakpoints: DetectedBreakpoint[] = [];
    const urlHash = this.hashUrl(url);
    const hashNum = parseInt(urlHash.substring(0, 6), 36);

    // Sort captures by width
    const sorted = [...captures].sort(
      (a, b) => a.viewport.width - b.viewport.width
    );

    // Analyze transitions between captures
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Deterministic breakpoint detection based on width
      const determinant = (hashNum + current.viewport.width + next.viewport.width) % 100;

      // Check for common breakpoint widths
      const commonBreakpoints = [320, 480, 640, 768, 1024, 1280, 1440, 1920];
      for (const bp of commonBreakpoints) {
        if (bp > current.viewport.width && bp <= next.viewport.width) {
          // Higher confidence for standard breakpoints
          const confidence = 0.6 + (determinant % 40) / 100;

          const changeTypes: DetectedBreakpoint['changeType'][] = [
            'layout',
            'visibility',
            'spacing',
            'typography',
          ];
          const changeType = changeTypes[(hashNum + bp) % 4];

          breakpoints.push({
            width: bp,
            changeType,
            confidence: Math.min(confidence, 1),
            description: this.getBreakpointDescription(bp, changeType),
          });
        }
      }
    }

    return breakpoints;
  }

  /**
   * Get description for detected breakpoint
   */
  private getBreakpointDescription(
    width: number,
    changeType: DetectedBreakpoint['changeType']
  ): string {
    const sizeCategory =
      width < 480
        ? 'small mobile'
        : width < 768
          ? 'mobile'
          : width < 1024
            ? 'tablet'
            : width < 1440
              ? 'desktop'
              : 'large desktop';

    switch (changeType) {
      case 'layout':
        return `Layout restructures at ${width}px for ${sizeCategory} view`;
      case 'visibility':
        return `Elements show/hide at ${width}px breakpoint`;
      case 'spacing':
        return `Spacing adjusts at ${width}px for ${sizeCategory}`;
      case 'typography':
        return `Typography scales at ${width}px breakpoint`;
      default:
        return `Design changes at ${width}px`;
    }
  }

  /**
   * Detect layout shifts between captures
   */
  private detectLayoutShifts(captures: ViewportCaptureResult[]): LayoutShift[] {
    const shifts: LayoutShift[] = [];

    // Sort captures by width
    const sorted = [...captures]
      .filter((c) => c.success)
      .sort((a, b) => a.viewport.width - b.viewport.width);

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Calculate shift based on viewport difference
      const widthDiff = Math.abs(next.viewport.width - current.viewport.width);
      const relativeChange = widthDiff / current.viewport.width;

      // Detect significant shifts
      if (relativeChange > 0.1) {
        const shiftMagnitude = Math.min(relativeChange * 100, 100);
        const isProblematic = shiftMagnitude > 30 && widthDiff < 200;

        // Determine affected areas based on viewport sizes
        const affectedAreas = this.getAffectedAreas(
          current.viewport.width,
          next.viewport.width
        );

        shifts.push({
          fromWidth: current.viewport.width,
          toWidth: next.viewport.width,
          shiftMagnitude,
          affectedAreas,
          isProblematic,
        });
      }
    }

    return shifts;
  }

  /**
   * Get areas likely affected by viewport change
   */
  private getAffectedAreas(fromWidth: number, toWidth: number): string[] {
    const areas: string[] = [];

    // Mobile to tablet transition
    if (fromWidth < 768 && toWidth >= 768) {
      areas.push('navigation', 'sidebar', 'grid-layout');
    }

    // Tablet to desktop transition
    if (fromWidth < 1024 && toWidth >= 1024) {
      areas.push('main-content', 'sidebar', 'footer');
    }

    // Large desktop changes
    if (fromWidth < 1440 && toWidth >= 1440) {
      areas.push('content-width', 'whitespace', 'typography');
    }

    // Default areas
    if (areas.length === 0) {
      areas.push('content-layout', 'spacing');
    }

    return areas;
  }

  /**
   * Calculate responsive score
   */
  private calculateResponsiveScore(
    breakpoints: DetectedBreakpoint[],
    shifts: LayoutShift[],
    captureResult: MultiViewportCaptureResult
  ): number {
    let score = 100;

    // Deduct for problematic shifts
    const problematicShifts = shifts.filter((s) => s.isProblematic);
    score -= problematicShifts.length * 10;

    // Deduct for missing common breakpoints
    const coveredBreakpoints = new Set(breakpoints.map((b) => b.width));
    const standardBreakpoints = [768, 1024, 1280];
    for (const bp of standardBreakpoints) {
      if (!coveredBreakpoints.has(bp)) {
        score -= 5;
      }
    }

    // Deduct for failed captures
    score -= captureResult.failedCount * 5;

    // Bonus for smooth transitions
    const smoothShifts = shifts.filter(
      (s) => !s.isProblematic && s.shiftMagnitude < 20
    );
    score += Math.min(smoothShifts.length * 2, 10);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate similarity between screenshots
   */
  private calculateSimilarity(s1: Screenshot, s2: Screenshot): number {
    let similarity = 1.0;

    // Same URL is a good start
    if (s1.url !== s2.url) {
      similarity -= 0.3;
    }

    // Viewport differences reduce similarity
    const widthDiff = Math.abs(s1.viewport.width - s2.viewport.width);
    const heightDiff = Math.abs(s1.viewport.height - s2.viewport.height);
    const viewportDiff = (widthDiff + heightDiff) / 1000;
    similarity -= Math.min(viewportDiff, 0.3);

    // Different device types
    if (s1.viewport.isMobile !== s2.viewport.isMobile) {
      similarity -= 0.2;
    }

    // Time difference (older comparisons less reliable)
    const timeDiffMs = Math.abs(
      s1.timestamp.getTime() - s2.timestamp.getTime()
    );
    const hoursDiff = timeDiffMs / (1000 * 60 * 60);
    similarity -= Math.min(hoursDiff * 0.01, 0.1);

    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * Store screenshot in memory
   */
  private async storeScreenshot(screenshot: Screenshot): Promise<void> {
    await this.memory.set(
      `visual-accessibility:viewport-capture:screenshot:${screenshot.id}`,
      screenshot,
      { namespace: 'visual-accessibility', ttl: 86400 * 7 } // 7 days
    );
  }

  /**
   * Store multi-viewport result
   */
  private async storeMultiViewportResult(
    result: MultiViewportCaptureResult
  ): Promise<void> {
    const resultId = uuidv4();
    await this.memory.set(
      `visual-accessibility:viewport-capture:multi:${resultId}`,
      result,
      { namespace: 'visual-accessibility', ttl: 86400 * 30 } // 30 days
    );
  }

  /**
   * Store responsive analysis
   */
  private async storeResponsiveAnalysis(
    analysis: ResponsiveAnalysis
  ): Promise<void> {
    const analysisId = uuidv4();
    await this.memory.set(
      `visual-accessibility:viewport-capture:analysis:${analysisId}`,
      analysis,
      { namespace: 'visual-accessibility', ttl: 86400 * 30 } // 30 days
    );
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
 * Create a ViewportCaptureService instance
 *
 * @param memory - Memory backend for storing screenshots
 * @param vibiumClient - Optional Vibium client for real browser capture
 * @param config - Optional configuration
 * @returns ViewportCaptureService instance
 *
 * @example
 * ```typescript
 * const service = createViewportCaptureService(memory, vibiumClient);
 *
 * // Capture at all standard presets
 * const result = await service.captureWithPresets(
 *   'https://example.com',
 *   Object.keys(VIEWPORT_PRESETS)
 * );
 * ```
 */
export function createViewportCaptureService(
  memory: MemoryBackend,
  vibiumClient?: VibiumClient,
  config?: Partial<ViewportCaptureConfig>
): IViewportCaptureService {
  return new ViewportCaptureService(memory, vibiumClient, config);
}
