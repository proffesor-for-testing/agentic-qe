/**
 * Agentic QE v3 - Requirements Validation Domain Plugin
 * Integrates the requirements validation domain into the kernel
 */

import { DomainName, DomainEvent, Result } from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin } from '../domain-interface.js';
import {
  IRequirementsValidationService,
  ITestabilityScoringService,
  IBDDGenerationService,
  Requirement,
  ValidationError,
  ValidationCriteria,
  AmbiguityReport,
  DependencyGraph,
  TestabilityScore,
  BDDScenario,
  RequirementAnalysis,
  TestArtifacts,
  SprintValidation,
} from './interfaces.js';
import {
  RequirementsValidationCoordinator,
  CoordinatorConfig,
  WorkflowStatus,
} from './coordinator.js';
import {
  RequirementsValidatorService,
  RequirementsValidatorConfig,
} from './services/requirements-validator.js';
import {
  BDDScenarioWriterService,
  BDDScenarioWriterConfig,
} from './services/bdd-scenario-writer.js';
import {
  TestabilityScorerService,
  TestabilityScorerConfig,
} from './services/testability-scorer.js';
import {
  QCSDIdeationPlugin,
  createQCSDIdeationPlugin,
  type IdeationReport,
} from './qcsd-ideation-plugin.js';
import type { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator.js';

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface RequirementsValidationPluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  validator?: Partial<RequirementsValidatorConfig>;
  bddWriter?: Partial<BDDScenarioWriterConfig>;
  testabilityScorer?: Partial<TestabilityScorerConfig>;
}

// ============================================================================
// Extended API
// ============================================================================

/**
 * Public API for the requirements validation domain
 */
export interface RequirementsValidationAPI {
  // Validation operations
  validate(requirement: Requirement): Promise<Result<ValidationError[]>>;
  validateAgainstCriteria(
    requirement: Requirement,
    criteria: ValidationCriteria
  ): Promise<Result<ValidationError[]>>;
  detectAmbiguity(requirement: Requirement): Promise<Result<AmbiguityReport>>;
  analyzeDependencies(requirements: Requirement[]): Promise<Result<DependencyGraph>>;

  // Testability scoring
  scoreRequirement(requirement: Requirement): Promise<Result<TestabilityScore>>;
  scoreRequirements(requirements: Requirement[]): Promise<Result<Map<string, TestabilityScore>>>;
  suggestImprovements(
    requirement: Requirement,
    score: TestabilityScore
  ): Promise<Result<string[]>>;
  meetsThreshold(score: TestabilityScore, threshold: number): boolean;

  // BDD generation
  generateScenarios(requirement: Requirement): Promise<Result<BDDScenario[]>>;
  generateScenariosWithExamples(
    requirement: Requirement,
    exampleCount: number
  ): Promise<Result<BDDScenario[]>>;
  toGherkin(scenarios: BDDScenario[]): string;
  parseGherkin(gherkinText: string): Result<BDDScenario[]>;

  // Coordinated workflows
  analyzeRequirement(requirementId: string): Promise<Result<RequirementAnalysis>>;
  generateTestArtifacts(requirementId: string): Promise<Result<TestArtifacts>>;
  validateSprintRequirements(requirementIds: string[]): Promise<Result<SprintValidation>>;
}

/**
 * Extended API with internal access
 */
export interface RequirementsValidationExtendedAPI extends RequirementsValidationAPI {
  /** Get the internal coordinator */
  getCoordinator(): RequirementsValidationCoordinator;

  /** Get the validator service */
  getValidator(): IRequirementsValidationService;

  /** Get the BDD writer service */
  getBDDWriter(): IBDDGenerationService;

  /** Get the testability scorer service */
  getTestabilityScorer(): ITestabilityScoringService;

  /** Get active workflows */
  getActiveWorkflows(): WorkflowStatus[];

  /**
   * Register QCSD Ideation workflow actions with the orchestrator
   * This enables the qcsd-ideation-swarm workflow to execute
   */
  registerWorkflowActions(orchestrator: WorkflowOrchestrator): void;
}

// ============================================================================
// Plugin Implementation
// ============================================================================

/**
 * Requirements Validation Domain Plugin
 * Provides pre-development requirements analysis capabilities
 */
