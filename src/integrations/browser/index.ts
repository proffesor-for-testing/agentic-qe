/**
 * Unified Browser Automation Integration
 * Supports both Vibium (MCP) and agent-browser (CLI)
 *
 * This module provides a common interface for browser automation,
 * allowing seamless integration of different browser tools with AQE v3.
 *
 * Exported Types:
 * - IBrowserClient: Common interface for all browser tools
 * - IAgentBrowserClient: Extended interface for agent-browser specific features
 * - ElementTarget: Flexible element targeting (refs, CSS, xpath, text)
 * - BrowserError: Unified error handling
 * - BrowserSessionInfo: Session information
 * - ParsedSnapshot: Agent-browser snapshot results
 * - BrowserLaunchOptions: Launch configuration
 * - BrowserNavigateResult: Navigation results
 * - BrowserScreenshotResult: Screenshot results
 *
 * @example
 * ```typescript
 * import type { IBrowserClient } from '@/integrations/browser';
 *
 * async function runTest(client: IBrowserClient) {
 *   // Launch browser
 *   const sessionResult = await client.launch({ headless: true });
 *   if (!sessionResult.success) {
 *     throw sessionResult.error;
 *   }
 *
 *   // Navigate and interact
 *   await client.navigate('https://example.com');
 *   await client.click({ type: 'css', value: 'button.submit' });
 *   const text = await client.getText('.result');
 *
 *   // Screenshot for visual testing
 *   const screenshot = await client.screenshot();
 *
 *   // Cleanup
 *   await client.quit();
 *   await client.dispose();
 * }
 * ```
 *
 * Tool Selection:
 * - For E2E Testing: Use agent-browser (supports refs, sessions, mocking)
 * - For Visual Testing: Use either (both capture screenshots)
 * - For Accessibility: Use either (both can run accessibility checks)
 * - For API Mocking: Use agent-browser only
 * - For Auth Testing: Use agent-browser (state persistence)
 */

export {
  // Type Definitions
  type ElementTarget,
  type BrowserToolPreference,
  type BrowserUseCase,
  type BrowserLaunchOptions,
  type BrowserSessionInfo,
  type BrowserNavigateResult,
  type BrowserScreenshotResult,
  type SnapshotElement,
  type ParsedSnapshot,
  // Interfaces
  type IBrowserClient,
  type IAgentBrowserClient,
  // Errors
  BrowserError,
  BrowserUnavailableError,
  BrowserTimeoutError,
  BrowserElementNotFoundError,
} from './types';

// Factory Functions
export {
  // Factory options type
  type BrowserClientFactoryOptions,
  // Main factory functions
  createBrowserClient,
  createAgentBrowserClient,
  getBrowserClientForUseCase,
  // Availability checks
  isVibiumAvailable,
  isAgentBrowserAvailable,
  // Utility functions
  getBrowserToolAvailability,
  getRecommendedToolForUseCase,
} from './client-factory';

// Re-export AgentBrowserClient for direct instantiation if needed
export { AgentBrowserClient } from './agent-browser/client';

// Web Content Fetcher - 5-tier browser cascade
export {
  // Main class
  WebContentFetcher,
  // Factory functions
  createWebContentFetcher,
  fetchWebContent,
  // Types
  type FetchTier,
  type FetchStatus,
  type WebContentFetchResult,
  type WebContentFetchOptions,
} from './web-content-fetcher';
