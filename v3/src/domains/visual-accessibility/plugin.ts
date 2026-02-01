/**
 * Agentic QE v3 - Visual & Accessibility Domain Plugin
 * Integrates the visual & accessibility testing domain into the kernel
 */

import { DomainName, DomainEvent, Result, ok, err } from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin, TaskHandler } from '../domain-interface.js';
import type { WorkflowOrchestrator, WorkflowContext } from '../../coordination/workflow-orchestrator.js';
import {
  Viewport,
  VisualTestReport,
  AccessibilityAuditReport,
  AccessibilityViolation,
  RemediationPlan,
  VisualTestingStatus,
  AccessibilityReport,
  ContrastAnalysis,
  WCAGValidationResult,
  KeyboardNavigationReport,
  Screenshot,
  CaptureOptions,
  AuditOptions,
} from './interfaces.js';
import {
  VisualAccessibilityCoordinator,
  IVisualAccessibilityCoordinatorExtended,
  CoordinatorConfig,
} from './coordinator.js';
import {
  createVisualTesterService,
  VisualTesterService,
  VisualTesterConfig,
} from './services/visual-tester.js';
import {
  AccessibilityTesterService,
  AccessibilityTesterConfig,
} from './services/accessibility-tester.js';
import {
  ResponsiveTesterService,
  ResponsiveTestConfig,
  ResponsiveTestResult,
  BreakpointAnalysis,
} from './services/responsive-tester.js';

/**
 * Plugin configuration options
 */
export interface VisualAccessibilityPluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  visualTester?: Partial<VisualTesterConfig>;
  accessibilityTester?: Partial<AccessibilityTesterConfig>;
  responsiveTester?: Partial<ResponsiveTestConfig>;
}

/**
 * Extended API providing access to all domain capabilities
 */
export interface VisualAccessibilityAPI {
  // Coordinator methods
  runVisualTests(urls: string[], viewports: Viewport[]): Promise<Result<VisualTestReport, Error>>;
  runAccessibilityAudit(urls: string[], level: 'A' | 'AA' | 'AAA'): Promise<Result<AccessibilityAuditReport, Error>>;
  approveVisualChanges(diffIds: string[], reason: string): Promise<Result<void, Error>>;
  generateRemediationPlan(violations: AccessibilityViolation[]): Promise<Result<RemediationPlan, Error>>;
  getVisualTestingStatus(): Promise<Result<VisualTestingStatus, Error>>;

  // Visual testing service methods
  captureScreenshot(url: string, options?: CaptureOptions): Promise<Result<Screenshot, Error>>;
  captureElement(url: string, selector: string, options?: CaptureOptions): Promise<Result<Screenshot, Error>>;

  // Accessibility service methods
  auditAccessibility(url: string, options?: AuditOptions): Promise<Result<AccessibilityReport, Error>>;
  checkContrast(url: string): Promise<Result<ContrastAnalysis[], Error>>;
  validateWCAGLevel(url: string, level: 'A' | 'AA' | 'AAA'): Promise<Result<WCAGValidationResult, Error>>;
  checkKeyboardNavigation(url: string): Promise<Result<KeyboardNavigationReport, Error>>;

  // Responsive testing service methods
  testResponsiveness(url: string, options?: Partial<ResponsiveTestConfig>): Promise<Result<ResponsiveTestResult, Error>>;
  analyzeBreakpoints(url: string): Promise<Result<BreakpointAnalysis, Error>>;

  // Workflow integration (Issue #206)
  registerWorkflowActions(orchestrator: WorkflowOrchestrator): void;

  // Internal access
  getCoordinator(): IVisualAccessibilityCoordinatorExtended;
  getVisualTester(): VisualTesterService;
  getAccessibilityTester(): AccessibilityTesterService;
  getResponsiveTester(): ResponsiveTesterService;
}

/**
 * Visual & Accessibility Domain Plugin
 * Provides visual regression, accessibility auditing, and responsive testing
 */
