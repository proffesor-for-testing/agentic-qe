/**
 * Agentic QE v3 - Defect Intelligence Coordinator
 * Orchestrates the defect intelligence workflow across services
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, err } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces';
import {
  DefectIntelligenceEvents,
  createEvent,
} from '../../shared/events/domain-events';
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
  DefectPredictorService,
  IDefectPredictorService,
} from './services/defect-predictor';
import {
  PatternLearnerService,
  IPatternLearnerService,
} from './services/pattern-learner';
import {
  RootCauseAnalyzerService,
  IRootCauseAnalyzerService,
} from './services/root-cause-analyzer';

/**
 * Interface for the defect intelligence coordinator
 */
export interface IDefectIntelligenceCoordinator extends DefectIntelligenceAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'predict' | 'analyze' | 'regression' | 'cluster' | 'learn';
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
  enablePatternLearning: boolean;
  publishEvents: boolean;
  autoAnalyzeThreshold: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000,
  enablePatternLearning: true,
  publishEvents: true,
  autoAnalyzeThreshold: 0.7,
};

/**
 * Defect Intelligence Coordinator
 * Orchestrates defect analysis workflows and coordinates with agents
 */
export class DefectIntelligenceCoordinator implements IDefectIntelligenceCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly predictor: IDefectPredictorService;
  private readonly patternLearner: IPatternLearnerService;
  private readonly rootCauseAnalyzer: IRootCauseAnalyzerService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.predictor = new DefectPredictorService(memory);
    this.patternLearner = new PatternLearnerService(memory);
    this.rootCauseAnalyzer = new RootCauseAnalyzerService(memory);
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
  // DefectIntelligenceAPI Implementation
  // ============================================================================

  /**
   * Predict defects for given files
   */
  async predictDefects(
    request: PredictRequest
  ): Promise<Result<PredictionResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'predict');

      // Check if we can spawn agents
      if (!this.agentCoordinator.canSpawn()) {
        return err(new Error('Agent limit reached, cannot spawn prediction agents'));
      }

      // Spawn prediction agent
      const agentResult = await this.spawnPredictionAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Execute prediction
      const result = await this.predictor.predictDefects(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish events
        if (this.config.publishEvents) {
          await this.publishPredictionEvent(result.value);
        }

        // Auto-analyze high-risk predictions
        if (this.config.enablePatternLearning) {
          await this.autoAnalyzeHighRisk(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      // Stop the agent
      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, err.message);
      return { success: false, error: err };
    }
  }

  /**
   * Analyze root cause of a defect
   */
  async analyzeRootCause(
    request: RootCauseRequest
  ): Promise<Result<RootCauseAnalysis, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'analyze');

      // Spawn analysis agent
      const agentResult = await this.spawnAnalysisAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Execute analysis
      const result = await this.rootCauseAnalyzer.analyzeRootCause(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish event
        if (this.config.publishEvents) {
          await this.publishRootCauseEvent(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze regression risk for a changeset
   */
  async analyzeRegressionRisk(
    request: RegressionRequest
  ): Promise<Result<RegressionRisk, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'regression');

      // Spawn regression analysis agent
      const agentResult = await this.spawnRegressionAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Execute regression analysis
      const result = await this.predictor.analyzeRegressionRisk(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish event
        if (this.config.publishEvents) {
          await this.publishRegressionEvent(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Cluster similar defects
   */
  async clusterDefects(
    request: ClusterRequest
  ): Promise<Result<DefectClusters, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'cluster');

      const result = await this.patternLearner.clusterDefects(request);

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Learn patterns from defects
   */
  async learnPatterns(
    request: LearnRequest
  ): Promise<Result<LearnedDefectPatterns, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'learn');

      const result = await this.patternLearner.learnPatterns(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish pattern learned event
        if (this.config.publishEvents && result.value.modelUpdated) {
          await this.publishPatternLearnedEvent(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
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

  private async spawnPredictionAgent(
    workflowId: string,
    request: PredictRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `defect-predictor-${workflowId.slice(0, 8)}`,
      domain: 'defect-intelligence',
      type: 'analyzer',
      capabilities: ['defect-prediction', 'ml-analysis'],
      config: {
        workflowId,
        files: request.files,
        threshold: request.threshold,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnAnalysisAgent(
    workflowId: string,
    request: RootCauseRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `root-cause-analyzer-${workflowId.slice(0, 8)}`,
      domain: 'defect-intelligence',
      type: 'analyzer',
      capabilities: ['root-cause-analysis', 'symptom-analysis'],
      config: {
        workflowId,
        defectId: request.defectId,
        symptoms: request.symptoms,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnRegressionAgent(
    workflowId: string,
    request: RegressionRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `regression-analyzer-${workflowId.slice(0, 8)}`,
      domain: 'defect-intelligence',
      type: 'analyzer',
      capabilities: ['regression-analysis', 'impact-analysis'],
      config: {
        workflowId,
        changeset: request.changeset,
        depth: request.depth,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishPredictionEvent(result: PredictionResult): Promise<void> {
    for (const prediction of result.predictions) {
      if (prediction.probability >= this.config.autoAnalyzeThreshold) {
        const event = createEvent(
          DefectIntelligenceEvents.DefectPredicted,
          'defect-intelligence',
          {
            predictionId: uuidv4(),
            file: prediction.file,
            probability: prediction.probability,
            factors: prediction.factors.map((f) => f.name),
            recommendations: prediction.recommendations,
          }
        );

        await this.eventBus.publish(event);
      }
    }
  }

  private async publishRootCauseEvent(result: RootCauseAnalysis): Promise<void> {
    const event = createEvent(
      DefectIntelligenceEvents.RootCauseIdentified,
      'defect-intelligence',
      {
        analysisId: uuidv4(),
        defectId: result.defectId,
        rootCause: result.rootCause,
        confidence: result.confidence,
        relatedFiles: result.relatedFiles,
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishRegressionEvent(result: RegressionRisk): Promise<void> {
    const event = createEvent(
      DefectIntelligenceEvents.RegressionRiskAnalyzed,
      'defect-intelligence',
      {
        riskLevel: result.riskLevel,
        overallRisk: result.overallRisk,
        impactedAreas: result.impactedAreas.length,
        recommendedTests: result.recommendedTests.length,
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishPatternLearnedEvent(
    result: LearnedDefectPatterns
  ): Promise<void> {
    const event = createEvent(
      'defect-intelligence.PatternLearned',
      'defect-intelligence',
      {
        patternCount: result.patterns.length,
        modelUpdated: result.modelUpdated,
        improvementEstimate: result.improvementEstimate,
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(id: string, type: WorkflowStatus['type']): void {
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
    // Subscribe to test execution events to learn from failures
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to code change events for regression analysis
    this.eventBus.subscribe(
      'code-intelligence.ImpactAnalysisCompleted',
      this.handleImpactAnalysis.bind(this)
    );
  }

  private async handleTestRunCompleted(
    event: import('../../shared/types').DomainEvent
  ): Promise<void> {
    const payload = event.payload as {
      failed: number;
      testIds: string[];
    };

    // If tests failed, trigger pattern learning
    if (payload.failed > 0 && this.config.enablePatternLearning) {
      // Store failed test info for future pattern learning
      await this.memory.set(
        `defect-intelligence:failed-tests:${Date.now()}`,
        {
          timestamp: new Date().toISOString(),
          failedCount: payload.failed,
          testIds: payload.testIds,
        },
        { namespace: 'defect-intelligence', ttl: 86400 * 7 }
      );
    }
  }

  private async handleImpactAnalysis(
    event: import('../../shared/types').DomainEvent
  ): Promise<void> {
    const payload = event.payload as {
      changedFiles: string[];
      impactedFiles: string[];
    };

    // Trigger regression risk analysis for significant changes
    if (payload.changedFiles.length > 3) {
      await this.analyzeRegressionRisk({
        changeset: payload.changedFiles,
        depth: 'shallow',
      });
    }
  }

  // ============================================================================
  // Auto-Analysis
  // ============================================================================

  private async autoAnalyzeHighRisk(result: PredictionResult): Promise<void> {
    const highRiskFiles = result.predictions.filter(
      (p) => p.probability >= this.config.autoAnalyzeThreshold
    );

    for (const prediction of highRiskFiles.slice(0, 3)) {
      // Store for later detailed analysis
      await this.memory.set(
        `defect-intelligence:high-risk:${prediction.file}`,
        {
          file: prediction.file,
          probability: prediction.probability,
          factors: prediction.factors,
          detectedAt: new Date().toISOString(),
        },
        { namespace: 'defect-intelligence', ttl: 86400 }
      );
    }
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'defect-intelligence:coordinator:workflows'
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
      'defect-intelligence:coordinator:workflows',
      workflows,
      { namespace: 'defect-intelligence', persist: true }
    );
  }
}