export class RequirementsValidationPlugin extends BaseDomainPlugin {
  private coordinator: RequirementsValidationCoordinator | null = null;
  private validator: RequirementsValidatorService | null = null;
  private bddWriter: BDDScenarioWriterService | null = null;
  private testabilityScorer: TestabilityScorerService | null = null;
  private qcsdIdeationPlugin: QCSDIdeationPlugin | null = null;
  private readonly pluginConfig: RequirementsValidationPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: RequirementsValidationPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'requirements-validation';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Requirements validation can optionally integrate with code intelligence
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: RequirementsValidationExtendedAPI = {
      // Validation operations
      validate: this.validate.bind(this),
      validateAgainstCriteria: this.validateAgainstCriteria.bind(this),
      detectAmbiguity: this.detectAmbiguity.bind(this),
      analyzeDependencies: this.analyzeDependencies.bind(this),

      // Testability scoring
      scoreRequirement: this.scoreRequirement.bind(this),
      scoreRequirements: this.scoreRequirements.bind(this),
      suggestImprovements: this.suggestImprovements.bind(this),
      meetsThreshold: this.meetsThreshold.bind(this),

      // BDD generation
      generateScenarios: this.generateScenarios.bind(this),
      generateScenariosWithExamples: this.generateScenariosWithExamples.bind(this),
      toGherkin: this.toGherkin.bind(this),
      parseGherkin: this.parseGherkin.bind(this),

      // Coordinated workflows
      analyzeRequirement: this.analyzeRequirement.bind(this),
      generateTestArtifacts: this.generateTestArtifacts.bind(this),
      validateSprintRequirements: this.validateSprintRequirements.bind(this),

      // Internal access
      getCoordinator: () => this.coordinator!,
      getValidator: () => this.validator!,
      getBDDWriter: () => this.bddWriter!,
      getTestabilityScorer: () => this.testabilityScorer!,
      getActiveWorkflows: () => this.coordinator?.getActiveWorkflows() || [],

      // QCSD Ideation workflow registration
      registerWorkflowActions: this.registerWorkflowActions.bind(this),
    };