export class VisualAccessibilityPlugin extends BaseDomainPlugin {
  private coordinator: IVisualAccessibilityCoordinatorExtended | null = null;
  private visualTester: VisualTesterService | null = null;
  private accessibilityTester: AccessibilityTesterService | null = null;
  private responsiveTester: ResponsiveTesterService | null = null;
  private readonly pluginConfig: VisualAccessibilityPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: VisualAccessibilityPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'visual-accessibility';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Visual accessibility testing is independent but can use code intelligence
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: VisualAccessibilityAPI = {
      // Coordinator methods
      runVisualTests: this.runVisualTests.bind(this),
      runAccessibilityAudit: this.runAccessibilityAudit.bind(this),
      approveVisualChanges: this.approveVisualChanges.bind(this),
      generateRemediationPlan: this.generateRemediationPlan.bind(this),
      getVisualTestingStatus: this.getVisualTestingStatus.bind(this),

      // Visual testing service methods
      captureScreenshot: this.captureScreenshot.bind(this),
      captureElement: this.captureElement.bind(this),

      // Accessibility service methods
      auditAccessibility: this.auditAccessibility.bind(this),
      checkContrast: this.checkContrast.bind(this),
      validateWCAGLevel: this.validateWCAGLevel.bind(this),
      checkKeyboardNavigation: this.checkKeyboardNavigation.bind(this),

      // Responsive testing service methods
      testResponsiveness: this.testResponsiveness.bind(this),
      analyzeBreakpoints: this.analyzeBreakpoints.bind(this),

      // Workflow integration (Issue #206)
      registerWorkflowActions: this.registerWorkflowActions.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getVisualTester: () => this.visualTester!,
      getAccessibilityTester: () => this.accessibilityTester!,
      getResponsiveTester: () => this.responsiveTester!,
    };

