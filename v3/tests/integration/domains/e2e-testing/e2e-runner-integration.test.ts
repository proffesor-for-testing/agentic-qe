/**
 * Integration Tests - E2E Test Runner Service
 *
 * Tests the full workflow of E2E test execution using the E2ETestRunnerService
 * with mocked VibiumClient to test step execution, suite execution, retry logic,
 * timeout handling, and error recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { E2ETestRunnerService } from '../../../../src/domains/test-execution/services/e2e-runner';
import type { VibiumClient } from '../../../../src/integrations/vibium/types';
import {
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createA11yCheckStep,
  createE2ETestCase,
  type E2ETestCase,
  type E2ETestSuite,
  E2EStepType,
} from '../../../../src/domains/test-execution/types/e2e-step.types';
import { ok, err } from '../../../../src/shared/types';

describe('E2E Test Runner Service Integration', () => {
  let runner: E2ETestRunnerService;
  let mockClient: VibiumClient;

  beforeEach(() => {
    // Create mock VibiumClient with all required methods
    mockClient = {
      // Health and Status
      isAvailable: vi.fn().mockResolvedValue(true),
      getHealth: vi.fn().mockResolvedValue({
        status: 'connected',
        features: ['navigation', 'interaction', 'screenshot', 'accessibility'],
        lastChecked: new Date(),
        sessionActive: true,
      }),
      getSession: vi.fn().mockResolvedValue({
        id: 'test-session-1',
        browserType: 'chromium',
        launchedAt: new Date(),
        status: 'connected',
        viewport: { width: 1280, height: 720 },
        headless: true,
      }),

      // Browser Lifecycle
      launch: vi.fn().mockResolvedValue(
        ok({
          id: 'test-session-1',
          browserType: 'chromium',
          launchedAt: new Date(),
          status: 'connected',
          viewport: { width: 1280, height: 720 },
          headless: true,
        })
      ),
      quit: vi.fn().mockResolvedValue(ok(undefined)),

      // Navigation
      navigate: vi.fn().mockResolvedValue(
        ok({
          url: 'https://example.com',
          statusCode: 200,
          title: 'Example Domain',
          durationMs: 150,
          success: true,
        })
      ),
      getPageInfo: vi.fn().mockResolvedValue(
        ok({
          url: 'https://example.com',
          title: 'Example Domain',
          viewport: { width: 1280, height: 720 },
          loadState: 'loaded',
        })
      ),
      goBack: vi.fn().mockResolvedValue(ok(undefined)),
      goForward: vi.fn().mockResolvedValue(ok(undefined)),
      reload: vi.fn().mockResolvedValue(ok(undefined)),

      // Element Interaction
      findElement: vi.fn().mockResolvedValue(
        ok({
          selector: '#test',
          tagName: 'button',
          textContent: 'Click Me',
          attributes: {},
          visible: true,
          enabled: true,
        })
      ),
      findElements: vi.fn().mockResolvedValue(ok([])),
      click: vi.fn().mockResolvedValue(
        ok({
          success: true,
          durationMs: 50,
          element: {
            selector: '#test',
            tagName: 'button',
            textContent: 'Click Me',
            attributes: {},
            visible: true,
            enabled: true,
          },
        })
      ),
      type: vi.fn().mockResolvedValue(
        ok({
          success: true,
          durationMs: 100,
        })
      ),
      getText: vi.fn().mockResolvedValue(ok('Expected Text')),
      getAttribute: vi.fn().mockResolvedValue(ok('attribute-value')),
      waitForElement: vi.fn().mockResolvedValue(
        ok({
          selector: '#test',
          tagName: 'div',
          textContent: 'Content',
          attributes: {},
          visible: true,
          enabled: true,
        })
      ),

      // Screenshots and Visual
      screenshot: vi.fn().mockResolvedValue(
        ok({
          base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          format: 'png',
          dimensions: { width: 1280, height: 720 },
          sizeBytes: 1024,
          capturedAt: new Date(),
        })
      ),
      compareScreenshots: vi.fn().mockResolvedValue(
        ok({
          matches: true,
          differencePercent: 0,
          diffRegions: [],
          comparedAt: new Date(),
        })
      ),

      // Accessibility
      checkAccessibility: vi.fn().mockResolvedValue(
        ok({
          passes: true,
          violations: [],
          violationsBySeverity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
          passedRules: ['color-contrast', 'image-alt'],
          incompleteRules: [],
          checkedAt: new Date(),
        })
      ),

      // Lifecycle
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    // Create E2E runner with mock client
    runner = new E2ETestRunnerService(mockClient, {
      verbose: false,
      defaultStepTimeout: 5000,
      defaultRetries: 1,
      screenshotOnFailure: false, // Disable for most tests
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Step Execution', () => {
    describe('Navigate Step', () => {
      it('should execute navigate step successfully', async () => {
        const testCase = createE2ETestCase(
          'nav-test-1',
          'Navigate Test',
          'https://example.com',
          [createNavigateStep('https://example.com/login', 'Navigate to login page')]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.status).toBe('passed');
        expect(result.stepResults).toHaveLength(1);
        expect(result.stepResults[0].success).toBe(true);
        expect(result.stepResults[0].stepType).toBe(E2EStepType.NAVIGATE);
        expect(mockClient.navigate).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://example.com/login',
          })
        );
      });

      it('should resolve relative URLs with baseUrl', async () => {
        const testCase = createE2ETestCase(
          'nav-test-2',
          'Relative URL Test',
          'https://example.com',
          [createNavigateStep('/dashboard', 'Navigate to dashboard')]
        );

        await runner.runTestCase(testCase);

        expect(mockClient.navigate).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://example.com/dashboard',
          })
        );
      });

      it('should handle navigation failure', async () => {
        mockClient.navigate = vi.fn().mockResolvedValue(
          err(new Error('Navigation failed: 404'))
        );

        const testCase = createE2ETestCase(
          'nav-test-3',
          'Failed Navigation',
          'https://example.com',
          [createNavigateStep('https://example.com/notfound', 'Navigate to 404 page')]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.stepResults[0].success).toBe(false);
        expect(result.stepResults[0].error?.message).toContain('Navigation failed');
      });
    });

    describe('Click Step', () => {
      it('should execute click step successfully', async () => {
        const testCase = createE2ETestCase(
          'click-test-1',
          'Click Test',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createClickStep('#submit-btn', 'Click submit button'),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults).toHaveLength(2);
        expect(result.stepResults[1].success).toBe(true);
        expect(result.stepResults[1].stepType).toBe(E2EStepType.CLICK);
        expect(mockClient.click).toHaveBeenCalledWith(
          expect.objectContaining({
            selector: '#submit-btn',
          })
        );
      });

      it('should handle click with options', async () => {
        const testCase = createE2ETestCase(
          'click-test-2',
          'Click with Options',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createClickStep('#menu', 'Right click menu', {
              options: {
                button: 'right',
                clickCount: 2,
              },
            }),
          ]
        );

        await runner.runTestCase(testCase);

        expect(mockClient.click).toHaveBeenCalledWith(
          expect.objectContaining({
            selector: '#menu',
            button: 'right',
            clickCount: 2,
          })
        );
      });

      it('should handle element not found', async () => {
        mockClient.click = vi.fn().mockResolvedValue(
          err(new Error('Element not found: #missing'))
        );

        const testCase = createE2ETestCase(
          'click-test-3',
          'Missing Element',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createClickStep('#missing', 'Click missing element'),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(false);
        expect(result.stepResults[1].success).toBe(false);
        expect(result.stepResults[1].error?.message).toContain('Element not found');
      });
    });

    describe('Type Step', () => {
      it('should execute type step successfully', async () => {
        const testCase = createE2ETestCase(
          'type-test-1',
          'Type Test',
          'https://example.com',
          [
            createNavigateStep('https://example.com/login', 'Navigate'),
            createTypeStep('#username', 'testuser', 'Enter username'),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults).toHaveLength(2);
        expect(result.stepResults[1].success).toBe(true);
        expect(result.stepResults[1].stepType).toBe(E2EStepType.TYPE);
        expect(mockClient.type).toHaveBeenCalledWith(
          expect.objectContaining({
            selector: '#username',
            text: 'testuser',
          })
        );
      });

      it('should mask sensitive data in results', async () => {
        const testCase = createE2ETestCase(
          'type-test-2',
          'Sensitive Data',
          'https://example.com',
          [
            createNavigateStep('https://example.com/login', 'Navigate'),
            createTypeStep('#password', 'secret123', 'Enter password', {
              options: { sensitive: true, clear: true },
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].data?.elementText).toBe('[MASKED]');
        expect(mockClient.type).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'secret123',
            clear: true,
          })
        );
      });
    });

    describe('Wait Step', () => {
      it('should wait for element to be visible', async () => {
        const testCase = createE2ETestCase(
          'wait-test-1',
          'Wait Test',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createWaitStep('element-visible', 'Wait for spinner to disappear', {}, {
              target: '#loading-spinner',
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
        expect(result.stepResults[1].stepType).toBe(E2EStepType.WAIT);
      });

      it('should wait for URL match', async () => {
        mockClient.getPageInfo = vi
          .fn()
          .mockResolvedValueOnce(
            ok({
              url: 'https://example.com',
              title: 'Example',
              viewport: { width: 1280, height: 720 },
              loadState: 'loaded',
            })
          )
          .mockResolvedValueOnce(
            ok({
              url: 'https://example.com/dashboard',
              title: 'Dashboard',
              viewport: { width: 1280, height: 720 },
              loadState: 'loaded',
            })
          );

        const testCase = createE2ETestCase(
          'wait-test-2',
          'Wait for URL',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createWaitStep(
              'url-match',
              'Wait for dashboard URL',
              { urlPattern: 'dashboard' },
              {}
            ),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
      });
    });

    describe('Assert Step', () => {
      it('should assert element exists', async () => {
        const testCase = createE2ETestCase(
          'assert-test-1',
          'Assert Element Exists',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createAssertStep('element-exists', 'Verify title exists', {}, {
              target: 'h1',
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
        expect(result.stepResults[1].stepType).toBe(E2EStepType.ASSERT);
      });

      it('should assert element text contains expected value', async () => {
        mockClient.getText = vi.fn().mockResolvedValue(ok('Welcome to Example Domain'));

        const testCase = createE2ETestCase(
          'assert-test-2',
          'Assert Text',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createAssertStep(
              'element-text',
              'Verify welcome message',
              { expected: 'Welcome', operator: 'contains' },
              { target: '.welcome' }
            ),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
        expect(mockClient.getText).toHaveBeenCalledWith('.welcome');
      });

      it('should fail when assertion does not match', async () => {
        mockClient.getText = vi.fn().mockResolvedValue(ok('Actual Text'));

        const testCase = createE2ETestCase(
          'assert-test-3',
          'Failed Assertion',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createAssertStep(
              'element-text',
              'Verify text',
              { expected: 'Expected Text', operator: 'eq' },
              { target: '#text' }
            ),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.stepResults[1].success).toBe(false);
        expect(result.stepResults[1].error?.code).toBe('ASSERTION_FAILED');
      });

      it('should assert URL contains expected path', async () => {
        mockClient.getPageInfo = vi.fn().mockResolvedValue(
          ok({
            url: 'https://example.com/dashboard',
            title: 'Dashboard',
            viewport: { width: 1280, height: 720 },
            loadState: 'loaded',
          })
        );

        const testCase = createE2ETestCase(
          'assert-test-4',
          'Assert URL',
          'https://example.com',
          [
            createNavigateStep('https://example.com/dashboard', 'Navigate'),
            createAssertStep('url-contains', 'Verify URL contains dashboard', {
              expected: 'dashboard',
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
      });
    });

    describe('Screenshot Step', () => {
      it('should capture screenshot successfully', async () => {
        const testCase = createE2ETestCase(
          'screenshot-test-1',
          'Screenshot Test',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createScreenshotStep('Capture homepage', {
              options: { fullPage: true },
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
        expect(result.stepResults[1].stepType).toBe(E2EStepType.SCREENSHOT);
        expect(result.stepResults[1].screenshot).toBeDefined();
        expect(mockClient.screenshot).toHaveBeenCalledWith(
          expect.objectContaining({ fullPage: true })
        );
      });

      it('should capture element screenshot', async () => {
        const testCase = createE2ETestCase(
          'screenshot-test-2',
          'Element Screenshot',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createScreenshotStep('Capture header', {
              target: 'header',
              options: { format: 'png' },
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(mockClient.screenshot).toHaveBeenCalledWith(
          expect.objectContaining({
            selector: 'header',
            format: 'png',
          })
        );
      });
    });

    describe('Accessibility Check Step', () => {
      it('should pass accessibility check with no violations', async () => {
        const testCase = createE2ETestCase(
          'a11y-test-1',
          'Accessibility Test',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createA11yCheckStep('Check accessibility', {
              wcagLevel: 'AA',
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(true);
        expect(result.stepResults[1].success).toBe(true);
        expect(result.stepResults[1].stepType).toBe(E2EStepType.A11Y_CHECK);
        expect(result.stepResults[1].accessibilityResult).toBeDefined();
        expect(result.stepResults[1].accessibilityResult?.passes).toBe(true);
      });

      it('should fail when violations exceed threshold', async () => {
        mockClient.checkAccessibility = vi.fn().mockResolvedValue(
          ok({
            passes: false,
            violations: [
              {
                id: 'color-contrast',
                rule: 'color-contrast',
                impact: 'high',
                description: 'Elements must have sufficient color contrast',
                help: 'Ensure color contrast meets WCAG AA',
                nodes: [
                  {
                    selector: '.text',
                    html: '<div class="text">Low contrast</div>',
                    target: ['.text'],
                    failureSummary: 'Contrast ratio is 2.5:1',
                  },
                ],
              },
            ],
            violationsBySeverity: {
              critical: 0,
              high: 1,
              medium: 0,
              low: 0,
              info: 0,
            },
            passedRules: [],
            incompleteRules: [],
            checkedAt: new Date(),
          })
        );

        const testCase = createE2ETestCase(
          'a11y-test-2',
          'Failed Accessibility',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createA11yCheckStep('Check accessibility', {
              wcagLevel: 'AA',
              failOnSeverity: 'high',
            }),
          ]
        );

        const result = await runner.runTestCase(testCase);

        expect(result.success).toBe(false);
        expect(result.stepResults[1].success).toBe(false);
        expect(result.stepResults[1].error?.code).toBe('ASSERTION_FAILED');
        expect(result.stepResults[1].error?.message).toContain('violations');
      });

      it('should check specific element for accessibility', async () => {
        const testCase = createE2ETestCase(
          'a11y-test-3',
          'Element Accessibility',
          'https://example.com',
          [
            createNavigateStep('https://example.com', 'Navigate'),
            createA11yCheckStep('Check form accessibility', {
              wcagLevel: 'AA',
            }, {
              target: 'form#contact',
            }),
          ]
        );

        await runner.runTestCase(testCase);

        expect(mockClient.checkAccessibility).toHaveBeenCalledWith(
          expect.objectContaining({
            selector: 'form#contact',
            wcagLevel: 'AA',
          })
        );
      });
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed steps according to retry count', async () => {
      let attemptCount = 0;
      mockClient.click = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.resolve(err(new Error('Temporary failure')));
        }
        return Promise.resolve(
          ok({
            success: true,
            durationMs: 50,
          })
        );
      });

      const testCase = createE2ETestCase(
        'retry-test-1',
        'Retry Test',
        'https://example.com',
        [
          createNavigateStep('https://example.com', 'Navigate'),
          createClickStep('#flaky-button', 'Click flaky button', {
            retries: 3,
          }),
        ]
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(true);
      expect(result.stepResults[1].success).toBe(true);
      expect(result.stepResults[1].retryInfo?.attempts).toBe(3);
      expect(mockClient.click).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting all retries', async () => {
      mockClient.click = vi.fn().mockResolvedValue(err(new Error('Persistent failure')));

      const testCase = createE2ETestCase(
        'retry-test-2',
        'Exhausted Retries',
        'https://example.com',
        [
          createNavigateStep('https://example.com', 'Navigate'),
          createClickStep('#broken-button', 'Click broken button', {
            retries: 2,
          }),
        ]
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
      expect(result.stepResults[1].success).toBe(false);
      expect(result.stepResults[1].retryInfo?.attempts).toBe(3); // Initial + 2 retries
      expect(mockClient.click).toHaveBeenCalledTimes(3);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout step that exceeds timeout duration', async () => {
      mockClient.click = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(ok({ success: true, durationMs: 6000 })), 6000);
          })
      );

      const testCase = createE2ETestCase(
        'timeout-test-1',
        'Timeout Test',
        'https://example.com',
        [
          createNavigateStep('https://example.com', 'Navigate'),
          createClickStep('#slow-button', 'Click slow button', {
            timeout: 1000, // 1 second timeout
            retries: 0, // No retries for faster test
          }),
        ]
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
      expect(result.stepResults[1].success).toBe(false);
      expect(result.stepResults[1].error?.code).toBe('STEP_TIMEOUT');
    });

    it('should use default timeout when step timeout not specified', async () => {
      const testCase = createE2ETestCase(
        'timeout-test-2',
        'Default Timeout',
        'https://example.com',
        [
          createNavigateStep('https://example.com', 'Navigate'),
          createClickStep('#button', 'Click button'),
        ]
      );

      await runner.runTestCase(testCase);

      expect(mockClient.click).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000, // Default from runner config
        })
      );
    });
  });

  describe('Test Suite Execution', () => {
    describe('Sequential Execution', () => {
      it('should execute test cases sequentially', async () => {
        const suite: E2ETestSuite = {
          id: 'suite-1',
          name: 'Sequential Suite',
          description: 'Tests executed in sequence',
          testCases: [
            createE2ETestCase('test-1', 'Test 1', 'https://example.com', [
              createNavigateStep('https://example.com', 'Navigate'),
            ]),
            createE2ETestCase('test-2', 'Test 2', 'https://example.com', [
              createNavigateStep('https://example.com/about', 'Navigate to about'),
            ]),
            createE2ETestCase('test-3', 'Test 3', 'https://example.com', [
              createNavigateStep('https://example.com/contact', 'Navigate to contact'),
            ]),
          ],
          parallel: false,
        };

        const result = await runner.runTestSuite(suite, 'sequential');

        expect(result.success).toBe(true);
        expect(result.testResults).toHaveLength(3);
        expect(result.summary.total).toBe(3);
        expect(result.summary.passed).toBe(3);
        expect(result.summary.failed).toBe(0);
        expect(result.summary.skipped).toBe(0);
      });

      it('should continue execution after test failure in sequential mode', async () => {
        mockClient.navigate = vi
          .fn()
          .mockResolvedValueOnce(
            ok({
              url: 'https://example.com',
              statusCode: 200,
              title: 'Example',
              durationMs: 100,
              success: true,
            })
          )
          .mockResolvedValueOnce(err(new Error('Navigation failed')))
          .mockResolvedValueOnce(
            ok({
              url: 'https://example.com/contact',
              statusCode: 200,
              title: 'Contact',
              durationMs: 100,
              success: true,
            })
          );

        const suite: E2ETestSuite = {
          id: 'suite-2',
          name: 'Mixed Results Suite',
          description: 'Suite with passing and failing tests',
          testCases: [
            createE2ETestCase('test-1', 'Test 1', 'https://example.com', [
              createNavigateStep('https://example.com', 'Navigate'),
            ]),
            createE2ETestCase('test-2', 'Test 2', 'https://example.com', [
              createNavigateStep('https://example.com/about', 'Navigate to about'),
            ]),
            createE2ETestCase('test-3', 'Test 3', 'https://example.com', [
              createNavigateStep('https://example.com/contact', 'Navigate to contact'),
            ]),
          ],
          parallel: false,
        };

        const result = await runner.runTestSuite(suite, 'sequential');

        expect(result.success).toBe(false);
        expect(result.testResults).toHaveLength(3);
        expect(result.summary.passed).toBe(2);
        expect(result.summary.failed).toBe(1);
      });
    });

    describe('Parallel Execution', () => {
      it('should execute test cases in parallel', async () => {
        const suite: E2ETestSuite = {
          id: 'suite-3',
          name: 'Parallel Suite',
          description: 'Tests executed in parallel',
          testCases: [
            createE2ETestCase('test-1', 'Test 1', 'https://example.com', [
              createNavigateStep('https://example.com', 'Navigate'),
            ]),
            createE2ETestCase('test-2', 'Test 2', 'https://example.com', [
              createNavigateStep('https://example.com/about', 'Navigate to about'),
            ]),
            createE2ETestCase('test-3', 'Test 3', 'https://example.com', [
              createNavigateStep('https://example.com/contact', 'Navigate to contact'),
            ]),
          ],
          parallel: true,
          maxWorkers: 3,
        };

        const result = await runner.runTestSuite(suite, 'parallel');

        expect(result.success).toBe(true);
        expect(result.testResults).toHaveLength(3);
        expect(result.summary.passed).toBe(3);
      });

      it('should respect maxWorkers limit', async () => {
        const suite: E2ETestSuite = {
          id: 'suite-4',
          name: 'Limited Parallel Suite',
          description: 'Tests with worker limit',
          testCases: Array.from({ length: 10 }, (_, i) =>
            createE2ETestCase(`test-${i + 1}`, `Test ${i + 1}`, 'https://example.com', [
              createNavigateStep('https://example.com', 'Navigate'),
            ])
          ),
          parallel: true,
          maxWorkers: 2,
        };

        const result = await runner.runTestSuite(suite, 'parallel');

        expect(result.success).toBe(true);
        expect(result.testResults).toHaveLength(10);
        expect(result.summary.total).toBe(10);
      });
    });

    describe('Test Filtering', () => {
      it('should only run tests marked with "only" flag', async () => {
        const suite: E2ETestSuite = {
          id: 'suite-5',
          name: 'Filtered Suite',
          description: 'Suite with only flag',
          testCases: [
            createE2ETestCase('test-1', 'Test 1', 'https://example.com', [
              createNavigateStep('https://example.com', 'Navigate'),
            ]),
            createE2ETestCase(
              'test-2',
              'Test 2',
              'https://example.com',
              [createNavigateStep('https://example.com/about', 'Navigate to about')],
              { only: true }
            ),
            createE2ETestCase('test-3', 'Test 3', 'https://example.com', [
              createNavigateStep('https://example.com/contact', 'Navigate to contact'),
            ]),
          ],
        };

        const result = await runner.runTestSuite(suite);

        expect(result.testResults).toHaveLength(1);
        expect(result.testResults[0].testCaseId).toBe('test-2');
      });

      it('should skip tests marked with skip flag', async () => {
        const testCase = createE2ETestCase(
          'skip-test',
          'Skipped Test',
          'https://example.com',
          [createNavigateStep('https://example.com', 'Navigate')],
          { skip: true }
        );

        const result = await runner.runTestCase(testCase);

        expect(result.status).toBe('skipped');
        expect(result.success).toBe(true);
        expect(result.stepResults).toHaveLength(0);
        expect(mockClient.navigate).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle browser launch failure', async () => {
      mockClient.getSession = vi.fn().mockResolvedValue(null);
      mockClient.launch = vi.fn().mockResolvedValue(err(new Error('Browser launch failed')));

      const testCase = createE2ETestCase('error-test-1', 'Launch Error', 'https://example.com', [
        createNavigateStep('https://example.com', 'Navigate'),
      ]);

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.errorSummary?.errorMessage).toContain('Failed to launch browser');
    });

    it('should validate required environment variables', async () => {
      const originalEnv = process.env.TEST_API_KEY;
      delete process.env.TEST_API_KEY;

      const testCase = createE2ETestCase(
        'error-test-2',
        'Missing Env Var',
        'https://example.com',
        [createNavigateStep('https://example.com', 'Navigate')],
        { requiredEnvVars: ['TEST_API_KEY'] }
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.errorSummary?.errorMessage).toContain('Missing required environment variables');

      // Restore
      if (originalEnv) process.env.TEST_API_KEY = originalEnv;
    });

    it('should continue on failure when continueOnFailure is true', async () => {
      mockClient.click = vi.fn().mockResolvedValue(err(new Error('Click failed')));

      const testCase = createE2ETestCase('error-test-3', 'Continue on Failure', 'https://example.com', [
        createNavigateStep('https://example.com', 'Navigate'),
        createClickStep('#optional-button', 'Optional click', {
          required: true,
          continueOnFailure: true,
        }),
        createAssertStep('url-equals', 'Verify URL', {
          expected: 'https://example.com',
        }),
      ]);

      const result = await runner.runTestCase(testCase);

      expect(result.stepResults).toHaveLength(3);
      expect(result.stepResults[1].success).toBe(false);
      expect(result.stepResults[2].success).toBe(true);
      expect(result.status).toBe('passed'); // Overall still passes
    });

    it('should stop on first failure when stopOnFirstFailure is enabled', async () => {
      const failingRunner = new E2ETestRunnerService(mockClient, {
        stopOnFirstFailure: true,
        defaultRetries: 0,
      });

      mockClient.click = vi.fn().mockResolvedValue(err(new Error('Click failed')));

      const testCase = createE2ETestCase('error-test-4', 'Stop on Failure', 'https://example.com', [
        createNavigateStep('https://example.com', 'Navigate'),
        createClickStep('#failing-button', 'Failing click', { required: true }),
        createAssertStep('url-equals', 'This should not run', {
          expected: 'https://example.com',
        }),
      ]);

      const result = await failingRunner.runTestCase(testCase);

      expect(result.stepResults).toHaveLength(2); // Navigate + failed click
      expect(result.stepResults[1].success).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should handle unexpected errors gracefully', async () => {
      mockClient.navigate = vi.fn().mockRejectedValue(new Error('Unexpected error'));

      const testCase = createE2ETestCase('error-test-5', 'Unexpected Error', 'https://example.com', [
        createNavigateStep('https://example.com', 'Navigate'),
      ]);

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.stepResults[0].error).toBeDefined();
    });
  });

  describe('Test Hooks', () => {
    it('should execute beforeAll hooks before test steps', async () => {
      const executionOrder: string[] = [];

      mockClient.navigate = vi.fn().mockImplementation((opts) => {
        executionOrder.push(`navigate:${opts.url}`);
        return Promise.resolve(
          ok({
            url: opts.url,
            statusCode: 200,
            title: 'Page',
            durationMs: 100,
            success: true,
          })
        );
      });

      const testCase = createE2ETestCase(
        'hooks-test-1',
        'BeforeAll Hooks',
        'https://example.com',
        [createNavigateStep('/main', 'Navigate to main')],
        {
          hooks: {
            beforeAll: [createNavigateStep('/setup', 'Setup navigation')],
          },
        }
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual([
        'navigate:https://example.com/setup',
        'navigate:https://example.com/main',
      ]);
    });

    it('should execute afterAll hooks after test steps', async () => {
      const executionOrder: string[] = [];

      mockClient.navigate = vi.fn().mockImplementation((opts) => {
        executionOrder.push(`navigate:${opts.url}`);
        return Promise.resolve(
          ok({
            url: opts.url,
            statusCode: 200,
            title: 'Page',
            durationMs: 100,
            success: true,
          })
        );
      });

      const testCase = createE2ETestCase(
        'hooks-test-2',
        'AfterAll Hooks',
        'https://example.com',
        [createNavigateStep('/main', 'Navigate to main')],
        {
          hooks: {
            afterAll: [createNavigateStep('/cleanup', 'Cleanup navigation')],
          },
        }
      );

      const result = await runner.runTestCase(testCase);

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual([
        'navigate:https://example.com/main',
        'navigate:https://example.com/cleanup',
      ]);
    });
  });
});
