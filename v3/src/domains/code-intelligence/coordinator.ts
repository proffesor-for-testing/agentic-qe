/**
 * Agentic QE v3 - Code Intelligence Coordinator
 * Orchestrates the code intelligence workflow across services
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
  CodeIntelligenceEvents,
  KnowledgeGraphUpdatedPayload,
  ImpactAnalysisPayload,
  createEvent,
} from '../../shared/events/domain-events';
import {
  CodeIntelligenceAPI,
  IndexRequest,
  IndexResult,
  SearchRequest,
  SearchResults,
  ImpactRequest,
  ImpactAnalysis,
  DependencyRequest,
  DependencyMap,
  KGQueryRequest,
  KGQueryResult,
} from './interfaces';
import {
  KnowledgeGraphService,
  IKnowledgeGraphService,
} from './services/knowledge-graph';
import {
  SemanticAnalyzerService,
  ISemanticAnalyzerService,
} from './services/semantic-analyzer';
import {
  ImpactAnalyzerService,
  IImpactAnalyzerService,
} from './services/impact-analyzer';
import { FileReader } from '../../shared/io';

/**
 * Interface for the code intelligence coordinator
 */
export interface ICodeIntelligenceCoordinator extends CodeIntelligenceAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
}

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'index' | 'search' | 'impact' | 'dependency' | 'query';
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
  enableIncrementalIndex: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 120000, // 2 minutes
  publishEvents: true,
  enableIncrementalIndex: true,
};

/**
 * Code Intelligence Coordinator
 * Orchestrates code intelligence workflows and coordinates with agents
 */
