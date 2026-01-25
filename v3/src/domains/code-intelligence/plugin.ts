/**
 * Agentic QE v3 - Code Intelligence Domain Plugin
 * Integrates the code intelligence domain into the kernel
 */

import { DomainName, DomainEvent, Result } from '../../shared/types';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { BaseDomainPlugin } from '../domain-interface';
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
  CodeIntelligenceCoordinator,
  ICodeIntelligenceCoordinator,
  CoordinatorConfig,
} from './coordinator';
import {
  KnowledgeGraphService,
  IKnowledgeGraphService,
  KnowledgeGraphConfig,
} from './services/knowledge-graph';
import {
  SemanticAnalyzerService,
  ISemanticAnalyzerService,
  SemanticAnalyzerConfig,
} from './services/semantic-analyzer';
import {
  ImpactAnalyzerService,
  IImpactAnalyzerService,
  ImpactAnalyzerConfig,
} from './services/impact-analyzer';

/**
 * Plugin configuration options
 */
export interface CodeIntelligencePluginConfig {
  coordinator?: Partial<CoordinatorConfig>;
  knowledgeGraph?: Partial<KnowledgeGraphConfig>;
  semanticAnalyzer?: Partial<SemanticAnalyzerConfig>;
  impactAnalyzer?: Partial<ImpactAnalyzerConfig>;
}

/**
 * Extended API with internal access
 */
export interface CodeIntelligenceExtendedAPI extends CodeIntelligenceAPI {
  /** Get the internal coordinator */
  getCoordinator(): ICodeIntelligenceCoordinator;

  /** Get the knowledge graph service */
  getKnowledgeGraph(): IKnowledgeGraphService;

  /** Get the semantic analyzer service */
  getSemanticAnalyzer(): ISemanticAnalyzerService;

  /** Get the impact analyzer service */
  getImpactAnalyzer(): IImpactAnalyzerService;
}

/**
 * Code Intelligence Domain Plugin
 * Provides knowledge graph, semantic search, and impact analysis capabilities
 */
export class CodeIntelligencePlugin extends BaseDomainPlugin {
  private coordinator: ICodeIntelligenceCoordinator | null = null;
  private knowledgeGraph: IKnowledgeGraphService | null = null;
  private semanticAnalyzer: ISemanticAnalyzerService | null = null;
  private impactAnalyzer: IImpactAnalyzerService | null = null;
  private readonly pluginConfig: CodeIntelligencePluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: CodeIntelligencePluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ============================================================================
  // DomainPlugin Interface Implementation
  // ============================================================================

