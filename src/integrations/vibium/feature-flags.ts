/**
 * Vibium Feature Flags for V3 QE Integration
 *
 * Controls which Vibium browser automation features are enabled for QE operations.
 * All flags default to true but can be disabled for debugging, testing,
 * or gradual rollout scenarios.
 *
 * Note: These are enable/disable flags for feature control, NOT error hiding.
 * If Vibium is unavailable, we fall back to heuristic-based testing.
 *
 * @module integrations/vibium/feature-flags
 */

// ============================================================================
// Feature Flags Interface
// ============================================================================

/**
 * Feature flags controlling Vibium browser automation usage in QE
 *
 * @example
 * ```typescript
 * import { setVibiumFeatureFlags, getVibiumFeatureFlags } from './feature-flags';
 *
 * // Disable browser mode for CI without display
 * setVibiumFeatureFlags({ useBrowserMode: false });
 *
 * // Check current flags
 * const flags = getVibiumFeatureFlags();
 * if (flags.useBrowserMode) {
 *   // Use real browser for accessibility testing
 * }
 * ```
 */
export interface VibiumFeatureFlags {
  /**
   * Enable browser mode for accessibility testing
   * When true, uses real browser via Vibium for DOM inspection
   * When false, falls back to heuristic-based URL analysis
   * @default true
   */
  useBrowserMode: boolean;

  /**
   * Enable screenshot capture for visual testing
   * Uses Vibium to capture viewport screenshots
   * @default true
   */
  useScreenshotCapture: boolean;

  /**
   * Enable visual regression testing
   * Requires screenshot capture to be enabled
   * @default true
   */
  useVisualRegression: boolean;

  /**
   * Enable E2E test execution via browser
   * Uses Vibium for step-based browser test execution
   * @default true
   */
  useE2EExecution: boolean;

  /**
   * Enable headless mode by default
   * When true, browser runs without visible window (good for CI)
   * When false, browser is visible (good for debugging)
   * @default false
   */
  defaultHeadless: boolean;

  /**
   * Enable auto-retry on browser failures
   * Automatically retries failed browser operations
   * @default true
   */
  useAutoRetry: boolean;

  /**
   * Log performance metrics for browser operations
   * Tracks timing for launch, navigation, screenshots, etc.
   * @default true
   */
  logPerformanceMetrics: boolean;

