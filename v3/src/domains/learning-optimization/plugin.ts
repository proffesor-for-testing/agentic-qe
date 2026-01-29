/**
 * Agentic QE v3 - Learning & Optimization Domain Plugin
 * Integrates the learning-optimization domain into the kernel
 */

import { DomainName, DomainEvent, Result, err } from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces.js';
import { BaseDomainPlugin, TaskHandler } from '../domain-interface.js';
import {
  ILearningOptimizationCoordinator,
  LearningCycleReport,
  OptimizationReport,
  CrossDomainSharingReport,
  LearningDashboard,
  ModelExport,
  ImportReport,
  LearnedPattern,
  Experience,
  Knowledge,
  PatternContext,
  PatternStats,
  KnowledgeQuery,
  OptimizedStrategy,
  OptimizationObjective,
  Strategy,
  ABTestConfig,
  ABTestResult,
  StrategyEvaluation,
} from './interfaces.js';
import {
  LearningOptimizationCoordinator,
  LearningCoordinatorConfig,
  LearningWorkflowStatus,
} from './coordinator.js';
import {
  LearningCoordinatorService,
  LearningCoordinatorConfig as ServiceConfig,
  TransferSpecialistService,
  TransferSpecialistConfig,
  MetricsOptimizerService,
  MetricsOptimizerConfig,
  ProductionIntelService,
  ProductionIntelConfig,
} from './services/index.js';

/**
 * Plugin configuration options
 */
export interface LearningOptimizationPluginConfig {
  coordinator?: Partial<LearningCoordinatorConfig>;
  learningService?: Partial<ServiceConfig>;
  transferService?: Partial<TransferSpecialistConfig>;
  optimizerService?: Partial<MetricsOptimizerConfig>;
  productionIntel?: Partial<ProductionIntelConfig>;
}

/**
 * Public API for the learning-optimization domain
 */
export interface LearningOptimizationAPI {
  // Coordinator methods
  runLearningCycle(domain: DomainName): Promise<Result<LearningCycleReport>>;
  optimizeAllStrategies(): Promise<Result<OptimizationReport>>;
  shareCrossDomainLearnings(): Promise<Result<CrossDomainSharingReport>>;
  getLearningDashboard(): Promise<Result<LearningDashboard>>;
  exportModels(domains?: DomainName[]): Promise<Result<ModelExport>>;
  importModels(modelExport: ModelExport): Promise<Result<ImportReport>>;

  // Pattern learning methods
  learnPattern(experiences: Experience[]): Promise<Result<LearnedPattern>>;
  findMatchingPatterns(
    context: PatternContext,
    limit?: number
  ): Promise<Result<LearnedPattern[]>>;
  applyPattern(
    pattern: LearnedPattern,
    variables: Record<string, unknown>
  ): Promise<Result<string>>;
  updatePatternFeedback(patternId: string, success: boolean): Promise<Result<void>>;
  getPatternStats(domain?: DomainName): Promise<Result<PatternStats>>;

  // Knowledge transfer methods
  queryKnowledge(query: KnowledgeQuery): Promise<Result<Knowledge[]>>;
  transferKnowledge(
    knowledge: Knowledge,
    targetDomain: DomainName
  ): Promise<Result<Knowledge>>;

  // Strategy optimization methods
  optimizeStrategy(
    currentStrategy: Strategy,
    objective: OptimizationObjective,
    experiences: Experience[]
  ): Promise<Result<OptimizedStrategy>>;
  runABTest(
    strategyA: Strategy,
    strategyB: Strategy,
    testConfig: ABTestConfig
  ): Promise<Result<ABTestResult>>;
  recommendStrategy(context: PatternContext): Promise<Result<Strategy>>;
  evaluateStrategy(
    strategy: Strategy,
    experiences: Experience[]
  ): Promise<Result<StrategyEvaluation>>;
}

/**
 * Extended API with internal access
 */
export interface LearningOptimizationExtendedAPI extends LearningOptimizationAPI {
  /** Get the internal coordinator */
  getCoordinator(): ILearningOptimizationCoordinator;

  /** Get active workflows */
  getActiveWorkflows(): LearningWorkflowStatus[];

  /** Get the learning service */
  getLearningService(): LearningCoordinatorService;

  /** Get the transfer service */
  getTransferService(): TransferSpecialistService;

  /** Get the optimizer service */
  getOptimizerService(): MetricsOptimizerService;

  /** Get the production intel service */
  getProductionIntelService(): ProductionIntelService;
}

/**
 * Learning & Optimization Domain Plugin
 * Provides cross-domain learning, pattern extraction, and strategy optimization
 */
