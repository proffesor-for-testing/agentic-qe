/**
 * Agentic QE v3 - E2E Test Runner Service Browser Integration Tests
 * Tests E2ETestRunnerService with mock browser client integration
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  E2ETestRunnerService,
  createE2ETestRunnerServiceWithBrowserClient,
  createAutoE2ETestRunnerService,
} from '../../../../src/domains/test-execution/services/e2e-runner';
import {
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createE2ETestCase,
} from '../../../../src/domains/test-execution/types';
import type {
  IAgentBrowserClient,
  BrowserSessionInfo,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  ParsedSnapshot,
  SnapshotElement,
  BrowserError,
} from '../../../../src/integrations/browser';
import { ok, err } from '../../../../src/shared/types';

/**
 * Create a mock IAgentBrowserClient with all required methods
 */
function createMockAgentBrowserClient(): IAgentBrowserClient {
  const mockSession: BrowserSessionInfo = {
    id: 'session-1',
    tool: 'agent-browser',
    status: 'active',
    createdAt: new Date(),
  };

  const mockNavigateResult: BrowserNavigateResult = {
    url: 'https://example.com',
    title: 'Example Page',
    success: true,
    durationMs: 100,
  };

  const mockSnapshotElements: SnapshotElement[] = [
    { ref: '@e1', role: 'button', name: 'Submit', text: 'Submit', depth: 2 },
    { ref: '@e2', role: 'textbox', name: 'Email', text: '', depth: 2 },
    { ref: '@e3', role: 'link', name: 'Home', text: 'Home', depth: 1 },
    { ref: '@e4', role: 'heading', name: 'Welcome', text: 'Welcome to Example', depth: 1 },
  ];

  const mockSnapshot: ParsedSnapshot = {
    url: 'https://example.com',
    title: 'Example Page',
    elements: mockSnapshotElements,
    interactiveElements: mockSnapshotElements.filter(e =>
      ['button', 'textbox', 'link'].includes(e.role)
    ),
    refMap: new Map(mockSnapshotElements.map(e => [e.ref, e])),
    timestamp: new Date(),
  };

  const mockScreenshotResult: BrowserScreenshotResult = {
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
    format: 'png',
    dimensions: { width: 1920, height: 1080 },
  };

  return {
    tool: 'agent-browser' as const,
    launch: vi.fn().mockResolvedValue(ok(mockSession)),
    quit: vi.fn().mockResolvedValue(ok(undefined)),
    isAvailable: vi.fn().mockResolvedValue(true),
    navigate: vi.fn().mockResolvedValue(ok(mockNavigateResult)),
    reload: vi.fn().mockResolvedValue(ok(undefined)),
    goBack: vi.fn().mockResolvedValue(ok(undefined)),
    goForward: vi.fn().mockResolvedValue(ok(undefined)),
    click: vi.fn().mockResolvedValue(ok(undefined)),
    fill: vi.fn().mockResolvedValue(ok(undefined)),
    getText: vi.fn().mockResolvedValue(ok('Welcome to Example')),
    isVisible: vi.fn().mockResolvedValue(ok(true)),
    screenshot: vi.fn().mockResolvedValue(ok(mockScreenshotResult)),
    evaluate: vi.fn().mockImplementation(async (script: string) => {
      // Handle common evaluation patterns
      if (script.includes('window.location.href')) {
        return ok('https://example.com/dashboard');
      }
      if (script.includes('document.title')) {
        return ok('Example Page');
      }
      if (script.includes('document.body.innerText.includes')) {
        return ok(true);
      }
      if (script.includes('axe.run')) {
        return ok(JSON.stringify({
          violations: [],
          passes: [{ id: 'button-name' }],
          incomplete: [],
          inapplicable: [],
        }));
      }
      return ok({});
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
    // Agent-browser specific methods
    getSnapshot: vi.fn().mockResolvedValue(ok(mockSnapshot)),
    createSession: vi.fn().mockResolvedValue(ok(mockSession)),
    switchSession: vi.fn().mockResolvedValue(ok(undefined)),
    listSessions: vi.fn().mockResolvedValue(ok([mockSession])),
    mockRoute: vi.fn().mockResolvedValue(ok(undefined)),
    abortRoute: vi.fn().mockResolvedValue(ok(undefined)),
    clearRoutes: vi.fn().mockResolvedValue(ok(undefined)),
    setDevice: vi.fn().mockResolvedValue(ok(undefined)),
    setViewport: vi.fn().mockResolvedValue(ok(undefined)),
    saveState: vi.fn().mockResolvedValue(ok(undefined)),
    loadState: vi.fn().mockResolvedValue(ok(undefined)),
    waitForElement: vi.fn().mockResolvedValue(ok(undefined)),
    waitForText: vi.fn().mockResolvedValue(ok(undefined)),
    waitForUrl: vi.fn().mockResolvedValue(ok(undefined)),
    waitForNetworkIdle: vi.fn().mockResolvedValue(ok(undefined)),
  };
}

/**
 * Create a mock browser error for testing error scenarios
 */
function createMockBrowserError(message: string, code: string): BrowserError {
  const error = new Error(message) as BrowserError;
  error.code = code;
  error.tool = 'agent-browser';
  return error;
}

describe('E2ETestRunnerService with Browser Client Integration', () => {
  let mockBrowserClient: IAgentBrowserClient;

  beforeEach(() => {
    mockBrowserClient = createMockAgentBrowserClient();
    vi.clearAllMocks();
  });

  describe('step execution with ElementTarget', () => {
    it('should execute navigate step', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      // createNavigateStep(url, description, options?)
      const testCase = createE2ETestCase(
        'test-navigate',
        'Navigate Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')]
      );

      await runner.runTestCase(testCase);

      expect(mockBrowserClient.launch).toHaveBeenCalled();
      expect(mockBrowserClient.navigate).toHaveBeenCalled();
    });

    it('should execute click step with CSS selector', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      // createClickStep(selector, description, options?)
      const testCase = createE2ETestCase(
        'test-css-selector',
        'CSS Selector Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createClickStep('.submit-button', 'Click submit button'),
        ]
      );

      await runner.runTestCase(testCase);

      expect(mockBrowserClient.click).toHaveBeenCalled();
    });

    it('should execute type step', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      // createTypeStep(selector, text, description, options?)
      const testCase = createE2ETestCase(
        'test-type',
        'Type Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createTypeStep('#email', 'test@example.com', 'Type email'),
        ]
      );

      await runner.runTestCase(testCase);

      expect(mockBrowserClient.fill).toHaveBeenCalled();
    });
  });

  describe('ref-based element selection (@e1, @e2)', () => {
    it('should handle @e1 ref selector in click step', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'test-ref-e1',
        'Ref E1 Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createClickStep('@e1', 'Click submit button via ref'),
        ]
      );

      await runner.runTestCase(testCase);

      // Verify click was called (selector conversion happens internally)
      expect(mockBrowserClient.click).toHaveBeenCalled();
    });

    it('should handle @e2 ref selector in type step', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'test-ref-e2',
        'Ref E2 Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createTypeStep('@e2', 'test@example.com', 'Type email via ref'),
        ]
      );

      await runner.runTestCase(testCase);

      expect(mockBrowserClient.fill).toHaveBeenCalled();
    });

    it('should get snapshot for ref-based element selection', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'test-snapshot-refresh',
        'Snapshot Refresh Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createClickStep('@e1', 'Click via ref'),
        ]
      );

      await runner.runTestCase(testCase);

      // getSnapshot should be called for ref-based selection
      expect(mockBrowserClient.getSnapshot).toHaveBeenCalled();
    });
  });

  describe('wait strategies', () => {
    it('should execute wait step for element-visible condition', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      // createWaitStep(condition, description, waitOptions, options?)
      const testCase = createE2ETestCase(
        'test-wait-element',
        'Wait Element Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createWaitStep('element-visible', 'Wait for content', {
            timeout: 5000,
          }, {
            target: '.loading-complete',
          }),
        ]
      );

      await runner.runTestCase(testCase);

      // Wait step should use waitForElement
      expect(mockBrowserClient.waitForElement).toHaveBeenCalled();
    });

    it('should execute wait step for network-idle condition', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'test-wait-network',
        'Wait Network Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createWaitStep('network-idle', 'Wait for network', {
            timeout: 5000,
          }),
        ]
      );

      await runner.runTestCase(testCase);

      // Wait for network idle
      expect(mockBrowserClient.waitForNetworkIdle).toHaveBeenCalled();
    });
  });

  describe('createE2ETestRunnerServiceWithBrowserClient factory', () => {
    it('should create runner with provided browser client', () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        screenshotOnFailure: true,
        verbose: false,
      });

      expect(runner).toBeDefined();
      expect(runner).toBeInstanceOf(E2ETestRunnerService);
    });

    it('should pass configuration to runner', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        defaultStepTimeout: 15000,
        defaultRetries: 3,
        screenshotOnFailure: false,
      });

      expect(runner).toBeDefined();

      // Execute a test to verify config is applied
      const testCase = createE2ETestCase(
        'config-test',
        'Config Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')]
      );

      await runner.runTestCase(testCase);
      expect(mockBrowserClient.launch).toHaveBeenCalled();
    });
  });

  describe('createAutoE2ETestRunnerService factory', () => {
    it('should be a function', () => {
      expect(createAutoE2ETestRunnerService).toBeDefined();
      expect(typeof createAutoE2ETestRunnerService).toBe('function');
    });
  });

  describe('browser client lifecycle', () => {
    it('should launch browser before executing test', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'lifecycle-test',
        'Lifecycle Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')]
      );

      await runner.runTestCase(testCase);

      expect(mockBrowserClient.launch).toHaveBeenCalled();
    });

    it('should handle launch failure gracefully', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.launch as Mock).mockResolvedValue(
        err(createMockBrowserError('Launch failed', 'LAUNCH_ERROR'))
      );

      const runner = createE2ETestRunnerServiceWithBrowserClient(failingClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'launch-fail-test',
        'Launch Fail Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')]
      );

      const result = await runner.runTestCase(testCase);

      // Result should indicate failure
      expect(result.success).toBe(false);
    });
  });

  describe('assertion steps', () => {
    it('should execute element-visible assertion', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      // createAssertStep(assertion, description, assertOptions, options?)
      const testCase = createE2ETestCase(
        'assert-visible-test',
        'Assert Visible Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createAssertStep('element-visible', 'Assert hero visible', {}, {
            target: '.hero-section',
          }),
        ]
      );

      await runner.runTestCase(testCase);

      // isVisible should be called for visibility assertion
      expect(mockBrowserClient.isVisible).toHaveBeenCalled();
    });

    it('should execute element-text assertion', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'assert-text-test',
        'Assert Text Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createAssertStep('element-text', 'Assert title text', {
            expected: 'Welcome to Example',
          }, {
            target: '.title',
          }),
        ]
      );

      await runner.runTestCase(testCase);

      // getText should be called for text assertion
      expect(mockBrowserClient.getText).toHaveBeenCalled();
    });

    it('should fail assertion when condition not met', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.isVisible as Mock).mockResolvedValue(ok(false));

      const runner = createE2ETestRunnerServiceWithBrowserClient(failingClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'assert-fail-test',
        'Assert Fail Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createAssertStep('element-visible', 'Assert element visible', {}, {
            target: '.nonexistent',
          }),
        ]
      );

      const result = await runner.runTestCase(testCase);

      // Result should indicate failure due to assertion
      expect(result.success).toBe(false);
    });
  });

  describe('screenshot on failure', () => {
    it('should capture screenshot when step fails', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.click as Mock).mockResolvedValue(
        err(createMockBrowserError('Click failed', 'CLICK_ERROR'))
      );

      const runner = createE2ETestRunnerServiceWithBrowserClient(failingClient, {
        screenshotOnFailure: true,
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'screenshot-fail-test',
        'Screenshot Fail Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createClickStep('.nonexistent', 'Click nonexistent button'),
        ]
      );

      await runner.runTestCase(testCase);

      // Screenshot should be attempted on failure
      expect(failingClient.screenshot).toHaveBeenCalled();
    });
  });

  describe('test suite execution', () => {
    it('should execute multiple test cases', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const suite = {
        id: 'suite-1',
        name: 'Test Suite',
        testCases: [
          createE2ETestCase(
            'test-1',
            'Test 1',
            'https://example.com',
            [createNavigateStep('/', 'Navigate to home')]
          ),
          createE2ETestCase(
            'test-2',
            'Test 2',
            'https://example.com',
            [createNavigateStep('/about', 'Navigate to about')]
          ),
        ],
      };

      const result = await runner.runTestSuite(suite, 'sequential');

      expect(result.testResults.length).toBe(2);
    });
  });

  describe('skipped tests', () => {
    it('should skip test when skip flag is true', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'skip-test',
        'Skipped Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')],
        { skip: true }
      );

      const result = await runner.runTestCase(testCase);

      expect(result.status).toBe('skipped');
    });
  });

  describe('browser configuration', () => {
    it('should pass viewport configuration to launch', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'viewport-test',
        'Viewport Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')],
        { viewport: { width: 1920, height: 1080 } }
      );

      await runner.runTestCase(testCase);

      // Launch should be called
      expect(mockBrowserClient.launch).toHaveBeenCalled();
    });
  });

  describe('navigation step handling', () => {
    it('should handle relative URLs by combining with baseUrl', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'nav-relative-test',
        'Navigation Relative Test',
        'https://example.com',
        [createNavigateStep('/about', 'Navigate to about')]
      );

      await runner.runTestCase(testCase);

      // Navigate should be called with full URL
      expect(mockBrowserClient.navigate).toHaveBeenCalledWith('https://example.com/about');
    });

    it('should handle absolute URLs directly', async () => {
      const runner = createE2ETestRunnerServiceWithBrowserClient(mockBrowserClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'nav-absolute-test',
        'Navigation Absolute Test',
        'https://example.com',
        [createNavigateStep('https://other.com/page', 'Navigate to other site')]
      );

      await runner.runTestCase(testCase);

      expect(mockBrowserClient.navigate).toHaveBeenCalledWith('https://other.com/page');
    });
  });

  describe('error handling', () => {
    it('should handle navigation failure', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.navigate as Mock).mockResolvedValue(
        err(createMockBrowserError('Navigation failed', 'NAV_ERROR'))
      );

      const runner = createE2ETestRunnerServiceWithBrowserClient(failingClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'nav-fail-test',
        'Navigation Fail Test',
        'https://example.com',
        [createNavigateStep('/', 'Navigate to home')]
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
    });

    it('should handle click failure', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.click as Mock).mockResolvedValue(
        err(createMockBrowserError('Click failed', 'CLICK_ERROR'))
      );

      const runner = createE2ETestRunnerServiceWithBrowserClient(failingClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'click-fail-test',
        'Click Fail Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createClickStep('.button', 'Click button'),
        ]
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
    });

    it('should handle type/fill failure', async () => {
      const failingClient = createMockAgentBrowserClient();
      (failingClient.fill as Mock).mockResolvedValue(
        err(createMockBrowserError('Fill failed', 'FILL_ERROR'))
      );

      const runner = createE2ETestRunnerServiceWithBrowserClient(failingClient, {
        verbose: false,
      });

      const testCase = createE2ETestCase(
        'type-fail-test',
        'Type Fail Test',
        'https://example.com',
        [
          createNavigateStep('/', 'Navigate to home'),
          createTypeStep('#input', 'test', 'Type into input'),
        ]
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
    });
  });
});