  get name(): DomainName {
    return 'code-intelligence';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Code intelligence can work standalone but benefits from test-generation
    return [];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    const api: CodeIntelligenceExtendedAPI = {
      // Public API methods
      index: this.index.bind(this),
      search: this.search.bind(this),
      analyzeImpact: this.analyzeImpact.bind(this),
      mapDependencies: this.mapDependencies.bind(this),
      queryKG: this.queryKG.bind(this),

      // Internal access methods
      getCoordinator: () => this.coordinator!,
      getKnowledgeGraph: () => this.knowledgeGraph!,
      getSemanticAnalyzer: () => this.semanticAnalyzer!,
      getImpactAnalyzer: () => this.impactAnalyzer!,
    };

    return api as T;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    // Create services
    this.knowledgeGraph = new KnowledgeGraphService(
      this.memory,
      this.pluginConfig.knowledgeGraph
    );

    this.semanticAnalyzer = new SemanticAnalyzerService(
      this.memory,
      this.pluginConfig.semanticAnalyzer
    );

    this.impactAnalyzer = new ImpactAnalyzerService(
      this.memory,
      this.knowledgeGraph,
      this.pluginConfig.impactAnalyzer
    );

    // Create coordinator
    this.coordinator = new CodeIntelligenceCoordinator(
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
    this.knowledgeGraph = null;
    this.semanticAnalyzer = null;
    this.impactAnalyzer = null;
  }

  protected subscribeToEvents(): void {
    // Subscribe to test generation events for impact correlation
    this.eventBus.subscribe(
      'test-generation.TestGenerated',
      this.handleTestGenerated.bind(this)
    );

    // Subscribe to coverage events for risk assessment
    this.eventBus.subscribe(
      'coverage-analysis.CoverageGapDetected',
      this.handleCoverageGap.bind(this)
    );

    // Subscribe to defect intelligence events
    this.eventBus.subscribe(
      'defect-intelligence.DefectPredicted',
      this.handleDefectPredicted.bind(this)
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
      case 'coverage-analysis.CoverageGapDetected':
        await this.handleCoverageGap(event);
        break;
      case 'defect-intelligence.DefectPredicted':
        await this.handleDefectPredicted(event);
        break;
      default:
        // No specific handling needed
        break;
    }
  }

  // ============================================================================
  // API Implementation
  // ============================================================================

  private async index(request: IndexRequest): Promise<Result<IndexResult, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.index(request);

      if (result.success) {
        this.trackSuccessfulOperation('index', result.value);
      } else {
        this.trackFailedOperation('index', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async search(request: SearchRequest): Promise<Result<SearchResults, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.search(request);

      if (result.success) {
        this.trackSuccessfulOperation('search', result.value);
      } else {
        this.trackFailedOperation('search', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async analyzeImpact(
    request: ImpactRequest
  ): Promise<Result<ImpactAnalysis, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.analyzeImpact(request);

      if (result.success) {
        this.trackSuccessfulOperation('impact', result.value);
      } else {
        this.trackFailedOperation('impact', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async mapDependencies(
    request: DependencyRequest
  ): Promise<Result<DependencyMap, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.mapDependencies(request);

      if (result.success) {
        this.trackSuccessfulOperation('dependency', result.value);
      } else {
        this.trackFailedOperation('dependency', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async queryKG(request: KGQueryRequest): Promise<Result<KGQueryResult, Error>> {
    this.ensureInitialized();

    try {
      const result = await this.coordinator!.queryKG(request);

      if (result.success) {
        this.trackSuccessfulOperation('query', result.value);
      } else {
        this.trackFailedOperation('query', result.error);
      }

      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleTestGenerated(event: DomainEvent): Promise<void> {
    // When a test is generated, update knowledge graph with test-source mapping
    const payload = event.payload as {
      testId: string;
      testFile: string;
      sourceFile: string;
    };

    // Store test mapping for impact analysis
    await this.memory.set(
      `code-intelligence:test-mapping:${payload.testId}`,
      {
        testFile: payload.testFile,
        sourceFile: payload.sourceFile,
        generatedAt: new Date().toISOString(),
      },
      { namespace: 'code-intelligence', ttl: 86400 * 30 } // 30 days
    );
  }

  private async handleCoverageGap(event: DomainEvent): Promise<void> {
    // Coverage gap detected - update risk scores in knowledge graph
    const payload = event.payload as {
      gapId: string;
      file: string;
      uncoveredLines: number[];
      riskScore: number;
    };

    // Store coverage gap info for impact analysis
    await this.memory.set(
      `code-intelligence:coverage-gap:${payload.gapId}`,
      payload,
      { namespace: 'code-intelligence', ttl: 86400 * 7 } // 7 days
    );
  }

  private async handleDefectPredicted(event: DomainEvent): Promise<void> {
    // Defect predicted - correlate with knowledge graph
    const payload = event.payload as {
      predictionId: string;
      file: string;
      probability: number;
    };

    // Store defect prediction for impact analysis enhancement
    await this.memory.set(
      `code-intelligence:defect-prediction:${payload.predictionId}`,
      payload,
      { namespace: 'code-intelligence', ttl: 86400 * 7 } // 7 days
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('CodeIntelligencePlugin is not initialized');
    }

    if (
      !this.coordinator ||
      !this.knowledgeGraph ||
      !this.semanticAnalyzer ||
      !this.impactAnalyzer
    ) {
      throw new Error('CodeIntelligencePlugin services are not available');
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

  private trackSuccessfulOperation(_operation: string, _result: unknown): void {
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
 * Factory function to create a CodeIntelligencePlugin
 */
export function createCodeIntelligencePlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: CodeIntelligencePluginConfig
): CodeIntelligencePlugin {
  return new CodeIntelligencePlugin(eventBus, memory, agentCoordinator, config);
}
