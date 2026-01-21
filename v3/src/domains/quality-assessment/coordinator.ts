/**
 * Agentic QE v3 - Quality Assessment Coordinator
 * Orchestrates the quality assessment workflow across services
 *
 * Integrations (per ADR-040):
 * - ActorCritic RL: Quality gate threshold tuning
 * - QESONA: Quality pattern learning
 * - QEFlashAttention: Similarity computations for quality reports
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainEvent } from '../../shared/types';
import type {
  RLState,
  RLAction,
  RLExperience,
  DomainName,
} from '../../integrations/rl-suite/interfaces';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces';
import {
  QualityAssessmentEvents,
  createEvent,
} from '../../shared/events/domain-events';
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
} from './interfaces';
import {
  QualityGateService,
  IQualityGateService,
} from './services/quality-gate';
import {
  QualityAnalyzerService,
  IQualityAnalyzerService,
} from './services/quality-analyzer';
import {
  DeploymentAdvisorService,
  IDeploymentAdvisorService,
} from './services/deployment-advisor';

// Ruvector integrations
import { ActorCriticAlgorithm } from '../../integrations/rl-suite/algorithms/actor-critic';
import { PersistentSONAEngine, createPersistentSONAEngine } from '../../integrations/ruvector/sona-persistence.js';
import {
  QEFlashAttention,
  createQEFlashAttention,
} from '../../integrations/ruvector/wrappers';

// V3 Integration: ClaimVerifier for report verification (Phase 4)
import {
  ClaimVerifierService,
  createClaimVerifierService,
  type QEReport,
  type Claim,
  type ClaimType,
  type ReportVerification,
} from '../../agents/claim-verifier/index.js';

/**
 * Interface for the quality assessment coordinator
 */
export interface IQualityAssessmentCoordinator extends QualityAssessmentAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'gate-evaluation' | 'quality-analysis' | 'deployment-advice' | 'complexity-analysis';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  publishEvents: boolean;
  enableAutoGating: boolean;
  // Intelligent features
  enableRLThresholdTuning: boolean;
  enableSONAPatternLearning: boolean;
  enableFlashAttention: boolean;
  // V3 Integration: ClaimVerifier (Phase 4)
  /** Enable claim verification before publishing reports */
  enableClaimVerification: boolean;
  /** Root directory for claim verifier file operations */
  claimVerifierRootDir?: string;
}

/**
 * RL-trained thresholds result
 */
interface RLThresholdResult {
  thresholds: QualityGateThresholds;
  confidence: number;
  reasoning: string;
}

/**
 * Quality gate thresholds (for RL tuning)
 */
interface QualityGateThresholds {
  coverage?: { min: number };
  testsPassing?: { min: number };
  criticalBugs?: { max: number };
  codeSmells?: { max: number };
  securityVulnerabilities?: { max: number };
  technicalDebt?: { max: number };
  duplications?: { max: number };
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000,
  publishEvents: true,
  enableAutoGating: false,
  enableRLThresholdTuning: true,
  enableSONAPatternLearning: true,
  enableFlashAttention: true,
  // V3: ClaimVerifier enabled by default
  enableClaimVerification: true,
};

/**
 * Quality Assessment Coordinator
 * Orchestrates quality assessment workflows and coordinates with agents
 *
 * Integrations (per ADR-040):
 * - ActorCritic RL: Quality gate threshold tuning
 * - QESONA: Quality pattern learning
 * - QEFlashAttention: Similarity computations for quality reports
 */
