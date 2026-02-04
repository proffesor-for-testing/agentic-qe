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
  C4DiagramsGeneratedPayload,
  createEvent,
} from '../../shared/events/domain-events';
import {
  C4DiagramResult,
  C4DiagramRequest,
} from '../../shared/c4-model';
import {
  ProductFactorsBridgeService,
  IProductFactorsBridge,
} from './services/product-factors-bridge';
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

// V3 Integration: SONA for code pattern learning (persistent patterns)
import {
  PersistentSONAEngine,
  createPersistentSONAEngine,
} from '../../integrations/ruvector/sona-persistence.js';
import { type QEPatternType } from '../../integrations/ruvector/wrappers';

// V3 Integration: RL Suite interfaces
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces';

// V3 Integration: MetricCollector for real code metrics (Phase 5)
import {
  MetricCollectorService,
  createMetricCollector,
  type IMetricCollectorService,
  type ProjectMetrics,
} from './services/metric-collector/index.js';

// V3 Integration: Hypergraph Engine for code intelligence (GOAP Action 7)
import {
  HypergraphEngine,
  createHypergraphEngine,
  type HypergraphEngineConfig,
  type BuildResult as HypergraphBuildResult,
  type CodeIndexResult,
} from '../../integrations/ruvector/hypergraph-engine.js';
import { type HypergraphNode } from '../../integrations/ruvector/hypergraph-schema.js';

// ============================================================================
// MinCut & Consensus Mixin Imports (ADR-047, MM-001)
// ============================================================================

import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  type IMinCutAwareDomain,
  type MinCutAwareConfig,
} from '../../coordination/mixins/mincut-aware-domain';

import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type IConsensusEnabledDomain,
  type ConsensusEnabledConfig,
} from '../../coordination/mixins/consensus-enabled-domain';

// ADR-058: Governance-aware mixin for MemoryWriteGate integration
import {
  GovernanceAwareDomainMixin,
  createGovernanceAwareMixin,
} from '../../coordination/mixins/governance-aware-domain.js';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration';
import type { WeakVertex } from '../../coordination/mincut/interfaces';
import type { ConsensusStats } from '../../coordination/mixins/consensus-enabled-domain';
import type { DomainName } from '../../shared/types';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';

/**
 * Interface for the code intelligence coordinator
 */
