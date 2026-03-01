/**
 * Agentic QE v3 - Browser Orchestrator
 *
 * Manages browser client lifecycle, type detection, and snapshot operations.
 * Supports both agent-browser (CLI-based) and Vibium (MCP-based) clients.
 *
 * @module test-execution/services/e2e/browser-orchestrator
 */

import type {
  VibiumClient,
  ScreenshotResult,
  AccessibilityResult,
  ElementInfo,
} from '@integrations/vibium';
import type {
  IBrowserClient,
  IAgentBrowserClient,
  ElementTarget,
  BrowserScreenshotResult,
  ParsedSnapshot,
} from '@integrations/browser';
import type { E2ETestCase } from '../../types';
import type { UnifiedBrowserClient, E2ERunnerConfig } from './types';
import { toErrorMessage } from '@shared/error-utils.js';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if client is an agent-browser client
 */
export function isAgentBrowserClient(
  client: IBrowserClient | VibiumClient
): client is IAgentBrowserClient {
  return 'tool' in client && client.tool === 'agent-browser';
}

/**
 * Type guard to check if client is a Vibium client (legacy)
 */
export function isVibiumClient(
  client: IBrowserClient | VibiumClient
): client is VibiumClient {
  return !('tool' in client) || !client.tool;
}

// ============================================================================
// Element Target Conversion
// ============================================================================

/**
 * Convert a step selector to an ElementTarget for the unified browser interface
 * Supports CSS selectors, XPath, text content, and agent-browser refs
 *
 * @param selector - The selector string from the step
 * @returns ElementTarget for use with IBrowserClient
 */
export function toElementTarget(selector: string): ElementTarget {
  // Agent-browser snapshot refs (@e1, @e2, e1, e2)
  if (/^@?e\d+$/.test(selector)) {
    const value = selector.startsWith('@') ? selector : `@${selector}`;
    return { type: 'ref', value };
  }

  // XPath selectors
  if (selector.startsWith('//') || selector.startsWith('xpath=')) {
    const value = selector.replace(/^xpath=/, '');
    return { type: 'xpath', value };
  }

  // Text content matching
  if (selector.startsWith('text=')) {
    const value = selector.replace(/^text=/, '');
    return { type: 'text', value };
  }

  // Default to CSS selector
  return { type: 'css', value: selector };
}

// ============================================================================
// Result Conversion Utilities
// ============================================================================

/**
 * Convert BrowserScreenshotResult to Vibium ScreenshotResult format
 * This is needed for backward compatibility
 */
export function toVibiumScreenshotResult(result: BrowserScreenshotResult): ScreenshotResult {
  return {
    base64: result.base64,
    path: result.path,
    format: result.format,
    dimensions: result.dimensions,
    sizeBytes: result.base64 ? Math.ceil(result.base64.length * 0.75) : 0,
    capturedAt: new Date(),
  };
}

/**
 * Convert axe-core results to Vibium AccessibilityResult format
 */
export function toVibiumAccessibilityResult(axeResults: {
  violations: Array<{ id: string; impact: string; description: string; nodes: unknown[] }>;
  passes: { id: string }[];
  incomplete: { id: string }[];
  inapplicable: unknown[];
}): AccessibilityResult {
  const violationsBySeverity = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const violations: Array<{ id: string; impact: string; description: string; nodes: number }> =
    axeResults.violations.map((v) => {
      const impact = v.impact as keyof typeof violationsBySeverity;
      if (impact in violationsBySeverity) {
        violationsBySeverity[impact]++;
      }
      return {
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      };
    });

  return {
    passes: violations.length === 0,
    violations: violations as unknown as AccessibilityResult['violations'],
    violationsBySeverity,
    passedRules: axeResults.passes.map((p) => p.id),
    incompleteRules: axeResults.incomplete.map((i) => i.id),
    checkedAt: new Date(),
  };
}

// ============================================================================
// Browser Orchestrator Class
// ============================================================================

/**
 * Browser Orchestrator
 *
 * Manages browser client operations including launch, snapshot refresh,
 * screenshot capture, and cleanup. Abstracts differences between
 * agent-browser and Vibium clients.
 */
export class BrowserOrchestrator {
  private readonly client: VibiumClient | IBrowserClient;
  private readonly unifiedClient: UnifiedBrowserClient;
  private readonly useAgentBrowser: boolean;
  private readonly config: E2ERunnerConfig;
  private readonly log: (message: string) => void;

  constructor(
    client: VibiumClient | IBrowserClient,
    config: E2ERunnerConfig,
    logger: (message: string) => void
  ) {
    this.client = client;
    this.config = config;
    this.log = logger;

    // Use provided browser client from config if available
    this.unifiedClient = config.browserClient ?? client;

    // Determine if we're using agent-browser
    this.useAgentBrowser = isAgentBrowserClient(this.unifiedClient);
  }

  /**
   * Get the unified browser client
   */
  getClient(): UnifiedBrowserClient {
    return this.unifiedClient;
  }

  /**
   * Check if using agent-browser client
   */
  isUsingAgentBrowser(): boolean {
    return this.useAgentBrowser;
  }

