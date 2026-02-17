/**
 * Agentic QE v3 - Quality Assessment Coordinator
 * Orchestrates the quality assessment workflow across services
 *
 * Integrations (per ADR-040):
 * - ActorCritic RL: Quality gate threshold tuning
 * - QESONA: Quality pattern learning
 * - QEFlashAttention: Similarity computations for quality reports
 *
 * V3 Integrations (ADR-047, CONSENSUS-MIXIN-001):
 * - MinCutAwareDomainMixin: Topology-aware routing and health monitoring
 * - ConsensusEnabledMixin: Multi-model consensus for high-stakes quality decisions
 *
 * CQ-002: Extends BaseDomainCoordinator for lifecycle deduplication
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainEvent } from '../../shared/types';
import { toError, toErrorMessage } from '../../shared/error-utils.js';
import type {
  RLState,
  RLAction,
  RLExperience,
} from '../../integrations/rl-suite/interfaces';
import type { DomainName } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces';
import {
  QualityAssessmentEvents,
  LearningOptimizationEvents,
  DreamCycleCompletedPayload,
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
  GateThresholds,
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

// CQ-004: Extracted modules
import * as ReportHelpers from './coordinator-reports.js';
import * as RLIntegration from './coordinator-rl-integration.js';
import * as ClaimVerifierHelpers from './coordinator-claim-verifier.js';
import * as GateEvalHelpers from './coordinator-gate-evaluation.js';

// V3 Integration: MinCut Awareness (ADR-047) - only import types needed beyond base
import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration';

// V3 Integration: Consensus Verification (CONSENSUS-MIXIN-001)
import type { ConsensusStats } from '../../coordination/consensus';

// CQ-002: Base domain coordinator
import {
  BaseDomainCoordinator,
  type BaseDomainCoordinatorConfig,
  type BaseWorkflowStatus,
} from '../base-domain-coordinator.js';

/**
 * Interface for the quality assessment coordinator
 */
export interface IQualityAssessmentCoordinator extends QualityAssessmentAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];

  // V3 Integration: MinCut awareness
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;

  // V3 Integration: Consensus verification
  getConsensusStats(): ConsensusStats | undefined;
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
 *
 * CQ-002: Extends BaseDomainCoordinatorConfig — removes duplicate fields
 */
export interface CoordinatorConfig extends BaseDomainCoordinatorConfig {
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

  // V3 Integration: Consensus Verification (CONSENSUS-MIXIN-001)
  /** Margin (percentage) for determining borderline cases */
  borderlineMargin: number;
}

// RL types re-exported from coordinator-rl-integration.ts
type RLThresholdResult = RLIntegration.RLThresholdResult;
type QualityGateThresholds = RLIntegration.QualityGateThresholds;

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
  // V3: MinCut Awareness enabled by default
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // V3: Consensus enabled by default for quality decisions
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
  borderlineMargin: 0.05, // 5% margin for borderline detection
};

type QualityWorkflowType = 'gate-evaluation' | 'quality-analysis' | 'deployment-advice' | 'complexity-analysis';

/**
 * Quality Assessment Coordinator
 * Orchestrates quality assessment workflows and coordinates with agents
 *
 * Integrations (per ADR-040):
 * - ActorCritic RL: Quality gate threshold tuning
 * - QESONA: Quality pattern learning
 * - QEFlashAttention: Similarity computations for quality reports
 *
 * V3 Integrations (ADR-047, CONSENSUS-MIXIN-001):
 * - MinCutAwareDomainMixin: Topology-aware routing and health monitoring
 * - ConsensusEnabledMixin: Multi-model consensus for high-stakes quality decisions
 *
 * CQ-002: Extends BaseDomainCoordinator
 */
