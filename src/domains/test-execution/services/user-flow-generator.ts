/**
 * Agentic QE v3 - User Flow Generator Service
 *
 * Service for recording user interactions via Vibium browser automation
 * and converting them to E2E test steps and executable test code.
 *
 * @module test-execution/services/user-flow-generator
 */

import { v4 as uuidv4 } from 'uuid';
import type { VibiumClient } from '../../../integrations/vibium/types';
import type { Result } from '../../../shared/types';
import { ok, err } from '../../../shared/types';
import {
  E2EStepType,
  type E2EStep,
  type NavigateStep,
  type ClickStep,
  type TypeStep,
  type WaitStep,
  type AssertStep,
  type Viewport,
  type BrowserContextOptions,
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
} from '../types/e2e-step.types';
import {
  FlowCategory,
  FlowStatus,
  RecordedActionType,
  DEFAULT_RECORDING_CONFIG,
  DEFAULT_CODE_GENERATION_OPTIONS,
  type RecordingConfig,
  type RecordingSession,
  type RecordedAction,
  type AnyRecordedAction,
  type NavigateAction,
  type ClickAction,
  type TypeAction,
  type AssertionAction,
  type UserFlow,
  type FlowTemplate,
  type LoginFlowTemplate,
  type CheckoutFlowTemplate,
  type FormSubmissionFlowTemplate,
  type SearchFlowTemplate,
  type NavigationFlowTemplate,
  type CodeGenerationOptions,
  type GeneratedTestCode,
  isNavigateAction,
  isClickAction,
  isTypeAction,
  isAssertionAction,
  isLoginFlowTemplate,
  isCheckoutFlowTemplate,
  isFormSubmissionFlowTemplate,
  isSearchFlowTemplate,
  isNavigationFlowTemplate,
} from '../types/flow-templates.types';

// ============================================================================
// Service Interface
// ============================================================================

/**
 * User flow generator service interface
 */
export interface IUserFlowGeneratorService {
  /** Start recording user interactions */
  startRecording(
    name: string,
    baseUrl: string,
    config?: Partial<RecordingConfig>
  ): Promise<Result<RecordingSession, Error>>;

  /** Stop recording and return the session */
  stopRecording(sessionId: string): Promise<Result<RecordingSession, Error>>;

  /** Pause recording */
  pauseRecording(sessionId: string): Promise<Result<RecordingSession, Error>>;

  /** Resume recording */
  resumeRecording(sessionId: string): Promise<Result<RecordingSession, Error>>;

  /** Add assertion during recording */
  addAssertion(
    sessionId: string,
    assertion: Omit<AssertionAction, 'id' | 'timestamp' | 'pageUrl' | 'pageTitle'>
  ): Promise<Result<RecordingSession, Error>>;

  /** Convert recorded actions to E2E steps */
  convertToSteps(actions: AnyRecordedAction[]): E2EStep[];

  /** Generate user flow from recording session */
  generateFlow(
    session: RecordingSession,
    options?: { category?: FlowCategory; tags?: string[] }
  ): Result<UserFlow, Error>;

  /** Generate flow from template */
  generateFlowFromTemplate(template: FlowTemplate): Result<UserFlow, Error>;

  /** Generate TypeScript test code from flow */
  generateTestCode(flow: UserFlow, options?: Partial<CodeGenerationOptions>): GeneratedTestCode;

  /** Get active recording session */
  getActiveSession(): RecordingSession | null;

  /** Get all recording sessions */
  getSessions(): RecordingSession[];

  /** Delete a recording session */
  deleteSession(sessionId: string): Result<void, Error>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Service configuration
 */
export interface UserFlowGeneratorConfig {
  /** Maximum actions per recording */
  maxActionsPerRecording: number;
  /** Maximum recording duration (ms) */
  maxRecordingDurationMs: number;
  /** Default viewport */
  defaultViewport: Viewport;
  /** Enable screenshot capture */
  captureScreenshots: boolean;
}

const DEFAULT_CONFIG: UserFlowGeneratorConfig = {
  maxActionsPerRecording: 1000,
  maxRecordingDurationMs: 30 * 60 * 1000, // 30 minutes
  defaultViewport: { width: 1280, height: 720 },
  captureScreenshots: true,
};

// ============================================================================
// User Flow Generator Service Implementation
// ============================================================================

/**
 * User Flow Generator Service
 *
 * Records user interactions via Vibium browser automation and converts them
 * to E2E test steps. Supports flow templates for common user journeys.
 *
 * @example
 * ```typescript
 * const generator = new UserFlowGeneratorService(vibiumClient);
 *
 * // Start recording
 * const sessionResult = await generator.startRecording('Login Flow', 'https://example.com');
 * if (!sessionResult.success) throw sessionResult.error;
 *
 * // User interacts with the page via Vibium...
 *
 * // Stop recording and generate flow
 * const stopResult = await generator.stopRecording(sessionResult.value.id);
 * if (!stopResult.success) throw stopResult.error;
 *
 * const flowResult = generator.generateFlow(stopResult.value, { category: 'authentication' });
 * if (!flowResult.success) throw flowResult.error;
 *
 * // Generate test code
 * const testCode = generator.generateTestCode(flowResult.value);
 * console.log(testCode.code);
 * ```
 */
export class UserFlowGeneratorService implements IUserFlowGeneratorService {
  private readonly config: UserFlowGeneratorConfig;
  private readonly sessions: Map<string, RecordingSession> = new Map();
  private activeSessionId: string | null = null;

