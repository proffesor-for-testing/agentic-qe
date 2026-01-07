/**
 * Agentic QE v3 - Quality Assessment Coordinator
 * Orchestrates the quality assessment workflow across services
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, err, DomainEvent } from '../../shared/types';
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
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000,
  publishEvents: true,
  enableAutoGating: false,
};

/**
 * Quality Assessment Coordinator
 * Orchestrates quality assessment workflows and coordinates with agents
 */
export class QualityAssessmentCoordinator implements IQualityAssessmentCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly qualityGate: IQualityGateService;
  private readonly qualityAnalyzer: IQualityAnalyzerService;
  private readonly deploymentAdvisor: IDeploymentAdvisorService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

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
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted workflow state
    await this.loadWorkflowState();

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    await this.saveWorkflowState();
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

      // Evaluate the gate
      const result = await this.qualityGate.evaluateGate(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish event
        if (this.config.publishEvents) {
          await this.publishQualityGateEvaluated(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      // Stop agent
      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze code quality
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

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Auto-trigger gate evaluation if enabled
        if (this.config.enableAutoGating && result.value.score.overall < 70) {
          // Store for downstream consumption
          await this.memory.set(
            `quality-assessment:auto-gate:${workflowId}`,
            { score: result.value.score, recommendations: result.value.recommendations },
            { namespace: 'quality-assessment', ttl: 3600 }
          );
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      return result;
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

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish deployment decision event
        if (this.config.publishEvents) {
          await this.publishDeploymentDecision(result.value, request.releaseCandidate);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
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

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

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
}
