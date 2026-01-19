/**
 * Agentic QE v3 - Vibium Browser Automation Integration
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
 *
 * @example
 * ```typescript
 * import { createVibiumClient, VibiumConfig } from '@agentic-qe/v3/integrations/vibium';
 *
 * // Create client with optional Vibium
 * const client = await createVibiumClient({
 *   enabled: true,  // Set to false for fallback/mock mode
 *   headless: true,
 *   timeout: 30000,
 *   fallbackEnabled: true,
 * });
 *
 * // Launch browser and navigate
 * await client.launch({ headless: true });
 * await client.navigate({ url: 'https://example.com' });
 *
 * // Interact with elements
 * await client.click({ selector: '#submit-button' });
 * await client.type({ selector: '#username', text: 'testuser' });
 *
 * // Capture screenshot
 * const screenshot = await client.screenshot({ fullPage: true });
 *
 * // Run accessibility checks
 * const a11yResult = await client.checkAccessibility({ wcagLevel: 'AA' });
 * ```
 */

// ============================================================================
// Public Types and Interfaces
// ============================================================================

export type {
  // Configuration
  VibiumConfig,
  VibiumHealthResult,
  VibiumConnectionStatus,

  // Client Interface
  VibiumClient,

  // Browser Session
  BrowserSession,
  LaunchOptions,

  // Navigation
  NavigateOptions,
  NavigateResult,
  PageInfo,

  // Element Interaction
  FindOptions,
  ElementInfo,
  ElementBoundingBox,
  ClickOptions,
  TypeOptions,
  InteractionResult,

  // Screenshots
  ScreenshotOptions,
  ScreenshotResult,
  VisualComparisonResult,

  // Accessibility
  AccessibilityCheckOptions,
  AccessibilityViolation,
  AccessibilityResult,

  // Wait and Polling
  WaitForOptions,
  PageLoadMetrics,
} from './types';

// Export constants
export { DEFAULT_VIBIUM_CONFIG } from './types';

// ============================================================================
// Error Classes
// ============================================================================

export {
  // Base Error
  VibiumError,

  // Specific Errors
  VibiumUnavailableError,
  VibiumTimeoutError,
  VibiumElementNotFoundError,
  VibiumConnectionError,
  VibiumConfigError,
  VibiumNavigationError,
  VibiumScreenshotError,
  VibiumInteractionError,

  // Error Type Guards
  isVibiumError,
  isVibiumUnavailable,
  isVibiumTimeout,
  isElementNotFound,
  isConnectionError,

  // Error Factory Functions
  createVibiumError,
  createUnavailableError,
} from './errors';

// ============================================================================
// Feature Flags
// ============================================================================

export {
  getVibiumFeatureFlags,
  setVibiumFeatureFlags,
  resetVibiumFeatureFlags,
  isBrowserModeEnabled,
  isAxeCoreEnabled,
  isVisualRegressionEnabled,
  isScreenshotCaptureEnabled,
  isE2EExecutionEnabled,
  isDefaultHeadless,
  isAutoRetryEnabled,
  shouldLogPerformanceMetrics,
  initVibiumFeatureFlagsFromEnv,
  configureForCI,
  configureForDevelopment,
  configureForHeuristicMode,
  DEFAULT_FEATURE_FLAGS as DEFAULT_VIBIUM_FEATURE_FLAGS,
  type VibiumFeatureFlags,
} from './feature-flags';

// ============================================================================
// Client Implementation Exports
// ============================================================================

export { VibiumClientImpl, VibiumClientProvider } from './client';

// ============================================================================
// Fallback Implementation Exports
// ============================================================================

export {
  FallbackVibiumClient,
  createFallbackVibiumClient,
  isUsingFallback,
  markAsFallback,
} from './fallback';

// ============================================================================
// Client Factory
// ============================================================================

import type { VibiumClient, VibiumConfig } from './types';
import { VibiumClientImpl } from './client';
import { FallbackVibiumClient } from './fallback';

/**
 * Create a Vibium client with automatic fallback
 *
 * Creates a VibiumClient that automatically falls back to stub mode
 * when Vibium MCP server is unavailable.
 *
 * @param config - Optional client configuration
 * @returns Promise resolving to VibiumClient instance
 *
 * @example
 * ```typescript
 * // Create client with Vibium enabled
 * const client = await createVibiumClient({
 *   enabled: true,
 *   headless: true,
 *   fallbackEnabled: true,
 * });
 *
 * // Launch browser (uses real browser or fallback)
 * const session = await client.launch();
 *
 * // Check if using fallback
 * const health = await client.getHealth();
 * console.log(health.status); // 'connected' or 'unavailable'
 * ```
 */