  constructor(
    private readonly vibiumClient: VibiumClient,
    config: Partial<UserFlowGeneratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Recording Methods
  // ==========================================================================

  /**
   * Start recording user interactions
   */
  async startRecording(
    name: string,
    baseUrl: string,
    config?: Partial<RecordingConfig>
  ): Promise<Result<RecordingSession, Error>> {
    // Check if there's already an active session
    if (this.activeSessionId) {
      return err(
        new Error(`Recording already in progress. Stop session ${this.activeSessionId} first.`)
      );
    }

    // Check Vibium availability
    const isAvailable = await this.vibiumClient.isAvailable();
    if (!isAvailable) {
      return err(new Error('Vibium browser automation is not available'));
    }

    // Create recording session
    const sessionId = uuidv4();
    const recordingConfig: RecordingConfig = {
      ...DEFAULT_RECORDING_CONFIG,
      ...config,
    };

    const session: RecordingSession = {
      id: sessionId,
      status: FlowStatus.RECORDING,
      name,
      config: recordingConfig,
      startedAt: new Date(),
      baseUrl,
      actions: [],
    };

    // Launch browser if not already running
    const existingSession = await this.vibiumClient.getSession();
    if (!existingSession) {
      const launchResult = await this.vibiumClient.launch({
        headless: false, // Need visible browser for recording
        viewport: recordingConfig.viewport ?? this.config.defaultViewport,
      });

      if (!launchResult.success) {
        const launchError = launchResult as { success: false; error: Error };
        return err(new Error(`Failed to launch browser: ${launchError.error.message}`));
      }
    }

    // Navigate to base URL
    const navResult = await this.vibiumClient.navigate({ url: baseUrl });
    if (!navResult.success) {
      const navError = navResult as { success: false; error: Error };
      return err(new Error(`Failed to navigate to ${baseUrl}: ${navError.error.message}`));
    }

    // Record initial navigation action
    const initialAction: NavigateAction = {
      id: uuidv4(),
      type: RecordedActionType.NAVIGATE,
      timestamp: new Date(),
      url: baseUrl,
      finalUrl: navResult.value.url,
      pageUrl: navResult.value.url,
      pageTitle: navResult.value.title,
      durationMs: navResult.value.durationMs,
    };
    session.actions.push(initialAction);
    session.currentUrl = navResult.value.url;
    session.currentTitle = navResult.value.title;

    // Store session
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    return ok(session);
  }

  /**
   * Stop recording and return the session
   */
  async stopRecording(sessionId: string): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.RECORDING && session.status !== FlowStatus.PAUSED) {
      return err(new Error(`Session ${sessionId} is not recording (status: ${session.status})`));
    }

    session.status = FlowStatus.COMPLETED;
    session.endedAt = new Date();

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }

