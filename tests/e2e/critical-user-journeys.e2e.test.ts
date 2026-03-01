/**
 * Critical User Journey E2E Tests
 *
 * These are the ONLY E2E tests that should run with real browsers.
 * They cover the critical user-facing behaviors:
 *
 * 1. Execute a test case → get pass/fail result
 * 2. Run accessibility audit → get violations report
 * 3. Handle failures gracefully → get error details
 *
 * All other browser-related tests should be unit/integration tests with mocks.
 *
 * NOTE: Automatically SKIPPED in CI environments.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  E2ETestRunnerService,
  createE2ETestRunnerServiceWithBrowserClient,
} from '../../src/domains/test-execution/services/e2e-runner';
import {
  createNavigateStep,
  createAssertStep,
  createWaitStep,
  createE2ETestCase,
} from '../../src/domains/test-execution/types';
import {
  AgentBrowserClient,
  cleanupAllBrowserProcesses,
} from '../../src/integrations/browser/agent-browser/client';

// ============================================================================
// Environment Detection
// ============================================================================

let agentBrowserAvailable = false;
try {
  const result = execSync('npx agent-browser --version 2>&1 || echo "not-found"', {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 10000,
  });
  agentBrowserAvailable = !result.includes('not-found') && !result.includes('ERR!');
} catch {
  agentBrowserAvailable = false;
}

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const shouldRun = !isCI && agentBrowserAvailable;

// ============================================================================
// Test Configuration
// ============================================================================

const BROWSER_TIMEOUT = 60000;
const TEST_URL = 'https://example.com';

// ============================================================================
// Critical User Journey Tests
// ============================================================================

const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('Critical User Journeys', () => {
  let browserClient: AgentBrowserClient;
  let runner: E2ETestRunnerService;

  beforeAll(async () => {
    browserClient = new AgentBrowserClient({
      sessionName: `e2e-critical-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
      headed: false,
    });

    runner = createE2ETestRunnerServiceWithBrowserClient(browserClient, {
      defaultStepTimeout: 30000,
      defaultRetries: 1,
      screenshotOnFailure: false,
      stopOnFirstFailure: false,
      verbose: false,
    });
  }, BROWSER_TIMEOUT);

  afterAll(async () => {
    try {
      await browserClient?.quit();
    } catch {
      // Ignore cleanup errors
    }
    await cleanupAllBrowserProcesses();
  }, 30000);

  // -------------------------------------------------------------------------
  // Journey 1: Execute a passing test case
  // -------------------------------------------------------------------------
  it('should execute a complete test case and return pass result', async () => {
    const testCase = createE2ETestCase({
      id: 'journey-1-pass',
      name: 'Complete passing test journey',
      steps: [
        createNavigateStep(TEST_URL),
        createWaitStep('element', { selector: 'h1', timeout: 10000 }),
        createAssertStep('text', { selector: 'h1', expected: 'Example Domain' }),
      ],
    });

    const result = await runner.runTestCase(testCase);

    // Critical assertions for user journey
    expect(result.status).toBe('passed');
    expect(result.stepResults).toHaveLength(3);
    expect(result.stepResults.every((s) => s.status === 'passed')).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
  }, BROWSER_TIMEOUT);

  // -------------------------------------------------------------------------
  // Journey 2: Execute a failing test case and get error details
  // -------------------------------------------------------------------------
  it('should execute a failing test case and return failure details', async () => {
    const testCase = createE2ETestCase({
      id: 'journey-2-fail',
      name: 'Test with intentional failure',
      steps: [
        createNavigateStep(TEST_URL),
        createAssertStep('text', { selector: 'h1', expected: 'Wrong Text That Does Not Exist' }),
      ],
    });

    const result = await runner.runTestCase(testCase);

    // Critical assertions for error handling
    expect(result.status).toBe('failed');
    expect(result.stepResults.some((s) => s.status === 'failed')).toBe(true);
    // Should have error information
    const failedStep = result.stepResults.find((s) => s.status === 'failed');
    expect(failedStep?.error).toBeDefined();
  }, BROWSER_TIMEOUT);

  // -------------------------------------------------------------------------
  // Journey 3: Execute a test suite with multiple cases
  // -------------------------------------------------------------------------
  it('should execute a test suite and aggregate results', async () => {
    const suite = {
      id: 'journey-3-suite',
      name: 'Multi-case test suite',
      testCases: [
        createE2ETestCase({
          id: 'suite-case-1',
          name: 'First case',
          steps: [
            createNavigateStep(TEST_URL),
            createAssertStep('visible', { selector: 'body' }),
          ],
        }),
        createE2ETestCase({
          id: 'suite-case-2',
          name: 'Second case',
          steps: [
            createNavigateStep(TEST_URL),
            createAssertStep('url', { expected: 'example.com' }),
          ],
        }),
      ],
    };

    const results = await runner.runTestSuite(suite);

    // Critical assertions for suite execution
    expect(results.suiteId).toBe('journey-3-suite');
    expect(results.testResults).toHaveLength(2);
    expect(results.summary.total).toBe(2);
    expect(results.summary.duration).toBeGreaterThan(0);
  }, BROWSER_TIMEOUT * 2);
});

// ============================================================================
// Availability Check (always runs)
// ============================================================================

describe('E2E Test Environment', () => {
  it('should report browser availability status', () => {
    if (!agentBrowserAvailable) {
      console.log('⚠️  agent-browser not available - E2E tests skipped');
    }
    if (isCI) {
      console.log('⚠️  CI environment detected - E2E tests skipped');
    }
    if (shouldRun) {
      console.log('✅ E2E tests will run');
    }

    // This test always passes - it's informational
    expect(typeof agentBrowserAvailable).toBe('boolean');
    expect(typeof isCI).toBe('boolean');
  });
});