export class CodeIntelligenceCoordinator implements ICodeIntelligenceCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly knowledgeGraph: IKnowledgeGraphService;
  private readonly semanticAnalyzer: ISemanticAnalyzerService;
  private readonly impactAnalyzer: IImpactAnalyzerService;
  private readonly fileReader: FileReader;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.knowledgeGraph = new KnowledgeGraphService(memory);
    this.semanticAnalyzer = new SemanticAnalyzerService(memory);
    this.impactAnalyzer = new ImpactAnalyzerService(memory, this.knowledgeGraph);
    this.fileReader = new FileReader();
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
    // Save workflow state
    await this.saveWorkflowState();

    // Clear active workflows
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
  // CodeIntelligenceAPI Implementation
  // ============================================================================

  /**
   * Index codebase into Knowledge Graph
   */
  async index(request: IndexRequest): Promise<Result<IndexResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'index');

      // Check if we can spawn agents
      if (!this.agentCoordinator.canSpawn()) {
        return err(new Error('Agent limit reached, cannot spawn indexing agents'));
      }

      // Spawn indexer agent
      const agentResult = await this.spawnIndexerAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);
      this.updateWorkflowProgress(workflowId, 10);

      // Perform indexing
      const result = await this.knowledgeGraph.index(request);

      if (result.success) {
        this.updateWorkflowProgress(workflowId, 80);

        // Index content for semantic search
        if (request.paths.length > 0) {
          await this.indexForSemanticSearch(request.paths);
        }

        this.updateWorkflowProgress(workflowId, 100);
        this.completeWorkflow(workflowId);

        // Publish events
        if (this.config.publishEvents) {
          await this.publishKnowledgeGraphUpdated(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      // Stop the agent
      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Semantic code search
   */
  async search(request: SearchRequest): Promise<Result<SearchResults, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'search');

      // Spawn search agent for complex queries
      const agentResult = await this.spawnSearchAgent(workflowId, request);
      if (agentResult.success) {
        this.addAgentToWorkflow(workflowId, agentResult.value);
      }

      // Perform search
      const result = await this.semanticAnalyzer.search(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish events
        if (this.config.publishEvents) {
          await this.publishSemanticSearchCompleted(request, result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      // Stop agent if spawned
      if (agentResult.success) {
        await this.agentCoordinator.stop(agentResult.value);
      }

      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Analyze change impact
   */
  async analyzeImpact(request: ImpactRequest): Promise<Result<ImpactAnalysis, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'impact');

      // Spawn impact analyzer agent
      const agentResult = await this.spawnImpactAnalyzerAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);
      this.updateWorkflowProgress(workflowId, 20);

      // Perform impact analysis
      const result = await this.impactAnalyzer.analyzeImpact(request);

      if (result.success) {
        this.updateWorkflowProgress(workflowId, 100);
        this.completeWorkflow(workflowId);

        // Publish events
        if (this.config.publishEvents) {
          await this.publishImpactAnalysisCompleted(request, result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      // Stop the agent
      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Map dependencies
   */
  async mapDependencies(
    request: DependencyRequest
  ): Promise<Result<DependencyMap, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'dependency');

      // Perform dependency mapping
      const result = await this.knowledgeGraph.mapDependencies(request);

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Query Knowledge Graph
   */
  async queryKG(request: KGQueryRequest): Promise<Result<KGQueryResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'query');

      // Perform query
      const result = await this.knowledgeGraph.query(request);

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.failWorkflow(workflowId, errorObj.message);
      return err(errorObj);
    }
  }

  // ============================================================================
  // Agent Spawning Methods
  // ============================================================================

  private async spawnIndexerAgent(
    workflowId: string,
    request: IndexRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `kg-indexer-${workflowId.slice(0, 8)}`,
      domain: 'code-intelligence',
      type: 'analyzer',
      capabilities: ['indexing', 'ast-parsing', 'graph-building'],
      config: {
        workflowId,
        paths: request.paths,
        incremental: request.incremental,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnSearchAgent(
    workflowId: string,
    request: SearchRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `semantic-search-${workflowId.slice(0, 8)}`,
      domain: 'code-intelligence',
      type: 'analyzer',
      capabilities: ['semantic-search', 'vector-similarity', request.type],
      config: {
        workflowId,
        query: request.query,
        type: request.type,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnImpactAnalyzerAgent(
    workflowId: string,
    request: ImpactRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `impact-analyzer-${workflowId.slice(0, 8)}`,
      domain: 'code-intelligence',
      type: 'analyzer',
      capabilities: ['impact-analysis', 'dependency-traversal', 'risk-assessment'],
      config: {
        workflowId,
        changedFiles: request.changedFiles,
        depth: request.depth,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishKnowledgeGraphUpdated(result: IndexResult): Promise<void> {
    const payload: KnowledgeGraphUpdatedPayload = {
      nodes: result.nodesCreated,
      edges: result.edgesCreated,
      filesIndexed: result.filesIndexed,
      duration: result.duration,
    };

    const event = createEvent(
      CodeIntelligenceEvents.KnowledgeGraphUpdated,
      'code-intelligence',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishImpactAnalysisCompleted(
    request: ImpactRequest,
    analysis: ImpactAnalysis
  ): Promise<void> {
    const payload: ImpactAnalysisPayload = {
      analysisId: uuidv4(),
      changedFiles: request.changedFiles,
      impactedFiles: [
        ...analysis.directImpact.map((i) => i.file),
        ...analysis.transitiveImpact.map((i) => i.file),
      ],
      impactedTests: analysis.impactedTests,
      riskLevel: analysis.riskLevel,
    };

    const event = createEvent(
      CodeIntelligenceEvents.ImpactAnalysisCompleted,
      'code-intelligence',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishSemanticSearchCompleted(
    request: SearchRequest,
    results: SearchResults
  ): Promise<void> {
    const event = createEvent(
      CodeIntelligenceEvents.SemanticSearchCompleted,
      'code-intelligence',
      {
        query: request.query,
        type: request.type,
        resultCount: results.total,
        searchTime: results.searchTime,
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(id: string, type: WorkflowStatus['type']): void {
    // Check workflow limit
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

  private updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to test execution events for impact correlation
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to code change events
    this.eventBus.subscribe(
      'source-control.FilesChanged',
      this.handleFilesChanged.bind(this)
    );
  }

  private async handleTestRunCompleted(event: DomainEvent): Promise<void> {
    // Correlate test results with impact analysis
    const payload = event.payload as {
      runId: string;
      passed: number;
      failed: number;
    };

    // Store for analysis
    await this.memory.set(
      `code-intelligence:test-correlation:${payload.runId}`,
      payload,
      { namespace: 'code-intelligence', ttl: 86400 } // 24 hours
    );
  }

  private async handleFilesChanged(event: DomainEvent): Promise<void> {
    // Auto-trigger incremental indexing if enabled
    if (!this.config.enableIncrementalIndex) return;

    const payload = event.payload as { files: string[] };
    if (payload.files && payload.files.length > 0) {
      // Queue incremental index
      await this.memory.set(
        `code-intelligence:pending-index:${Date.now()}`,
        { files: payload.files, timestamp: new Date().toISOString() },
        { namespace: 'code-intelligence', ttl: 3600 } // 1 hour
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async indexForSemanticSearch(paths: string[]): Promise<void> {
    // Index a subset of files for semantic search
    // Limit to 100 files for performance in a single batch
    const filesToIndex = paths.slice(0, 100);

    for (const path of filesToIndex) {
      try {
        // Read actual file content
        const content = await this.fileReader.readFile(path);
        if (content) {
          await this.semanticAnalyzer.indexCode(path, content);
        }
      } catch {
        // Continue on error - file may not exist or be unreadable
      }
    }
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'code-intelligence:coordinator:workflows'
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
      'code-intelligence:coordinator:workflows',
      workflows,
      { namespace: 'code-intelligence', persist: true }
    );
  }
}
