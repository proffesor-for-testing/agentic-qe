/**
 * Agentic QE v3 - Visual & Accessibility Domain Plugin
 * Integrates the visual & accessibility testing domain into the kernel
 */

import { DomainName, DomainEvent, Result } from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin } from '../domain-interface.js';
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

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getVisualTester: () => this.visualTester!,
      getAccessibilityTester: () => this.accessibilityTester!,
      getResponsiveTester: () => this.responsiveTester!,
    };

    return api as T;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.visualTester = new VisualTesterService(
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

    // Update health status
    this.updateHealth({
      status: 'healthy',
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