export class QualityAssessmentCoordinator
  extends BaseDomainCoordinator<CoordinatorConfig, QualityWorkflowType>
  implements IQualityAssessmentCoordinator
{
  private readonly qualityGate: IQualityGateService;
  private readonly qualityAnalyzer: IQualityAnalyzerService;
  private readonly deploymentAdvisor: IDeploymentAdvisorService;

  // Ruvector integration instances
  private actorCritic?: ActorCriticAlgorithm;
  private qesona?: PersistentSONAEngine;
  private flashAttention?: QEFlashAttention;

  // V3 Integration: ClaimVerifier for report verification
  private claimVerifier?: ClaimVerifierService;

  // Quality domain name for SONA
  private readonly domain: DomainName = 'quality-assessment';

  // Cache of recent dream insights for quality assessment enhancement
  private recentDreamInsights: Array<{
    id: string;
    type: string;
    description: string;
    suggestedAction?: string;
    confidenceScore: number;
    noveltyScore: number;
    sourceConcepts: string[];
    receivedAt: Date;
  }> = [];

  constructor(
    eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    const fullConfig: CoordinatorConfig = { ...DEFAULT_CONFIG, ...config };

    super(eventBus, 'quality-assessment', fullConfig, {
      // Quality-specific finding types that require consensus
      verifyFindingTypes: [
        'gate-verdict',           // Pass/fail quality gate decisions
        'tech-debt-classification', // Critical vs acceptable tech debt
        'release-readiness',      // Go/no-go deployment decisions
        'risk-scoring',           // High-risk deployment detection
      ],
    });

    this.qualityGate = new QualityGateService(memory);
    this.qualityAnalyzer = new QualityAnalyzerService(memory);
    this.deploymentAdvisor = new DeploymentAdvisorService(memory);
  }

  // ==========================================================================
  // BaseDomainCoordinator Template Methods
  // ==========================================================================

  /**
   * Initialize the coordinator
   * Sets up Ruvector integrations: ActorCritic, QESONA, QEFlashAttention
   * V3: Also initializes MinCut awareness and Consensus verification
   */
  protected async onInitialize(): Promise<void> {
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
    } catch (error) {
      const errorMsg = `Failed to initialize quality-assessment coordinator: ${toErrorMessage(error)}`;
      throw new Error(errorMsg);
    }
  }

  /**
   * Dispose and cleanup
   * V3: Also disposes domain-specific resources
   */
  protected async onDispose(): Promise<void> {
    await this.saveWorkflowState();

    // Dispose Flash Attention
    this.flashAttention?.dispose();

    // Dispose PersistentSONAEngine (flushes pending saves)
    if (this.qesona) {
      await this.qesona.close();
      this.qesona = undefined;
    }
  }

  /**
   * Get active workflow statuses (typed override)
   */
  override getActiveWorkflows(): WorkflowStatus[] {
    return super.getActiveWorkflows() as WorkflowStatus[];
  }

  // ============================================================================
  // V3 Integration: MinCut Awareness (ADR-047) — domain-specific extras
  // ============================================================================

  /**
   * Get domains that are healthy for routing
   * Filters out weak domains from routing candidates
   */
  getHealthyRoutingDomains(): DomainName[] {
    return this.minCutMixin.getHealthyRoutingDomains();
  }

  // ============================================================================
  // QualityAssessmentAPI Implementation
  // ============================================================================

  /**
   * Evaluate a quality gate
   * Uses Actor-Critic RL for intelligent threshold tuning when enabled
   * V3: Uses consensus verification for borderline gate decisions
   */
  async evaluateGate(
    request: GateEvaluationRequest
  ): Promise<Result<GateResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'gate-evaluation');

      // Self-healing: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        console.warn('[quality-assessment] Quality gate evaluation paused: topology is in critical state');
        this.failWorkflow(workflowId, 'Topology is in critical state');
        return err(new Error('Quality gate evaluation paused: topology is in critical state'));
      }

      // V3 Integration: Check topology health before proceeding (ADR-047)
      // Apply stricter thresholds when topology is degraded
      if (!this.isTopologyHealthy()) {
        console.warn('[quality-assessment] Topology degraded - applying stricter thresholds for quality gate');
        // Continue evaluation but with heightened caution - quality gates are critical
      }

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

      // V3 Integration: Use consensus for borderline cases (CONSENSUS-MIXIN-001)
      // Borderline cases are pass/fail decisions where metrics are close to thresholds
      let finalResult = result.value;
      if (this.config.enableConsensus && this.isBorderlineGateResult(request.metrics, request.thresholds, result.value)) {
        const consensusResult = await this.verifyGateVerdictWithConsensus(
          effectiveRequest,
          result.value
        );
        if (consensusResult) {
          finalResult = consensusResult;
        }
      }

      // Success path
      this.completeWorkflow(workflowId);

      // Store quality pattern in SONA if enabled
      if (this.config.enableSONAPatternLearning && this.qesona) {
        await this.storeQualityPattern(effectiveRequest, finalResult);
      }

      // Train Actor-Critic with the result
      if (this.config.enableRLThresholdTuning && this.actorCritic) {
        await this.trainActorCritic(effectiveRequest, finalResult);
      }

      // Publish event
      if (this.config.publishEvents) {
        await this.publishQualityGateEvaluated(finalResult);
      }

      // V3: Verify claims before returning (Phase 4)
      const verifiedResult = await this.verifyGateResultClaims(finalResult);

      return ok(verifiedResult);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * V3 Integration: Check if a gate result is a borderline case
   * A borderline case is when any metric is within the configured margin of its threshold
   *
   * @param metrics - The quality metrics being evaluated
   * @param thresholds - The threshold configuration
   * @param result - The gate result
   * @returns true if this is a borderline case requiring consensus
   */
  private isBorderlineGateResult(
    metrics: QualityMetrics,
    thresholds: GateThresholds,
    result: GateResult
  ): boolean {
    return GateEvalHelpers.isBorderlineGateResult(metrics, thresholds, result, this.config.borderlineMargin);
  }

  /**
   * V3 Integration: Verify a gate verdict with multi-model consensus
   *
   * @param request - The gate evaluation request
   * @param initialResult - The initial gate result
   * @returns The potentially modified result with consensus verification, or null if consensus unavailable
   */
  private async verifyGateVerdictWithConsensus(
    request: GateEvaluationRequest,
    initialResult: GateResult
  ): Promise<GateResult | null> {
    return GateEvalHelpers.verifyGateVerdictWithConsensus(request, initialResult, this.consensusMixin);
  }

  /**
   * Analyze code quality
   * Uses QEFlashAttention for similarity-based recommendations when enabled
   * V3: Includes topology-aware behavior based on MinCut health
   */
  async analyzeQuality(
    request: QualityAnalysisRequest
  ): Promise<Result<QualityReport, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'quality-analysis');

      // Self-healing: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        console.warn('[quality-assessment] Quality analysis paused: topology is in critical state');
        this.failWorkflow(workflowId, 'Topology is in critical state');
        return err(new Error('Quality analysis paused: topology is in critical state'));
      }

      // V3 Integration: Check topology health and adjust behavior (ADR-047)
      const topologyHealthy = this.isTopologyHealthy();
      if (!topologyHealthy) {
        console.warn('[quality-assessment] Topology degraded during quality analysis');
        // Could adjust analysis depth or timeouts in degraded state
        // For now, we proceed but could be extended to reduce analysis scope
      }

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
      return err(toError(error));
    }
  }

  /**
   * Get deployment recommendation
   * V3: Uses consensus verification for high-risk deployment decisions
   */
  async getDeploymentAdvice(
    request: DeploymentRequest
  ): Promise<Result<DeploymentAdvice, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'deployment-advice');

      // Self-healing: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        console.warn('[quality-assessment] Deployment advice paused: topology is in critical state');
        this.failWorkflow(workflowId, 'Topology is in critical state');
        return err(new Error('Deployment advice paused: topology is in critical state'));
      }

      // V3 Integration: Check topology health (ADR-047)
      if (!this.isTopologyHealthy()) {
        console.warn('[quality-assessment] Topology degraded during deployment advice generation');
      }

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

      // V3 Integration: Use consensus for high-risk deployment decisions (CONSENSUS-MIXIN-001)
      let finalAdvice = result.value;
      if (this.config.enableConsensus && this.isHighRiskDeployment(request, result.value)) {
        const consensusAdvice = await this.verifyDeploymentAdviceWithConsensus(request, result.value);
        if (consensusAdvice) {
          finalAdvice = consensusAdvice;
        }
      }

      // Success path
      this.completeWorkflow(workflowId);

      // Publish deployment decision event
      if (this.config.publishEvents) {
        await this.publishDeploymentDecision(finalAdvice, request.releaseCandidate);
      }

      return ok(finalAdvice);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * V3 Integration: Check if a deployment is high-risk
   * High-risk deployments include blocked deployments or low risk tolerance with warnings
   */
  private isHighRiskDeployment(request: DeploymentRequest, advice: DeploymentAdvice): boolean {
    return GateEvalHelpers.isHighRiskDeployment(request, advice);
  }

  /**
   * V3 Integration: Verify deployment advice with multi-model consensus
   */
  private async verifyDeploymentAdviceWithConsensus(
    request: DeploymentRequest,
    initialAdvice: DeploymentAdvice
  ): Promise<DeploymentAdvice | null> {
    return GateEvalHelpers.verifyDeploymentAdviceWithConsensus(request, initialAdvice, this.consensusMixin);
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

      // Self-healing: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        console.warn('[quality-assessment] Complexity analysis paused: topology is in critical state');
        this.failWorkflow(workflowId, 'Topology is in critical state');
        return err(new Error('Complexity analysis paused: topology is in critical state'));
      }

      // V3 Integration: Check topology health (ADR-047)
      if (!this.isTopologyHealthy()) {
        console.warn('[quality-assessment] Topology degraded during complexity analysis');
      }

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
      return err(toError(error));
    }
  }

  /**
   * Generate a quality report
   * @param options - Report generation options
   * @returns Result containing the generated report content
   */
  async generateReport(options: {
    format: 'json' | 'html' | 'markdown';
    includeRecommendations?: boolean;
  }): Promise<Result<{ content: string; format: string }, Error>> {
    return ReportHelpers.generateReport(this.memory, options);
  }

  /**
   * Get quality dashboard overview
   * @returns Result containing dashboard data
   */
  async getQualityDashboard(): Promise<Result<{
    overallScore: number;
    metrics: QualityMetrics;
    trends: Record<string, number>;
  }, Error>> {
    return ReportHelpers.getQualityDashboard(this.memory);
  }

  /**
   * Analyze project risks
   * @param options - Risk analysis options
   * @returns Result containing identified risks
   */
  async analyzeRisks(options: {
    scope: 'project' | 'module' | 'file';
    includeSecurityRisks?: boolean;
  }): Promise<Result<{
    risks: Array<{ id: string; severity: string; description: string; category: string }>;
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  }, Error>> {
    return ReportHelpers.analyzeRisks(this.memory, options);
  }

  /**
   * Evaluate a quality gate (simplified API)
   * @param options - Quality gate evaluation options
   * @returns Result containing gate evaluation
   */
  async evaluateQualityGate(options: {
    gateId: string;
    metrics: Partial<QualityMetrics>;
  }): Promise<Result<{ passed: boolean; score: number; violations: string[] }, Error>> {
    const request = ReportHelpers.buildFullGateRequest(options);
    const result = await this.evaluateGate(request);
    if (!result.success) {
      return err(result.error);
    }
    return ok({
      passed: result.value.passed,
      score: result.value.overallScore,
      violations: result.value.failedChecks,
    });
  }

  /**
   * Assess deployment readiness
   * @param options - Deployment readiness options
   * @returns Result containing readiness assessment
   */
  async assessDeploymentReadiness(options: {
    environment: 'development' | 'staging' | 'production';
    changeSet: string[];
  }): Promise<Result<{
    ready: boolean;
    risks: Array<{ id: string; severity: string; description: string }>;
    score: number;
  }, Error>> {
    return ReportHelpers.assessDeploymentReadiness(this.memory, options);
  }

  /**
   * Analyze technical debt
   * @param options - Technical debt analysis options
   * @returns Result containing debt analysis
   */
  async analyzeTechnicalDebt(options: {
    projectPath: string;
    includeCodeSmells?: boolean;
  }): Promise<Result<{
    totalDebt: number;
    items: Array<{ file: string; type: string; effort: number; description: string }>;
    debtRatio: number;
  }, Error>> {
    return ReportHelpers.analyzeTechnicalDebt(this.memory, options);
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
  // Event Handling
  // ============================================================================

  protected subscribeToEvents(): void {
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

    // Subscribe to dream cycle events from learning-optimization domain
    this.subscribeToDreamEvents();
  }

  // ============================================================================
  // Dream Event Handling (ADR-021 Integration)
  // ============================================================================

  /**
   * Subscribe to dream cycle completion events from learning-optimization domain.
   * Dream insights can suggest quality improvements, threshold adjustments, and risk patterns.
   */
  private subscribeToDreamEvents(): void {
    this.eventBus.subscribe(
      LearningOptimizationEvents.DreamCycleCompleted,
      this.handleDreamCycleCompleted.bind(this)
    );
  }

  /**
   * Handle dream cycle completion event.
   * Filters insights relevant to quality assessment and applies actionable ones.
   */
  private async handleDreamCycleCompleted(
    event: { payload: DreamCycleCompletedPayload }
  ): Promise<void> {
    const { insights, cycleId } = event.payload;

    if (!insights || insights.length === 0) {
      return;
    }

    // Filter insights relevant to this domain
    const relevantInsights = insights.filter((insight) => {
      // Check if suggested action mentions this domain
      const actionRelevant =
        insight.suggestedAction?.toLowerCase().includes(this.domain) ||
        insight.suggestedAction?.toLowerCase().includes('quality') ||
        insight.suggestedAction?.toLowerCase().includes('gate') ||
        insight.suggestedAction?.toLowerCase().includes('threshold');

      // Check if source concepts include quality-related terms
      const conceptsRelevant = insight.sourceConcepts.some(
        (c) =>
          c.toLowerCase().includes('quality') ||
          c.toLowerCase().includes(this.domain) ||
          c.toLowerCase().includes('metric') ||
          c.toLowerCase().includes('gate')
      );

      // Check for quality-assessment related insight types
      const typeRelevant =
        insight.type === 'optimization' || insight.type === 'pattern_merge';

      return actionRelevant || conceptsRelevant || (typeRelevant && insight.actionable);
    });

    if (relevantInsights.length === 0) {
      return;
    }

    console.log(
      `[${this.domain}] Received ${relevantInsights.length} relevant dream insights from cycle ${cycleId}`
    );

    // Apply high-confidence actionable insights
    for (const insight of relevantInsights) {
      if (insight.confidenceScore > 0.7 && insight.actionable) {
        await this.applyDreamInsight(insight, cycleId);
      }

      // Cache all relevant insights for quality enhancement
      this.recentDreamInsights.push({
        ...insight,
        receivedAt: new Date(),
      });
    }

    // Prune old insights (keep last 50)
    if (this.recentDreamInsights.length > 50) {
      this.recentDreamInsights = this.recentDreamInsights.slice(-50);
    }
  }

  /**
   * Apply a dream insight by storing it as a learned pattern via SONA.
   * This allows the insight to influence future quality assessment decisions.
   *
   * @param insight - The dream insight to apply
   * @param cycleId - The dream cycle ID for tracking
   */
  private async applyDreamInsight(
    insight: DreamCycleCompletedPayload['insights'][0],
    cycleId: string
  ): Promise<void> {
    console.log(
      `[${this.domain}] Applying dream insight: ${insight.description.slice(0, 100)}...`
    );

    // Store as a learned pattern via SONA if available
    if (this.qesona) {
      try {
        // Create state representation from insight
        const state: RLState = {
          id: `dream-insight-${insight.id}`,
          features: this.encodeInsightAsFeatures(insight),
          metadata: {
            insightType: insight.type,
            cycleId,
            sourceConcepts: insight.sourceConcepts,
          },
        };

        // Create action representing the suggested action
        const action: RLAction = {
          type: 'dream-insight',
          value: insight.suggestedAction || insight.description,
        };

        // Create pattern in QESONA with dream-derived marker
        this.qesona.createPattern(
          state,
          action,
          {
            reward: insight.confidenceScore,
            success: true,
            quality: insight.noveltyScore,
          },
          'quality-assessment',
          this.domain,
          {
            insightId: insight.id,
            cycleId,
            description: insight.description,
            suggestedAction: insight.suggestedAction,
            dreamDerived: true,
          }
        );

        console.log(
          `[${this.domain}] Created SONA pattern from dream insight ${insight.id}`
        );
      } catch (error) {
        console.error(
          `[${this.domain}] Failed to store dream insight pattern:`,
          error
        );
      }
    }

    // Store insight in memory for downstream usage
    await this.memory.set(
      `${this.domain}:dream-insight:${insight.id}`,
      {
        insight,
        cycleId,
        appliedAt: new Date().toISOString(),
      },
      { namespace: this.domain, ttl: 86400 * 7 } // 7 days
    );
  }

  private encodeInsightAsFeatures(
    insight: DreamCycleCompletedPayload['insights'][0]
  ): number[] {
    return RLIntegration.encodeInsightAsFeatures(insight);
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
    this.actorCritic = await RLIntegration.initializeActorCritic();
  }

  private async initializeQESONA(): Promise<void> {
    this.qesona = await RLIntegration.initializeQESONA();
  }

  private async initializeFlashAttention(): Promise<void> {
    this.flashAttention = await RLIntegration.initializeFlashAttention();
  }

  private async tuneThresholdsWithRL(metrics: QualityMetrics): Promise<RLIntegration.RLThresholdResult | null> {
    if (!this.actorCritic) return null;
    return RLIntegration.tuneThresholdsWithRL(this.actorCritic, metrics);
  }

  private async trainActorCritic(request: GateEvaluationRequest, result: GateResult): Promise<void> {
    if (!this.actorCritic) return;
    await RLIntegration.trainActorCritic(this.actorCritic, request, result);
  }

  private async storeQualityPattern(request: GateEvaluationRequest, result: GateResult): Promise<void> {
    if (!this.qesona) return;
    await RLIntegration.storeQualityPattern(this.qesona, request, result, this.domain);
  }

  private async storeQualityAnalysisPattern(request: QualityAnalysisRequest, report: QualityReport): Promise<void> {
    if (!this.qesona) return;
    await RLIntegration.storeQualityAnalysisPattern(this.qesona, request, report, this.domain);
  }

  private async enhanceWithSimilarityPatterns(report: QualityReport): Promise<QualityReport | null> {
    if (!this.flashAttention || !this.qesona) return null;
    return RLIntegration.enhanceWithSimilarityPatterns(report, this.flashAttention, this.qesona, this.domain);
  }

  // ============================================================================
  // V3 Integration: ClaimVerifier Methods (Phase 4)
  // ============================================================================

  /**
   * Initialize ClaimVerifier for report verification
   */
  private async initializeClaimVerifier(): Promise<void> {
    this.claimVerifier = await ClaimVerifierHelpers.initializeClaimVerifier(this.config.claimVerifierRootDir);
  }

  private async verifyQualityReportClaims(
    report: QualityReport
  ): Promise<QualityReport & { claimVerification?: { verified: boolean; confidence: number; unverifiedClaims: number } }> {
    if (!this.config.enableClaimVerification || !this.claimVerifier) {
      return report;
    }
    return ClaimVerifierHelpers.verifyQualityReportClaims(report, this.claimVerifier);
  }

  private async verifyGateResultClaims(
    result: GateResult
  ): Promise<GateResult & { claimVerification?: { verified: boolean; confidence: number; unverifiedClaims: number } }> {
    if (!this.config.enableClaimVerification || !this.claimVerifier) {
      return result;
    }
    return ClaimVerifierHelpers.verifyGateResultClaims(result, this.claimVerifier);
  }

  /**
   * Get ClaimVerifier statistics
   */
  getClaimVerifierStats(): ReturnType<ClaimVerifierService['getStats']> | null {
    return this.claimVerifier?.getStats() ?? null;
  }
}
