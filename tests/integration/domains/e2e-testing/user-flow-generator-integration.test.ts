/**
 * Integration Tests - User Flow Generator Service
 *
 * Tests the full workflow of user flow recording, generation from templates,
 * and code generation for different testing frameworks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserFlowGeneratorService } from '../../../../src/domains/test-execution/services/user-flow-generator';
import type { VibiumClient } from '../../../../src/integrations/vibium/types';
import {
  RecordedActionType,
  FlowCategory,
  FlowStatus,
  type RecordingSession,
  type UserFlow,
  type LoginFlowTemplate,
  type CheckoutFlowTemplate,
  type SearchFlowTemplate,
  type FormSubmissionFlowTemplate,
  type NavigationFlowTemplate,
} from '../../../../src/domains/test-execution/types/flow-templates.types';
import { E2EStepType } from '../../../../src/domains/test-execution/types/e2e-step.types';
import { ok, err } from '../../../../src/shared/types';

describe('User Flow Generator Service Integration', () => {
  let generator: UserFlowGeneratorService;
  let mockClient: VibiumClient;

  beforeEach(() => {
    // Create mock VibiumClient
    mockClient = {
      // Health and Status
      isAvailable: vi.fn().mockResolvedValue(true),
      getHealth: vi.fn().mockResolvedValue({
        status: 'connected',
        features: ['navigation', 'interaction', 'screenshot'],
        lastChecked: new Date(),
        sessionActive: true,
      }),
      getSession: vi.fn().mockResolvedValue(null),

      // Browser Lifecycle
      launch: vi.fn().mockResolvedValue(
        ok({
          id: 'recording-session-1',
          browserType: 'chromium',
          launchedAt: new Date(),
          status: 'connected',
          viewport: { width: 1280, height: 720 },
          headless: false,
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
      getText: vi.fn().mockResolvedValue(ok('Text')),
      getAttribute: vi.fn().mockResolvedValue(ok('value')),
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

      // Screenshots
      screenshot: vi.fn().mockResolvedValue(
        ok({
          base64:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
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
          passedRules: [],
          incompleteRules: [],
          checkedAt: new Date(),
        })
      ),

      // Lifecycle
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    // Create generator service
    generator = new UserFlowGeneratorService(mockClient, {
      maxActionsPerRecording: 100,
      captureScreenshots: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Recording Session Management', () => {
    describe('Start Recording', () => {
      it('should start a new recording session', async () => {
        const result = await generator.startRecording(
          'Login Flow',
          'https://example.com/login'
        );

        expect(result.success).toBe(true);
        if (result.success) {
          const session = result.value;
          expect(session.name).toBe('Login Flow');
          expect(session.baseUrl).toBe('https://example.com/login');
          expect(session.status).toBe(FlowStatus.RECORDING);
          expect(session.actions).toHaveLength(1); // Initial navigation
          expect(session.actions[0].type).toBe(RecordedActionType.NAVIGATE);
        }

        expect(mockClient.isAvailable).toHaveBeenCalled();
        expect(mockClient.launch).toHaveBeenCalled();
        expect(mockClient.navigate).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://example.com/login',
          })
        );
      });

      it('should fail when Vibium is unavailable', async () => {
        mockClient.isAvailable = vi.fn().mockResolvedValue(false);

        const result = await generator.startRecording('Test Flow', 'https://example.com');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('Vibium browser automation is not available');
        }
      });

      it('should fail when recording is already in progress', async () => {
        // Start first recording
        const firstResult = await generator.startRecording('First Flow', 'https://example.com');
        expect(firstResult.success).toBe(true);

        // Try to start second recording
        const secondResult = await generator.startRecording('Second Flow', 'https://example.com');

        expect(secondResult.success).toBe(false);
        if (!secondResult.success) {
          expect(secondResult.error.message).toContain('Recording already in progress');
        }
      });

      it('should use existing browser session if available', async () => {
        mockClient.getSession = vi.fn().mockResolvedValue({
          id: 'existing-session',
          browserType: 'chromium',
          launchedAt: new Date(),
          status: 'connected',
          viewport: { width: 1280, height: 720 },
          headless: false,
        });

        const result = await generator.startRecording('Test Flow', 'https://example.com');

        expect(result.success).toBe(true);
        expect(mockClient.launch).not.toHaveBeenCalled();
        expect(mockClient.navigate).toHaveBeenCalled();
      });
    });

    describe('Stop Recording', () => {
      it('should stop an active recording session', async () => {
        const startResult = await generator.startRecording('Test Flow', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const stopResult = await generator.stopRecording(sessionId);

          expect(stopResult.success).toBe(true);
          if (stopResult.success) {
            expect(stopResult.value.status).toBe(FlowStatus.COMPLETED);
            expect(stopResult.value.endedAt).toBeDefined();
          }
        }
      });

      it('should fail when session does not exist', async () => {
        const result = await generator.stopRecording('nonexistent-session');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('Recording session not found');
        }
      });

      it('should fail when session is not recording', async () => {
        const startResult = await generator.startRecording('Test Flow', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          // Stop once
          await generator.stopRecording(sessionId);

          // Try to stop again
          const secondStopResult = await generator.stopRecording(sessionId);

          expect(secondStopResult.success).toBe(false);
          if (!secondStopResult.success) {
            expect(secondStopResult.error.message).toContain('is not recording');
          }
        }
      });
    });

    describe('Pause and Resume Recording', () => {
      it('should pause an active recording', async () => {
        const startResult = await generator.startRecording('Test Flow', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const pauseResult = await generator.pauseRecording(sessionId);

          expect(pauseResult.success).toBe(true);
          if (pauseResult.success) {
            expect(pauseResult.value.status).toBe(FlowStatus.PAUSED);
          }
        }
      });

      it('should resume a paused recording', async () => {
        const startResult = await generator.startRecording('Test Flow', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.pauseRecording(sessionId);
          const resumeResult = await generator.resumeRecording(sessionId);

          expect(resumeResult.success).toBe(true);
          if (resumeResult.success) {
            expect(resumeResult.value.status).toBe(FlowStatus.RECORDING);
          }
        }
      });

      it('should fail to resume a non-paused recording', async () => {
        const startResult = await generator.startRecording('Test Flow', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const resumeResult = await generator.resumeRecording(sessionId);

          expect(resumeResult.success).toBe(false);
          if (!resumeResult.success) {
            expect(resumeResult.error.message).toContain('is not paused');
          }
        }
      });
    });
  });

  describe('Recording User Actions', () => {
    describe('Navigation Recording', () => {
      it('should record navigation events', async () => {
        const startResult = await generator.startRecording('Nav Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          mockClient.navigate = vi.fn().mockResolvedValue(
            ok({
              url: 'https://example.com/about',
              statusCode: 200,
              title: 'About Us',
              durationMs: 100,
              success: true,
            })
          );

          const navResult = await generator.recordNavigation(
            sessionId,
            'https://example.com/about'
          );

          expect(navResult.success).toBe(true);
          if (navResult.success) {
            expect(navResult.value.actions).toHaveLength(2); // Initial + new navigation
            expect(navResult.value.actions[1].type).toBe(RecordedActionType.NAVIGATE);
            expect(navResult.value.currentUrl).toBe('https://example.com/about');
          }
        }
      });
    });

    describe('Click Recording', () => {
      it('should record click events', async () => {
        const startResult = await generator.startRecording(
          'Click Test',
          'https://example.com'
        );
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const clickResult = await generator.recordClick(sessionId, '#submit-button');

          expect(clickResult.success).toBe(true);
          if (clickResult.success) {
            expect(clickResult.value.actions).toHaveLength(2); // Navigation + click
            const clickAction = clickResult.value.actions[1];
            expect(clickAction.type).toBe(RecordedActionType.CLICK);
            expect((clickAction as any).selector).toBe('#submit-button');
          }

          expect(mockClient.click).toHaveBeenCalledWith(
            expect.objectContaining({
              selector: '#submit-button',
            })
          );
        }
      });

      it('should capture screenshot during click if enabled', async () => {
        const startResult = await generator.startRecording(
          'Screenshot Test',
          'https://example.com'
        );
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.recordClick(sessionId, '#button');

          expect(mockClient.screenshot).toHaveBeenCalled();
        }
      });

      it('should support different mouse buttons', async () => {
        const startResult = await generator.startRecording('Button Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.recordClick(sessionId, '#menu', { button: 'right' });

          expect(mockClient.click).toHaveBeenCalledWith(
            expect.objectContaining({
              button: 'right',
            })
          );
        }
      });
    });

    describe('Type Recording', () => {
      it('should record type events', async () => {
        const startResult = await generator.startRecording('Type Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const typeResult = await generator.recordType(sessionId, '#username', 'testuser');

          expect(typeResult.success).toBe(true);
          if (typeResult.success) {
            expect(typeResult.value.actions).toHaveLength(2); // Navigation + type
            const typeAction = typeResult.value.actions[1];
            expect(typeAction.type).toBe(RecordedActionType.TYPE);
            expect((typeAction as any).value).toBe('testuser');
          }

          expect(mockClient.type).toHaveBeenCalledWith(
            expect.objectContaining({
              selector: '#username',
              text: 'testuser',
            })
          );
        }
      });

      it('should mark sensitive data', async () => {
        const startResult = await generator.startRecording(
          'Sensitive Test',
          'https://example.com'
        );
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const typeResult = await generator.recordType(
            sessionId,
            '#password',
            'secret123',
            { sensitive: true }
          );

          expect(typeResult.success).toBe(true);
          if (typeResult.success) {
            const typeAction = typeResult.value.actions[1];
            expect((typeAction as any).sensitive).toBe(true);
          }
        }
      });

      it('should support clear before typing', async () => {
        const startResult = await generator.startRecording('Clear Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.recordType(sessionId, '#input', 'new value', { clear: true });

          expect(mockClient.type).toHaveBeenCalledWith(
            expect.objectContaining({
              clear: true,
            })
          );
        }
      });
    });

    describe('Assertion Recording', () => {
      it('should add assertions during recording', async () => {
        const startResult = await generator.startRecording(
          'Assertion Test',
          'https://example.com'
        );
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          const assertResult = await generator.addAssertion(sessionId, {
            type: RecordedActionType.ASSERTION,
            assertionType: 'element-exists',
            selector: '#success-message',
            expected: 'true',
          });

          expect(assertResult.success).toBe(true);
          if (assertResult.success) {
            expect(assertResult.value.actions).toHaveLength(2); // Navigation + assertion
            const assertion = assertResult.value.actions[1];
            expect(assertion.type).toBe(RecordedActionType.ASSERTION);
          }
        }
      });
    });
  });

  describe('Flow Generation from Recording', () => {
    it('should convert recorded session to user flow', async () => {
      const startResult = await generator.startRecording(
        'Complete Flow',
        'https://example.com'
      );
      expect(startResult.success).toBe(true);

      if (startResult.success) {
        const sessionId = startResult.value.id;

        // Record actions
        await generator.recordNavigation(sessionId, 'https://example.com/login');
        await generator.recordClick(sessionId, '#login-button');
        await generator.recordType(sessionId, '#username', 'testuser');

        // Stop recording
        const stopResult = await generator.stopRecording(sessionId);
        expect(stopResult.success).toBe(true);

        if (stopResult.success) {
          // Generate flow
          const flowResult = generator.generateFlow(stopResult.value, {
            category: FlowCategory.AUTHENTICATION,
            tags: ['login', 'user-auth'],
          });

          expect(flowResult.success).toBe(true);
          if (flowResult.success) {
            const flow = flowResult.value;
            expect(flow.name).toBe('Complete Flow');
            expect(flow.category).toBe(FlowCategory.AUTHENTICATION);
            expect(flow.tags).toEqual(['login', 'user-auth']);
            expect(flow.steps.length).toBeGreaterThan(0);
            expect(flow.sessionId).toBe(sessionId);
          }
        }
      }
    });

    it('should convert actions to appropriate step types', async () => {
      const startResult = await generator.startRecording('Step Types', 'https://example.com');
      expect(startResult.success).toBe(true);

      if (startResult.success) {
        const sessionId = startResult.value.id;

        await generator.recordClick(sessionId, '#button');
        await generator.recordType(sessionId, '#input', 'text');
        await generator.addAssertion(sessionId, {
          type: RecordedActionType.ASSERTION,
          assertionType: 'element-exists',
          selector: '#result',
          expected: 'true',
        });

        const stopResult = await generator.stopRecording(sessionId);
        expect(stopResult.success).toBe(true);

        if (stopResult.success) {
          const flowResult = generator.generateFlow(stopResult.value);
          expect(flowResult.success).toBe(true);

          if (flowResult.success) {
            const steps = flowResult.value.steps;
            expect(steps.some((s) => s.type === E2EStepType.NAVIGATE)).toBe(true);
            expect(steps.some((s) => s.type === E2EStepType.CLICK)).toBe(true);
            expect(steps.some((s) => s.type === E2EStepType.TYPE)).toBe(true);
            expect(steps.some((s) => s.type === E2EStepType.ASSERT)).toBe(true);
          }
        }
      }
    });

    it('should fail when session has no actions', async () => {
      const emptySession: RecordingSession = {
        id: 'empty-session',
        name: 'Empty',
        baseUrl: 'https://example.com',
        status: FlowStatus.COMPLETED,
        startedAt: new Date(),
        endedAt: new Date(),
        actions: [],
        config: {
          captureScreenshots: false,
          captureConsoleLogs: false,
          captureNetworkRequests: false,
        },
      };

      const result = generator.generateFlow(emptySession);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No actions recorded');
      }
    });
  });

  describe('Flow Generation from Templates', () => {
    describe('Login Flow Template', () => {
      it('should generate login flow from template', () => {
        const template: LoginFlowTemplate = {
          id: 'login-template-1',
          type: 'login',
          name: 'Standard Login',
          description: 'Standard login form flow',
          category: FlowCategory.AUTHENTICATION,
          baseUrl: 'https://example.com',
          loginUrl: 'https://example.com/login',
          usernameSelector: '#username',
          passwordSelector: '#password',
          submitSelector: '#login-button',
          successIndicator: '.welcome-message',
          successUrl: '/dashboard',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = generator.generateFlowFromTemplate(template);

        expect(result.success).toBe(true);
        if (result.success) {
          const flow = result.value;
          expect(flow.name).toBe('Standard Login');
          expect(flow.category).toBe(FlowCategory.AUTHENTICATION);
          expect(flow.steps.length).toBeGreaterThan(0);

          // Verify expected steps
          const stepTypes = flow.steps.map((s) => s.type);
          expect(stepTypes).toContain(E2EStepType.NAVIGATE);
          expect(stepTypes).toContain(E2EStepType.WAIT);
          expect(stepTypes).toContain(E2EStepType.TYPE);
          expect(stepTypes).toContain(E2EStepType.CLICK);
          expect(stepTypes).toContain(E2EStepType.ASSERT);
        }
      });

      it('should include remember me step if selector provided', () => {
        const template: LoginFlowTemplate = {
          id: 'login-template-2',
          type: 'login',
          name: 'Login with Remember Me',
          description: 'Login with remember me option',
          category: FlowCategory.AUTHENTICATION,
          baseUrl: 'https://example.com',
          loginUrl: 'https://example.com/login',
          usernameSelector: '#username',
          passwordSelector: '#password',
          submitSelector: '#login-button',
          rememberMeSelector: '#remember-me',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = generator.generateFlowFromTemplate(template);

        expect(result.success).toBe(true);
        if (result.success) {
          const flow = result.value;
          const clickSteps = flow.steps.filter((s) => s.type === E2EStepType.CLICK);
          expect(clickSteps.length).toBeGreaterThanOrEqual(2); // Remember me + submit
        }
      });
    });

    describe('Checkout Flow Template', () => {
      it('should generate checkout flow from template', () => {
        const template: CheckoutFlowTemplate = {
          id: 'checkout-template-1',
          type: 'checkout',
          name: 'E-commerce Checkout',
          description: 'Complete checkout process',
          category: FlowCategory.ECOMMERCE,
          baseUrl: 'https://shop.example.com',
          cartUrl: 'https://shop.example.com/cart',
          checkoutUrl: 'https://shop.example.com/checkout',
          proceedButton: '#proceed-to-checkout',
          shippingForm: {
            firstName: '#shipping-first-name',
            lastName: '#shipping-last-name',
            address: '#shipping-address',
            city: '#shipping-city',
            zipCode: '#shipping-zip',
            email: '#email',
          },
          paymentForm: {
            cardNumber: '#card-number',
            cardExpiry: '#card-expiry',
            cardCvc: '#card-cvc',
          },
          placeOrderButton: '#place-order',
          confirmationIndicator: '.order-confirmation',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = generator.generateFlowFromTemplate(template);

        expect(result.success).toBe(true);
        if (result.success) {
          const flow = result.value;
          expect(flow.name).toBe('E-commerce Checkout');
          expect(flow.category).toBe(FlowCategory.ECOMMERCE);

          const typeSteps = flow.steps.filter((s) => s.type === E2EStepType.TYPE);
          expect(typeSteps.length).toBeGreaterThan(5); // Multiple form fields
        }
      });
    });

    describe('Search Flow Template', () => {
      it('should generate search flow from template', () => {
        const template: SearchFlowTemplate = {
          id: 'search-template-1',
          type: 'search',
          name: 'Product Search',
          description: 'Search for products',
          category: FlowCategory.SEARCH,
          baseUrl: 'https://shop.example.com',
          searchUrl: 'https://shop.example.com',
          searchInputSelector: '#search-input',
          searchButtonSelector: '#search-button',
          resultsContainerSelector: '.search-results',
          resultItemSelector: '.product-item',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = generator.generateFlowFromTemplate(template);

        expect(result.success).toBe(true);
        if (result.success) {
          const flow = result.value;
          expect(flow.category).toBe(FlowCategory.SEARCH);

          const stepTypes = flow.steps.map((s) => s.type);
          expect(stepTypes).toContain(E2EStepType.NAVIGATE);
          expect(stepTypes).toContain(E2EStepType.TYPE);
          expect(stepTypes).toContain(E2EStepType.CLICK);
          expect(stepTypes).toContain(E2EStepType.WAIT);
          expect(stepTypes).toContain(E2EStepType.ASSERT);
        }
      });
    });

    describe('Form Submission Template', () => {
      it('should generate form flow from template', () => {
        const template: FormSubmissionFlowTemplate = {
          id: 'form-template-1',
          type: 'form-submission',
          name: 'Contact Form',
          description: 'Submit contact form',
          category: FlowCategory.FORM,
          baseUrl: 'https://example.com',
          formUrl: 'https://example.com/contact',
          fields: [
            { name: 'name', selector: '#name', type: 'text', required: true },
            { name: 'email', selector: '#email', type: 'email', required: true },
            { name: 'message', selector: '#message', type: 'textarea', required: true },
            { name: 'agree', selector: '#agree-terms', type: 'checkbox', required: true },
          ],
          submitSelector: '#submit-form',
          successIndicator: '.success-message',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = generator.generateFlowFromTemplate(template);

        expect(result.success).toBe(true);
        if (result.success) {
          const flow = result.value;
          expect(flow.steps.length).toBeGreaterThan(0);

          const typeSteps = flow.steps.filter((s) => s.type === E2EStepType.TYPE);
          expect(typeSteps.length).toBeGreaterThanOrEqual(3); // text, email, textarea

          const clickSteps = flow.steps.filter((s) => s.type === E2EStepType.CLICK);
          expect(clickSteps.length).toBeGreaterThanOrEqual(2); // checkbox + submit
        }
      });
    });

    describe('Navigation Flow Template', () => {
      it('should generate navigation flow from template', () => {
        const template: NavigationFlowTemplate = {
          id: 'nav-template-1',
          type: 'navigation',
          name: 'Multi-page Navigation',
          description: 'Navigate through multiple pages',
          category: FlowCategory.NAVIGATION,
          baseUrl: 'https://example.com',
          startUrl: 'https://example.com',
          waypoints: [
            {
              name: 'About',
              url: '/about',
              selector: 'a[href="/about"]',
              waitFor: '#about-content',
            },
            {
              name: 'Services',
              url: '/services',
              selector: 'a[href="/services"]',
              waitFor: '#services-list',
            },
            { name: 'Contact', url: '/contact', selector: 'a[href="/contact"]' },
          ],
          expectedFinalUrl: '/contact',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = generator.generateFlowFromTemplate(template);

        expect(result.success).toBe(true);
        if (result.success) {
          const flow = result.value;
          expect(flow.steps.length).toBeGreaterThan(0);

          const assertSteps = flow.steps.filter((s) => s.type === E2EStepType.ASSERT);
          expect(assertSteps.length).toBeGreaterThanOrEqual(3); // One per waypoint
        }
      });
    });
  });

  describe('Code Generation', () => {
    describe('Playwright Code Generation', () => {
      it('should generate Playwright test code', async () => {
        const startResult = await generator.startRecording('Playwright Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.recordClick(sessionId, '#button');
          await generator.recordType(sessionId, '#input', 'test');

          const stopResult = await generator.stopRecording(sessionId);
          expect(stopResult.success).toBe(true);

          if (stopResult.success) {
            const flowResult = generator.generateFlow(stopResult.value);
            expect(flowResult.success).toBe(true);

            if (flowResult.success) {
              const code = generator.generateTestCode(flowResult.value, {
                framework: 'playwright',
                language: 'typescript',
              });

              expect(code.code).toContain("import { test, expect");
              expect(code.code).toContain("test('Playwright Test'");
              expect(code.code).toContain('await page.goto');
              expect(code.code).toContain('await page.click');
              expect(code.code).toContain('await page.type');
              expect(code.framework).toBe('playwright');
              expect(code.language).toBe('typescript');
            }
          }
        }
      });
    });

    describe('Cypress Code Generation', () => {
      it('should generate Cypress test code', async () => {
        const startResult = await generator.startRecording('Cypress Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.recordClick(sessionId, '#submit');
          await generator.addAssertion(sessionId, {
            type: RecordedActionType.ASSERTION,
            assertionType: 'url-contains',
            expected: 'success',
          });

          const stopResult = await generator.stopRecording(sessionId);
          expect(stopResult.success).toBe(true);

          if (stopResult.success) {
            const flowResult = generator.generateFlow(stopResult.value);
            expect(flowResult.success).toBe(true);

            if (flowResult.success) {
              const code = generator.generateTestCode(flowResult.value, {
                framework: 'cypress',
                language: 'javascript',
              });

              expect(code.code).toContain("describe('Cypress Test'");
              expect(code.code).toContain('cy.visit');
              expect(code.code).toContain('cy.get');
              expect(code.code).toContain('cy.url().should');
              expect(code.framework).toBe('cypress');
            }
          }
        }
      });
    });

    describe('Puppeteer Code Generation', () => {
      it('should generate Puppeteer test code', async () => {
        const startResult = await generator.startRecording(
          'Puppeteer Test',
          'https://example.com'
        );
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.recordNavigation(sessionId, 'https://example.com/page');

          const stopResult = await generator.stopRecording(sessionId);
          expect(stopResult.success).toBe(true);

          if (stopResult.success) {
            const flowResult = generator.generateFlow(stopResult.value);
            expect(flowResult.success).toBe(true);

            if (flowResult.success) {
              const code = generator.generateTestCode(flowResult.value, {
                framework: 'puppeteer',
                language: 'typescript',
              });

              expect(code.code).toContain('puppeteer');
              expect(code.code).toContain('beforeAll');
              expect(code.code).toContain('await puppeteer.launch');
              expect(code.code).toContain('await page.goto');
              expect(code.framework).toBe('puppeteer');
            }
          }
        }
      });
    });

    describe('Code Generation Options', () => {
      it('should include comments when requested', async () => {
        const startResult = await generator.startRecording('Comments Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;
          await generator.recordClick(sessionId, '#button');

          const stopResult = await generator.stopRecording(sessionId);
          expect(stopResult.success).toBe(true);

          if (stopResult.success) {
            const flowResult = generator.generateFlow(stopResult.value);
            expect(flowResult.success).toBe(true);

            if (flowResult.success) {
              const code = generator.generateTestCode(flowResult.value, {
                framework: 'playwright',
                includeComments: true,
              });

              expect(code.code).toContain('//');
            }
          }
        }
      });

      it('should count assertions in generated code', async () => {
        const startResult = await generator.startRecording('Assert Test', 'https://example.com');
        expect(startResult.success).toBe(true);

        if (startResult.success) {
          const sessionId = startResult.value.id;

          await generator.addAssertion(sessionId, {
            type: RecordedActionType.ASSERTION,
            assertionType: 'element-exists',
            selector: '#result',
            expected: 'true',
          });

          await generator.addAssertion(sessionId, {
            type: RecordedActionType.ASSERTION,
            assertionType: 'url-contains',
            expected: 'example',
          });

          const stopResult = await generator.stopRecording(sessionId);
          expect(stopResult.success).toBe(true);

          if (stopResult.success) {
            const flowResult = generator.generateFlow(stopResult.value);
            expect(flowResult.success).toBe(true);

            if (flowResult.success) {
              const code = generator.generateTestCode(flowResult.value, {
                framework: 'playwright',
              });

              expect(code.assertionCount).toBe(2);
            }
          }
        }
      });
    });
  });

  describe('Session Management', () => {
    it('should get active session', async () => {
      expect(generator.getActiveSession()).toBeNull();

      const startResult = await generator.startRecording('Active Test', 'https://example.com');
      expect(startResult.success).toBe(true);

      const activeSession = generator.getActiveSession();
      expect(activeSession).not.toBeNull();
      expect(activeSession?.status).toBe(FlowStatus.RECORDING);

      if (startResult.success) {
        await generator.stopRecording(startResult.value.id);
      }

      expect(generator.getActiveSession()).toBeNull();
    });

    it('should get all sessions', async () => {
      expect(generator.getSessions()).toHaveLength(0);

      await generator.startRecording('Session 1', 'https://example.com');
      expect(generator.getSessions()).toHaveLength(1);

      const sessions = generator.getSessions();
      expect(sessions[0].name).toBe('Session 1');
    });

    it('should delete a completed session', async () => {
      const startResult = await generator.startRecording('Delete Test', 'https://example.com');
      expect(startResult.success).toBe(true);

      if (startResult.success) {
        const sessionId = startResult.value.id;

        await generator.stopRecording(sessionId);

        const deleteResult = generator.deleteSession(sessionId);
        expect(deleteResult.success).toBe(true);

        expect(generator.getSessions()).toHaveLength(0);
      }
    });

    it('should not delete active session', async () => {
      const startResult = await generator.startRecording('Active Delete', 'https://example.com');
      expect(startResult.success).toBe(true);

      if (startResult.success) {
        const sessionId = startResult.value.id;

        const deleteResult = generator.deleteSession(sessionId);
        expect(deleteResult.success).toBe(false);
        if (!deleteResult.success) {
          expect(deleteResult.error.message).toContain('Cannot delete active recording session');
        }
      }
    });
  });
});
