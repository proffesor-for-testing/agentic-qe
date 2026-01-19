/**
 * Browser Client Factory
 * Provides unified creation of browser clients with intelligent tool selection
 *
 * This factory enables seamless switching between browser automation tools:
 * - Vibium: MCP-native, real browser control via WebDriver BiDi
 * - agent-browser: CLI-based with snapshot refs (@e1, @e2)
 *
 * Tool Selection Logic:
 * - 'auto' preference: Check Vibium availability first (MCP-native), fallback to agent-browser
 * - Use case requirements: Some use cases require agent-browser features
 * - Explicit preference: User can specify preferred tool
 *
 * @example
 * ```typescript
 * // Auto-select best available tool
 * const client = await createBrowserClient();
 *
 * // For E2E testing (requires refs, sessions)
 * const e2eClient = await getBrowserClientForUseCase('e2e-testing');
 *
 * // Explicit agent-browser client
 * const agentClient = await createAgentBrowserClient();
 * ```
 */

import type {
  IBrowserClient,
  IAgentBrowserClient,
  BrowserUseCase,
  BrowserToolPreference,
} from './types';
import { BrowserUnavailableError } from './types';
import { AgentBrowserClient } from './agent-browser/client';

// ============================================================================
// Factory Options
// ============================================================================

/**
 * Options for creating a browser client
 */
export interface BrowserClientFactoryOptions {
  /** Tool preference: 'agent-browser', 'vibium', or 'auto' (default: 'auto') */
  preference?: BrowserToolPreference;
  /** Use case hint for intelligent tool selection */
  useCase?: BrowserUseCase;
}

// ============================================================================
// Availability Checks
// ============================================================================

/**
 * Check if Vibium MCP tool is available
 *
 * Vibium requires MCP server to be running and connected.
 * For now, this is a placeholder stub that returns false.
 * Will be implemented when Vibium integration is added.
 *
 * @returns Promise<boolean> True if Vibium is available
 */
export async function isVibiumAvailable(): Promise<boolean> {
  // TODO: Implement Vibium availability check
  // This would check if Vibium MCP server is connected and responsive
  // For now, return false as Vibium client is not yet implemented
  return false;
}

/**
 * Check if agent-browser CLI tool is available
 *
 * Checks if agent-browser is installed and accessible via CLI.
 *
 * @returns Promise<boolean> True if agent-browser is available
 */
export async function isAgentBrowserAvailable(): Promise<boolean> {
  try {
    const client = new AgentBrowserClient();
    return await client.isAvailable();
  } catch {
    return false;
  }
}

// ============================================================================
// Use Case Recommendations
// ============================================================================

/**
 * Use cases that require agent-browser specific features
 * These use cases need refs, sessions, mocking, or device emulation
 */
const AGENT_BROWSER_REQUIRED_USE_CASES: BrowserUseCase[] = [
  'e2e-testing',       // Requires refs and sessions
  'api-mocking',       // Only agent-browser supports network interception
  'responsive-testing', // Requires device emulation
  'auth-testing',      // Requires state persistence
];

/**
 * Use cases that can use either tool
 * Both Vibium and agent-browser support these capabilities
 */
const EITHER_TOOL_USE_CASES: BrowserUseCase[] = [
  'visual-regression', // Both capture screenshots
  'accessibility',     // Both can run accessibility checks
];

/**
 * Determine if a use case requires agent-browser
 *
 * @param useCase The use case to check
 * @returns True if agent-browser is required
 */
function requiresAgentBrowser(useCase: BrowserUseCase): boolean {
  return AGENT_BROWSER_REQUIRED_USE_CASES.includes(useCase);
}

// ============================================================================
// Placeholder Vibium Client
// ============================================================================

/**
 * Placeholder Vibium client stub
 * Returns unavailable for all operations until Vibium integration is implemented
 */
class VibiumClientStub implements IBrowserClient {
  readonly tool = 'vibium' as const;

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async launch() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async quit() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async navigate() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async reload() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async goBack() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async goForward() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async click() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async fill() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async getText() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async isVisible() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async screenshot() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async evaluate() {
    return {
      success: false as const,
      error: new BrowserUnavailableError('vibium', 'Vibium client not yet implemented'),
    };
  }