export class LearningOptimizationPlugin extends BaseDomainPlugin {
  private coordinator: LearningOptimizationCoordinator | null = null;
  private learningService: LearningCoordinatorService | null = null;
  private transferService: TransferSpecialistService | null = null;
  private optimizerService: MetricsOptimizerService | null = null;
  private productionIntel: ProductionIntelService | null = null;
  private readonly pluginConfig: LearningOptimizationPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: LearningOptimizationPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'learning-optimization';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Learning optimization observes all other domains
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: LearningOptimizationExtendedAPI = {
      // Coordinator methods
      runLearningCycle: this.runLearningCycle.bind(this),
      optimizeAllStrategies: this.optimizeAllStrategies.bind(this),
      shareCrossDomainLearnings: this.shareCrossDomainLearnings.bind(this),
      getLearningDashboard: this.getLearningDashboard.bind(this),
      exportModels: this.exportModels.bind(this),
      importModels: this.importModels.bind(this),

      // Pattern learning methods
      learnPattern: this.learnPattern.bind(this),
      findMatchingPatterns: this.findMatchingPatterns.bind(this),
      applyPattern: this.applyPattern.bind(this),
      updatePatternFeedback: this.updatePatternFeedback.bind(this),
      getPatternStats: this.getPatternStats.bind(this),

      // Knowledge transfer methods
      queryKnowledge: this.queryKnowledge.bind(this),
      transferKnowledge: this.transferKnowledge.bind(this),

      // Strategy optimization methods
      optimizeStrategy: this.optimizeStrategy.bind(this),
      runABTest: this.runABTest.bind(this),
      recommendStrategy: this.recommendStrategy.bind(this),
      evaluateStrategy: this.evaluateStrategy.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getActiveWorkflows: () =>
        this.coordinator?.getActiveWorkflows() || [],
      getLearningService: () => this.learningService!,
      getTransferService: () => this.transferService!,
      getOptimizerService: () => this.optimizerService!,
      getProductionIntelService: () => this.productionIntel!,
    };