    return api as T;
  }

  /**
   * Register QCSD Ideation workflow actions with the orchestrator
   */
  private registerWorkflowActions(orchestrator: WorkflowOrchestrator): void {
    this.ensureInitialized();

    if (!this.qcsdIdeationPlugin) {
      throw new Error('QCSD Ideation Plugin not initialized');
    }

    this.qcsdIdeationPlugin.registerWorkflowActions(orchestrator);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.validator = new RequirementsValidatorService(
      this.memory,
      this.pluginConfig.validator
    );

    this.bddWriter = new BDDScenarioWriterService(
      this.memory,
      this.pluginConfig.bddWriter
    );

    this.testabilityScorer = new TestabilityScorerService(
      this.memory,
      this.pluginConfig.testabilityScorer
    );

    // Create and initialize coordinator
    this.coordinator = new RequirementsValidationCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
    );

    await this.coordinator.initialize();

    // Create and initialize QCSD Ideation Plugin
    this.qcsdIdeationPlugin = createQCSDIdeationPlugin(this.memory);
    await this.qcsdIdeationPlugin.initialize();

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

    if (this.qcsdIdeationPlugin) {
      await this.qcsdIdeationPlugin.dispose();
    }

    this.coordinator = null;
    this.validator = null;
    this.bddWriter = null;
    this.testabilityScorer = null;
    this.qcsdIdeationPlugin = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to test generation events
    this.eventBus.subscribe(
      'test-generation.TestGenerated',
      this.handleTestGenerated.bind(this)
    );

    // Subscribe to code intelligence events
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    this.updateHealth({
      lastActivity: new Date(),
    });

    switch (event.type) {
      case 'test-generation.TestGenerated':
        await this.handleTestGenerated(event);
        break;
      case 'code-intelligence.ImpactAnalysisCompleted':
        await this.handleImpactAnalysis(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // Validation API Implementation
  // ============================================================================

  private async validate(requirement: Requirement): Promise<Result<ValidationError[]>> {
    this.ensureInitialized();
    try {
      return await this.validator!.validate(requirement);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateAgainstCriteria(
    requirement: Requirement,
    criteria: ValidationCriteria
  ): Promise<Result<ValidationError[]>> {
    this.ensureInitialized();
    try {
      return await this.validator!.validateAgainstCriteria(requirement, criteria);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async detectAmbiguity(requirement: Requirement): Promise<Result<AmbiguityReport>> {
    this.ensureInitialized();
    try {
      return await this.validator!.detectAmbiguity(requirement);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async analyzeDependencies(
    requirements: Requirement[]
  ): Promise<Result<DependencyGraph>> {
    this.ensureInitialized();
    try {
      return await this.validator!.analyzeDependencies(requirements);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Testability Scoring API Implementation
  // ============================================================================

  private async scoreRequirement(
    requirement: Requirement
  ): Promise<Result<TestabilityScore>> {
    this.ensureInitialized();
    try {
      return await this.testabilityScorer!.scoreRequirement(requirement);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async scoreRequirements(
    requirements: Requirement[]
  ): Promise<Result<Map<string, TestabilityScore>>> {
    this.ensureInitialized();
    try {
      return await this.testabilityScorer!.scoreRequirements(requirements);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async suggestImprovements(
    requirement: Requirement,
    score: TestabilityScore
  ): Promise<Result<string[]>> {
    this.ensureInitialized();
    try {
      return await this.testabilityScorer!.suggestImprovements(requirement, score);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private meetsThreshold(score: TestabilityScore, threshold: number): boolean {
    this.ensureInitialized();
    return this.testabilityScorer!.meetsThreshold(score, threshold);
  }

  // ============================================================================
  // BDD Generation API Implementation
  // ============================================================================

  private async generateScenarios(
    requirement: Requirement
  ): Promise<Result<BDDScenario[]>> {
    this.ensureInitialized();
    try {
      return await this.bddWriter!.generateScenarios(requirement);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateScenariosWithExamples(
    requirement: Requirement,
    exampleCount: number
  ): Promise<Result<BDDScenario[]>> {
    this.ensureInitialized();
    try {
      return await this.bddWriter!.generateScenariosWithExamples(requirement, exampleCount);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private toGherkin(scenarios: BDDScenario[]): string {
    this.ensureInitialized();
    return this.bddWriter!.toGherkin(scenarios);
  }

  private parseGherkin(gherkinText: string): Result<BDDScenario[]> {
    this.ensureInitialized();
    return this.bddWriter!.parseGherkin(gherkinText);
  }

  // ============================================================================
  // Coordinated Workflow API Implementation
  // ============================================================================

  private async analyzeRequirement(
    requirementId: string
  ): Promise<Result<RequirementAnalysis>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.analyzeRequirement(requirementId);

      if (result.success) {
        this.trackSuccessfulOperation('analyze');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async generateTestArtifacts(
    requirementId: string
  ): Promise<Result<TestArtifacts>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.generateTestArtifacts(requirementId);

      if (result.success) {
        this.trackSuccessfulOperation('generate-artifacts');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async validateSprintRequirements(
    requirementIds: string[]
  ): Promise<Result<SprintValidation>> {
    this.ensureInitialized();
    try {
      const result = await this.coordinator!.validateSprintRequirements(requirementIds);

      if (result.success) {
        this.trackSuccessfulOperation('validate-sprint');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleTestGenerated(event: DomainEvent): Promise<void> {
    // Could update requirement status when tests are generated for it
    const payload = event.payload as {
      testId: string;
      sourceFile: string;
    };

    // Store reference for traceability
    await this.memory.set(
      `requirements-validation:test-link:${payload.testId}`,
      {
        testId: payload.testId,
        sourceFile: payload.sourceFile,
        linkedAt: new Date().toISOString(),
      },
      { namespace: 'requirements-validation', ttl: 86400 * 30 }
    );
  }

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    // Could trigger re-validation of affected requirements
    const payload = event.payload as {
      analysisId: string;
      changedFiles: string[];
      impactedTests: string[];
    };

    // Store for potential requirement impact analysis
    await this.memory.set(
      `requirements-validation:impact:${payload.analysisId}`,
      payload,
      { namespace: 'requirements-validation', ttl: 3600 }
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('RequirementsValidationPlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.validator ||
      !this.bddWriter ||
      !this.testabilityScorer
    ) {
      throw new Error('RequirementsValidationPlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), err.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return { success: false, error: err };
  }

  private trackSuccessfulOperation(_type: string): void {
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

  private trackFailedOperation(error: Error): void {
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

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create a RequirementsValidationPlugin
 */
export function createRequirementsValidationPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: RequirementsValidationPluginConfig
): RequirementsValidationPlugin {
  return new RequirementsValidationPlugin(eventBus, memory, agentCoordinator, config);
}