export interface ICodeIntelligenceCoordinator extends CodeIntelligenceAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];

  /**
   * Generate C4 architecture diagrams for a project
   * @param projectPath - Path to the project root
   * @param options - Optional C4 diagram generation options
   */
  generateC4Diagrams(
    projectPath: string,
    options?: Partial<C4DiagramRequest>
  ): Promise<Result<C4DiagramResult, Error>>;

  /**
   * Get the Product Factors Bridge for cross-domain access
   */
  getProductFactorsBridge(): IProductFactorsBridge;

  /**
   * V3: Collect real project metrics using actual tooling (Phase 5)
   * Uses cloc/tokei for LOC, vitest/jest/cargo/pytest for tests
   * @param projectPath - Path to the project root
   */
  collectProjectMetrics(projectPath: string): Promise<Result<ProjectMetrics, Error>>;

  /**
   * V3: Find untested functions using hypergraph analysis (GOAP Action 7)
   * Returns functions that have no test coverage based on the code knowledge graph.
   */
  findUntestedFunctions(): Promise<Result<HypergraphNode[], Error>>;

  /**
   * V3: Find impacted tests using hypergraph traversal (GOAP Action 7)
   * Returns tests that should be run based on changed files.
   * @param changedFiles - Array of file paths that have changed
   */
  findImpactedTestsFromHypergraph(changedFiles: string[]): Promise<Result<HypergraphNode[], Error>>;

  /**
   * V3: Find coverage gaps using hypergraph analysis (GOAP Action 7)
   * Returns functions with low test coverage.
   * @param maxCoverage - Maximum coverage percentage to consider as a gap (default: 50)
   */
  findCoverageGapsFromHypergraph(maxCoverage?: number): Promise<Result<HypergraphNode[], Error>>;

  /**
   * V3: Build hypergraph from latest index result (GOAP Action 7)
   * Populates the hypergraph with code entities and relationships.
   * @param indexResult - Code index result to build from
   */
  buildHypergraphFromIndex(indexResult: CodeIndexResult): Promise<Result<HypergraphBuildResult, Error>>;

  /**
   * V3: Check if hypergraph is enabled and initialized
   */
  isHypergraphEnabled(): boolean;

  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  getDomainWeakVertices(): WeakVertex[];
  isDomainWeakPoint(): boolean;
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[];
  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
  getConsensusStats(): ConsensusStats | undefined;
  verifyCodePatternDetection(
    pattern: { id: string; name: string; type: string; location: string },
    confidence: number
  ): Promise<boolean>;
  verifyImpactAnalysis(
    impact: { changedFiles: string[]; riskLevel: string; impactedTests: string[] },
    confidence: number
  ): Promise<boolean>;
  verifyDependencyMapping(
    dependency: { source: string; targets: string[]; type: string },
    confidence: number
  ): Promise<boolean>;
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
  // V3: Enable MetricCollector for real code metrics (Phase 5)
  enableMetricCollector: boolean;
  // V3: Enable Hypergraph for intelligent code analysis (GOAP Action 7)
  enableHypergraph: boolean;
  // V3: Optional database path for hypergraph persistence
  hypergraphDbPath?: string;
  // MinCut integration config (ADR-047)
  enableMinCutAwareness: boolean;
  topologyHealthThreshold: number;
  pauseOnCriticalTopology: boolean;
  // Consensus integration config (MM-001)
  enableConsensus: boolean;
  consensusThreshold: number;
  consensusStrategy: 'majority' | 'weighted' | 'unanimous';
  consensusMinModels: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 120000, // 2 minutes
  publishEvents: true,
  enableIncrementalIndex: true,
  enableGNN: true,
  enableSONA: true,
  // V3: MetricCollector enabled by default for real code metrics
  enableMetricCollector: true,
  // V3: Hypergraph enabled by default for intelligent code analysis (GOAP Action 7)
  enableHypergraph: true,
  // MinCut integration defaults (ADR-047)
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // Consensus integration defaults (MM-001)
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
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
  private sonaEngine?: PersistentSONAEngine;
  private rlInitialized = false;

  // V3: MetricCollector for real code metrics (Phase 5)
  private metricCollector?: IMetricCollectorService;

  // V3: Hypergraph Engine for intelligent code analysis (GOAP Action 7)
  private hypergraph?: HypergraphEngine;
  private hypergraphDb?: import('better-sqlite3').Database;

  // V3: Product Factors Bridge for cross-domain C4 access
  private productFactorsBridge: ProductFactorsBridgeService;

  // MinCut topology awareness mixin (ADR-047)
  private readonly minCutMixin: MinCutAwareDomainMixin;

  // Consensus verification mixin (MM-001)
  private readonly consensusMixin: ConsensusEnabledMixin;

  // Domain identifier for mixin initialization
  private readonly domainName = 'code-intelligence';

  // ADR-058: Governance mixin for MemoryWriteGate integration
  private readonly governanceMixin: GovernanceAwareDomainMixin;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize MinCut-aware mixin (ADR-047)
    this.minCutMixin = createMinCutAwareMixin(this.domainName, {
      enableMinCutAwareness: this.config.enableMinCutAwareness,
      topologyHealthThreshold: this.config.topologyHealthThreshold,
      pauseOnCriticalTopology: this.config.pauseOnCriticalTopology,
    });

    // Initialize Consensus-enabled mixin (MM-001)
    this.consensusMixin = createConsensusEnabledMixin({
      enableConsensus: this.config.enableConsensus,
      consensusThreshold: this.config.consensusThreshold,
      verifyFindingTypes: ['code-pattern-detection', 'impact-analysis', 'dependency-mapping'],
      strategy: this.config.consensusStrategy,
      minModels: this.config.consensusMinModels,
      modelTimeout: 60000,
      verifySeverities: ['critical', 'high'],
      enableLogging: false,
    });

    // ADR-058: Initialize governance mixin for MemoryWriteGate integration
    this.governanceMixin = createGovernanceAwareMixin(this.domainName);

    this.knowledgeGraph = new KnowledgeGraphService(memory);
    this.semanticAnalyzer = new SemanticAnalyzerService(memory);
    this.impactAnalyzer = new ImpactAnalyzerService(memory, this.knowledgeGraph);
    this.fileReader = new FileReader();

    // Initialize Product Factors Bridge
    this.productFactorsBridge = new ProductFactorsBridgeService(eventBus, memory, {
      publishEvents: this.config.publishEvents,
    });
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

    // V3: Initialize MetricCollector for real code metrics (Phase 5)
    if (this.config.enableMetricCollector) {
      this.metricCollector = createMetricCollector({
        enableCache: true,
        cacheTTL: 300000, // 5 minutes
      });
      console.log('[CodeIntelligence] MetricCollector initialized for real code metrics');
    }

    // V3: Initialize Hypergraph Engine for intelligent code analysis (GOAP Action 7)
    if (this.config.enableHypergraph) {
      await this.initializeHypergraph();
    }

    // V3: Initialize Product Factors Bridge
    await this.productFactorsBridge.initialize();

    // Initialize Consensus engine if enabled (MM-001)
    if (this.config.enableConsensus) {
      try {
        await (this.consensusMixin as any).initializeConsensus();
        console.log(`[${this.domainName}] Consensus engine initialized`);
      } catch (error) {
        console.error(`[${this.domainName}] Failed to initialize consensus engine:`, error);
        console.warn(`[${this.domainName}] Continuing without consensus verification`);
      }
    }

    this.initialized = true;
  }

  /**
   * Initialize V3 Hypergraph Engine for code intelligence (GOAP Action 7)
   */
  private async initializeHypergraph(): Promise<void> {
    try {
      // Import better-sqlite3 dynamically to avoid issues in environments where it's not available
      const Database = (await import('better-sqlite3')).default;

      // Use configured path or default
      const dbPath = this.config.hypergraphDbPath || '.agentic-qe/hypergraph.db';

      // Ensure directory exists
      const fs = await import('fs');
      const path = await import('path');
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create database connection
      this.hypergraphDb = new Database(dbPath);

      // Create hypergraph engine
      this.hypergraph = await createHypergraphEngine({
        db: this.hypergraphDb,
        maxTraversalDepth: 10,
        maxQueryResults: 1000,
        enableVectorSearch: this.config.enableGNN,
      });

      console.log(`[CodeIntelligence] Hypergraph Engine initialized at ${dbPath}`);
    } catch (error) {
      console.error('[CodeIntelligence] Failed to initialize Hypergraph Engine:', error);
      // Don't throw - hypergraph is optional, coordinator should still work
      this.hypergraph = undefined;
      this.hypergraphDb = undefined;
    }
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

      // Initialize SONA for code pattern learning (persistent patterns)
      if (this.config.enableSONA) {
        try {
          this.sonaEngine = await createPersistentSONAEngine({
            domain: 'code-intelligence',
            loadOnInit: true,
            autoSaveInterval: 60000,
            maxPatterns: 10000,
            minConfidence: 0.6,
          });
          console.log('[CodeIntelligence] PersistentSONAEngine initialized for code pattern learning');
        } catch (error) {
          console.error('[CodeIntelligence] Failed to initialize PersistentSONAEngine:', error);
          // Continue without SONA - it's optional
          this.sonaEngine = undefined;
        }
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
    // Dispose Consensus engine (MM-001)
    try {
      await (this.consensusMixin as any).disposeConsensus();
    } catch (error) {
      console.error(`[${this.domainName}] Error disposing consensus engine:`, error);
    }

    // Dispose MinCut mixin (ADR-047)
    this.minCutMixin.dispose();

    // Save workflow state
    await this.saveWorkflowState();

    // Clear active workflows
    this.workflows.clear();

    // Clean up GNN index
    if (this.gnnIndex) {
      QEGNNIndexFactory.closeInstance('code-intelligence');
    }

    // V3: Clean up SONA engine (persistent patterns)
    if (this.sonaEngine) {
      try {
        await this.sonaEngine.close();
        this.sonaEngine = undefined;
      } catch (error) {
        console.error('[CodeIntelligence] Error closing SONA engine:', error);
      }
    }

    // V3: Clean up Hypergraph Engine (GOAP Action 7)
    if (this.hypergraphDb) {
      try {
        this.hypergraphDb.close();
      } catch (error) {
        console.error('[CodeIntelligence] Error closing hypergraph database:', error);
      }
      this.hypergraphDb = undefined;
    }
    this.hypergraph = undefined;

    // Dispose Product Factors Bridge
    await this.productFactorsBridge.dispose();

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

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative strategy`);
        // Continue with reduced parallelism when topology is unhealthy
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Indexing paused: topology is in critical state'));
      }

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
        this.updateWorkflowProgress(workflowId, 40);

        // V3: Index code embeddings in GNN
        if (this.config.enableGNN && this.gnnIndex && request.paths.length > 0) {
          await this.indexCodeEmbeddings(request.paths);
        }

        this.updateWorkflowProgress(workflowId, 60);

        // V3: Collect real project metrics using actual tooling (Phase 5)
        if (this.config.enableMetricCollector && this.metricCollector && request.paths.length > 0) {
          // Determine project root from first path
          const projectPath = this.getProjectRootFromPaths(request.paths);
          if (projectPath) {
            await this.collectProjectMetrics(projectPath);
          }
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

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative impact analysis`);
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Impact analysis paused: topology is in critical state'));
      }

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
        this.updateWorkflowProgress(workflowId, 80);

        // V3: Enhance impact analysis with hypergraph (GOAP Action 7)
        let enhancedAnalysis = result.value;
        if (this.config.enableHypergraph && this.hypergraph) {
          enhancedAnalysis = await this.enhanceImpactWithHypergraph(request, result.value);
        }

        this.updateWorkflowProgress(workflowId, 100);
        this.completeWorkflow(workflowId);

        // V3: Store impact pattern in SONA
        if (this.config.enableSONA && this.sonaEngine) {
          await this.storeImpactPattern(request, enhancedAnalysis);
        }

        // Publish events
        if (this.config.publishEvents) {
          await this.publishImpactAnalysisCompleted(request, enhancedAnalysis);
        }

        // Return enhanced analysis
        return { success: true, value: enhancedAnalysis };
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

  // ============================================================================
  // C4 Diagram Generation (Cross-Domain Integration)
  // ============================================================================

  /**
   * Generate C4 architecture diagrams for a project
   *
   * This method provides C4 diagram generation capabilities that can be used by:
   * - The code-intelligence domain internally
   * - The requirements-validation domain (product-factors-assessor)
   * - Any other domain that needs C4 diagrams
   *
   * @param projectPath - Path to the project root directory
   * @param options - Optional configuration for diagram generation
   * @returns C4DiagramResult with diagrams and analysis metadata
   */
  async generateC4Diagrams(
    projectPath: string,
    options?: Partial<C4DiagramRequest>
  ): Promise<Result<C4DiagramResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'query'); // Using 'query' type for C4 generation

      // Build the full request
      const request: C4DiagramRequest = {
        projectPath,
        detectExternalSystems: options?.detectExternalSystems ?? true,
        analyzeComponents: options?.analyzeComponents ?? true,
        analyzeCoupling: options?.analyzeCoupling ?? true,
        includeContext: options?.includeContext ?? true,
        includeContainer: options?.includeContainer ?? true,
        includeComponent: options?.includeComponent ?? true,
        includeDependency: options?.includeDependency ?? false,
        excludePatterns: options?.excludePatterns,
      };

      this.updateWorkflowProgress(workflowId, 20);

      // Delegate to the Product Factors Bridge
      const result = await this.productFactorsBridge.requestC4Diagrams(request);

      if (result.success) {
        this.updateWorkflowProgress(workflowId, 80);

        // Store in memory for cross-domain access
        await this.storeC4DiagramsInMemory(projectPath, result.value);

        this.updateWorkflowProgress(workflowId, 100);
        this.completeWorkflow(workflowId);

        // The bridge already publishes the event, but we can add correlation here
        console.log(
          `[CodeIntelligenceCoordinator] C4 diagrams generated for ${projectPath}: ` +
            `${result.value.components.length} components, ` +
            `${result.value.externalSystems.length} external systems`
        );
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
   * Get the Product Factors Bridge for cross-domain access
   *
   * This allows other domains (like requirements-validation) to directly
   * access C4 diagram capabilities without going through the coordinator.
   */
  getProductFactorsBridge(): IProductFactorsBridge {
    return this.productFactorsBridge;
  }

  /**
   * Store C4 diagrams in memory for cross-domain access
   */
  private async storeC4DiagramsInMemory(
    projectPath: string,
    result: C4DiagramResult
  ): Promise<void> {
    const key = `c4-diagrams:latest:${this.hashCode(projectPath)}`;

    await this.memory.set(key, result, {
      namespace: 'code-intelligence',
      persist: true,
      ttl: 3600000, // 1 hour
    });

    // Also store components and external systems separately for quick access
    await this.memory.set(
      `c4-components:${this.hashCode(projectPath)}`,
      result.components,
      { namespace: 'code-intelligence', ttl: 3600000 }
    );

    await this.memory.set(
      `c4-external-systems:${this.hashCode(projectPath)}`,
      result.externalSystems,
      { namespace: 'code-intelligence', ttl: 3600000 }
    );
  }

  // ============================================================================
  // V3 Integration: MetricCollector for Real Code Metrics (Phase 5)
  // ============================================================================

  /**
   * Collect real project metrics using actual tooling
   *
   * Uses MetricCollector service which runs:
   * - cloc/tokei for accurate LOC counting
   * - vitest/jest/cargo/pytest/go for test counting
   * - Pattern analysis for code quality indicators
   *
   * This replaces estimates with ACTUAL counts from real tooling.
   *
   * @param projectPath - Path to the project root
   * @returns ProjectMetrics with LOC, test counts, and patterns
   */
  async collectProjectMetrics(
    projectPath: string
  ): Promise<Result<ProjectMetrics, Error>> {
    if (!this.config.enableMetricCollector || !this.metricCollector) {
      return err(new Error('MetricCollector is not enabled'));
    }

    try {
      console.log(`[CodeIntelligence] Collecting real metrics for ${projectPath}`);

      // Collect all metrics using actual tooling
      const metrics = await this.metricCollector.collectAll(projectPath);

      console.log(
        `[CodeIntelligence] Real metrics collected: ` +
          `${metrics.loc.total} LOC, ${metrics.tests.total} tests, ` +
          `tools: ${metrics.toolsUsed.join(', ') || 'fallback'}`
      );

      // Store metrics in memory for cross-domain access
      await this.storeProjectMetricsInMemory(projectPath, metrics);

      // Publish event
      if (this.config.publishEvents) {
        const event = createEvent(
          'code-intelligence.MetricsCollected',
          'code-intelligence',
          {
            projectPath,
            loc: metrics.loc.total,
            tests: metrics.tests.total,
            toolsUsed: metrics.toolsUsed,
          }
        );
        await this.eventBus.publish(event);
      }

      return { success: true, value: metrics };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[CodeIntelligence] Failed to collect metrics:', errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Store project metrics in memory for cross-domain access
   */
  private async storeProjectMetricsInMemory(
    projectPath: string,
    metrics: ProjectMetrics
  ): Promise<void> {
    const key = `project-metrics:latest:${this.hashCode(projectPath)}`;

    await this.memory.set(key, metrics, {
      namespace: 'code-intelligence',
      persist: true,
      ttl: 300000, // 5 minutes (metrics can change frequently)
    });

    // Store LOC and test counts separately for quick access
    await this.memory.set(
      `loc-metrics:${this.hashCode(projectPath)}`,
      metrics.loc,
      { namespace: 'code-intelligence', ttl: 300000 }
    );

    await this.memory.set(
      `test-metrics:${this.hashCode(projectPath)}`,
      metrics.tests,
      { namespace: 'code-intelligence', ttl: 300000 }
    );
  }

  /**
   * Get the MetricCollector service for direct access
   */
  getMetricCollector(): IMetricCollectorService | undefined {
    return this.metricCollector;
  }

  /**
   * Determine project root from indexed paths
   */
  private getProjectRootFromPaths(paths: string[]): string | null {
    if (paths.length === 0) return null;

    // Get the first path and find the project root
    const firstPath = paths[0];

    // Walk up the path to find package.json, Cargo.toml, go.mod, etc.
    const parts = firstPath.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      // Check for common project markers
      const markers = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.git'];
      for (const marker of markers) {
        try {
          const markerPath = `${currentPath}/${marker}`;
          // Use synchronous check (since we're in async context anyway)
          const fs = require('fs');
          if (fs.existsSync(markerPath)) {
            return currentPath;
          }
        } catch {
          // Continue checking
        }
      }
    }

    // If no marker found, return the parent directory of the first path
    const lastSlash = firstPath.lastIndexOf('/');
    return lastSlash > 0 ? firstPath.substring(0, lastSlash) : firstPath;
  }

  // ============================================================================
  // V3: Hypergraph Integration for Intelligent Code Analysis (GOAP Action 7)
  // ============================================================================

  /**
   * Check if hypergraph is enabled and initialized
   */
  isHypergraphEnabled(): boolean {
    return this.config.enableHypergraph && this.hypergraph !== undefined;
  }

  /**
   * Find untested functions using hypergraph analysis
   *
   * Uses the HypergraphEngine to find functions that have no test coverage
   * based on the 'covers' edge type in the code knowledge graph.
   *
   * @returns Array of HypergraphNode representing untested functions
   */
  async findUntestedFunctions(): Promise<Result<HypergraphNode[], Error>> {
    if (!this.hypergraph) {
      return err(new Error('Hypergraph is not enabled or not initialized'));
    }

    try {
      const untestedFunctions = await this.hypergraph.findUntestedFunctions();

      console.log(
        `[CodeIntelligence] Found ${untestedFunctions.length} untested functions via hypergraph`
      );

      // Publish event
      if (this.config.publishEvents) {
        const event = createEvent(
          'code-intelligence.UntestedFunctionsFound',
          'code-intelligence',
          {
            count: untestedFunctions.length,
            functions: untestedFunctions.slice(0, 10).map((f) => ({
              name: f.name,
              file: f.filePath,
              complexity: f.complexity,
            })),
          }
        );
        await this.eventBus.publish(event);
      }

      return { success: true, value: untestedFunctions };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[CodeIntelligence] Failed to find untested functions:', errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Find impacted tests using hypergraph traversal
   *
   * Uses the HypergraphEngine to find tests that cover functions in the changed files.
   * This enables intelligent test selection based on code relationships.
   *
   * @param changedFiles - Array of file paths that have changed
   * @returns Array of HypergraphNode representing impacted tests
   */
  async findImpactedTestsFromHypergraph(
    changedFiles: string[]
  ): Promise<Result<HypergraphNode[], Error>> {
    if (!this.hypergraph) {
      return err(new Error('Hypergraph is not enabled or not initialized'));
    }

    if (changedFiles.length === 0) {
      return { success: true, value: [] };
    }

    try {
      const impactedTests = await this.hypergraph.findImpactedTests(changedFiles);

      console.log(
        `[CodeIntelligence] Found ${impactedTests.length} impacted tests for ` +
          `${changedFiles.length} changed files via hypergraph`
      );

      // Publish event
      if (this.config.publishEvents) {
        const event = createEvent(
          'code-intelligence.ImpactedTestsFound',
          'code-intelligence',
          {
            changedFiles,
            testCount: impactedTests.length,
            tests: impactedTests.slice(0, 10).map((t) => ({
              name: t.name,
              file: t.filePath,
            })),
          }
        );
        await this.eventBus.publish(event);
      }

      return { success: true, value: impactedTests };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[CodeIntelligence] Failed to find impacted tests:', errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Find coverage gaps using hypergraph analysis
   *
   * Uses the HypergraphEngine to find functions with low test coverage.
   * This helps identify areas that need more testing.
   *
   * @param maxCoverage - Maximum coverage percentage to consider as a gap (default: 50)
   * @returns Array of HypergraphNode representing functions with coverage gaps
   */
  async findCoverageGapsFromHypergraph(
    maxCoverage: number = 50
  ): Promise<Result<HypergraphNode[], Error>> {
    if (!this.hypergraph) {
      return err(new Error('Hypergraph is not enabled or not initialized'));
    }

    try {
      const coverageGaps = await this.hypergraph.findCoverageGaps(maxCoverage);

      console.log(
        `[CodeIntelligence] Found ${coverageGaps.length} coverage gaps ` +
          `(functions with <=${maxCoverage}% coverage) via hypergraph`
      );

      // Publish event
      if (this.config.publishEvents) {
        const event = createEvent(
          'code-intelligence.CoverageGapsFound',
          'code-intelligence',
          {
            maxCoverage,
            gapCount: coverageGaps.length,
            gaps: coverageGaps.slice(0, 10).map((g) => ({
              name: g.name,
              file: g.filePath,
              coverage: g.coverage,
              complexity: g.complexity,
            })),
          }
        );
        await this.eventBus.publish(event);
      }

      return { success: true, value: coverageGaps };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[CodeIntelligence] Failed to find coverage gaps:', errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Build hypergraph from code index result
   *
   * Populates the hypergraph with code entities and relationships from
   * the code indexing result. This creates nodes for files, functions,
   * classes, and modules, along with edges for imports and dependencies.
   *
   * @param indexResult - Code index result containing files and entities
   * @returns Build result with counts of nodes and edges created
   */
  async buildHypergraphFromIndex(
    indexResult: CodeIndexResult
  ): Promise<Result<HypergraphBuildResult, Error>> {
    if (!this.hypergraph) {
      return err(new Error('Hypergraph is not enabled or not initialized'));
    }

    try {
      console.log(
        `[CodeIntelligence] Building hypergraph from ${indexResult.files.length} indexed files`
      );

      const buildResult = await this.hypergraph.buildFromIndexResult(indexResult);

      console.log(
        `[CodeIntelligence] Hypergraph built: ` +
          `${buildResult.nodesCreated} nodes created, ` +
          `${buildResult.nodesUpdated} nodes updated, ` +
          `${buildResult.edgesCreated} edges created ` +
          `(${buildResult.durationMs}ms)`
      );

      // Store build result in memory
      await this.memory.set(
        `hypergraph:build:latest`,
        {
          timestamp: new Date().toISOString(),
          ...buildResult,
        },
        { namespace: 'code-intelligence', persist: true }
      );

      // Publish event
      if (this.config.publishEvents) {
        const event = createEvent(
          'code-intelligence.HypergraphBuilt',
          'code-intelligence',
          {
            nodesCreated: buildResult.nodesCreated,
            nodesUpdated: buildResult.nodesUpdated,
            edgesCreated: buildResult.edgesCreated,
            durationMs: buildResult.durationMs,
            errorCount: buildResult.errors.length,
          }
        );
        await this.eventBus.publish(event);
      }

      return { success: true, value: buildResult };
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.error('[CodeIntelligence] Failed to build hypergraph:', errorObj.message);
      return err(errorObj);
    }
  }

  /**
   * Get the Hypergraph Engine for direct access (advanced usage)
   */
  getHypergraph(): HypergraphEngine | undefined {
    return this.hypergraph;
  }

  /**
   * Enhanced impact analysis using hypergraph when available
   *
   * This extends the base analyzeImpact method by merging hypergraph-based
   * test discovery with the existing impact analysis.
   */
  private async enhanceImpactWithHypergraph(
    request: ImpactRequest,
    baseAnalysis: ImpactAnalysis
  ): Promise<ImpactAnalysis> {
    if (!this.hypergraph) {
      return baseAnalysis;
    }

    try {
      // Find additional impacted tests using hypergraph
      const hypergraphTests = await this.hypergraph.findImpactedTests(request.changedFiles);

      // Merge with existing impacted tests (deduplicate)
      const allTests = new Set([
        ...baseAnalysis.impactedTests,
        ...hypergraphTests.map((t) => t.filePath || t.name),
      ]);

      // Update risk level if hypergraph found more impacted tests
      let newRiskLevel = baseAnalysis.riskLevel;
      if (hypergraphTests.length > baseAnalysis.impactedTests.length) {
        // Hypergraph found additional tests - might indicate higher risk
        const totalImpact =
          baseAnalysis.directImpact.length + baseAnalysis.transitiveImpact.length;
        if (totalImpact > 10 && allTests.size > 20) {
          newRiskLevel = 'critical';
        } else if (totalImpact > 5 && allTests.size > 10) {
          newRiskLevel = 'high';
        }
      }

      // Add recommendation about hypergraph-discovered tests
      const newRecommendations = [...baseAnalysis.recommendations];
      if (hypergraphTests.length > 0) {
        newRecommendations.push(
          `Hypergraph analysis found ${hypergraphTests.length} additional test(s) to run`
        );
      }

      return {
        ...baseAnalysis,
        impactedTests: Array.from(allTests),
        riskLevel: newRiskLevel,
        recommendations: newRecommendations,
      };
    } catch (error) {
      console.error('[CodeIntelligence] Failed to enhance impact with hypergraph:', error);
      return baseAnalysis;
    }
  }

  // ============================================================================
  // MinCut Integration Methods (ADR-047)
  // ============================================================================

  /**
   * Set the MinCut bridge for topology awareness
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.minCutMixin.setMinCutBridge(bridge);
    console.log(`[${this.domainName}] MinCut bridge connected for topology awareness`);
  }

  /**
   * Check if topology is healthy
   */
  isTopologyHealthy(): boolean {
    return this.minCutMixin.isTopologyHealthy();
  }

  // ============================================================================
  // Consensus Integration Methods (MM-001)
  // ============================================================================

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean {
    return (this.consensusMixin as any).isConsensusAvailable?.() ?? false;
  }

  /**
   * Get consensus statistics
   * Per MM-001: Returns metrics about consensus verification
   */
  getConsensusStats() {
    return this.consensusMixin.getConsensusStats();
  }

  /**
   * Verify a code pattern detection using multi-model consensus
   * Per MM-001: High-stakes code intelligence decisions require verification
   *
   * @param pattern - The code pattern to verify
   * @param confidence - Initial confidence in the pattern detection
   * @returns true if the pattern is verified or doesn't require consensus
   */
  async verifyCodePatternDetection(
    pattern: { id: string; name: string; type: string; location: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof pattern> = createDomainFinding({
      id: uuidv4(),
      type: 'code-pattern-detection',
      confidence,
      description: `Verify code pattern: ${pattern.name} (${pattern.type}) at ${pattern.location}`,
      payload: pattern,
      detectedBy: 'code-intelligence-coordinator',
      severity: confidence > 0.9 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Code pattern '${pattern.name}' verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Code pattern '${pattern.name}' NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify an impact analysis using multi-model consensus
   * Per MM-001: Impact analysis decisions can have significant deployment impact
   *
   * @param impact - The impact analysis to verify
   * @param confidence - Initial confidence in the analysis
   * @returns true if the analysis is verified or doesn't require consensus
   */
  async verifyImpactAnalysis(
    impact: { changedFiles: string[]; riskLevel: string; impactedTests: string[] },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof impact> = createDomainFinding({
      id: uuidv4(),
      type: 'impact-analysis',
      confidence,
      description: `Verify impact analysis: ${impact.changedFiles.length} files, risk=${impact.riskLevel}, ${impact.impactedTests.length} tests`,
      payload: impact,
      detectedBy: 'code-intelligence-coordinator',
      severity: impact.riskLevel === 'critical' || impact.riskLevel === 'high' ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Impact analysis verified by consensus (risk=${impact.riskLevel})`);
        return true;
      }
      console.warn(`[${this.domainName}] Impact analysis NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify a dependency mapping using multi-model consensus
   * Per MM-001: Dependency analysis can affect downstream decisions
   *
   * @param dependency - The dependency mapping to verify
   * @param confidence - Initial confidence in the mapping
   * @returns true if the mapping is verified or doesn't require consensus
   */
  async verifyDependencyMapping(
    dependency: { source: string; targets: string[]; type: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof dependency> = createDomainFinding({
      id: uuidv4(),
      type: 'dependency-mapping',
      confidence,
      description: `Verify dependency: ${dependency.source} -> ${dependency.targets.length} targets (${dependency.type})`,
      payload: dependency,
      detectedBy: 'code-intelligence-coordinator',
      severity: confidence > 0.85 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Dependency mapping verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Dependency mapping NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  // ============================================================================
  // Topology Routing Methods (ADR-047)
  // ============================================================================

  /**
   * Get weak vertices belonging to this domain
   * Per ADR-047: Identifies agents that are single points of failure
   */
  getDomainWeakVertices() {
    return this.minCutMixin.getDomainWeakVertices();
  }

  /**
   * Check if this domain is a weak point in the topology
   * Per ADR-047: Returns true if any weak vertex belongs to code-intelligence domain
   */
  isDomainWeakPoint(): boolean {
    return this.minCutMixin.isDomainWeakPoint();
  }

  /**
   * Get topology-based routing excluding weak domains
   * Per ADR-047: Filters out domains that are currently weak points
   *
   * @param targetDomains - List of potential target domains
   * @returns Filtered list of healthy domains for routing
   */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    return this.minCutMixin.getTopologyBasedRouting(targetDomains);
  }
}