    return ok(session);
  }

  /**
   * Pause recording
   */
  async pauseRecording(sessionId: string): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.RECORDING) {
      return err(new Error(`Session ${sessionId} is not recording (status: ${session.status})`));
    }

    session.status = FlowStatus.PAUSED;
    return ok(session);
  }

  /**
   * Resume recording
   */
  async resumeRecording(sessionId: string): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.PAUSED) {
      return err(new Error(`Session ${sessionId} is not paused (status: ${session.status})`));
    }

    session.status = FlowStatus.RECORDING;
    return ok(session);
  }

  /**
   * Add an assertion during recording
   */
  async addAssertion(
    sessionId: string,
    assertion: Omit<AssertionAction, 'id' | 'timestamp' | 'pageUrl' | 'pageTitle'>
  ): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.RECORDING) {
      return err(
        new Error(`Session ${sessionId} is not recording (status: ${session.status})`)
      );
    }

    const assertionAction: AssertionAction = {
      ...assertion,
      id: uuidv4(),
      type: RecordedActionType.ASSERTION,
      timestamp: new Date(),
      pageUrl: session.currentUrl ?? session.baseUrl,
      pageTitle: session.currentTitle ?? '',
    };

    session.actions.push(assertionAction);
    return ok(session);
  }

  /**
   * Record a navigation event
   */
  async recordNavigation(
    sessionId: string,
    url: string
  ): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.RECORDING) {
      return err(new Error(`Session ${sessionId} is not recording`));
    }

    // Navigate via Vibium
    const navResult = await this.vibiumClient.navigate({ url });
    if (!navResult.success) {
      const navError = navResult as { success: false; error: Error };
      return err(new Error(`Navigation failed: ${navError.error.message}`));
    }

    const action: NavigateAction = {
      id: uuidv4(),
      type: RecordedActionType.NAVIGATE,
      timestamp: new Date(),
      url,
      finalUrl: navResult.value.url,
      pageUrl: navResult.value.url,
      pageTitle: navResult.value.title,
      durationMs: navResult.value.durationMs,
    };

    session.actions.push(action);
    session.currentUrl = navResult.value.url;
    session.currentTitle = navResult.value.title;

    return ok(session);
  }

  /**
   * Record a click event
   */
  async recordClick(
    sessionId: string,
    selector: string,
    options?: { button?: 'left' | 'right' | 'middle' }
  ): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.RECORDING) {
      return err(new Error(`Session ${sessionId} is not recording`));
    }

    // Click via Vibium
    const clickResult = await this.vibiumClient.click({
      selector,
      button: options?.button ?? 'left',
    });

    if (!clickResult.success) {
      const clickError = clickResult as { success: false; error: Error };
      return err(new Error(`Click failed: ${clickError.error.message}`));
    }

    // Capture screenshot if enabled
    let screenshot: string | undefined;
    if (session.config.captureScreenshots) {
      const screenshotResult = await this.vibiumClient.screenshot({});
      if (screenshotResult.success && screenshotResult.value.base64) {
        screenshot = screenshotResult.value.base64;
      }
    }

    const action: ClickAction = {
      id: uuidv4(),
      type: RecordedActionType.CLICK,
      timestamp: new Date(),
      selector,
      button: options?.button ?? 'left',
      pageUrl: session.currentUrl ?? session.baseUrl,
      pageTitle: session.currentTitle ?? '',
      screenshot,
    };

    session.actions.push(action);
    return ok(session);
  }

  /**
   * Record a type event
   */
  async recordType(
    sessionId: string,
    selector: string,
    text: string,
    options?: { clear?: boolean; sensitive?: boolean }
  ): Promise<Result<RecordingSession, Error>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (session.status !== FlowStatus.RECORDING) {
      return err(new Error(`Session ${sessionId} is not recording`));
    }

    // Type via Vibium
    const typeResult = await this.vibiumClient.type({
      selector,
      text,
      clear: options?.clear ?? false,
    });

    if (!typeResult.success) {
      const typeError = typeResult as { success: false; error: Error };
      return err(new Error(`Type failed: ${typeError.error.message}`));
    }

    const action: TypeAction = {
      id: uuidv4(),
      type: RecordedActionType.TYPE,
      timestamp: new Date(),
      selector,
      value: text,
      cleared: options?.clear ?? false,
      sensitive: options?.sensitive ?? false,
      pageUrl: session.currentUrl ?? session.baseUrl,
      pageTitle: session.currentTitle ?? '',
    };

    session.actions.push(action);
    return ok(session);
  }

  // ==========================================================================
  // Conversion Methods
  // ==========================================================================

  /**
   * Convert recorded actions to E2E steps
   */
  convertToSteps(actions: AnyRecordedAction[]): E2EStep[] {
    const steps: E2EStep[] = [];

    for (const action of actions) {
      const step = this.convertActionToStep(action);
      if (step) {
        steps.push(step);
      }
    }

    return steps;
  }

  /**
   * Convert a single recorded action to an E2E step
   */
  private convertActionToStep(action: AnyRecordedAction): E2EStep | null {
    switch (action.type) {
      case RecordedActionType.NAVIGATE:
        return this.convertNavigateAction(action as NavigateAction);

      case RecordedActionType.CLICK:
        return this.convertClickAction(action as ClickAction);

      case RecordedActionType.TYPE:
        return this.convertTypeAction(action as TypeAction);

      case RecordedActionType.ASSERTION:
        return this.convertAssertionAction(action as AssertionAction);

      // Skip non-essential action types for now
      case RecordedActionType.HOVER:
      case RecordedActionType.SCROLL:
        return null;

      default:
        return null;
    }
  }

  private convertNavigateAction(action: NavigateAction): NavigateStep {
    return createNavigateStep(action.url, `Navigate to ${action.url}`, {
      id: `step-${action.id}`,
    });
  }

  private convertClickAction(action: ClickAction): ClickStep {
    return createClickStep(action.selector, `Click on ${action.selector}`, {
      id: `step-${action.id}`,
      options: {
        button: action.button ?? 'left',
      },
    });
  }

  private convertTypeAction(action: TypeAction): TypeStep {
    const description = action.sensitive
      ? `Type [SENSITIVE] into ${action.selector}`
      : `Type "${action.value}" into ${action.selector}`;

    return createTypeStep(action.selector, action.value, description, {
      id: `step-${action.id}`,
      options: {
        clear: action.cleared ?? false,
        sensitive: action.sensitive ?? false,
      },
    });
  }

  private convertAssertionAction(action: AssertionAction): AssertStep {
    const assertionTypeMap: Record<string, 'element-exists' | 'element-visible' | 'element-text' | 'url-equals' | 'url-contains' | 'title-equals' | 'title-contains'> = {
      'element-exists': 'element-exists',
      'element-visible': 'element-visible',
      'element-text': 'element-text',
      'element-value': 'element-text',
      'url-equals': 'url-equals',
      'url-contains': 'url-contains',
      'title-equals': 'title-equals',
      'title-contains': 'title-contains',
    };

    const mappedType = assertionTypeMap[action.assertionType] ?? 'element-exists';

    return createAssertStep(
      mappedType,
      `Assert ${action.assertionType}${action.expected ? `: ${action.expected}` : ''}`,
      {
        expected: action.expected,
      },
      {
        id: `step-${action.id}`,
        target: action.selector,
        value: action.expected,
      }
    );
  }

  // ==========================================================================
  // Flow Generation Methods
  // ==========================================================================

  /**
   * Generate user flow from recording session
   */
  generateFlow(
    session: RecordingSession,
    options?: { category?: FlowCategory; tags?: string[] }
  ): Result<UserFlow, Error> {
    if (session.actions.length === 0) {
      return err(new Error('No actions recorded in session'));
    }

    const steps = this.convertToSteps(session.actions);
    if (steps.length === 0) {
      return err(new Error('Could not convert any actions to steps'));
    }

    const flow: UserFlow = {
      id: uuidv4(),
      name: session.name,
      description: `User flow recorded from ${session.baseUrl}`,
      category: options?.category ?? FlowCategory.CUSTOM,
      baseUrl: session.baseUrl,
      steps,
      recordedActions: session.actions,
      tags: options?.tags,
      viewport: session.config.viewport,
      browserContext: session.config.browserContext,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionId: session.id,
    };

    return ok(flow);
  }

  /**
   * Generate flow from template
   */
  generateFlowFromTemplate(template: FlowTemplate): Result<UserFlow, Error> {
    let steps: E2EStep[];

    if (isLoginFlowTemplate(template)) {
      steps = this.generateLoginFlowSteps(template);
    } else if (isCheckoutFlowTemplate(template)) {
      steps = this.generateCheckoutFlowSteps(template);
    } else if (isFormSubmissionFlowTemplate(template)) {
      steps = this.generateFormFlowSteps(template);
    } else if (isSearchFlowTemplate(template)) {
      steps = this.generateSearchFlowSteps(template);
    } else if (isNavigationFlowTemplate(template)) {
      steps = this.generateNavigationFlowSteps(template);
    } else {
      return err(new Error('Unknown template type'));
    }

    const flow: UserFlow = {
      id: uuidv4(),
      name: template.name,
      description: template.description,
      category: template.category,
      baseUrl: template.baseUrl,
      steps,
      recordedActions: [],
      tags: template.tags,
      createdAt: new Date(),
      updatedAt: new Date(),
      templateId: template.id,
    };

    return ok(flow);
  }

  private generateLoginFlowSteps(template: LoginFlowTemplate): E2EStep[] {
    const steps: E2EStep[] = [];

    // Navigate to login page
    steps.push(createNavigateStep(template.loginUrl, 'Navigate to login page'));

    // Wait for login form
    steps.push(
      createWaitStep('element-visible', 'Wait for username field', {}, {
        target: template.usernameSelector,
      })
    );

    // Enter username (placeholder)
    steps.push(
      createTypeStep(
        template.usernameSelector,
        '{{username}}',
        'Enter username',
        { options: { clear: true } }
      )
    );

    // Enter password (placeholder)
    steps.push(
      createTypeStep(
        template.passwordSelector,
        '{{password}}',
        'Enter password',
        { options: { clear: true, sensitive: true } }
      )
    );

    // Check remember me if present
    if (template.rememberMeSelector) {
      steps.push(createClickStep(template.rememberMeSelector, 'Check remember me'));
    }

    // Click submit
    steps.push(
      createClickStep(template.submitSelector, 'Click login button', {
        options: { waitForNavigation: true },
      })
    );

    // Assert successful login
    if (template.successIndicator) {
      steps.push(
        createAssertStep('element-visible', 'Verify login success', {}, {
          target: template.successIndicator,
        })
      );
    }

    if (template.successUrl) {
      steps.push(
        createAssertStep('url-contains', 'Verify redirect to success URL', {
          expected: template.successUrl,
        })
      );
    }

    return steps;
  }

  private generateCheckoutFlowSteps(template: CheckoutFlowTemplate): E2EStep[] {
    const steps: E2EStep[] = [];

    // Navigate to cart
    steps.push(createNavigateStep(template.cartUrl, 'Navigate to cart'));

    // Proceed to checkout
    steps.push(
      createClickStep(template.proceedButton, 'Proceed to checkout', {
        options: { waitForNavigation: true },
      })
    );

    // Fill shipping form
    const shippingFields = template.shippingForm;
    if (shippingFields.firstName) {
      steps.push(createTypeStep(shippingFields.firstName, '{{firstName}}', 'Enter first name'));
    }
    if (shippingFields.lastName) {
      steps.push(createTypeStep(shippingFields.lastName, '{{lastName}}', 'Enter last name'));
    }
    if (shippingFields.address) {
      steps.push(createTypeStep(shippingFields.address, '{{address}}', 'Enter address'));
    }
    if (shippingFields.city) {
      steps.push(createTypeStep(shippingFields.city, '{{city}}', 'Enter city'));
    }
    if (shippingFields.zipCode) {
      steps.push(createTypeStep(shippingFields.zipCode, '{{zipCode}}', 'Enter zip code'));
    }
    if (shippingFields.email) {
      steps.push(createTypeStep(shippingFields.email, '{{email}}', 'Enter email'));
    }

    // Fill payment form
    const paymentFields = template.paymentForm;
    if (paymentFields.cardNumber) {
      steps.push(
        createTypeStep(paymentFields.cardNumber, '{{cardNumber}}', 'Enter card number', {
          options: { sensitive: true },
        })
      );
    }
    if (paymentFields.cardExpiry) {
      steps.push(createTypeStep(paymentFields.cardExpiry, '{{cardExpiry}}', 'Enter card expiry'));
    }
    if (paymentFields.cardCvc) {
      steps.push(
        createTypeStep(paymentFields.cardCvc, '{{cardCvc}}', 'Enter card CVC', {
          options: { sensitive: true },
        })
      );
    }

    // Place order
    steps.push(
      createClickStep(template.placeOrderButton, 'Place order', {
        options: { waitForNavigation: true },
      })
    );

    // Verify confirmation
    if (template.confirmationIndicator) {
      steps.push(
        createAssertStep('element-visible', 'Verify order confirmation', {}, {
          target: template.confirmationIndicator,
        })
      );
    }

    return steps;
  }

  private generateFormFlowSteps(template: FormSubmissionFlowTemplate): E2EStep[] {
    const steps: E2EStep[] = [];

    // Navigate to form
    steps.push(createNavigateStep(template.formUrl, 'Navigate to form'));

    // Fill form fields
    for (const field of template.fields) {
      const placeholder = `{{${field.name}}}`;

      switch (field.type) {
        case 'text':
        case 'email':
        case 'tel':
        case 'number':
        case 'textarea':
          steps.push(
            createTypeStep(field.selector, placeholder, `Enter ${field.name}`, {
              options: { clear: true },
            })
          );
          break;

        case 'password':
          steps.push(
            createTypeStep(field.selector, placeholder, `Enter ${field.name}`, {
              options: { clear: true, sensitive: true },
            })
          );
          break;

        case 'checkbox':
        case 'radio':
          steps.push(createClickStep(field.selector, `Select ${field.name}`));
          break;

        case 'select':
          // For select, we'd typically need a different step type
          steps.push(createClickStep(field.selector, `Click ${field.name} dropdown`));
          break;

        case 'file':
          // File upload would need special handling
          break;
      }
    }

    // Submit form
    steps.push(
      createClickStep(template.submitSelector, 'Submit form', {
        options: { waitForNavigation: true },
      })
    );

    // Verify success
    if (template.successIndicator) {
      steps.push(
        createAssertStep('element-visible', 'Verify form submission success', {}, {
          target: template.successIndicator,
        })
      );
    }

    return steps;
  }

  private generateSearchFlowSteps(template: SearchFlowTemplate): E2EStep[] {
    const steps: E2EStep[] = [];

    // Navigate to search page
    steps.push(createNavigateStep(template.searchUrl, 'Navigate to search page'));

    // Enter search query
    steps.push(
      createTypeStep(template.searchInputSelector, '{{searchQuery}}', 'Enter search query', {
        options: { clear: true },
      })
    );

    // Click search button if present
    if (template.searchButtonSelector) {
      steps.push(createClickStep(template.searchButtonSelector, 'Click search button'));
    }

    // Wait for results
    steps.push(
      createWaitStep('element-visible', 'Wait for search results', {}, {
        target: template.resultsContainerSelector,
      })
    );

    // Assert results are displayed
    steps.push(
      createAssertStep('element-exists', 'Verify results are displayed', {}, {
        target: template.resultItemSelector,
      })
    );

    return steps;
  }

  private generateNavigationFlowSteps(template: NavigationFlowTemplate): E2EStep[] {
    const steps: E2EStep[] = [];

    // Navigate to start URL
    steps.push(createNavigateStep(template.startUrl, 'Navigate to start page'));

    // Navigate through waypoints
    for (const waypoint of template.waypoints) {
      if (waypoint.selector) {
        steps.push(
          createClickStep(waypoint.selector, `Navigate to ${waypoint.name}`, {
            options: { waitForNavigation: true },
          })
        );
      } else {
        steps.push(createNavigateStep(waypoint.url, `Navigate to ${waypoint.name}`));
      }

      // Wait for waypoint indicator if specified
      if (waypoint.waitFor) {
        steps.push(
          createWaitStep('element-visible', `Wait for ${waypoint.name} content`, {}, {
            target: waypoint.waitFor,
          })
        );
      }

      // Assert URL
      steps.push(
        createAssertStep('url-contains', `Verify at ${waypoint.name}`, {
          expected: waypoint.url,
        })
      );
    }

    // Verify final URL if specified
    if (template.expectedFinalUrl) {
      steps.push(
        createAssertStep('url-equals', 'Verify final destination', {
          expected: template.expectedFinalUrl,
        })
      );
    }

    return steps;
  }

  // ==========================================================================
  // Code Generation Methods
  // ==========================================================================

  /**
   * Generate TypeScript test code from flow
   */
  generateTestCode(
    flow: UserFlow,
    options?: Partial<CodeGenerationOptions>
  ): GeneratedTestCode {
    const opts: CodeGenerationOptions = { ...DEFAULT_CODE_GENERATION_OPTIONS, ...options };
    const { framework, language, includeComments, includeAssertions, includeErrorHandling } = opts;

    let code = '';
    let assertionCount = 0;

    // Generate imports
    code += this.generateImports(framework, language);
    code += '\n\n';

    // Generate test description
    const testDescription = opts.testDescription ?? flow.description;
    if (includeComments) {
      code += `/**\n * ${testDescription}\n * Generated from flow: ${flow.name}\n */\n`;
    }

    // Generate test block
    code += this.generateTestBlock(flow, opts);

    // Count assertions
    for (const step of flow.steps) {
      if (step.type === E2EStepType.ASSERT) {
        assertionCount++;
      }
    }

    const fileName =
      opts.fileName ??
      `${flow.name.toLowerCase().replace(/\s+/g, '-')}.spec.${language === 'typescript' ? 'ts' : 'js'}`;

    return {
      code,
      fileName,
      framework,
      language,
      stepCount: flow.steps.length,
      assertionCount,
      generatedAt: new Date(),
    };
  }

  private generateImports(framework: string, language: string): string {
    switch (framework) {
      case 'playwright':
        return language === 'typescript'
          ? "import { test, expect, type Page } from '@playwright/test';"
          : "const { test, expect } = require('@playwright/test');";

      case 'cypress':
        return '// Cypress imports are automatic';

      case 'puppeteer':
        return language === 'typescript'
          ? "import puppeteer, { type Browser, type Page } from 'puppeteer';"
          : "const puppeteer = require('puppeteer');";

      case 'webdriverio':
        return language === 'typescript'
          ? "import { browser, $, $$ } from '@wdio/globals';"
          : "const { browser, $, $$ } = require('@wdio/globals');";

      case 'testcafe':
        return language === 'typescript'
          ? "import { Selector, t } from 'testcafe';"
          : "const { Selector, t } = require('testcafe');";

      default:
        return '';
    }
  }

  // ==========================================================================
  // Framework Code Generation Strategy Tables
  // ==========================================================================

  /**
   * Lookup table for test block opening code per framework
   */
  private static readonly TEST_BLOCK_OPENERS: Record<string, (name: string, timeout: number) => string> = {
    playwright: (name, timeout) =>
      `test('${name}', async ({ page }) => {\n  test.setTimeout(${timeout});\n\n`,
    cypress: (name) =>
      `describe('${name}', () => {\n  it('should complete the flow', () => {\n`,
    puppeteer: (name) =>
      `describe('${name}', () => {\n` +
      `  let browser: Browser;\n` +
      `  let page: Page;\n\n` +
      `  beforeAll(async () => {\n` +
      `    browser = await puppeteer.launch({ headless: true });\n` +
      `    page = await browser.newPage();\n` +
      `  });\n\n` +
      `  afterAll(async () => {\n` +
      `    await browser.close();\n` +
      `  });\n\n` +
      `  it('should complete the flow', async () => {\n`,
  };

  /**
   * Lookup table for test block closing code per framework
   */
  private static readonly TEST_BLOCK_CLOSERS: Record<string, string> = {
    cypress: `  });\n});\n`,
    puppeteer: `  });\n});\n`,
  };

  /**
   * Lookup table for navigate code per framework
   */
  private static readonly NAVIGATE_CODE: Record<string, (url: string, indent: string) => string> = {
    playwright: (url, indent) => `${indent}await page.goto('${url}');\n`,
    cypress: (url, indent) => `${indent}cy.visit('${url}');\n`,
    puppeteer: (url, indent) => `${indent}await page.goto('${url}', { waitUntil: 'networkidle0' });\n`,
    webdriverio: (url, indent) => `${indent}await browser.url('${url}');\n`,
    testcafe: (url, indent) => `${indent}await t.navigateTo('${url}');\n`,
  };

  /**
   * Lookup table for click code per framework
   */
  private static readonly CLICK_CODE: Record<string, (sel: string, indent: string) => string> = {
    playwright: (sel, indent) => `${indent}await page.click('${sel}');\n`,
    cypress: (sel, indent) => `${indent}cy.get('${sel}').click();\n`,
    puppeteer: (sel, indent) => `${indent}await page.click('${sel}');\n`,
    webdriverio: (sel, indent) => `${indent}await $('${sel}').click();\n`,
    testcafe: (sel, indent) => `${indent}await t.click(Selector('${sel}'));\n`,
  };

  /**
   * Lookup table for type code per framework (clear variant and default variant)
   */
  private static readonly TYPE_CODE: Record<string, { clear: (sel: string, val: string, indent: string) => string; default: (sel: string, val: string, indent: string) => string }> = {
    playwright: {
      clear: (sel, val, indent) => `${indent}await page.fill('${sel}', '${val}');\n`,
      default: (sel, val, indent) => `${indent}await page.type('${sel}', '${val}');\n`,
    },
    cypress: {
      clear: (sel, val, indent) => `${indent}cy.get('${sel}').clear().type('${val}');\n`,
      default: (sel, val, indent) => `${indent}cy.get('${sel}').type('${val}');\n`,
    },
    puppeteer: {
      clear: (sel, val, indent) => `${indent}await page.click('${sel}', { clickCount: 3 });\n${indent}await page.type('${sel}', '${val}');\n`,
      default: (sel, val, indent) => `${indent}await page.type('${sel}', '${val}');\n`,
    },
    webdriverio: {
      clear: (sel, val, indent) => `${indent}await $('${sel}').clearValue();\n${indent}await $('${sel}').setValue('${val}');\n`,
      default: (sel, val, indent) => `${indent}await $('${sel}').setValue('${val}');\n`,
    },
    testcafe: {
      clear: (sel, val, indent) => `${indent}await t.selectText(Selector('${sel}')).typeText(Selector('${sel}'), '${val}', { replace: true });\n`,
      default: (sel, val, indent) => `${indent}await t.typeText(Selector('${sel}'), '${val}');\n`,
    },
  };

  /**
   * Lookup table for assert code per framework and assertion type
   */
  private static readonly ASSERT_CODE: Record<string, Record<string, (sel: string, expected: string, indent: string) => string>> = {
    playwright: {
      'element-exists': (sel, _exp, indent) => `${indent}await expect(page.locator('${sel}')).toBeVisible();\n`,
      'element-visible': (sel, _exp, indent) => `${indent}await expect(page.locator('${sel}')).toBeVisible();\n`,
      'element-text': (sel, exp, indent) => `${indent}await expect(page.locator('${sel}')).toContainText('${exp}');\n`,
      'url-equals': (_sel, exp, indent) => `${indent}await expect(page).toHaveURL('${exp}');\n`,
      'url-contains': (_sel, exp, indent) => `${indent}await expect(page).toHaveURL(/${exp}/);\n`,
      'title-equals': (_sel, exp, indent) => `${indent}await expect(page).toHaveTitle('${exp}');\n`,
    },
    cypress: {
      'element-exists': (sel, _exp, indent) => `${indent}cy.get('${sel}').should('exist');\n`,
      'element-visible': (sel, _exp, indent) => `${indent}cy.get('${sel}').should('be.visible');\n`,
      'element-text': (sel, exp, indent) => `${indent}cy.get('${sel}').should('contain', '${exp}');\n`,
      'url-equals': (_sel, exp, indent) => `${indent}cy.url().should('eq', '${exp}');\n`,
      'url-contains': (_sel, exp, indent) => `${indent}cy.url().should('include', '${exp}');\n`,
      'title-equals': (_sel, exp, indent) => `${indent}cy.title().should('eq', '${exp}');\n`,
    },
    puppeteer: {
      'element-exists': (sel, _exp, indent) => `${indent}const element = await page.$('${sel}');\n${indent}expect(element).not.toBeNull();\n`,
      'element-visible': (sel, _exp, indent) => `${indent}const element = await page.$('${sel}');\n${indent}expect(element).not.toBeNull();\n`,
      'url-equals': (_sel, exp, indent) => `${indent}expect(page.url()).toBe('${exp}');\n`,
      'url-contains': (_sel, exp, indent) => `${indent}expect(page.url()).toContain('${exp}');\n`,
      'title-equals': (_sel, exp, indent) => `${indent}const title = await page.title();\n${indent}expect(title).toBe('${exp}');\n`,
    },
  };

  private generateTestBlock(flow: UserFlow, opts: CodeGenerationOptions): string {
    const { framework, includeComments, defaultTimeout } = opts;

    const opener = UserFlowGeneratorService.TEST_BLOCK_OPENERS[framework];
    let code = opener
      ? opener(flow.name, defaultTimeout)
      : `test('${flow.name}', async ({ page }) => {\n`;

    for (const step of flow.steps) {
      const stepCode = this.generateStepCode(step, framework, includeComments);
      if (stepCode) {
        code += stepCode + '\n';
      }
    }

    code += UserFlowGeneratorService.TEST_BLOCK_CLOSERS[framework] ?? `});\n`;
    return code;
  }

  /**
   * Step type to code generator dispatch table
   */
  private readonly stepCodeGenerators: Record<string, (step: E2EStep, framework: string, indent: string) => string> = {
    [E2EStepType.NAVIGATE]: (step, fw, indent) => this.generateNavigateCode(step as NavigateStep, fw, indent),
    [E2EStepType.CLICK]: (step, fw, indent) => this.generateClickCode(step as ClickStep, fw, indent),
    [E2EStepType.TYPE]: (step, fw, indent) => this.generateTypeCode(step as TypeStep, fw, indent),
    [E2EStepType.WAIT]: (step, fw, indent) => this.generateWaitCode(step as WaitStep, fw, indent),
    [E2EStepType.ASSERT]: (step, fw, indent) => this.generateAssertCode(step as AssertStep, fw, indent),
  };

  private generateStepCode(
    step: E2EStep,
    framework: string,
    includeComments: boolean
  ): string {
    const indent = framework === 'cypress' || framework === 'puppeteer' ? '    ' : '  ';
    let code = '';

    if (includeComments && step.description) {
      code += `${indent}// ${step.description}\n`;
    }

    const generator = this.stepCodeGenerators[step.type];
    if (generator) {
      code += generator(step, framework, indent);
    }

    return code;
  }

  private generateNavigateCode(step: NavigateStep, framework: string, indent: string): string {
    const url = step.target;
    const gen = UserFlowGeneratorService.NAVIGATE_CODE[framework];
    return gen ? gen(url, indent) : `${indent}await page.goto('${url}');\n`;
  }

  private generateClickCode(step: ClickStep, framework: string, indent: string): string {
    const selector = step.target;
    const gen = UserFlowGeneratorService.CLICK_CODE[framework];
    return gen ? gen(selector, indent) : `${indent}await page.click('${selector}');\n`;
  }

  private generateTypeCode(step: TypeStep, framework: string, indent: string): string {
    const selector = step.target;
    const value = step.value;
    const variant = step.options?.clear ? 'clear' : 'default';
    const typeCode = UserFlowGeneratorService.TYPE_CODE[framework];
    if (typeCode) {
      return typeCode[variant](selector, value, indent);
    }
    return `${indent}await page.type('${selector}', '${value}');\n`;
  }

  private generateWaitCode(step: WaitStep, framework: string, indent: string): string {
    const selector = step.target ?? '';
    const condition = step.options?.condition ?? 'element-visible';

    const waitStrategies: Record<string, () => string> = {
      playwright: () => {
        if (condition === 'element-visible' && selector) return `${indent}await page.waitForSelector('${selector}', { state: 'visible' });\n`;
        if (condition === 'element-hidden' && selector) return `${indent}await page.waitForSelector('${selector}', { state: 'hidden' });\n`;
        return `${indent}await page.waitForTimeout(1000);\n`;
      },
      cypress: () => {
        if (condition === 'element-visible' && selector) return `${indent}cy.get('${selector}').should('be.visible');\n`;
        if (condition === 'element-hidden' && selector) return `${indent}cy.get('${selector}').should('not.be.visible');\n`;
        return `${indent}cy.wait(1000);\n`;
      },
      puppeteer: () => {
        if (selector) return `${indent}await page.waitForSelector('${selector}');\n`;
        return `${indent}await page.waitForTimeout(1000);\n`;
      },
    };

    const strategy = waitStrategies[framework];
    if (strategy) return strategy();
    if (selector) return `${indent}await page.waitForSelector('${selector}');\n`;
    return `${indent}await page.waitForTimeout(1000);\n`;
  }

  private generateAssertCode(step: AssertStep, framework: string, indent: string): string {
    const assertion = step.options?.assertion ?? 'element-exists';
    const selector = step.target;
    const expected = step.options?.expected ?? step.value;

    const frameworkAssertions = UserFlowGeneratorService.ASSERT_CODE[framework];
    if (frameworkAssertions) {
      const gen = frameworkAssertions[assertion];
      if (gen) return gen(selector ?? '', String(expected ?? ''), indent);
      return `${indent}// TODO: Implement assertion: ${assertion}\n`;
    }
    return `${indent}// Assertion: ${assertion}\n`;
  }

  // ==========================================================================
  // Session Management Methods
  // ==========================================================================

  /**
   * Get active recording session
   */
  getActiveSession(): RecordingSession | null {
    if (!this.activeSessionId) {
      return null;
    }
    return this.sessions.get(this.activeSessionId) ?? null;
  }

  /**
   * Get all recording sessions
   */
  getSessions(): RecordingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Delete a recording session
   */
  deleteSession(sessionId: string): Result<void, Error> {
    if (!this.sessions.has(sessionId)) {
      return err(new Error(`Recording session not found: ${sessionId}`));
    }

    if (this.activeSessionId === sessionId) {
      return err(new Error('Cannot delete active recording session. Stop it first.'));
    }

    this.sessions.delete(sessionId);
    return ok(undefined);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a UserFlowGeneratorService instance
 *
 * @param vibiumClient - Vibium browser automation client (required)
 * @param config - Optional service configuration
 * @returns UserFlowGeneratorService instance
 *
 * @example
 * ```typescript
 * import { createVibiumClient } from 'agentic-qe/integrations/vibium';
 * import { createUserFlowGenerator } from 'agentic-qe/domains/test-execution';
 *
 * const vibiumClient = await createVibiumClient({ enabled: true });
 * const generator = createUserFlowGenerator(vibiumClient);
 * ```
 */
export function createUserFlowGenerator(
  vibiumClient: VibiumClient,
  config?: Partial<UserFlowGeneratorConfig>
): UserFlowGeneratorService {
  return new UserFlowGeneratorService(vibiumClient, config);
}