  /**
   * Enable axe-core integration for accessibility
   * Injects and runs axe-core in browser context
   * @default true
   */
  useAxeCore: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default feature flags - browser features enabled by default
 */
const DEFAULT_FEATURE_FLAGS: VibiumFeatureFlags = {
  useBrowserMode: true,
  useScreenshotCapture: true,
  useVisualRegression: true,
  useE2EExecution: true,
  defaultHeadless: false, // Visible by default for better UX
  useAutoRetry: true,
  logPerformanceMetrics: true,
  useAxeCore: true,
};

// ============================================================================
// Internal State
// ============================================================================

/**
 * Current feature flags state (mutable for runtime configuration)
 */
let currentFeatureFlags: VibiumFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

// ============================================================================
// Public API
// ============================================================================

/**
 * Get current Vibium feature flags
 *
 * @returns Current feature flag configuration (immutable copy)
 *
 * @example
 * ```typescript
 * const flags = getVibiumFeatureFlags();
 * console.log(`Browser mode enabled: ${flags.useBrowserMode}`);
 * console.log(`Headless default: ${flags.defaultHeadless}`);
 * ```
 */
export function getVibiumFeatureFlags(): Readonly<VibiumFeatureFlags> {
  return { ...currentFeatureFlags };
}

/**
 * Set Vibium feature flags
 *
 * Updates the current feature flags with the provided partial configuration.
 * Only specified flags are changed; others retain their current values.
 *
 * @param flags - Partial feature flag configuration to merge
 *
 * @example
 * ```typescript
 * // Enable headless mode for CI
 * setVibiumFeatureFlags({ defaultHeadless: true });
 *
 * // Disable browser features for heuristic-only mode
 * setVibiumFeatureFlags({
 *   useBrowserMode: false,
 *   useScreenshotCapture: false,
 *   useE2EExecution: false,
 * });
 * ```
 */
export function setVibiumFeatureFlags(
  flags: Partial<VibiumFeatureFlags>
): void {
  currentFeatureFlags = {
    ...currentFeatureFlags,
    ...flags,
  };
}

/**
 * Reset Vibium feature flags to defaults
 *
 * Restores all feature flags to their default values.
 * Useful for cleanup after tests or debugging sessions.
 *
 * @example
 * ```typescript
 * // After tests
 * afterEach(() => {
 *   resetVibiumFeatureFlags();
 * });
 * ```
 */
export function resetVibiumFeatureFlags(): void {
  currentFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if browser mode is enabled
 * @returns true if useBrowserMode flag is set
 */
export function isBrowserModeEnabled(): boolean {
  return currentFeatureFlags.useBrowserMode;
}

/**
 * Check if screenshot capture is enabled
 * @returns true if useScreenshotCapture flag is set
 */
export function isScreenshotCaptureEnabled(): boolean {
  return currentFeatureFlags.useScreenshotCapture;
}

/**
 * Check if visual regression is enabled
 * @returns true if useVisualRegression flag is set
 */
export function isVisualRegressionEnabled(): boolean {
  return currentFeatureFlags.useVisualRegression;
}

/**
 * Check if E2E execution is enabled
 * @returns true if useE2EExecution flag is set
 */
export function isE2EExecutionEnabled(): boolean {
  return currentFeatureFlags.useE2EExecution;
}

/**
 * Check if headless mode is the default
 * @returns true if defaultHeadless flag is set
 */
export function isDefaultHeadless(): boolean {
  return currentFeatureFlags.defaultHeadless;
}

/**
 * Check if auto-retry is enabled
 * @returns true if useAutoRetry flag is set
 */
export function isAutoRetryEnabled(): boolean {
  return currentFeatureFlags.useAutoRetry;
}

/**
 * Check if performance metrics logging is enabled
 * @returns true if logPerformanceMetrics flag is set
 */
export function shouldLogPerformanceMetrics(): boolean {
  return currentFeatureFlags.logPerformanceMetrics;
}

/**
 * Check if axe-core integration is enabled
 * @returns true if useAxeCore flag is set
 */
export function isAxeCoreEnabled(): boolean {
  return currentFeatureFlags.useAxeCore;
}

// ============================================================================
// Environment Variable Support
// ============================================================================

/**
 * Initialize feature flags from environment variables
 *
 * Reads the following environment variables:
 * - VIBIUM_USE_BROWSER_MODE: 'true'/'false'
 * - VIBIUM_USE_SCREENSHOT_CAPTURE: 'true'/'false'
 * - VIBIUM_USE_VISUAL_REGRESSION: 'true'/'false'
 * - VIBIUM_USE_E2E_EXECUTION: 'true'/'false'
 * - VIBIUM_DEFAULT_HEADLESS: 'true'/'false'
 * - VIBIUM_USE_AUTO_RETRY: 'true'/'false'
 * - VIBIUM_LOG_PERFORMANCE_METRICS: 'true'/'false'
 * - VIBIUM_USE_AXE_CORE: 'true'/'false'
 *
 * @example
 * ```typescript
 * // In application startup
 * initVibiumFeatureFlagsFromEnv();
 * ```
 */
export function initVibiumFeatureFlagsFromEnv(): void {
  const envFlags: Partial<VibiumFeatureFlags> = {};

  if (process.env.VIBIUM_USE_BROWSER_MODE !== undefined) {
    envFlags.useBrowserMode = process.env.VIBIUM_USE_BROWSER_MODE === 'true';
  }

  if (process.env.VIBIUM_USE_SCREENSHOT_CAPTURE !== undefined) {
    envFlags.useScreenshotCapture = process.env.VIBIUM_USE_SCREENSHOT_CAPTURE === 'true';
  }

  if (process.env.VIBIUM_USE_VISUAL_REGRESSION !== undefined) {
    envFlags.useVisualRegression = process.env.VIBIUM_USE_VISUAL_REGRESSION === 'true';
  }

  if (process.env.VIBIUM_USE_E2E_EXECUTION !== undefined) {
    envFlags.useE2EExecution = process.env.VIBIUM_USE_E2E_EXECUTION === 'true';
  }

  if (process.env.VIBIUM_DEFAULT_HEADLESS !== undefined) {
    envFlags.defaultHeadless = process.env.VIBIUM_DEFAULT_HEADLESS === 'true';
  }

  if (process.env.VIBIUM_USE_AUTO_RETRY !== undefined) {
    envFlags.useAutoRetry = process.env.VIBIUM_USE_AUTO_RETRY === 'true';
  }

  if (process.env.VIBIUM_LOG_PERFORMANCE_METRICS !== undefined) {
    envFlags.logPerformanceMetrics = process.env.VIBIUM_LOG_PERFORMANCE_METRICS === 'true';
  }

  if (process.env.VIBIUM_USE_AXE_CORE !== undefined) {
    envFlags.useAxeCore = process.env.VIBIUM_USE_AXE_CORE === 'true';
  }

  setVibiumFeatureFlags(envFlags);
}

// ============================================================================
// CI/CD Helpers
// ============================================================================

/**
 * Configure Vibium for CI environment
 *
 * Sets optimal flags for headless CI execution:
 * - Enables headless mode
 * - Enables auto-retry for stability
 * - Enables performance metrics for monitoring
 *
 * @example
 * ```typescript
 * if (process.env.CI) {
 *   configureForCI();
 * }
 * ```
 */
export function configureForCI(): void {
  setVibiumFeatureFlags({
    defaultHeadless: true,
    useAutoRetry: true,
    logPerformanceMetrics: true,
  });
}

/**
 * Configure Vibium for local development
 *
 * Sets optimal flags for interactive development:
 * - Visible browser for debugging
 * - Performance metrics for optimization
 *
 * @example
 * ```typescript
 * if (process.env.NODE_ENV === 'development') {
 *   configureForDevelopment();
 * }
 * ```
 */
export function configureForDevelopment(): void {
  setVibiumFeatureFlags({
    defaultHeadless: false,
    logPerformanceMetrics: true,
  });
}

/**
 * Configure Vibium for heuristic-only mode
 *
 * Disables all browser features, falling back to
 * URL-pattern-based heuristic analysis.
 * Useful when Vibium/Chrome is unavailable.
 *
 * @example
 * ```typescript
 * if (!isVibiumAvailable()) {
 *   configureForHeuristicMode();
 * }
 * ```
 */
export function configureForHeuristicMode(): void {
  setVibiumFeatureFlags({
    useBrowserMode: false,
    useScreenshotCapture: false,
    useVisualRegression: false,
    useE2EExecution: false,
    useAxeCore: false,
  });
}

// ============================================================================
// Export Default Flags
// ============================================================================

export { DEFAULT_FEATURE_FLAGS };
