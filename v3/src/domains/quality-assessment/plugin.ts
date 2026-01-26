/**
 * Agentic QE v3 - Quality Assessment Domain Plugin
 * Integrates the quality assessment domain into the kernel
 */

import { DomainName, DomainEvent, Result, ok, err } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { BaseDomainPlugin, TaskHandler } from '../domain-interface';
import {
  QualityAssessmentAPI,
  GateEvaluationRequest,
  GateResult,
  QualityAnalysisRequest,
  QualityReport,
  DeploymentRequest,
  DeploymentAdvice,
  ComplexityRequest,
  ComplexityReport,
  QualityMetrics,
  GateThresholds,
} from './interfaces';
import {
  QualityAssessmentCoordinator,
  IQualityAssessmentCoordinator,
  CoordinatorConfig,
} from './coordinator';
import {
  QualityGateService,
  IQualityGateService,
  QualityGateConfig,
} from './services/quality-gate';
import {
  QualityAnalyzerService,
  IQualityAnalyzerService,
  QualityAnalyzerConfig,
} from './services/quality-analyzer';
import {
  DeploymentAdvisorService,
  IDeploymentAdvisorService,
  DeploymentAdvisorConfig,
} from './services/deployment-advisor';

/**
 * Plugin configuration options
 */
export interface QualityAssessmentPluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  qualityGate?: Partial<QualityGateConfig>;
  qualityAnalyzer?: Partial<QualityAnalyzerConfig>;
  deploymentAdvisor?: Partial<DeploymentAdvisorConfig>;
}

/**
 * Extended API with internal access
 */
export interface QualityAssessmentExtendedAPI extends QualityAssessmentAPI {
  /** Get the internal coordinator */
  getCoordinator(): IQualityAssessmentCoordinator;

  /** Get the quality gate service */
  getQualityGate(): IQualityGateService;

  /** Get the quality analyzer service */
  getQualityAnalyzer(): IQualityAnalyzerService;

  /** Get the deployment advisor service */
  getDeploymentAdvisor(): IDeploymentAdvisorService;
}

/**
 * Quality Assessment Domain Plugin
 * Provides intelligent quality gate decisions and deployment recommendations
 */
export class QualityAssessmentPlugin extends BaseDomainPlugin {
  private coordinator: IQualityAssessmentCoordinator | null = null;
  private qualityGate: IQualityGateService | null = null;
  private qualityAnalyzer: IQualityAnalyzerService | null = null;
  private deploymentAdvisor: IDeploymentAdvisorService | null = null;
  private readonly pluginConfig: QualityAssessmentPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: QualityAssessmentPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'quality-assessment';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Quality assessment can optionally use:
    // - test-execution for test results
    // - coverage-analysis for coverage data
    // - security-compliance for security findings
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: QualityAssessmentExtendedAPI = {
      // Public API methods
      evaluateGate: this.evaluateGate.bind(this),
      analyzeQuality: this.analyzeQuality.bind(this),
      getDeploymentAdvice: this.getDeploymentAdvice.bind(this),
      analyzeComplexity: this.analyzeComplexity.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getQualityGate: () => this.qualityGate!,
      getQualityAnalyzer: () => this.qualityAnalyzer!,
      getDeploymentAdvisor: () => this.deploymentAdvisor!,
    };

