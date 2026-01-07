/**
 * Agentic QE v3 - Defect Intelligence Domain Plugin
 * Integrates the defect intelligence domain into the kernel
 */

import { DomainName, DomainEvent } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { BaseDomainPlugin } from '../domain-interface';
import {
  DefectIntelligenceAPI,
  PredictRequest,
  PredictionResult,
  RootCauseRequest,
  RootCauseAnalysis,
  RegressionRequest,
  RegressionRisk,
  ClusterRequest,
  DefectClusters,
  LearnRequest,
  LearnedDefectPatterns,
} from './interfaces';
import {
  DefectIntelligenceCoordinator,
  IDefectIntelligenceCoordinator,
  CoordinatorConfig,
} from './coordinator';
import {
  DefectPredictorService,
  IDefectPredictorService,
  DefectPredictorConfig,
} from './services/defect-predictor';
import {
  PatternLearnerService,
  IPatternLearnerService,
  PatternLearnerConfig,
} from './services/pattern-learner';
import {
  RootCauseAnalyzerService,
  IRootCauseAnalyzerService,
  RootCauseAnalyzerConfig,
} from './services/root-cause-analyzer';

/**
 * Plugin configuration options
 */
export interface DefectIntelligencePluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  predictor?: Partial<DefectPredictorConfig>;
  patternLearner?: Partial<PatternLearnerConfig>;
  rootCauseAnalyzer?: Partial<RootCauseAnalyzerConfig>;
}

/**
 * Extended API with internal access
 */
export interface DefectIntelligenceExtendedAPI extends DefectIntelligenceAPI {
  /** Get the internal coordinator */
  getCoordinator(): IDefectIntelligenceCoordinator;

  /** Get the defect predictor service */
  getPredictor(): IDefectPredictorService;

  /** Get the pattern learner service */
  getPatternLearner(): IPatternLearnerService;

  /** Get the root cause analyzer service */
  getRootCauseAnalyzer(): IRootCauseAnalyzerService;
}

/**
 * Defect Intelligence Domain Plugin
 * Provides ML-based defect prediction and analysis capabilities
 */
export class DefectIntelligencePlugin extends BaseDomainPlugin {
  private coordinator: IDefectIntelligenceCoordinator | null = null;
  private predictor: IDefectPredictorService | null = null;
  private patternLearner: IPatternLearnerService | null = null;
  private rootCauseAnalyzer: IRootCauseAnalyzerService | null = null;
  private readonly pluginConfig: DefectIntelligencePluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: DefectIntelligencePluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'defect-intelligence';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Defect intelligence can optionally use coverage and code intelligence
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: DefectIntelligenceExtendedAPI = {
      // Public API methods
      predictDefects: this.predictDefects.bind(this),
      analyzeRootCause: this.analyzeRootCause.bind(this),
      analyzeRegressionRisk: this.analyzeRegressionRisk.bind(this),
      clusterDefects: this.clusterDefects.bind(this),
      learnPatterns: this.learnPatterns.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getPredictor: () => this.predictor!,
      getPatternLearner: () => this.patternLearner!,
      getRootCauseAnalyzer: () => this.rootCauseAnalyzer!,
    };

    return api as T;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.predictor = new DefectPredictorService(
      this.memory,
      this.pluginConfig.predictor
    );

    this.patternLearner = new PatternLearnerService(
      this.memory,
      this.pluginConfig.patternLearner
    );

    this.rootCauseAnalyzer = new RootCauseAnalyzerService(
      this.memory,
      this.pluginConfig.rootCauseAnalyzer
    );

    // Create coordinator
    this.coordinator = new DefectIntelligenceCoordinator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.coordinator
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
    this.predictor = null;
    this.patternLearner = null;
    this.rootCauseAnalyzer = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to test execution events for defect learning
    this.eventBus.subscribe(
      'test-execution.FlakyTestDetected',
      this.handleFlakyTest.bind(this)
    );

    // Subscribe to coverage events for risk analysis
    this.eventBus.subscribe(
      'coverage-analysis.CoverageGapDetected',
      this.handleCoverageGap.bind(this)
    );

