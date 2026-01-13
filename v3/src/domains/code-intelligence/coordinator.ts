/**
 * Agentic QE v3 - Code Intelligence Coordinator
 * Orchestrates the code intelligence workflow across services
 *
 * V3 Integration:
 * - QEGNNEmbeddingIndex: Code graph embeddings with HNSW for fast similarity search
 * - QESONA: Learns and adapts code patterns for improved intelligence
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
  SearchResult,
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

// V3 Integration: @ruvector wrappers
import {
  QEGNNEmbeddingIndex,
  QEGNNIndexFactory,
  toIEmbedding,
  initGNN,
} from '../../integrations/ruvector/wrappers';

// Embeddings types
import type {
  IEmbedding,
  EmbeddingNamespace,
} from '../../integrations/embeddings/base/types';

// V3 Integration: SONA for code pattern learning
import {
  QESONA,
  createQESONA,
  type QEPatternType,
} from '../../integrations/ruvector/wrappers';

// V3 Integration: RL Suite interfaces
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces';

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
  // V3: Enable GNN and SONA integrations
  enableGNN: boolean;
  enableSONA: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 120000, // 2 minutes
  publishEvents: true,
  enableIncrementalIndex: true,
  enableGNN: true,
  enableSONA: true,
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

  // V3: GNN and SONA integrations
  private gnnIndex?: QEGNNEmbeddingIndex;
  private sonaEngine?: QESONA;
  private rlInitialized = false;

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

    // V3: Initialize GNN and SONA integrations
    if (this.config.enableGNN || this.config.enableSONA) {
      await this.initializeRLIntegrations();
    }

    this.initialized = true;
  }

  /**
   * Initialize V3 GNN and SONA integrations
   */
  private async initializeRLIntegrations(): Promise<void> {
    try {
      // Initialize GNN for code graph embeddings
      if (this.config.enableGNN) {
        initGNN(); // Initialize @ruvector/gnn
        this.gnnIndex = QEGNNIndexFactory.getInstance('code-intelligence', {
          M: 16,
          efConstruction: 200,
          efSearch: 50,
          dimension: 384,
          metric: 'cosine',
        });
        this.gnnIndex.initializeIndex('code' as EmbeddingNamespace);
        this.gnnIndex.initializeIndex('test' as EmbeddingNamespace);
      }

      // Initialize SONA for code pattern learning
      if (this.config.enableSONA) {
        this.sonaEngine = createQESONA({
          hiddenDim: 256,
          embeddingDim: 384,
          patternClusters: 50,
          maxPatterns: 10000,
        });
      }

      this.rlInitialized = true;
    } catch (error) {
      console.error('Failed to initialize RL integrations:', error);
      throw error;
    }
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    // Save workflow state
    await this.saveWorkflowState();

    // Clear active workflows
    this.workflows.clear();

    // Clean up GNN index
    if (this.gnnIndex) {
      QEGNNIndexFactory.closeInstance('code-intelligence');
    }

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
        this.updateWorkflowProgress(workflowId, 50);

        // V3: Index code embeddings in GNN
        if (this.config.enableGNN && this.gnnIndex && request.paths.length > 0) {
          await this.indexCodeEmbeddings(request.paths);
        }

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

      // V3: Use SONA to adapt search patterns
      if (this.config.enableSONA && this.sonaEngine) {
        const pattern = await this.adaptSearchPattern(request);
        if (pattern.success && pattern.pattern) {
          console.log(`[SONA] Adapted search pattern with ${pattern.similarity.toFixed(3)} similarity`);
        }
      }

      // V3: Use GNN for enhanced code similarity search
      let gnnResults: Array<{ file: string; similarity: number }> = [];
      if (this.config.enableGNN && this.gnnIndex) {
        gnnResults = await this.searchCodeWithGNN(request);
      }

      // Perform search
      const result = await this.semanticAnalyzer.search(request);

      if (result.success) {
        // Merge GNN results with semantic search results
        if (gnnResults.length > 0) {
          result.value.results = this.mergeSearchResults(
            result.value.results,
            gnnResults
          );
        }

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

      // V3: Use GNN to enhance impact analysis with semantic similarity
      if (this.config.enableGNN && this.gnnIndex) {
        await this.enhanceImpactAnalysisWithGNN(request);
      }

      // Perform impact analysis
      const result = await this.impactAnalyzer.analyzeImpact(request);

      if (result.success) {
        this.updateWorkflowProgress(workflowId, 100);
        this.completeWorkflow(workflowId);

        // V3: Store impact pattern in SONA
        if (this.config.enableSONA && this.sonaEngine) {
          await this.storeImpactPattern(request, result.value);
        }

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
  // V3: GNN Integration for Code Graph Embeddings
  // ============================================================================

  /**
   * Index code embeddings in GNN for fast similarity search
   */
  private async indexCodeEmbeddings(paths: string[]): Promise<void> {
    if (!this.gnnIndex || !this.rlInitialized) {
      return;
    }

    try {
      // Generate embeddings for each code file
      for (const path of paths) {
        try {
          const result = await this.fileReader.readFile(path);
          if (result.success && result.value) {
            // Create embedding from code content
            const embedding = await this.generateCodeEmbedding(path, result.value);

            // Add to GNN index
            const embeddingObj: IEmbedding = {
              vector: embedding,
              dimension: 384,
              namespace: 'code' as EmbeddingNamespace,
              text: result.value.slice(0, 1000), // First 1000 chars for context
              timestamp: Date.now(),
              quantization: 'none',
              metadata: { path },
            };

            this.gnnIndex.addEmbedding(embeddingObj);
          }
        } catch (error) {
          console.error(`Failed to index ${path}:`, error);
        }
      }

      console.log(`[GNN] Indexed ${paths.length} code embeddings`);
    } catch (error) {
      console.error('Failed to index code embeddings:', error);
    }
  }

  /**
   * Generate code embedding using semantic features
   */
  private async generateCodeEmbedding(
    path: string,
    content: string
  ): Promise<number[]> {
    // Simple embedding based on code features
    const features: number[] = [];

    // File type feature
    const ext = path.split('.').pop();
    const typeHash = this.hashCode(ext || '');
    features.push((typeHash % 1000) / 1000);

    // Content length feature
    features.push(Math.min(1, content.length / 10000));

    // Function/class count
    const functionMatches = content.match(/function\s+\w+/g) || [];
    const classMatches = content.match(/class\s+\w+/g) || [];
    features.push(Math.min(1, (functionMatches.length + classMatches.length) / 50));

    // Import/require count
    const importMatches = content.match(/import\s+.*from|require\s*\(/g) || [];
    features.push(Math.min(1, importMatches.length / 20));

    // Complexity indicators
    const loopMatches = content.match(/for\s*\(|while\s*\(/g) || [];
    const ifMatches = content.match(/if\s*\(/g) || [];
    features.push(Math.min(1, (loopMatches.length + ifMatches.length) / 30));

    // Comment density
    const commentMatches = content.match(/\/\/.*|\/\*[\s\S]*?\*\//g) || [];
    features.push(Math.min(1, commentMatches.length / 50));

    // Fill with hashed content features
    const contentHash = this.hashCode(content.slice(0, 500));
    for (let i = features.length; i < 384; i++) {
      features.push(((contentHash * (i + 1)) % 10000) / 10000);
    }

    return features.slice(0, 384);
  }

  /**
   * Search code with GNN for enhanced similarity
   */
  private async searchCodeWithGNN(
    request: SearchRequest
  ): Promise<Array<{ file: string; similarity: number }>> {
    if (!this.gnnIndex || !this.rlInitialized) {
      return [];
    }

    try {
      // Create query embedding
      const queryEmbedding = await this.generateCodeEmbedding('query', request.query);

      const queryIEmbedding: IEmbedding = {
        vector: queryEmbedding,
        dimension: 384,
        namespace: 'code' as EmbeddingNamespace,
        text: request.query,
        timestamp: Date.now(),
        quantization: 'none',
      };

      // Search in GNN index
      const results = this.gnnIndex.search(queryIEmbedding, {
        limit: 10,
        namespace: 'code' as EmbeddingNamespace,
      });

      return results.map((r: { id: number; distance: number; metadata?: { path?: string } }) => ({
        file: r.metadata?.path ?? `file-${r.id}`,
        similarity: 1 - r.distance,
      }));
    } catch (error) {
      console.error('Failed to search with GNN:', error);
      return [];
    }
  }

  /**
   * Enhance impact analysis with GNN semantic similarity
   */
  private async enhanceImpactAnalysisWithGNN(request: ImpactRequest): Promise<void> {
    if (!this.gnnIndex || !this.rlInitialized) {
      return;
    }

    try {
      // Find semantically similar files to changed files
      for (const changedFile of request.changedFiles) {
        const result = await this.fileReader.readFile(changedFile);
        if (result.success && result.value) {
          const embedding = await this.generateCodeEmbedding(changedFile, result.value);

          const embeddingObj: IEmbedding = {
            vector: embedding,
            dimension: 384,
            namespace: 'code' as EmbeddingNamespace,
            text: result.value.slice(0, 1000),
            timestamp: Date.now(),
            quantization: 'none',
            metadata: { path: changedFile },
          };

          // Search for similar files
          const similar = this.gnnIndex.search(embeddingObj, {
            limit: 5,
            namespace: 'code' as EmbeddingNamespace,
          });

          console.log(`[GNN] Found ${similar.length} semantically similar files to ${changedFile}`);
        }
      }
    } catch (error) {
      console.error('Failed to enhance impact analysis:', error);
    }
  }

  // ============================================================================
  // V3: SONA Integration for Code Pattern Learning
  // ============================================================================

  /**
   * Adapt search pattern using SONA
   */
  private async adaptSearchPattern(
    request: SearchRequest
  ): Promise<{ success: boolean; pattern: unknown; similarity: number }> {
    if (!this.sonaEngine || !this.rlInitialized) {
      return { success: false, pattern: null, similarity: 0 };
    }

    try {
      // Get language filter from filters array if present (field='language', value=<lang>)
      const languageFilter = Array.isArray(request.filters)
        ? (request.filters.find(f => f.field === 'language')?.value as string | undefined)
        : undefined;

      const state: RLState = {
        id: `search-${request.type}`,
        features: [
          request.query.length,
          request.type === 'semantic' ? 1 : 0,
          request.type === 'exact' ? 1 : 0, // Changed from 'structural' which doesn't exist
          languageFilter === 'typescript' ? 1 : 0,
          languageFilter === 'javascript' ? 1 : 0,
        ],
      };

      const result = await this.sonaEngine.adaptPattern(
        state,
        'coverage-optimization' as QEPatternType,
        'code-intelligence'
      );

      return {
        success: result.success,
        pattern: result.pattern,
        similarity: result.similarity,
      };
    } catch (error) {
      console.error('Failed to adapt search pattern:', error);
      return { success: false, pattern: null, similarity: 0 };
    }
  }

  /**
   * Store impact analysis pattern in SONA
   */
  private async storeImpactPattern(
    request: ImpactRequest,
    analysis: ImpactAnalysis
  ): Promise<void> {
    if (!this.sonaEngine || !this.rlInitialized) {
      return;
    }

    try {
      const state: RLState = {
        id: `impact-${request.changedFiles.join(',')}`,
        features: [
          request.changedFiles.length,
          request.depth || 1,
          analysis.directImpact.length,
          analysis.transitiveImpact.length,
          analysis.impactedTests.length,
          analysis.riskLevel === 'high' ? 1 : analysis.riskLevel === 'medium' ? 0.5 : 0,
        ],
      };

      const action: RLAction = {
        type: 'analyze-impact',
        value: analysis.riskLevel,
      };

      const outcome = {
        reward: analysis.riskLevel === 'high' ? 0.8 : analysis.riskLevel === 'medium' ? 0.5 : 0.3,
        success: analysis.impactedTests.length > 0,
        quality: (analysis.directImpact.length + analysis.transitiveImpact.length) / 100,
      };

      const pattern = this.sonaEngine.createPattern(
        state,
        action,
        outcome,
        'coverage-optimization' as QEPatternType,
        'code-intelligence',
        {
          changedFiles: request.changedFiles,
          impactCount: analysis.directImpact.length + analysis.transitiveImpact.length,
          testImpactCount: analysis.impactedTests.length,
        }
      );

      console.log(`[SONA] Stored impact pattern ${pattern.id}`);
    } catch (error) {
      console.error('Failed to store impact pattern:', error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Merge search results from semantic search and GNN
   */
  private mergeSearchResults(
    semanticResults: SearchResult[],
    gnnResults: Array<{ file: string; similarity: number }>
  ): SearchResult[] {
    const scoreMap = new Map<string, number>();
    const resultMap = new Map<string, SearchResult>();

    // Add semantic results
    for (const result of semanticResults) {
      scoreMap.set(result.file, result.score);
      resultMap.set(result.file, result);
    }

    // Merge GNN results (weighted average)
    for (const gnnResult of gnnResults) {
      const existingScore = scoreMap.get(gnnResult.file);
      if (existingScore !== undefined) {
        scoreMap.set(gnnResult.file, (existingScore + gnnResult.similarity) / 2);
      } else {
        // Create a new SearchResult for GNN-only results
        scoreMap.set(gnnResult.file, gnnResult.similarity * 0.8);
        resultMap.set(gnnResult.file, {
          file: gnnResult.file,
          snippet: '',
          score: gnnResult.similarity * 0.8,
          highlights: [],
        });
      }
    }

    // Update scores and sort
    return Array.from(resultMap.values())
      .map(result => ({
        ...result,
        score: scoreMap.get(result.file) ?? result.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // Top 20 results
  }

  /**
   * Simple hash function for strings
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash);
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
        const result = await this.fileReader.readFile(path);
        if (result.success && result.value) {
          await this.semanticAnalyzer.indexCode(path, result.value);
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