    return api as T;
  }

  // ============================================================================
  // Task Handlers (Queen-Domain Integration)
  // ============================================================================

  /**
   * Get task handlers for direct Queen-Domain integration
   * Maps task types to coordinator methods
   */
  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      // Evaluate quality gate task - main task type for this domain
      ['evaluate-gate', async (payload): Promise<Result<unknown, Error>> => {
        const gateName = payload.gateName as string | undefined;
        const metrics = payload.metrics as QualityMetrics | undefined;
        const thresholds = payload.thresholds as GateThresholds | undefined;

        if (!gateName || !metrics || !thresholds) {
          return err(new Error('Invalid evaluate-gate payload: missing gateName, metrics, or thresholds'));
        }

        const request: GateEvaluationRequest = {
          gateName,
          metrics,
          thresholds,
        };

        return this.evaluateGate(request);
      }],

      // Analyze quality task
      ['analyze-quality', async (payload): Promise<Result<unknown, Error>> => {
        const sourceFiles = payload.sourceFiles as string[] | undefined;

        if (!sourceFiles || sourceFiles.length === 0) {
          return err(new Error('Invalid analyze-quality payload: missing sourceFiles'));
        }

        const request: QualityAnalysisRequest = {
          sourceFiles,
          includeMetrics: (payload.includeMetrics as string[]) ?? ['coverage', 'complexity', 'maintainability'],
          compareBaseline: payload.compareBaseline as string | undefined,
        };

        return this.analyzeQuality(request);
      }],

      // Get deployment advice task
      ['deployment-advice', async (payload): Promise<Result<unknown, Error>> => {
        const releaseCandidate = payload.releaseCandidate as string | undefined;
        const metrics = payload.metrics as QualityMetrics | undefined;
        const riskTolerance = payload.riskTolerance as 'low' | 'medium' | 'high' | undefined;

        if (!releaseCandidate || !metrics) {
          return err(new Error('Invalid deployment-advice payload: missing releaseCandidate or metrics'));
        }

        const request: DeploymentRequest = {
          releaseCandidate,
          metrics,
          riskTolerance: riskTolerance ?? 'medium',
        };

        return this.getDeploymentAdvice(request);
      }],

      // Analyze complexity task
      ['analyze-complexity', async (payload): Promise<Result<unknown, Error>> => {
        const sourceFiles = payload.sourceFiles as string[] | undefined;

        if (!sourceFiles || sourceFiles.length === 0) {
          return err(new Error('Invalid analyze-complexity payload: missing sourceFiles'));
        }

        const request: ComplexityRequest = {
          sourceFiles,
          metrics: (payload.metrics as ComplexityRequest['metrics']) ?? ['cyclomatic', 'cognitive'],
        };

        return this.analyzeComplexity(request);
      }],
    ]);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.qualityGate = new QualityGateService(
      this.memory,
      this.pluginConfig.qualityGate
    );

    this.qualityAnalyzer = new QualityAnalyzerService(
      this.memory,
      this.pluginConfig.qualityAnalyzer
    );

    this.deploymentAdvisor = new DeploymentAdvisorService(
      this.memory,
      this.pluginConfig.deploymentAdvisor
    );

    // Create coordinator
    this.coordinator = new QualityAssessmentCoordinator(
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
    this.qualityGate = null;
    this.qualityAnalyzer = null;
    this.deploymentAdvisor = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to test execution events
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to coverage analysis events
    this.eventBus.subscribe(
      'coverage-analysis.CoverageReportCreated',
      this.handleCoverageReport.bind(this)
    );

    // Subscribe to defect intelligence events
    this.eventBus.subscribe(
      'defect-intelligence.DefectPredicted',
      this.handleDefectPrediction.bind(this)
    );

    // Subscribe to security compliance events
    this.eventBus.subscribe(
      'security-compliance.VulnerabilityDetected',
      this.handleVulnerabilityDetected.bind(this)
    );
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Track activity
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'test-execution.TestRunCompleted':
        await this.handleTestRunCompleted(event);
        break;
      case 'coverage-analysis.CoverageReportCreated':
        await this.handleCoverageReport(event);
        break;
      case 'defect-intelligence.DefectPredicted':
        await this.handleDefectPrediction(event);
        break;
      case 'security-compliance.VulnerabilityDetected':
        await this.handleVulnerabilityDetected(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation
  // ============================================================================

  private async evaluateGate(
    request: GateEvaluationRequest
  ): Promise<Result<GateResult, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.evaluateGate(request);

      if (result.success) {
        this.trackSuccessfulOperation('gate-evaluation');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async analyzeQuality(
    request: QualityAnalysisRequest
  ): Promise<Result<QualityReport, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.analyzeQuality(request);

      if (result.success) {
        this.trackSuccessfulOperation('quality-analysis');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async getDeploymentAdvice(
    request: DeploymentRequest
  ): Promise<Result<DeploymentAdvice, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.getDeploymentAdvice(request);

      if (result.success) {
        this.trackSuccessfulOperation('deployment-advice');
      } else {
        this.trackFailedOperation(result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async analyzeComplexity(
    request: ComplexityRequest
  ): Promise<Result<ComplexityReport, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.analyzeComplexity(request);

      if (result.success) {
        this.trackSuccessfulOperation('complexity-analysis');
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

  private async handleTestRunCompleted(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      runId: string;
      passed: number;
      failed: number;
      skipped: number;
      duration: number;
    };

    // Store test results for quality assessment
    await this.memory.set(
      `quality-assessment:test-results:${payload.runId}`,
      {
        ...payload,
        receivedAt: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', ttl: 86400 }
    );

    // Update quality metrics if significant failures
    if (payload.failed > 0) {
      const totalTests = payload.passed + payload.failed + payload.skipped;
      const passingRate = (payload.passed / totalTests) * 100;

      if (passingRate < 95) {
        // Store as potential quality concern
        await this.memory.set(
          `quality-assessment:concerns:test-failures:${payload.runId}`,
          {
            type: 'test-failures',
            passingRate,
            failedCount: payload.failed,
            severity: passingRate < 80 ? 'high' : 'medium',
          },
          { namespace: 'quality-assessment', ttl: 86400 * 7 }
        );
      }
    }
  }

  private async handleCoverageReport(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      reportId: string;
      line: number;
      branch: number;
      function: number;
      statement: number;
    };

    // Store coverage data for quality assessment
    await this.memory.set(
      `quality-assessment:coverage:${payload.reportId}`,
      {
        ...payload,
        receivedAt: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', ttl: 86400 }
    );
  }

  private async handleDefectPrediction(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      predictionId: string;
      file: string;
      probability: number;
      factors: string[];
    };

    // High probability defects affect quality assessment
    if (payload.probability >= 0.7) {
      await this.memory.set(
        `quality-assessment:defect-risks:${payload.predictionId}`,
        {
          ...payload,
          severity: payload.probability >= 0.9 ? 'critical' : 'high',
        },
        { namespace: 'quality-assessment', ttl: 86400 * 7 }
      );
    }
  }

  private async handleVulnerabilityDetected(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      vulnId: string;
      cve?: string;
      severity: string;
      file: string;
    };

    // Security vulnerabilities directly impact deployment decisions
    await this.memory.set(
      `quality-assessment:vulnerabilities:${payload.vulnId}`,
      {
        ...payload,
        receivedAt: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', persist: true }
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('QualityAssessmentPlugin is not initialized');
    }

    if (!this.coordinator || !this.qualityGate || !this.qualityAnalyzer || !this.deploymentAdvisor) {
      throw new Error('QualityAssessmentPlugin services are not available');
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

  private trackSuccessfulOperation(type: string): void {
    const health = this.getHealth();
    this.updateHealth({
      agents: {
        ...health.agents,
        total: health.agents.total + 1,
        idle: health.agents.idle + 1,
      },
      lastActivity: new Date(),
    });

    // Store operation metrics
    this.memory.set(
      `quality-assessment:metrics:${type}:${Date.now()}`,
      { type, success: true, timestamp: new Date().toISOString() },
      { namespace: 'quality-assessment', ttl: 86400 }
    ).catch(() => {
      // Silent failure for metrics
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
 * Factory function to create a QualityAssessmentPlugin
 */
export function createQualityAssessmentPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: QualityAssessmentPluginConfig
): QualityAssessmentPlugin {
  return new QualityAssessmentPlugin(eventBus, memory, agentCoordinator, config);
}