    return api as T;
  }

  // ============================================================================
  // Task Handlers (Queen-Domain Integration)
  // ============================================================================

  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      ['run-learning-cycle', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }
        const domain = payload.domain as DomainName | undefined;
        if (!domain) {
          return err(new Error('Invalid run-learning-cycle payload: missing domain'));
        }
        return this.coordinator.runLearningCycle(domain);
      }],

      ['optimize-strategies', async (_payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }
        return this.coordinator.optimizeAllStrategies();
      }],

      ['share-learnings', async (_payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }
        return this.coordinator.shareCrossDomainLearnings();
      }],

      ['learn-pattern', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.learningService) {
          return err(new Error('Learning service not initialized'));
        }
        const experiences = payload.experiences as Experience[] | undefined;
        if (!experiences || experiences.length === 0) {
          return err(new Error('Invalid learn-pattern payload: missing experiences'));
        }
        return this.learningService.learnPattern(experiences);
      }],

      ['query-knowledge', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.transferService) {
          return err(new Error('Transfer service not initialized'));
        }
        const query = payload.query as KnowledgeQuery | undefined;
        if (!query) {
          return err(new Error('Invalid query-knowledge payload: missing query'));
        }
        return this.transferService.queryKnowledge(query);
      }],
    ]);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.learningService = new LearningCoordinatorService(
      { memory: this.memory },
      this.pluginConfig.learningService
    );

    this.transferService = new TransferSpecialistService(
      this.memory,
      this.pluginConfig.transferService
    );

    this.optimizerService = new MetricsOptimizerService(
      this.memory,
      this.pluginConfig.optimizerService
    );

    this.productionIntel = new ProductionIntelService(
      this.memory,
      this.pluginConfig.productionIntel
    );

    // Create coordinator
    this.coordinator = new LearningOptimizationCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
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
    this.learningService = null;
    this.transferService = null;
    this.optimizerService = null;
    this.productionIntel = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to all domain events for learning
    this.eventBus.subscribe(
      'test-generation.TestGenerated',
      this.handleTestGenerated.bind(this)
    );

    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    this.eventBus.subscribe(
      'coverage-analysis.CoverageGapDetected',
      this.handleCoverageGap.bind(this)
    );

    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGate.bind(this)
    );

    this.eventBus.subscribe(
      'defect-intelligence.DefectPredicted',
      this.handleDefectPredicted.bind(this)
    );

    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'test-generation.TestGenerated':
        await this.handleTestGenerated(event);
        break;
      case 'test-execution.TestRunCompleted':
        await this.handleTestRunCompleted(event);
        break;
      case 'coverage-analysis.CoverageGapDetected':
        await this.handleCoverageGap(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation - Coordinator Methods
  // ============================================================================

  private async runLearningCycle(
    domain: DomainName
  ): Promise<Result<LearningCycleReport>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.runLearningCycle(domain);

      if (result.success) {
        this.trackSuccessfulOperation('learning-cycle');
      } else {
        this.trackFailedOperation('learning-cycle', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async optimizeAllStrategies(): Promise<Result<OptimizationReport>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.optimizeAllStrategies();

      if (result.success) {
        this.trackSuccessfulOperation('optimization');
      } else {
        this.trackFailedOperation('optimization', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async shareCrossDomainLearnings(): Promise<
    Result<CrossDomainSharingReport>
  > {
    this.ensureInitialized();

    try {
      return await this.coordinator!.shareCrossDomainLearnings();
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getLearningDashboard(): Promise<Result<LearningDashboard>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.getLearningDashboard();
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async exportModels(
    domains?: DomainName[]
  ): Promise<Result<ModelExport>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.exportModels(domains);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async importModels(
    modelExport: ModelExport
  ): Promise<Result<ImportReport>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.importModels(modelExport);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Pattern Learning Methods
  // ============================================================================

  private async learnPattern(
    experiences: Experience[]
  ): Promise<Result<LearnedPattern>> {
    this.ensureInitialized();

    try {
      return await this.learningService!.learnPattern(experiences);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async findMatchingPatterns(
    context: PatternContext,
    limit?: number
  ): Promise<Result<LearnedPattern[]>> {
    this.ensureInitialized();

    try {
      return await this.learningService!.findMatchingPatterns(context, limit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async applyPattern(
    pattern: LearnedPattern,
    variables: Record<string, unknown>
  ): Promise<Result<string>> {
    this.ensureInitialized();

    try {
      return await this.learningService!.applyPattern(pattern, variables);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async updatePatternFeedback(
    patternId: string,
    success: boolean
  ): Promise<Result<void>> {
    this.ensureInitialized();

    try {
      return await this.learningService!.updatePatternFeedback(patternId, success);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getPatternStats(
    domain?: DomainName
  ): Promise<Result<PatternStats>> {
    this.ensureInitialized();

    try {
      return await this.learningService!.getPatternStats(domain);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Knowledge Transfer Methods
  // ============================================================================

  private async queryKnowledge(
    query: KnowledgeQuery
  ): Promise<Result<Knowledge[]>> {
    this.ensureInitialized();

    try {
      return await this.transferService!.queryKnowledge(query);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async transferKnowledge(
    knowledge: Knowledge,
    targetDomain: DomainName
  ): Promise<Result<Knowledge>> {
    this.ensureInitialized();

    try {
      return await this.transferService!.transferKnowledge(knowledge, targetDomain);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // API Implementation - Strategy Optimization Methods
  // ============================================================================

  private async optimizeStrategy(
    currentStrategy: Strategy,
    objective: OptimizationObjective,
    experiences: Experience[]
  ): Promise<Result<OptimizedStrategy>> {
    this.ensureInitialized();

    try {
      return await this.optimizerService!.optimizeStrategy(
        currentStrategy,
        objective,
        experiences
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async runABTest(
    strategyA: Strategy,
    strategyB: Strategy,
    testConfig: ABTestConfig
  ): Promise<Result<ABTestResult>> {
    this.ensureInitialized();

    try {
      return await this.optimizerService!.runABTest(
        strategyA,
        strategyB,
        testConfig
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async recommendStrategy(
    context: PatternContext
  ): Promise<Result<Strategy>> {
    this.ensureInitialized();

    try {
      return await this.optimizerService!.recommendStrategy(context);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async evaluateStrategy(
    strategy: Strategy,
    experiences: Experience[]
  ): Promise<Result<StrategyEvaluation>> {
    this.ensureInitialized();

    try {
      return await this.optimizerService!.evaluateStrategy(strategy, experiences);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleTestGenerated(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      testId: string;
      testFile: string;
      testType: string;
    };

    // Record as experience
    await this.learningService!.recordExperience({
      agentId: {
        value: 'test-generation',
        domain: 'test-generation',
        type: 'generator',
      },
      domain: 'test-generation',
      action: 'test-generated',
      state: {
        context: { testId: payload.testId, testType: payload.testType },
        metrics: {},
      },
      result: {
        success: true,
        outcome: { generated: 1 },
        duration: 0,
      },
      reward: 0.8,
    });
  }

  private async handleTestRunCompleted(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      runId: string;
      passed: number;
      failed: number;
      duration: number;
    };

    const successRate =
      payload.passed + payload.failed > 0
        ? payload.passed / (payload.passed + payload.failed)
        : 0;

    await this.learningService!.recordExperience({
      agentId: {
        value: 'test-execution',
        domain: 'test-execution',
        type: 'tester',
      },
      domain: 'test-execution',
      action: 'test-run',
      state: {
        context: { runId: payload.runId },
        metrics: {
          passed: payload.passed,
          failed: payload.failed,
          duration: payload.duration,
        },
      },
      result: {
        success: successRate > 0.8,
        outcome: {
          success_rate: successRate,
          passed: payload.passed,
          failed: payload.failed,
        },
        duration: payload.duration,
      },
      reward: successRate,
    });

    // Record production metric
    await this.productionIntel!.recordMetric(
      'test_success_rate',
      successRate,
      'ratio',
      'test-execution',
      ['automated']
    );
  }

  private async handleCoverageGap(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      gapId: string;
      file: string;
      riskScore: number;
    };

    await this.learningService!.recordExperience({
      agentId: {
        value: 'coverage-analysis',
        domain: 'coverage-analysis',
        type: 'analyzer',
      },
      domain: 'coverage-analysis',
      action: 'gap-detection',
      state: {
        context: { gapId: payload.gapId, file: payload.file },
        metrics: { riskScore: payload.riskScore },
      },
      result: {
        success: true,
        outcome: { risk_score: payload.riskScore },
        duration: 0,
      },
      reward: 1 - payload.riskScore,
    });
  }

  private async handleQualityGate(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      gateId: string;
      passed: boolean;
    };

    await this.learningService!.recordExperience({
      agentId: {
        value: 'quality-assessment',
        domain: 'quality-assessment',
        type: 'validator',
      },
      domain: 'quality-assessment',
      action: 'gate-evaluation',
      state: {
        context: { gateId: payload.gateId },
        metrics: { passed: payload.passed ? 1 : 0 },
      },
      result: {
        success: payload.passed,
        outcome: { gate_passed: payload.passed ? 1 : 0 },
        duration: 0,
      },
      reward: payload.passed ? 1 : 0,
    });
  }

  private async handleDefectPredicted(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      predictionId: string;
      probability: number;
    };

    await this.learningService!.recordExperience({
      agentId: {
        value: 'defect-intelligence',
        domain: 'defect-intelligence',
        type: 'analyzer',
      },
      domain: 'defect-intelligence',
      action: 'defect-prediction',
      state: {
        context: { predictionId: payload.predictionId },
        metrics: { probability: payload.probability },
      },
      result: {
        success: true,
        outcome: { probability: payload.probability },
        duration: 0,
      },
      reward: 0.7, // Predictions are valuable
    });
  }

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      analysisId: string;
      changedFiles: string[];
      impactedFiles: string[];
    };

    await this.learningService!.recordExperience({
      agentId: {
        value: 'code-intelligence',
        domain: 'code-intelligence',
        type: 'analyzer',
      },
      domain: 'code-intelligence',
      action: 'impact-analysis',
      state: {
        context: { analysisId: payload.analysisId },
        metrics: {
          changedFiles: payload.changedFiles.length,
          impactedFiles: payload.impactedFiles.length,
        },
      },
      result: {
        success: true,
        outcome: {
          changed_count: payload.changedFiles.length,
          impacted_count: payload.impactedFiles.length,
        },
        duration: 0,
      },
      reward: 0.8,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('LearningOptimizationPlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.learningService ||
      !this.transferService ||
      !this.optimizerService ||
      !this.productionIntel
    ) {
      throw new Error('LearningOptimizationPlugin services are not available');
    }
  }

  private handleError<T>(error: unknown): Result<T, Error> {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Track error
    const currentHealth = this.getHealth();
    this.updateHealth({
      errors: [...currentHealth.errors.slice(-9), errorObj.message],
      status: currentHealth.errors.length >= 5 ? 'degraded' : currentHealth.status,
    });

    return err(errorObj);
  }

  private trackSuccessfulOperation(_operation: string): void {
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

  private trackFailedOperation(_operation: string, error: Error): void {
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
 * Factory function to create a LearningOptimizationPlugin
 */
export function createLearningOptimizationPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: LearningOptimizationPluginConfig
): LearningOptimizationPlugin {
  return new LearningOptimizationPlugin(
    eventBus,
    memory,
    agentCoordinator,
    config
  );
}
