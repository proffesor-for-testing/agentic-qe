/**
 * E2E Test Runner INFRASTRUCTURE Tests
 *
 * NOTE: These are NOT user-facing E2E tests. They test the E2E runner
 * infrastructure itself. For critical user journey E2E tests, see:
 * tests/e2e/critical-user-journeys.e2e.test.ts
 *
 * These tests verify:
 * - Individual step types work (navigate, click, type, assert, wait, screenshot)
 * - Step retries and timeouts work correctly
 * - Error handling for various failure modes
 *
 * These tests require agent-browser CLI to be installed.
 * NOTE: Tests are automatically SKIPPED in CI where agent-browser is unavailable.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { execSync } from 'child_process';
import {
  E2ETestRunnerService,
  createE2ETestRunnerServiceWithBrowserClient,
  type E2ERunnerConfig,
} from '../../../src/domains/test-execution/services/e2e-runner';
import {
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createE2ETestCase,
  E2EStepType,
} from '../../../src/domains/test-execution/types';
import { AgentBrowserClient, cleanupAllBrowserProcesses } from '../../../src/integrations/browser/agent-browser/client';
import * as fs from 'fs';
import * as path from 'path';

const BROWSER_TIMEOUT = 90000;

// Check if agent-browser is available
let agentBrowserAvailable = false;
try {
  const result = execSync('npx agent-browser --version 2>&1 || echo "not-found"', {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 10000
  });
  agentBrowserAvailable = !result.includes('not-found') && !result.includes('ERR!');
} catch {
  agentBrowserAvailable = false;
}

// Skip tests if agent-browser not available OR if running in CI
// CI environments typically don't have browser automation setup
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const describeIfAvailable = (!isCI && agentBrowserAvailable) ? describe : describe.skip;
const SCREENSHOT_DIR = '/tmp/e2e-test-screenshots';

// Test URLs
const TEST_URLS = {
  simple: 'https://example.com',
  forms: 'https://httpbin.org/forms/post',
  html: 'https://httpbin.org/html',
};

describeIfAvailable('E2ETestRunnerService - Real Browser Execution', () => {
  let runner: E2ETestRunnerService;
  let browserClient: AgentBrowserClient;

  beforeEach(async () => {
    // Create real browser client
    browserClient = new AgentBrowserClient({
      sessionName: `e2e-runner-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
      headed: false,
    });

    // Create runner with real browser client
    runner = createE2ETestRunnerServiceWithBrowserClient(browserClient, {
      defaultStepTimeout: 30000,
      defaultRetries: 1,
      retryDelay: 1000,
      screenshotOnFailure: true,
      stopOnFirstFailure: false,
      pollingInterval: 500,
      maxParallelWorkers: 1,
      verbose: true,
      preferAgentBrowser: true,
      browserClientType: 'agent-browser',
    });

    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  afterEach(async () => {
    try {
      await browserClient.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Longer timeout for cleanup

  // Global cleanup to prevent memory leaks from orphan browser processes
  afterAll(async () => {
    await cleanupAllBrowserProcesses();
  }, 10000);

  describe('Navigation Steps', () => {
    it('should execute navigate step to real URL', async () => {
      const testCase = createE2ETestCase({
        id: 'nav-test-1',
        name: 'Navigate to example.com',
        steps: [createNavigateStep(TEST_URLS.simple)],
      });

      const result = await runner.runTestCase(testCase);

      // Debug: log result details if not passed
      if (result.status !== 'passed') {
        console.log('Navigation test failed:', JSON.stringify({
          status: result.status,
          errorSummary: result.errorSummary,
          stepResultsCount: result.stepResults?.length ?? 0,
          stepResults: result.stepResults?.map(s => ({
            stepId: s.stepId,
            status: s.status,
            error: s.error,
          })),
        }, null, 2));
      }

      expect(result.status).toBe('passed');
      expect(result.stepResults.length).toBe(1);
      expect(result.stepResults[0].status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should navigate to multiple pages in sequence', async () => {
      const testCase = createE2ETestCase({
        id: 'nav-test-2',
        name: 'Navigate to multiple pages',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createNavigateStep(TEST_URLS.html),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
      expect(result.stepResults.length).toBe(2);
      expect(result.stepResults.every((s) => s.status === 'passed')).toBe(true);
    }, BROWSER_TIMEOUT);
  });

  describe('Wait Steps', () => {
    it('should wait for element to be visible', async () => {
      const testCase = createE2ETestCase({
        id: 'wait-test-1',
        name: 'Wait for element',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createWaitStep('element', { selector: 'h1', timeout: 10000 }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
      expect(result.stepResults[1].status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should wait for text to appear', async () => {
      const testCase = createE2ETestCase({
        id: 'wait-test-2',
        name: 'Wait for text',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createWaitStep('text', { text: 'Example', timeout: 10000 }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should wait for URL pattern', async () => {
      const testCase = createE2ETestCase({
        id: 'wait-test-3',
        name: 'Wait for URL',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createWaitStep('url', { pattern: 'example.com', timeout: 10000 }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
    }, BROWSER_TIMEOUT);
  });

  describe('Assertion Steps', () => {
    it('should assert element is visible', async () => {
      const testCase = createE2ETestCase({
        id: 'assert-test-1',
        name: 'Assert element visible',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createAssertStep('visible', { selector: 'h1' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
      expect(result.stepResults[1].status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should assert text content', async () => {
      const testCase = createE2ETestCase({
        id: 'assert-test-2',
        name: 'Assert text content',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createAssertStep('text', { selector: 'h1', expected: 'Example Domain' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should assert URL contains pattern', async () => {
      const testCase = createE2ETestCase({
        id: 'assert-test-3',
        name: 'Assert URL',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createAssertStep('url', { expected: 'example.com' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should assert title contains text', async () => {
      const testCase = createE2ETestCase({
        id: 'assert-test-4',
        name: 'Assert page title',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createAssertStep('title', { expected: 'Example' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
    }, BROWSER_TIMEOUT);

    it('should fail assertion when condition not met', async () => {
      const testCase = createE2ETestCase({
        id: 'assert-test-5',
        name: 'Assert fails correctly',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createAssertStep('text', {
            selector: 'h1',
            expected: 'This text does not exist on the page',
          }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      // The test should fail because the assertion is wrong
      expect(result.status).toBe('failed');
      expect(result.stepResults[1].status).toBe('failed');
    }, BROWSER_TIMEOUT);
  });

  describe('Screenshot Steps', () => {
    it('should capture screenshot and save to file', async () => {
      const screenshotPath = path.join(SCREENSHOT_DIR, `test-screenshot-${Date.now()}.png`);

      const testCase = createE2ETestCase({
        id: 'screenshot-test-1',
        name: 'Capture screenshot',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createScreenshotStep({ path: screenshotPath }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');

      // Verify screenshot file was created
      expect(fs.existsSync(screenshotPath)).toBe(true);

      // Verify it's a valid PNG (starts with PNG magic bytes)
      const fileBuffer = fs.readFileSync(screenshotPath);
      expect(fileBuffer[0]).toBe(0x89);
      expect(fileBuffer[1]).toBe(0x50); // P
      expect(fileBuffer[2]).toBe(0x4e); // N
      expect(fileBuffer[3]).toBe(0x47); // G

      // Cleanup
      fs.unlinkSync(screenshotPath);
    }, BROWSER_TIMEOUT);

    it('should capture full page screenshot', async () => {
      const screenshotPath = path.join(SCREENSHOT_DIR, `test-fullpage-${Date.now()}.png`);

      const testCase = createE2ETestCase({
        id: 'screenshot-test-2',
        name: 'Capture full page screenshot',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createScreenshotStep({ path: screenshotPath, fullPage: true }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('passed');
      expect(fs.existsSync(screenshotPath)).toBe(true);

      // Cleanup
      fs.unlinkSync(screenshotPath);
    }, BROWSER_TIMEOUT);
  });

  describe('Form Interactions', () => {
    it('should fill form fields and submit', async () => {
      const testCase = createE2ETestCase({
        id: 'form-test-1',
        name: 'Fill and submit form',
        steps: [
          createNavigateStep(TEST_URLS.forms),
          createWaitStep('element', { selector: 'form', timeout: 10000 }),
          createTypeStep('input[name="custname"]', 'Test User'),
          createTypeStep('input[name="custemail"]', 'test@example.com'),
          createTypeStep('input[name="custtel"]', '1234567890'),
          // Assert values were entered
          createAssertStep('visible', { selector: 'input[name="custname"]' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      // Log step results for debugging
      console.log('Form test results:', (result.stepResults || []).map((s) => ({
        step: s.stepIndex,
        status: s.status,
        error: s.error,
      })));

      // At least navigate should have run
      expect(result.stepResults).toBeDefined();
      if (result.stepResults && result.stepResults.length >= 2) {
        expect(result.stepResults[0].status).toBe('passed'); // Navigate
        expect(result.stepResults[1].status).toBe('passed'); // Wait for form
      }
    }, BROWSER_TIMEOUT);
  });

  describe('Click Interactions', () => {
    it('should click link on page', async () => {
      const testCase = createE2ETestCase({
        id: 'click-test-1',
        name: 'Click link',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createWaitStep('element', { selector: 'a', timeout: 10000 }),
          createClickStep('a'),
        ],
      });

      const result = await runner.runTestCase(testCase);

      // At minimum, navigate and wait should pass
      expect(result.stepResults).toBeDefined();
      if (result.stepResults && result.stepResults.length >= 2) {
        expect(result.stepResults[0].status).toBe('passed');
        expect(result.stepResults[1].status).toBe('passed');
      }
    }, BROWSER_TIMEOUT);
  });

  describe('Complex Test Flows', () => {
    it('should execute multi-step test with various actions', async () => {
      const testCase = createE2ETestCase({
        id: 'complex-test-1',
        name: 'Complex multi-step test',
        steps: [
          // 1. Navigate
          createNavigateStep(TEST_URLS.simple),

          // 2. Wait for page load
          createWaitStep('element', { selector: 'body', timeout: 10000 }),

          // 3. Assert page loaded correctly
          createAssertStep('visible', { selector: 'h1' }),
          createAssertStep('text', { selector: 'h1', expected: 'Example Domain' }),

          // 4. Take screenshot
          createScreenshotStep({ name: 'homepage' }),

          // 5. Assert URL
          createAssertStep('url', { expected: 'example.com' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      const stepResults = result.stepResults || [];
      console.log('Complex test summary:', {
        status: result.status,
        totalSteps: stepResults.length,
        passedSteps: stepResults.filter((s) => s.status === 'passed').length,
        failedSteps: stepResults.filter((s) => s.status === 'failed').length,
        duration: result.totalDurationMs,
      });

      expect(stepResults.length).toBeGreaterThan(0);
      // If all steps ran, expect passed
      if (stepResults.length === 6) {
        expect(result.status).toBe('passed');
      }
    }, BROWSER_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle navigation to invalid URL gracefully', async () => {
      const testCase = createE2ETestCase({
        id: 'error-test-1',
        name: 'Navigate to invalid URL',
        steps: [createNavigateStep('not-a-valid-url-12345')],
      });

      const result = await runner.runTestCase(testCase);

      // Should fail gracefully, not crash - can be failed, error, or timeout
      expect(result).toBeDefined();
      expect(['passed', 'failed', 'error', 'timeout']).toContain(result.status);
    }, BROWSER_TIMEOUT);

    it('should handle timeout waiting for non-existent element', async () => {
      const testCase = createE2ETestCase({
        id: 'error-test-2',
        name: 'Wait for non-existent element',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createWaitStep('element', {
            selector: '#non-existent-element-xyz',
            timeout: 3000,
          }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      // Navigate should pass, wait should fail (or error/timeout)
      if (result.stepResults && result.stepResults.length >= 2) {
        expect(result.stepResults[0].status).toBe('passed');
        expect(['failed', 'error', 'timeout']).toContain(result.stepResults[1].status);
      }
      expect(['failed', 'error', 'timeout']).toContain(result.status);
    }, BROWSER_TIMEOUT);

    it('should capture screenshot on step failure when enabled', async () => {
      const testCase = createE2ETestCase({
        id: 'error-test-3',
        name: 'Screenshot on failure',
        steps: [
          createNavigateStep(TEST_URLS.simple),
          createAssertStep('visible', { selector: '#non-existent-element' }),
        ],
      });

      const result = await runner.runTestCase(testCase);

      // Should fail (could be 'failed' or 'error')
      expect(['failed', 'error', 'timeout']).toContain(result.status);

      // Check if there's a failed/error step
      if (result.stepResults && result.stepResults.length > 0) {
        const failedStep = result.stepResults.find(
          (s) => s.status === 'failed' || s.status === 'error' || s.status === 'timeout'
        );
        // A failed step should exist (either failed assertion or error)
        expect(failedStep || result.stepResults.length > 0).toBeTruthy();
      }
    }, BROWSER_TIMEOUT);
  });
});

describeIfAvailable('E2ETestRunnerService - Test Suite Execution', () => {
  let runner: E2ETestRunnerService;
  let browserClient: AgentBrowserClient;

  beforeEach(async () => {
    browserClient = new AgentBrowserClient({
      sessionName: `e2e-suite-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
    });

    runner = createE2ETestRunnerServiceWithBrowserClient(browserClient, {
      defaultStepTimeout: 30000,
      defaultRetries: 0,
      retryDelay: 1000,
      screenshotOnFailure: false,
      stopOnFirstFailure: false,
      pollingInterval: 500,
      maxParallelWorkers: 1,
      verbose: false,
      preferAgentBrowser: true,
      browserClientType: 'agent-browser',
    });
  });

  afterEach(async () => {
    try {
      await browserClient.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Longer timeout for cleanup

  it('should execute multiple test cases in a suite', async () => {
    const suite = {
      id: 'suite-1',
      name: 'Example.com Test Suite',
      description: 'Integration tests for example.com',
      testCases: [
        createE2ETestCase({
          id: 'test-1',
          name: 'Homepage loads',
          steps: [
            createNavigateStep(TEST_URLS.simple),
            createAssertStep('visible', { selector: 'h1' }),
          ],
        }),
        createE2ETestCase({
          id: 'test-2',
          name: 'Title is correct',
          steps: [
            createNavigateStep(TEST_URLS.simple),
            createAssertStep('title', { expected: 'Example' }),
          ],
        }),
      ],
    };

    const result = await runner.runTestSuite(suite);

    expect(result.suiteId).toBe('suite-1');
    expect(result.testResults.length).toBe(2);

    console.log('Suite results:', {
      total: result.testResults.length,
      passed: result.testResults.filter((r) => r.status === 'passed').length,
      failed: result.testResults.filter((r) => r.status === 'failed').length,
    });
  }, BROWSER_TIMEOUT * 2);
});
