/**
 * Agentic QE v3 - E2E Runner Types and Configuration
 *
 * Shared types, interfaces, configuration, and error classes
 * for the E2E test runner modular components.
 *
 * @module test-execution/services/e2e/types
 */

import type { VibiumClient, ScreenshotResult, AccessibilityResult } from '../../../../integrations/vibium';
import type {
  IBrowserClient,
  IAgentBrowserClient,
  ParsedSnapshot,
} from '../../../../integrations/browser';
import type { E2EStepResult, E2ETestCase } from '../../types';
import { E2E_CONSTANTS } from '../../../constants.js';

// ============================================================================
// Browser Client Types
// ============================================================================

/**
 * Browser client type for configuration
 */
export type BrowserClientType = 'vibium' | 'agent-browser' | 'auto';

/**
 * Unified browser client type - supports both IBrowserClient and legacy VibiumClient
 */
export type UnifiedBrowserClient = IBrowserClient | VibiumClient;

// ============================================================================
// Configuration
// ============================================================================

/**
 * E2E Test Runner configuration
 */
export interface E2ERunnerConfig {
  /** Default step timeout in milliseconds */
  defaultStepTimeout: number;
  /** Default retry count for steps */
  defaultRetries: number;
  /** Delay between retries in milliseconds */
  retryDelay: number;
  /** Capture screenshot on failure */
  screenshotOnFailure: boolean;
  /** Stop on first failure */
  stopOnFirstFailure: boolean;
  /** Default polling interval for wait conditions */
  pollingInterval: number;
  /** Maximum parallel workers for suite execution */
  maxParallelWorkers: number;
  /** Enable verbose logging */
  verbose: boolean;
  /**
   * Prefer agent-browser over Vibium for E2E testing
   * Agent-browser provides enhanced features: refs (@e1, @e2), sessions, mocking
   * @default true
   */
  preferAgentBrowser: boolean;
  /**
   * Browser client type preference
   * - 'vibium': Use Vibium (MCP-based)
   * - 'agent-browser': Use agent-browser (CLI-based with refs)
   * - 'auto': Auto-select based on availability and use case
   * @default 'auto'
   */
  browserClientType: BrowserClientType;
  /**
   * Pre-configured browser client instance
   * If provided, this client will be used instead of creating a new one
   * Useful for sharing browser instances across test suites
   */
  browserClient?: IBrowserClient;
}

/**
 * Default E2E runner configuration
 */
export const DEFAULT_E2E_RUNNER_CONFIG: E2ERunnerConfig = {
  defaultStepTimeout: E2E_CONSTANTS.DEFAULT_STEP_TIMEOUT_MS,
  defaultRetries: 2,
  retryDelay: E2E_CONSTANTS.RETRY_DELAY_MS,
  screenshotOnFailure: true,
  stopOnFirstFailure: false,
  pollingInterval: E2E_CONSTANTS.POLLING_INTERVAL_MS,
  maxParallelWorkers: 4,
  verbose: false,
  preferAgentBrowser: true,
  browserClientType: 'auto',
};

// ============================================================================
// Execution Strategy
// ============================================================================

/**
 * Test suite execution strategy
 */
export type ExecutionStrategy = 'sequential' | 'parallel';

// ============================================================================
// Step Execution Context
// ============================================================================

/**
 * Step execution context passed between modules
 */
export interface StepExecutionContext {
  /** Test case being executed */
  testCase: E2ETestCase;
  /** Base URL for the test */
  baseUrl: string;
  /** Variables available in the test */
  variables: Record<string, unknown>;
  /** Previous step results */
  previousResults: E2EStepResult[];
  /** Current page snapshot (agent-browser only) */
  currentSnapshot?: ParsedSnapshot;
  /** Whether to use agent-browser enhanced features */
  useAgentBrowser: boolean;
}

/**
 * Step execution data returned by executors
 */
export interface StepExecutionData {
  /** Data to include in step result */
  data?: E2EStepResult['data'];
  /** Screenshot captured during step */
  screenshot?: ScreenshotResult;
  /** Accessibility result (for a11y steps) */
  accessibilityResult?: AccessibilityResult;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * E2E Runner error class
 */
export class E2ERunnerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stepId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'E2ERunnerError';
  }
}

/**
 * Step timeout error
 */
export class StepTimeoutError extends E2ERunnerError {
  constructor(stepId: string, timeout: number, cause?: Error) {
    super(`Step "${stepId}" timed out after ${timeout}ms`, 'STEP_TIMEOUT', stepId, cause);
    this.name = 'StepTimeoutError';
  }
}

/**
 * Assertion failure error
 */
export class AssertionError extends E2ERunnerError {
  constructor(
    message: string,
    stepId: string,
    public readonly expected: unknown,
    public readonly actual: unknown,
    cause?: Error
  ) {
    super(message, 'ASSERTION_FAILED', stepId, cause);
    this.name = 'AssertionError';
  }
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * E2E Test Runner Service Interface
 */
export interface IE2ETestRunnerService {
  /**
   * Execute a single E2E test case
   * @param testCase - Test case to execute
   * @returns Promise resolving to test result
   */
  runTestCase(testCase: E2ETestCase): Promise<import('../../types').E2ETestResult>;

  /**
   * Execute an E2E test suite
   * @param suite - Test suite to execute
   * @param strategy - Execution strategy (sequential or parallel)
   * @returns Promise resolving to suite result
   */
  runTestSuite(
    suite: import('../../types').E2ETestSuite,
    strategy?: ExecutionStrategy
  ): Promise<import('../../types').E2ETestSuiteResult>;
}