    return api as T;
  }

  // ============================================================================
  // Task Handlers (Queen-Domain Integration)
  // ============================================================================

  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      ['run-visual-tests', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }
        const urls = payload.urls as string[] | undefined;
        const viewports = payload.viewports as Viewport[] | undefined;
        if (!urls || urls.length === 0) {
          return err(new Error('Invalid run-visual-tests payload: missing urls'));
        }
        return this.coordinator.runVisualTests(
          urls,
          viewports || [{ width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }]
        );
      }],

      ['run-accessibility-audit', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }
        const urls = payload.urls as string[] | undefined;
        const level = (payload.level as 'A' | 'AA' | 'AAA') || 'AA';
        if (!urls || urls.length === 0) {
          return err(new Error('Invalid run-accessibility-audit payload: missing urls'));
        }
        return this.coordinator.runAccessibilityAudit(urls, level);
      }],

      ['capture-screenshot', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.visualTester) {
          return err(new Error('Visual tester not initialized'));
        }
        const url = payload.url as string | undefined;
        if (!url) {
          return err(new Error('Invalid capture-screenshot payload: missing url'));
        }
        return this.visualTester.captureScreenshot(url, payload.options as CaptureOptions | undefined);
      }],

      ['test-responsiveness', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.responsiveTester) {
          return err(new Error('Responsive tester not initialized'));
        }
        const url = payload.url as string | undefined;
        if (!url) {
          return err(new Error('Invalid test-responsiveness payload: missing url'));
        }
        return this.responsiveTester.testResponsiveness(url, payload.options as Partial<ResponsiveTestConfig> | undefined);
      }],

      ['validate-wcag', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.accessibilityTester) {
          return err(new Error('Accessibility tester not initialized'));
        }
        const url = payload.url as string | undefined;
        if (!url) {
          return err(new Error('Invalid validate-wcag payload: missing url'));
        }
        const level = (payload.level as 'A' | 'AA' | 'AAA') || 'AA';
        return this.accessibilityTester.validateWCAGLevel(url, level);
      }],
    ]);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services using factory function for proper DI
    this.visualTester = createVisualTesterService(
      this.memory,
      this.pluginConfig.visualTester
    );

    this.accessibilityTester = new AccessibilityTesterService(
      this.memory,
      this.pluginConfig.accessibilityTester
    );

    this.responsiveTester = new ResponsiveTesterService(
      this.memory,
      this.pluginConfig.responsiveTester
    );

    // Create coordinator
    this.coordinator = new VisualAccessibilityCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator,
      this.pluginConfig.visualTester,
      this.pluginConfig.accessibilityTester,
      this.pluginConfig.responsiveTester
    );

    // Initialize coordinator
    await this.coordinator.initialize();

    // Issue #205 fix: Start with 'idle' status (0 agents)
    this.updateHealth({
      status: 'idle',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
      lastActivity: new Date(),
      errors: [],
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.dispose();
    }

    this.coordinator = null;
    this.visualTester = null;
    this.accessibilityTester = null;
    this.responsiveTester = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to deployment events for automated testing
    this.eventBus.subscribe(
      'ci-cd.DeploymentCompleted',
      this.handleDeploymentCompleted.bind(this)
    );

    // Subscribe to code changes for affected component testing
    this.eventBus.subscribe(
      'code-intelligence.FileChanged',
      this.handleFileChanged.bind(this)
    );

    // Subscribe to quality gate events
    this.eventBus.subscribe(
      'quality-assessment.QualityGateTriggered',
      this.handleQualityGateTriggered.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'ci-cd.DeploymentCompleted':
        await this.handleDeploymentCompleted(event);
        break;
      case 'code-intelligence.FileChanged':
        await this.handleFileChanged(event);
        break;
      case 'quality-assessment.QualityGateTriggered':
        await this.handleQualityGateTriggered(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation - Coordinator Methods
  // ============================================================================

  private async runVisualTests(
    urls: string[],
    viewports: Viewport[]
  ): Promise<Result<VisualTestReport, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.runVisualTests(urls, viewports);

      if (result.success) {
        this.trackSuccessfulTest('visual', result.value.totalTests);
      } else {
        this.trackFailedTest(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runAccessibilityAudit(
    urls: string[],
    level: 'A' | 'AA' | 'AAA'
  ): Promise<Result<AccessibilityAuditReport, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.runAccessibilityAudit(urls, level);

      if (result.success) {
        this.trackSuccessfulTest('accessibility', result.value.totalUrls);
      } else {
        this.trackFailedTest(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async approveVisualChanges(
    diffIds: string[],
    reason: string
  ): Promise<Result<void, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.approveVisualChanges(diffIds, reason);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateRemediationPlan(
    violations: AccessibilityViolation[]
  ): Promise<Result<RemediationPlan, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.generateRemediationPlan(violations);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getVisualTestingStatus(): Promise<Result<VisualTestingStatus, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.getVisualTestingStatus();
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Visual Tester Methods
  // ============================================================================

  private async captureScreenshot(
    url: string,
    options?: CaptureOptions
  ): Promise<Result<Screenshot, Error>> {
    this.ensureInitialized();

    try {
      return await this.visualTester!.captureScreenshot(url, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async captureElement(
    url: string,
    selector: string,
    options?: CaptureOptions
  ): Promise<Result<Screenshot, Error>> {
    this.ensureInitialized();

    try {
      return await this.visualTester!.captureElement(url, selector, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Accessibility Tester Methods
  // ============================================================================

  private async auditAccessibility(
    url: string,
    options?: AuditOptions
  ): Promise<Result<AccessibilityReport, Error>> {
    this.ensureInitialized();

    try {
      return await this.accessibilityTester!.audit(url, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async checkContrast(url: string): Promise<Result<ContrastAnalysis[], Error>> {
    this.ensureInitialized();

    try {
      return await this.accessibilityTester!.checkContrast(url);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateWCAGLevel(
    url: string,
    level: 'A' | 'AA' | 'AAA'
  ): Promise<Result<WCAGValidationResult, Error>> {
    this.ensureInitialized();

    try {
      return await this.accessibilityTester!.validateWCAGLevel(url, level);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async checkKeyboardNavigation(
    url: string
  ): Promise<Result<KeyboardNavigationReport, Error>> {
    this.ensureInitialized();

    try {
      return await this.accessibilityTester!.checkKeyboardNavigation(url);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Responsive Tester Methods
  // ============================================================================

  private async testResponsiveness(
    url: string,
    options?: Partial<ResponsiveTestConfig>
  ): Promise<Result<ResponsiveTestResult, Error>> {
    this.ensureInitialized();

    try {
      return await this.responsiveTester!.testResponsiveness(url, options);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async analyzeBreakpoints(url: string): Promise<Result<BreakpointAnalysis, Error>> {
    this.ensureInitialized();

    try {
      return await this.responsiveTester!.analyzeBreakpoints(url);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleDeploymentCompleted(event: DomainEvent): Promise<void> {
    // Deployment completed - could trigger visual and accessibility tests
    const payload = event.payload as {
      environment: string;
      urls?: string[];
    };

    // Store deployment info for potential testing
    await this.memory.set(
      `visual-accessibility:deployment:${Date.now()}`,
      payload,
      { namespace: 'visual-accessibility', ttl: 3600 }
    );
  }

  private async handleFileChanged(event: DomainEvent): Promise<void> {
    // File changed - could trigger affected component tests
    const payload = event.payload as {
      file: string;
      changeType: string;
    };

    // Store for potential component-level testing
    if (payload.file.endsWith('.css') || payload.file.endsWith('.scss')) {
      await this.memory.set(
        `visual-accessibility:style-change:${Date.now()}`,
        payload,
        { namespace: 'visual-accessibility', ttl: 3600 }
      );
    }
  }

  private async handleQualityGateTriggered(event: DomainEvent): Promise<void> {
    // Quality gate triggered - could include accessibility in quality checks
    const payload = event.payload as {
      gateId: string;
      checks: string[];
    };

    if (payload.checks.includes('accessibility')) {
      await this.memory.set(
        `visual-accessibility:quality-gate:${payload.gateId}`,
        { pending: true, timestamp: Date.now() },
        { namespace: 'visual-accessibility', ttl: 3600 }
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('VisualAccessibilityPlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.visualTester ||
      !this.accessibilityTester ||
      !this.responsiveTester
    ) {
      throw new Error('VisualAccessibilityPlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    // Track error
    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), err.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return { success: false, error: err };
  }

  private trackSuccessfulTest(_type: string, _count: number): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        total: health.agents.total + 1,
        idle: health.agents.idle + 1,
      },
      lastActivity: new Date(),
    });
  }

  private trackFailedTest(error: Error): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        failed: health.agents.failed + 1,
      },
      errors: [...health.errors.slice(-9), error.message],
    });
  }

  // ============================================================================
  // Workflow Action Registration (Issue #206)
  // ============================================================================

  /**
   * Register workflow actions with the WorkflowOrchestrator
   * This enables the visual-accessibility domain to be used in pipeline YAML workflows
   *
   * Actions registered:
   * - runVisualTest: Execute visual regression tests on specified URLs
   * - runAccessibilityTest: Run WCAG accessibility audits
   */
  registerWorkflowActions(orchestrator: WorkflowOrchestrator): void {
    if (!this._initialized) {
      throw new Error('VisualAccessibilityPlugin must be initialized before registering workflow actions');
    }

    // Register runVisualTest action
    // Maps to CLI command: `aqe visual test`
    orchestrator.registerAction(
      'visual-accessibility',
      'runVisualTest',
      async (
        input: Record<string, unknown>,
        _context: WorkflowContext
      ): Promise<Result<unknown, Error>> => {
        try {
          this.ensureInitialized();

          // Extract URLs from input
          const urls = this.extractUrls(input);
          if (urls.length === 0) {
            return err(new Error('No URLs provided for visual test. Provide "url" or "urls" parameter.'));
          }

          // Extract viewports from input, using defaults if not specified
          const viewports = this.extractViewports(input);

          // Run visual tests
          const result = await this.coordinator!.runVisualTests(urls, viewports);

          if (result.success) {
            return ok({
              passed: result.value.passed,
              failed: result.value.failed,
              totalTests: result.value.totalTests,
              newBaselines: result.value.newBaselines,
              duration: result.value.duration,
              results: result.value.results.map(r => ({
                url: r.url,
                viewport: `${r.viewport.width}x${r.viewport.height}`,
                status: r.status,
                diffPercentage: r.diff?.diffPercentage,
              })),
            });
          }

          return err(result.error);
        } catch (error) {
          return err(error instanceof Error ? error : new Error(String(error)));
        }
      }
    );

    // Register runAccessibilityTest action
    // Maps to CLI command: `aqe accessibility test`
    orchestrator.registerAction(
      'visual-accessibility',
      'runAccessibilityTest',
      async (
        input: Record<string, unknown>,
        _context: WorkflowContext
      ): Promise<Result<unknown, Error>> => {
        try {
          this.ensureInitialized();

          // Extract URLs from input
          const urls = this.extractUrls(input);
          if (urls.length === 0) {
            return err(new Error('No URLs provided for accessibility test. Provide "url" or "urls" parameter.'));
          }

          // Extract WCAG level from input, defaulting to AA
          const level = this.extractWcagLevel(input);

          // Run accessibility audit
          const result = await this.coordinator!.runAccessibilityAudit(urls, level);

          if (result.success) {
            return ok({
              totalUrls: result.value.totalUrls,
              passingUrls: result.value.passingUrls,
              totalViolations: result.value.totalViolations,
              criticalViolations: result.value.criticalViolations,
              averageScore: result.value.averageScore,
              topIssues: result.value.topIssues.map(issue => ({
                ruleId: issue.ruleId,
                description: issue.description,
                occurrences: issue.occurrences,
                impact: issue.impact,
              })),
            });
          }

          return err(result.error);
        } catch (error) {
          return err(error instanceof Error ? error : new Error(String(error)));
        }
      }
    );
  }

  /**
   * Extract URLs from workflow input
   * Supports: url (string), urls (string[]), or target (string)
   */
  private extractUrls(input: Record<string, unknown>): string[] {
    if (typeof input.url === 'string') {
      return [input.url];
    }
    if (Array.isArray(input.urls)) {
      return input.urls.filter((u): u is string => typeof u === 'string');
    }
    if (typeof input.target === 'string') {
      return [input.target];
    }
    return [];
  }

  /**
   * Extract viewports from workflow input
   * Supports: viewport (object), viewports (array), or defaults
   */
  private extractViewports(input: Record<string, unknown>): Viewport[] {
    const DEFAULT_VIEWPORTS: Viewport[] = [
      { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
      { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    ];

    if (Array.isArray(input.viewports)) {
      return input.viewports
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(v => ({
          width: typeof v.width === 'number' ? v.width : 1920,
          height: typeof v.height === 'number' ? v.height : 1080,
          deviceScaleFactor: typeof v.deviceScaleFactor === 'number' ? v.deviceScaleFactor : 1,
          isMobile: typeof v.isMobile === 'boolean' ? v.isMobile : false,
          hasTouch: typeof v.hasTouch === 'boolean' ? v.hasTouch : false,
        }));
    }

    if (typeof input.viewport === 'object' && input.viewport !== null) {
      const v = input.viewport as Record<string, unknown>;
      return [{
        width: typeof v.width === 'number' ? v.width : 1920,
        height: typeof v.height === 'number' ? v.height : 1080,
        deviceScaleFactor: typeof v.deviceScaleFactor === 'number' ? v.deviceScaleFactor : 1,
        isMobile: typeof v.isMobile === 'boolean' ? v.isMobile : false,
        hasTouch: typeof v.hasTouch === 'boolean' ? v.hasTouch : false,
      }];
    }

    return DEFAULT_VIEWPORTS;
  }

  /**
   * Extract WCAG compliance level from workflow input
   * Supports: level (string), wcagLevel (string), or default 'AA'
   */
  private extractWcagLevel(input: Record<string, unknown>): 'A' | 'AA' | 'AAA' {
    const levelStr = (input.level ?? input.wcagLevel ?? 'AA') as string;
    const normalized = levelStr.toUpperCase();
    if (normalized === 'A' || normalized === 'AA' || normalized === 'AAA') {
      return normalized;
    }
    return 'AA';
  }
}

/**
 * Factory function to create a VisualAccessibilityPlugin
 */
export function createVisualAccessibilityPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: VisualAccessibilityPluginConfig
): VisualAccessibilityPlugin {
  return new VisualAccessibilityPlugin(eventBus, memory, agentCoordinator, config);
}