export class QualityAssessmentCoordinator implements IQualityAssessmentCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly qualityGate: IQualityGateService;
  private readonly qualityAnalyzer: IQualityAnalyzerService;
  private readonly deploymentAdvisor: IDeploymentAdvisorService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  // Ruvector integration instances
  private actorCritic?: ActorCriticAlgorithm;
  private qesona?: PersistentSONAEngine;
  private flashAttention?: QEFlashAttention;

  // V3 Integration: ClaimVerifier for report verification
  private claimVerifier?: ClaimVerifierService;

  // Quality domain name for SONA
  private readonly domain: DomainName = 'quality-assessment';

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.qualityGate = new QualityGateService(memory);
    this.qualityAnalyzer = new QualityAnalyzerService(memory);
    this.deploymentAdvisor = new DeploymentAdvisorService(memory);
  }

  /**
   * Initialize the coordinator
   * Sets up Ruvector integrations: ActorCritic, QESONA, QEFlashAttention
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Subscribe to relevant events
      this.subscribeToEvents();

      // Load any persisted workflow state
      await this.loadWorkflowState();

      // Initialize Actor-Critic RL for threshold tuning
      if (this.config.enableRLThresholdTuning) {
        await this.initializeActorCritic();
      }

      // Initialize QESONA for quality pattern learning
      if (this.config.enableSONAPatternLearning) {
        await this.initializeQESONA();
      }

      // Initialize QEFlashAttention for similarity computations
      if (this.config.enableFlashAttention) {
        await this.initializeFlashAttention();
      }

      // V3: Initialize ClaimVerifier for report verification
      if (this.config.enableClaimVerification) {
        await this.initializeClaimVerifier();
      }

      this.initialized = true;
    } catch (error) {
      const errorMsg = `Failed to initialize quality-assessment coordinator: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error(errorMsg);
    }
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();

    // Dispose Flash Attention
    this.flashAttention?.dispose();

    // Dispose PersistentSONAEngine (flushes pending saves)
    if (this.qesona) {
      await this.qesona.close();
      this.qesona = undefined;
    }

    this.workflows.clear();
    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ============================================================================
  // QualityAssessmentAPI Implementation
  // ============================================================================

  /**
   * Evaluate a quality gate
   * Uses Actor-Critic RL for intelligent threshold tuning when enabled
   */
  async evaluateGate(
    request: GateEvaluationRequest
  ): Promise<Result<GateResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'gate-evaluation');

      // Spawn quality gate agent if available
      const agentResult = await this.spawnQualityGateAgent(workflowId, request);
      if (agentResult.success) {
        this.addAgentToWorkflow(workflowId, agentResult.value);
      }

      // Use RL to tune thresholds if enabled
      let effectiveRequest = request;
      if (this.config.enableRLThresholdTuning && this.actorCritic) {
        const tunedThresholds = await this.tuneThresholdsWithRL(request.metrics);
        if (tunedThresholds) {
          effectiveRequest = {
            ...request,
            thresholds: tunedThresholds.thresholds,
          };
        }
      }

      // Evaluate the gate
      const result = await this.qualityGate.evaluateGate(effectiveRequest);

      // Stop agent
      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      if (!result.success) {
        this.failWorkflow(workflowId, 'Evaluation failed');
        return result;
      }

      // Success path
      this.completeWorkflow(workflowId);

      // Store quality pattern in SONA if enabled
      if (this.config.enableSONAPatternLearning && this.qesona) {
        await this.storeQualityPattern(effectiveRequest, result.value);
      }

      // Train Actor-Critic with the result
      if (this.config.enableRLThresholdTuning && this.actorCritic) {
        await this.trainActorCritic(effectiveRequest, result.value);
      }

      // Publish event
      if (this.config.publishEvents) {
        await this.publishQualityGateEvaluated(result.value);
      }

      // V3: Verify claims before returning (Phase 4)
      const verifiedResult = await this.verifyGateResultClaims(result.value);

      return ok(verifiedResult);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze code quality
   * Uses QEFlashAttention for similarity-based recommendations when enabled
   */
  async analyzeQuality(
    request: QualityAnalysisRequest
  ): Promise<Result<QualityReport, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'quality-analysis');

      // Spawn quality analyzer agent
      const agentResult = await this.spawnQualityAnalyzerAgent(workflowId, request);
      if (agentResult.success) {
        this.addAgentToWorkflow(workflowId, agentResult.value);
      }

      // Analyze quality
      const result = await this.qualityAnalyzer.analyzeQuality(request);

      // Stop agent
      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      if (!result.success) {
        this.failWorkflow(workflowId, 'Evaluation failed');
        return result;
      }

      // Success path
      this.completeWorkflow(workflowId);

      // Use Flash Attention for similarity-based pattern matching
      if (this.config.enableFlashAttention && this.flashAttention && result.value.metrics.length > 0) {
        const enhanced = await this.enhanceWithSimilarityPatterns(result.value);
        if (enhanced) {
          result.value = enhanced;
        }
      }

      // Store quality pattern in SONA
      if (this.config.enableSONAPatternLearning && this.qesona) {
        await this.storeQualityAnalysisPattern(request, result.value);
      }

      // Auto-trigger gate evaluation if enabled
      if (this.config.enableAutoGating && result.value.score.overall < 70) {
        // Store for downstream consumption
        await this.memory.set(
          `quality-assessment:auto-gate:${workflowId}`,
          { score: result.value.score, recommendations: result.value.recommendations },
          { namespace: 'quality-assessment', ttl: 3600 }
        );
      }

      // V3: Verify claims before returning (Phase 4)
      const verifiedResult = await this.verifyQualityReportClaims(result.value);

      return ok(verifiedResult);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get deployment recommendation
   */
  async getDeploymentAdvice(
    request: DeploymentRequest
  ): Promise<Result<DeploymentAdvice, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'deployment-advice');

      // Spawn deployment advisor agent
      const agentResult = await this.spawnDeploymentAdvisorAgent(workflowId, request);
      if (agentResult.success) {
        this.addAgentToWorkflow(workflowId, agentResult.value);
      }

      // Get deployment advice
      const result = await this.deploymentAdvisor.getDeploymentAdvice(request);

      // Stop agent
      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      if (!result.success) {
        this.failWorkflow(workflowId, 'Evaluation failed');
        return result;
      }

      // Success path
      this.completeWorkflow(workflowId);

      // Publish deployment decision event
      if (this.config.publishEvents) {
        await this.publishDeploymentDecision(result.value, request.releaseCandidate);
      }

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze code complexity
   */
  async analyzeComplexity(
    request: ComplexityRequest
  ): Promise<Result<ComplexityReport, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'complexity-analysis');

      // Spawn complexity analyzer agent
      const agentResult = await this.spawnComplexityAnalyzerAgent(workflowId, request);
      if (agentResult.success) {
        this.addAgentToWorkflow(workflowId, agentResult.value);
      }

      // Analyze complexity
      const result = await this.qualityAnalyzer.analyzeComplexity(request);

      // Stop agent
      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      if (!result.success) {
        this.failWorkflow(workflowId, 'Evaluation failed');
        return result;
      }

      // Success path
      this.completeWorkflow(workflowId);

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Agent Spawning Methods
  // ============================================================================

  private async spawnQualityGateAgent(
    workflowId: string,
    request: GateEvaluationRequest
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `quality-gate-${workflowId.slice(0, 8)}`,
      domain: 'quality-assessment',
      type: 'validator',
      capabilities: ['quality-gate', 'threshold-evaluation'],
      config: {
        workflowId,
        gateName: request.gateName,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnQualityAnalyzerAgent(
    workflowId: string,
    request: QualityAnalysisRequest
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `quality-analyzer-${workflowId.slice(0, 8)}`,
      domain: 'quality-assessment',
      type: 'analyzer',
      capabilities: ['quality-analysis', 'metrics-collection', 'trend-analysis'],
      config: {
        workflowId,
        sourceFiles: request.sourceFiles,
        includeMetrics: request.includeMetrics,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnDeploymentAdvisorAgent(
    workflowId: string,
    request: DeploymentRequest
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `deployment-advisor-${workflowId.slice(0, 8)}`,
      domain: 'quality-assessment',
      type: 'analyzer',
      capabilities: ['deployment-advice', 'risk-scoring', 'ml-prediction'],
      config: {
        workflowId,
        releaseCandidate: request.releaseCandidate,
        riskTolerance: request.riskTolerance,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnComplexityAnalyzerAgent(
    workflowId: string,
    request: ComplexityRequest
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `complexity-analyzer-${workflowId.slice(0, 8)}`,
      domain: 'quality-assessment',
      type: 'analyzer',
      capabilities: ['complexity-analysis', 'cyclomatic', 'cognitive', 'maintainability'],
      config: {
        workflowId,
        sourceFiles: request.sourceFiles,
        metrics: request.metrics,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishQualityGateEvaluated(result: GateResult): Promise<void> {
    const event = createEvent(
      QualityAssessmentEvents.QualityGateEvaluated,
      'quality-assessment',
      {
        gateId: uuidv4(),
        passed: result.passed,
        checks: result.checks.map((c) => ({
          name: c.name,
          passed: c.passed,
          value: c.value,
          threshold: c.threshold,
        })),
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishDeploymentDecision(
    advice: DeploymentAdvice,
    releaseCandidate: string
  ): Promise<void> {
    const eventType = advice.decision === 'approved'
      ? QualityAssessmentEvents.DeploymentApproved
      : QualityAssessmentEvents.DeploymentBlocked;

    const event = createEvent(
      eventType,
      'quality-assessment',
      {
        decision: advice.decision,
        reason: advice.reasons.join('; '),
        riskScore: advice.riskScore,
        recommendations: advice.conditions || [],
        releaseCandidate,
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(
    id: string,
    type: WorkflowStatus['type']
  ): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  private completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  private failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  private addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to test execution events
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to coverage analysis events
    this.eventBus.subscribe(
      'coverage-analysis.CoverageReportCreated',
      this.handleCoverageReportCreated.bind(this)
    );

    // Subscribe to security events
    this.eventBus.subscribe(
      'security-compliance.SecurityAuditCompleted',
      this.handleSecurityAuditCompleted.bind(this)
    );
  }

  private async handleTestRunCompleted(event: DomainEvent): Promise<void> {
    // Auto-evaluate quality gate after test run if enabled
    if (!this.config.enableAutoGating) return;

    const payload = event.payload as {
      runId: string;
      passed: number;
      failed: number;
      skipped: number;
    };

    // Store for aggregation
    await this.memory.set(
      `quality-assessment:test-results:${payload.runId}`,
      payload,
      { namespace: 'quality-assessment', ttl: 3600 }
    );
  }

  private async handleCoverageReportCreated(event: DomainEvent): Promise<void> {
    // Store coverage data for quality assessment
    const payload = event.payload as {
      reportId: string;
      line: number;
      branch: number;
    };

    await this.memory.set(
      `quality-assessment:coverage:${payload.reportId}`,
      payload,
      { namespace: 'quality-assessment', ttl: 3600 }
    );
  }

  private async handleSecurityAuditCompleted(event: DomainEvent): Promise<void> {
    // Store security findings for deployment decisions
    const payload = event.payload as {
      auditId: string;
      vulnerabilities: number;
      severity: string;
    };

    await this.memory.set(
      `quality-assessment:security:${payload.auditId}`,
      payload,
      { namespace: 'quality-assessment', ttl: 86400 }
    );
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'quality-assessment:coordinator:workflows'
    );

    if (savedState) {
      for (const workflow of savedState) {
        if (workflow.status === 'running') {
          workflow.status = 'failed';
          workflow.error = 'Coordinator restarted';
          workflow.completedAt = new Date();
        }
        this.workflows.set(workflow.id, workflow);
      }
    }
  }

  private async saveWorkflowState(): Promise<void> {
    const workflows = Array.from(this.workflows.values());
    await this.memory.set(
      'quality-assessment:coordinator:workflows',
      workflows,
      { namespace: 'quality-assessment', persist: true }
    );
  }

  // ============================================================================
  // Ruvector Integration Methods (ADR-040)
  // ============================================================================

  /**
   * Initialize Actor-Critic RL for quality gate threshold tuning
   */
  private async initializeActorCritic(): Promise<void> {
    try {
      this.actorCritic = new ActorCriticAlgorithm({
        stateSize: 10, // Quality metrics feature size
        actionSize: 4, // Threshold adjustment actions
        actorHiddenLayers: [64, 64],
        criticHiddenLayers: [64, 64],
        actorLR: 0.0001,
        criticLR: 0.001,
        entropyCoeff: 0.01,
      });

      // ActorCriticAlgorithm initializes automatically on first predict/train call
      // No need to call initialize() as it's protected
    } catch (error) {
      throw new Error(`Failed to initialize Actor-Critic RL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize PersistentSONAEngine for quality pattern learning (patterns survive restarts)
   */
  private async initializeQESONA(): Promise<void> {
    try {
      this.qesona = await createPersistentSONAEngine({
        domain: 'quality-assessment',
        loadOnInit: true,
        autoSaveInterval: 60000, // Save every minute
        hiddenDim: 256,
        embeddingDim: 384,
        microLoraRank: 1,
        baseLoraRank: 8,
        minConfidence: 0.5,
        maxPatterns: 5000,
      });
      console.log('[quality-assessment] PersistentSONAEngine initialized successfully');
    } catch (error) {
      // Log and continue - SONA is enhancement, not critical
      console.error('[quality-assessment] Failed to initialize PersistentSONAEngine:', error);
      console.warn('[quality-assessment] Continuing without SONA pattern persistence');
      this.qesona = undefined;
    }
  }

  /**
   * Initialize QEFlashAttention for similarity computations
   */
  private async initializeFlashAttention(): Promise<void> {
    try {
      this.flashAttention = await createQEFlashAttention('pattern-adaptation', {
        dim: 384,
        strategy: 'flash',
        blockSize: 32,
      });
    } catch (error) {
      throw new Error(`Failed to initialize QEFlashAttention: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Use Actor-Critic RL to predict optimal quality gate thresholds
   */
  private async tuneThresholdsWithRL(metrics: QualityMetrics): Promise<RLThresholdResult | null> {
    if (!this.actorCritic) return null;

    try {
      // Create RL state from quality metrics
      const state: RLState = {
        id: `quality-state-${Date.now()}`,
        features: [
          metrics.coverage / 100,
          metrics.testsPassing / 100,
          metrics.criticalBugs / 10,
          metrics.codeSmells / 50,
          metrics.securityVulnerabilities / 10,
          metrics.technicalDebt / 20,
          metrics.duplications / 20,
        ],
      };

      // Get action from Actor-Critic
      const prediction = await this.actorCritic.predict(state);

      // Apply action to adjust thresholds
      const baseThresholds: QualityGateThresholds = {
        coverage: { min: 80 },
        testsPassing: { min: 95 },
        criticalBugs: { max: 0 },
        codeSmells: { max: 20 },
        securityVulnerabilities: { max: 0 },
        technicalDebt: { max: 5 },
        duplications: { max: 5 },
      };

      const tunedThresholds = this.applyActionToThresholds(baseThresholds, prediction.action);

      return {
        thresholds: tunedThresholds,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning ?? '',
      };
    } catch (error) {
      console.error('RL threshold tuning failed:', error);
      return null;
    }
  }

  /**
   * Apply RL action to threshold adjustments
   */
  private applyActionToThresholds(
    thresholds: QualityGateThresholds,
    action: RLAction
  ): QualityGateThresholds {
    const adjusted = { ...thresholds };

    if (action.type === 'adjust-threshold' && typeof action.value === 'number') {
      const delta = action.value * 5; // Scale adjustment

      // Adjust coverage threshold
      if (adjusted.coverage?.min !== undefined) {
        adjusted.coverage.min = Math.max(50, Math.min(100, adjusted.coverage.min + delta));
      }

      // Adjust code smells threshold
      if (adjusted.codeSmells?.max !== undefined) {
        adjusted.codeSmells.max = Math.max(0, Math.min(100, adjusted.codeSmells.max - delta));
      }
    }

    return adjusted;
  }

  /**
   * Train Actor-Critic with quality gate evaluation results
   */
  private async trainActorCritic(
    request: GateEvaluationRequest,
    result: GateResult
  ): Promise<void> {
    if (!this.actorCritic) return;

    try {
      // Create state from metrics
      const state: RLState = {
        id: `quality-state-${Date.now()}`,
        features: [
          request.metrics.coverage / 100,
          request.metrics.testsPassing / 100,
          request.metrics.criticalBugs / 10,
          request.metrics.codeSmells / 50,
          request.metrics.securityVulnerabilities / 10,
          request.metrics.technicalDebt / 20,
          request.metrics.duplications / 20,
        ],
      };

      // Define action as the threshold configuration used
      const action: RLAction = {
        type: 'evaluate-gate',
        value: result.overallScore,
      };

      // Create next state (same for now, could be next evaluation)
      const nextState: RLState = { ...state };

      // Calculate reward based on gate result
      let reward = 0;
      if (result.passed) {
        reward += result.overallScore / 100;
        // Bonus for high score
        if (result.overallScore >= 90) reward += 0.5;
        if (result.overallScore >= 95) reward += 0.5;
      } else {
        reward -= 0.5;
        // Penalty for failing critical checks
        const criticalFailures = result.checks.filter(
          c => !c.passed && c.severity === 'critical'
        ).length;
        reward -= criticalFailures * 0.2;
      }

      // Create experience
      const experience: RLExperience = {
        state,
        action,
        nextState,
        reward: Math.max(-1, Math.min(1, reward)),
        done: true,
      };

      // Train Actor-Critic (train() expects a single experience)
      await this.actorCritic.train(experience);
    } catch (error) {
      console.error('Actor-Critic training failed:', error);
    }
  }

  /**
   * Store quality gate pattern in SONA for learning
   */
  private async storeQualityPattern(
    request: GateEvaluationRequest,
    result: GateResult
  ): Promise<void> {
    if (!this.qesona) return;

    try {
      const state: RLState = {
        id: `quality-state-${Date.now()}`,
        features: [
          request.metrics.coverage,
          request.metrics.testsPassing,
          request.metrics.criticalBugs,
          request.metrics.codeSmells,
          request.metrics.securityVulnerabilities,
          request.metrics.technicalDebt,
          request.metrics.duplications,
        ],
      };

      const action: RLAction = {
        type: 'quality-gate-evaluation',
        value: result.passed ? 1 : 0,
      };

      this.qesona.createPattern(
        state,
        action,
        {
          reward: result.passed ? result.overallScore / 100 : -0.5,
          success: result.passed,
          quality: result.overallScore / 100,
        },
        'quality-assessment',
        this.domain,
        {
          gateName: request.gateName,
          overallScore: result.overallScore,
          failedChecks: result.failedChecks,
        }
      );
    } catch (error) {
      console.error('Failed to store quality pattern in SONA:', error);
    }
  }

  /**
   * Store quality analysis pattern in SONA
   */
  private async storeQualityAnalysisPattern(
    request: QualityAnalysisRequest,
    report: QualityReport
  ): Promise<void> {
    if (!this.qesona) return;

    try {
      const state: RLState = {
        id: `quality-analysis-${Date.now()}`,
        features: [
          report.score.overall,
          report.score.coverage,
          report.score.complexity,
          report.score.maintainability,
          report.metrics.length,
          request.sourceFiles.length,
        ],
      };

      const action: RLAction = {
        type: 'quality-analysis',
        value: report.score.overall,
      };

      this.qesona.createPattern(
        state,
        action,
        {
          reward: report.score.overall / 100,
          success: report.score.overall >= 70,
          quality: report.score.overall / 100,
        },
        'quality-assessment',
        this.domain,
        {
          sourceFileCount: request.sourceFiles.length,
          recommendationCount: report.recommendations.length,
        }
      );
    } catch (error) {
      console.error('Failed to store quality analysis pattern in SONA:', error);
    }
  }

  /**
   * Enhance quality report with similarity-based pattern matching using Flash Attention
   */
  private async enhanceWithSimilarityPatterns(
    report: QualityReport
  ): Promise<QualityReport | null> {
    if (!this.flashAttention || !this.qesona) return null;

    try {
      // Create embedding from quality metrics
      const metricsEmbedding = this.createMetricsEmbedding(report);

      // Find similar historical patterns using SONA
      const state: RLState = {
        id: `similarity-search-${Date.now()}`,
        features: [
          report.score.overall,
          report.score.coverage,
          report.score.complexity,
          report.score.maintainability,
        ],
      };

      const adaptation = await this.qesona.adaptPattern(
        state,
        'quality-assessment',
        this.domain
      );

      if (!adaptation.success || !adaptation.pattern) {
        return null;
      }

      // Add insights from similar patterns to recommendations
      const additionalRecommendations: typeof report.recommendations = [];

      if (adaptation.pattern.metadata) {
        const meta = adaptation.pattern.metadata as {
          similarIssues?: string[];
          commonFixes?: string[];
        };

        if (meta.similarIssues && meta.similarIssues.length > 0) {
          additionalRecommendations.push({
            type: 'improvement',
            title: 'Similar Quality Patterns Found',
            description: `Found ${adaptation.similarity.toFixed(0)}% similar historical patterns: ${meta.similarIssues.slice(0, 3).join(', ')}`,
            impact: 'medium',
            effort: 'low',
          });
        }
      }

      return {
        ...report,
        recommendations: [...report.recommendations, ...additionalRecommendations],
      };
    } catch (error) {
      console.error('Failed to enhance with similarity patterns:', error);
      return null;
    }
  }

  /**
   * Create embedding from quality metrics for similarity search
   */
  private createMetricsEmbedding(report: QualityReport): Float32Array {
    const features = [
      report.score.overall / 100,
      report.score.coverage / 100,
      report.score.complexity / 100,
      report.score.maintainability / 100,
      report.score.security / 100,
      ...report.metrics.map(m => m.value / 100),
    ];

    // Pad to 384 dimensions
    while (features.length < 384) {
      features.push(0);
    }

    return new Float32Array(features.slice(0, 384));
  }

  // ============================================================================
  // V3 Integration: ClaimVerifier Methods (Phase 4)
  // ============================================================================

  /**
   * Initialize ClaimVerifier for report verification
   */
  private async initializeClaimVerifier(): Promise<void> {
    try {
      const rootDir = this.config.claimVerifierRootDir || process.cwd();
      this.claimVerifier = createClaimVerifierService({
        rootDir,
        verifier: {
          enableStatistics: true,
          enableMultiModel: false, // Use consensus engine separately for multi-model
          defaultConfidenceThreshold: 0.7,
        },
      }) as ClaimVerifierService;
    } catch (error) {
      throw new Error(`Failed to initialize ClaimVerifier: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify a quality report's claims before returning
   *
   * Converts QualityReport to QEReport format and verifies all claims.
   * Adds verification metadata to the report.
   *
   * @param report - The quality report to verify
   * @returns The report with verification status, or original if verification disabled/fails
   */
  private async verifyQualityReportClaims(
    report: QualityReport
  ): Promise<QualityReport & { claimVerification?: { verified: boolean; confidence: number; unverifiedClaims: number } }> {
    if (!this.config.enableClaimVerification || !this.claimVerifier) {
      return report;
    }

    try {
      // Convert QualityReport to QEReport format
      const qeReport = this.convertToQEReport(report, 'quality-analysis');

      if (qeReport.claims.length === 0) {
        return report;
      }

      // Verify the report
      const verification = await this.claimVerifier.verifyReport(qeReport);

      if (!verification.success) {
        console.warn('[QualityAssessment] Claim verification failed:', verification.error);
        return report;
      }

      // Annotate report with verification status
      return {
        ...report,
        claimVerification: {
          verified: verification.value.passed,
          confidence: verification.value.overallConfidence,
          unverifiedClaims: verification.value.flaggedClaims.length,
        },
      };
    } catch (error) {
      console.error('[QualityAssessment] Failed to verify report claims:', error);
      return report;
    }
  }

  /**
   * Verify a gate result's claims before returning
   */
  private async verifyGateResultClaims(
    result: GateResult
  ): Promise<GateResult & { claimVerification?: { verified: boolean; confidence: number; unverifiedClaims: number } }> {
    if (!this.config.enableClaimVerification || !this.claimVerifier) {
      return result;
    }

    try {
      // Convert GateResult to QEReport format
      const qeReport = this.convertGateResultToQEReport(result);

      if (qeReport.claims.length === 0) {
        return result;
      }

      // Verify the report
      const verification = await this.claimVerifier.verifyReport(qeReport);

      if (!verification.success) {
        console.warn('[QualityAssessment] Gate claim verification failed:', verification.error);
        return result;
      }

      // Annotate result with verification status
      return {
        ...result,
        claimVerification: {
          verified: verification.value.passed,
          confidence: verification.value.overallConfidence,
          unverifiedClaims: verification.value.flaggedClaims.length,
        },
      };
    } catch (error) {
      console.error('[QualityAssessment] Failed to verify gate claims:', error);
      return result;
    }
  }

  /**
   * Convert QualityReport to QEReport format for claim verification
   */
  private convertToQEReport(report: QualityReport, type: string): QEReport {
    const claims: Claim[] = [];

    // Extract claims from metrics
    for (const metric of report.metrics) {
      claims.push({
        id: `metric-${metric.name}-${Date.now()}`,
        type: 'metric-count' as ClaimType,
        statement: `Metric ${metric.name} = ${metric.value}`,
        evidence: [],
        sourceAgent: 'quality-analyzer',
        sourceAgentType: 'analyzer',
        severity: metric.value < 50 ? 'high' : metric.value < 70 ? 'medium' : 'low',
        timestamp: new Date(),
        metadata: {
          name: metric.name,
          value: metric.value,
        },
      });
    }

    // Extract claims from score
    if (report.score.coverage < 80) {
      claims.push({
        id: `coverage-${Date.now()}`,
        type: 'coverage-claim' as ClaimType,
        statement: `Code coverage is ${report.score.coverage}%`,
        evidence: [],
        sourceAgent: 'quality-analyzer',
        sourceAgentType: 'analyzer',
        severity: report.score.coverage < 50 ? 'critical' : 'high',
        timestamp: new Date(),
        metadata: { coverage: report.score.coverage },
      });
    }

    return {
      id: `quality-report-${Date.now()}`,
      type,
      claims,
      generatedAt: new Date(),
      sourceAgent: 'quality-assessment-coordinator',
    };
  }

  /**
   * Convert GateResult to QEReport format for claim verification
   */
  private convertGateResultToQEReport(result: GateResult): QEReport {
    const claims: Claim[] = [];

    // Extract claims from checks
    for (const check of result.checks) {
      claims.push({
        id: `gate-check-${check.name}-${Date.now()}`,
        type: 'metric-count' as ClaimType,
        statement: `Gate check '${check.name}': ${check.value} (threshold: ${check.threshold})`,
        evidence: [],
        sourceAgent: 'quality-gate',
        sourceAgentType: 'validator',
        severity: check.passed ? 'low' : (check.severity as 'critical' | 'high' | 'medium' | 'low') || 'medium',
        timestamp: new Date(),
        metadata: {
          checkName: check.name,
          value: check.value,
          threshold: check.threshold,
          passed: check.passed,
        },
      });
    }

    return {
      id: `gate-result-${Date.now()}`,
      type: 'gate-evaluation',
      claims,
      generatedAt: new Date(),
      sourceAgent: 'quality-assessment-coordinator',
    };
  }

  /**
   * Get ClaimVerifier statistics
   */
  getClaimVerifierStats(): ReturnType<ClaimVerifierService['getStats']> | null {
    return this.claimVerifier?.getStats() ?? null;
  }
}