    // Subscribe to code intelligence events
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );

    // Subscribe to quality assessment events
    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGate.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'test-execution.FlakyTestDetected':
        await this.handleFlakyTest(event);
        break;
      case 'coverage-analysis.CoverageGapDetected':
        await this.handleCoverageGap(event);
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
  // API Implementation
  // ============================================================================

  private async predictDefects(
    request: PredictRequest
  ): Promise<import('../../shared/types').Result<PredictionResult, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.predictDefects(request);

      if (result.success) {
        this.trackSuccessfulOperation('predict');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async analyzeRootCause(
    request: RootCauseRequest
  ): Promise<import('../../shared/types').Result<RootCauseAnalysis, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.analyzeRootCause(request);

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

  private async analyzeRegressionRisk(
    request: RegressionRequest
  ): Promise<import('../../shared/types').Result<RegressionRisk, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.analyzeRegressionRisk(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async clusterDefects(
    request: ClusterRequest
  ): Promise<import('../../shared/types').Result<DefectClusters, Error>> {
    this.ensureInitialized();

    try {
      return await this.coordinator!.clusterDefects(request);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async learnPatterns(
    request: LearnRequest
  ): Promise<import('../../shared/types').Result<LearnedDefectPatterns, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.learnPatterns(request);

      if (result.success) {
        this.trackSuccessfulOperation('learn');
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleFlakyTest(event: DomainEvent): Promise<void> {
    // Flaky test detected - analyze for patterns
    const payload = event.payload as {
      testId: string;
      testFile: string;
      failureRate: number;
      pattern: string;
    };

    // Store for pattern learning
    await this.memory.set(
      `defect-intelligence:flaky-test:${payload.testId}`,
      {
        ...payload,
        detectedAt: new Date().toISOString(),
      },
      { namespace: 'defect-intelligence', ttl: 86400 * 30 } // 30 days
    );

    // If high failure rate, trigger analysis
    if (payload.failureRate > 0.3 && payload.testFile) {
      await this.coordinator?.predictDefects({
        files: [payload.testFile],
        threshold: 0.5,
      });
    }
  }

  private async handleCoverageGap(event: DomainEvent): Promise<void> {
    // Coverage gap detected - assess defect risk
    const payload = event.payload as {
      gapId: string;
      file: string;
      uncoveredLines: number[];
      riskScore: number;
    };

    // High risk coverage gaps indicate defect-prone areas
    if (payload.riskScore >= 0.7) {
      await this.memory.set(
        `defect-intelligence:coverage-gap:${payload.gapId}`,
        {
          ...payload,
          analyzedAt: new Date().toISOString(),
        },
        { namespace: 'defect-intelligence', ttl: 86400 * 7 }
      );
    }
  }

  private async handleImpactAnalysis(event: DomainEvent): Promise<void> {
    // Impact analysis completed - assess regression risk
    const payload = event.payload as {
      analysisId: string;
      changedFiles: string[];
      impactedFiles: string[];
    };

    // Store for correlation with defects
    await this.memory.set(
      `defect-intelligence:impact:${payload.analysisId}`,
      {
        ...payload,
        recordedAt: new Date().toISOString(),
      },
      { namespace: 'defect-intelligence', ttl: 86400 }
    );
  }

  private async handleQualityGate(event: DomainEvent): Promise<void> {
    // Quality gate evaluated - learn from failures
    const payload = event.payload as {
      gateId: string;
      passed: boolean;
      checks: Array<{ name: string; passed: boolean }>;
    };

    if (!payload.passed) {
      const failedChecks = payload.checks.filter((c) => !c.passed);
      await this.memory.set(
        `defect-intelligence:quality-failure:${payload.gateId}`,
        {
          failedChecks: failedChecks.map((c) => c.name),
          timestamp: new Date().toISOString(),
        },
        { namespace: 'defect-intelligence', ttl: 86400 * 7 }
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('DefectIntelligencePlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.predictor ||
      !this.patternLearner ||
      !this.rootCauseAnalyzer
    ) {
      throw new Error('DefectIntelligencePlugin services are not available');
    }
  }

  private handleError<T>(
    error: unknown
  ): import('../../shared/types').Result<T, Error> {
    const err = error instanceof Error ? error : new Error(String(error));

    // Track error
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

/**
 * Factory function to create a DefectIntelligencePlugin
 */
export function createDefectIntelligencePlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: DefectIntelligencePluginConfig
): DefectIntelligencePlugin {
  return new DefectIntelligencePlugin(eventBus, memory, agentCoordinator, config);
}