  async dispose(): Promise<void> {
    // No-op for stub
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a browser client with intelligent tool selection
 *
 * Selection logic:
 * 1. If use case requires agent-browser features, use agent-browser
 * 2. If explicit preference is set, try that tool first
 * 3. For 'auto' preference: try Vibium first (MCP-native), fallback to agent-browser
 *
 * @param options Factory options
 * @returns Promise<IBrowserClient> Browser client instance
 * @throws BrowserUnavailableError if no browser tool is available
 *
 * @example
 * ```typescript
 * // Auto-select
 * const client = await createBrowserClient();
 *
 * // With preference
 * const client = await createBrowserClient({ preference: 'agent-browser' });
 *
 * // With use case hint
 * const client = await createBrowserClient({ useCase: 'e2e-testing' });
 * ```
 */
export async function createBrowserClient(
  options: BrowserClientFactoryOptions = {}
): Promise<IBrowserClient> {
  const { preference = 'auto', useCase } = options;

  // If use case requires agent-browser, use it directly
  if (useCase && requiresAgentBrowser(useCase)) {
    return createAgentBrowserClient();
  }

  // Handle explicit preferences
  if (preference === 'agent-browser') {
    return createAgentBrowserClient();
  }

  if (preference === 'vibium') {
    const available = await isVibiumAvailable();
    if (available) {
      // TODO: Return real Vibium client when implemented
      return new VibiumClientStub();
    }
    throw new BrowserUnavailableError('vibium', 'Vibium is not available');
  }

  // Auto selection: prefer Vibium (MCP-native), fallback to agent-browser
  const vibiumAvailable = await isVibiumAvailable();
  if (vibiumAvailable) {
    // TODO: Return real Vibium client when implemented
    return new VibiumClientStub();
  }

  const agentBrowserAvailable = await isAgentBrowserAvailable();
  if (agentBrowserAvailable) {
    return createAgentBrowserClient();
  }

  // Fallback: return agent-browser client even if not fully available
  // It will return appropriate errors when used
  return createAgentBrowserClient();
}

/**
 * Create an agent-browser specific client
 *
 * Returns an IAgentBrowserClient with full agent-browser capabilities:
 * - Snapshot refs (@e1, @e2, etc.)
 * - Session management
 * - Network interception and API mocking
 * - Device emulation
 * - State persistence
 *
 * @returns Promise<IAgentBrowserClient> Agent-browser client instance
 *
 * @example
 * ```typescript
 * const client = await createAgentBrowserClient();
 *
 * // Use snapshot refs
 * const snapshot = await client.getSnapshot();
 * await client.click('@e1');
 *
 * // Mock API responses
 * await client.mockRoute('/api/users', { status: 200, body: [] });
 * ```
 */
export async function createAgentBrowserClient(): Promise<IAgentBrowserClient> {
  return new AgentBrowserClient();
}

/**
 * Get the best browser client for a specific use case
 *
 * Use case recommendations:
 * - 'e2e-testing': agent-browser (requires refs, sessions)
 * - 'visual-regression': Either tool (both capture screenshots)
 * - 'accessibility': Either tool (both run accessibility checks)
 * - 'api-mocking': agent-browser only (network interception)
 * - 'responsive-testing': agent-browser (device emulation)
 * - 'auth-testing': agent-browser (state persistence)
 *
 * @param useCase The intended use case
 * @returns Promise<IBrowserClient> Best client for the use case
 *
 * @example
 * ```typescript
 * // Get client for E2E testing
 * const e2eClient = await getBrowserClientForUseCase('e2e-testing');
 *
 * // Get client for accessibility testing
 * const a11yClient = await getBrowserClientForUseCase('accessibility');
 * ```
 */
export async function getBrowserClientForUseCase(
  useCase: BrowserUseCase
): Promise<IBrowserClient> {
  return createBrowserClient({ useCase });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get information about available browser tools
 *
 * @returns Promise<{ vibium: boolean; agentBrowser: boolean }> Availability status
 */
export async function getBrowserToolAvailability(): Promise<{
  vibium: boolean;
  agentBrowser: boolean;
}> {
  const [vibium, agentBrowser] = await Promise.all([
    isVibiumAvailable(),
    isAgentBrowserAvailable(),
  ]);

  return { vibium, agentBrowser };
}

/**
 * Get the recommended tool for a use case
 *
 * @param useCase The use case to check
 * @returns 'agent-browser' | 'vibium' | 'either' Recommendation
 */
export function getRecommendedToolForUseCase(
  useCase: BrowserUseCase
): 'agent-browser' | 'vibium' | 'either' {
  if (requiresAgentBrowser(useCase)) {
    return 'agent-browser';
  }
  if (EITHER_TOOL_USE_CASES.includes(useCase)) {
    return 'either';
  }
  // Default to either for any unknown use cases
  return 'either';
}