  /**
   * Ensure browser is launched for the test case
   * Handles both agent-browser and Vibium clients
   */
  async ensureBrowserLaunched(testCase: E2ETestCase): Promise<string | null> {
    try {
      if (this.useAgentBrowser && isAgentBrowserClient(this.unifiedClient)) {
        const launchResult = await this.unifiedClient.launch({
          headless: true,
          viewport: testCase.viewport,
        });

        if (!launchResult.success) {
          return `Failed to launch browser: ${launchResult.error.message}`;
        }
        return null;
      } else if (isVibiumClient(this.client)) {
        const session = await this.client.getSession();
        if (!session) {
          const launchResult = await this.client.launch({
            headless: true,
            viewport: testCase.viewport,
            ...this.getBrowserContextOptions(testCase),
          });
          if (!launchResult.success) {
            return `Failed to launch browser: ${launchResult.error.message}`;
          }
        }
        return null;
      } else {
        const launchResult = await (this.unifiedClient as IBrowserClient).launch({
          headless: true,
          viewport: testCase.viewport,
        });
        if (!launchResult.success) {
          return `Failed to launch browser: ${launchResult.error.message}`;
        }
        return null;
      }
    } catch (error) {
      return toErrorMessage(error);
    }
  }

  /**
   * Refresh the page snapshot (agent-browser only)
   */
  async refreshSnapshot(): Promise<ParsedSnapshot | undefined> {
    if (!this.useAgentBrowser || !isAgentBrowserClient(this.unifiedClient)) {
      return undefined;
    }

    try {
      const snapshotResult = await this.unifiedClient.getSnapshot({ interactive: true });
      if (snapshotResult.success) {
        return snapshotResult.value;
      }
    } catch {
      this.log('Failed to refresh snapshot');
    }
    return undefined;
  }

  /**
   * Capture screenshot on failure
   */
  async captureFailureScreenshot(stepId: string): Promise<ScreenshotResult | null> {
    try {
      if (!isVibiumClient(this.unifiedClient)) {
        const browserClient = this.unifiedClient as IBrowserClient;
        const result = await browserClient.screenshot({ fullPage: true });
        if (result.success) {
          return toVibiumScreenshotResult(result.value);
        }
        return null;
      }

      const result = await (this.client as VibiumClient).screenshot({
        fullPage: true,
        format: 'png',
      });
      if (result.success) {
        return result.value;
      }
    } catch {
      this.log(`Failed to capture failure screenshot for step ${stepId}`);
    }
    return null;
  }

  /**
   * Check if element is visible (Vibium client)
   */
  async checkElementVisible(selector: string): Promise<boolean> {
    if (!isVibiumClient(this.client)) {
      return false;
    }
    const result = await this.client.findElement({
      selector,
      visible: true,
      timeout: 1000,
    });
    return result.success && result.value.visible;
  }

  /**
   * Check if element is enabled (Vibium client)
   */
  async checkElementEnabled(selector: string): Promise<boolean> {
    if (!isVibiumClient(this.client)) {
      return false;
    }
    const result = await this.client.findElement({ selector, timeout: 1000 });
    return result.success && result.value.enabled;
  }

  /**
   * Check element text against expected value (Vibium client)
   */
  async checkElementText(
    selector: string,
    expectedText: string,
    matchMode: 'exact' | 'contains' | 'regex'
  ): Promise<{ matches: boolean; actualText: string }> {
    if (!isVibiumClient(this.client)) {
      return { matches: false, actualText: '' };
    }
    const result = await this.client.getText(selector);
    if (!result.success) {
      return { matches: false, actualText: '' };
    }

    const actualText = result.value;
    let matches = false;

    switch (matchMode) {
      case 'exact':
        matches = actualText === expectedText;
        break;
      case 'contains':
        matches = actualText.includes(expectedText);
        break;
      case 'regex':
        matches = new RegExp(expectedText).test(actualText);
        break;
    }

    return { matches, actualText };
  }

  /**
   * Check element attribute against expected value (Vibium client)
   */
  async checkElementAttribute(
    selector: string,
    attributeName: string,
    expectedValue: string
  ): Promise<{ matches: boolean; actualValue: string }> {
    if (!isVibiumClient(this.client)) {
      return { matches: false, actualValue: '' };
    }
    const result = await this.client.getAttribute(selector, attributeName);
    if (!result.success) {
      return { matches: false, actualValue: '' };
    }

    return {
      matches: result.value === expectedValue,
      actualValue: result.value,
    };
  }

  /**
   * Scroll element into view (Vibium client)
   */
  async scrollIntoView(selector: string): Promise<void> {
    if (isVibiumClient(this.client)) {
      await this.client.findElement({ selector, visible: true });
    }
  }

  /**
   * Get browser context options from test case
   */
  private getBrowserContextOptions(testCase: E2ETestCase): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (testCase.browserContext?.userAgent) {
      options.userAgent = testCase.browserContext.userAgent;
    }
    if (testCase.browserContext?.locale) {
      options.locale = testCase.browserContext.locale;
    }
    if (testCase.browserContext?.timezoneId) {
      options.timezoneId = testCase.browserContext.timezoneId;
    }

    return options;
  }
}

/**
 * Create a browser orchestrator instance
 */
export function createBrowserOrchestrator(
  client: VibiumClient | IBrowserClient,
  config: E2ERunnerConfig,
  logger: (message: string) => void
): BrowserOrchestrator {
  return new BrowserOrchestrator(client, config, logger);
}