export async function createVibiumClient(
  config: Partial<VibiumConfig> = {}
): Promise<VibiumClient> {
  const { getVibiumFeatureFlags } = await import('./feature-flags');
  const flags = getVibiumFeatureFlags();

  // If browser mode is disabled or fallback is preferred, use fallback
  if (!flags.useBrowserMode || (config.fallbackEnabled && !config.enabled)) {
    const fallbackClient = new FallbackVibiumClient(config);
    await fallbackClient.initialize();
    return fallbackClient;
  }

  // Try to create real client
  const client = new VibiumClientImpl(config);
  await client.initialize();

  // Check if Vibium is available
  const isAvailable = await client.isAvailable();

  // If unavailable and fallback is enabled, return fallback
  if (!isAvailable && config.fallbackEnabled !== false) {
    await client.dispose();
    const fallbackClient = new FallbackVibiumClient(config);
    await fallbackClient.initialize();
    return fallbackClient;
  }

  return client;
}

/**
 * Create a Vibium client synchronously (must call initialize() manually)
 *
 * @param config - Optional client configuration
 * @returns VibiumClient instance
 *
 * @example
 * ```typescript
 * const client = createVibiumClientSync({ enabled: true });
 * await client.initialize();
 *
 * const session = await client.launch();
 * ```
 */
export function createVibiumClientSync(
  config: Partial<VibiumConfig> = {}
): VibiumClient {
  const { getVibiumFeatureFlags } = require('./feature-flags');
  const flags = getVibiumFeatureFlags();

  if (!flags.useBrowserMode || (config.fallbackEnabled && !config.enabled)) {
    return new FallbackVibiumClient(config);
  }

  return new VibiumClientImpl(config);
}

/**
 * Get Vibium client via singleton provider
 *
 * Uses VibiumClientProvider to manage a single client instance.
 *
 * @param config - Optional initial configuration
 * @returns Promise resolving to VibiumClient instance
 *
 * @example
 * ```typescript
 * // Get singleton client
 * const client = await getVibiumClient({ enabled: true });
 *
 * // Same instance returned on subsequent calls
 * const sameClient = await getVibiumClient();
 * console.log(client === sameClient); // true
 * ```
 */
export async function getVibiumClient(
  config?: Partial<VibiumConfig>
): Promise<VibiumClient> {
  const { VibiumClientProvider } = await import('./client');
  const provider = VibiumClientProvider.getInstance(config);
  return provider.getClient();
}

/**
 * Get Vibium client synchronously via singleton provider
 *
 * @param config - Optional initial configuration
 * @returns VibiumClient instance
 */
export function getVibiumClientSync(config?: Partial<VibiumConfig>): VibiumClient {
  const { VibiumClientProvider } = require('./client');
  const provider = VibiumClientProvider.getInstance(config);
  return provider.getClientSync();
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Quick check if Vibium integration is available
 *
 * @param config - Optional configuration
 * @returns Promise resolving to true if Vibium is available
 *
 * @example
 * ```typescript
 * const available = await isVibiumAvailable();
 * if (available) {
 *   console.log('Browser automation available');
 * } else {
 *   console.log('Using fallback mode');
 * }
 * ```
 */
export async function isVibiumAvailable(
  config: Partial<VibiumConfig> = {}
): Promise<boolean> {
  if (!config.enabled && config.enabled !== undefined) {
    return false;
  }

  const client = await createVibiumClient(config);
  try {
    return await client.isAvailable();
  } finally {
    await client.dispose();
  }
}

/**
 * Get Vibium status summary
 *
 * @param config - Optional configuration
 * @returns Promise resolving to status summary
 *
 * @example
 * ```typescript
 * const status = await getVibiumStatus();
 * console.log(`Mode: ${status.mode}`);
 * console.log(`Features: ${status.features.join(', ')}`);
 * ```
 */
export async function getVibiumStatus(
  config: Partial<VibiumConfig> = {}
): Promise<{
  available: boolean;
  mode: 'browser' | 'fallback';
  features: string[];
  browserType?: string;
}> {
  const client = await createVibiumClient(config);
  try {
    const health = await client.getHealth();
    return {
      available: health.status === 'connected',
      mode: health.status === 'connected' ? 'browser' : 'fallback',
      features: health.features,
      browserType: health.browserType,
    };
  } finally {
    await client.dispose();
  }
}

/**
 * Quick health check for Vibium integration
 *
 * @param config - Optional configuration
 * @returns Promise resolving to health result
 *
 * @example
 * ```typescript
 * const health = await checkVibiumHealth();
 * console.log(`Status: ${health.status}`);
 * console.log(`Latency: ${health.latencyMs}ms`);
 * ```
 */
export async function checkVibiumHealth(
  config: Partial<VibiumConfig> = {}
): Promise<import('./types').VibiumHealthResult> {
  const client = await createVibiumClient(config);
  try {
    return await client.getHealth();
  } finally {
    await client.dispose();
  }
}
