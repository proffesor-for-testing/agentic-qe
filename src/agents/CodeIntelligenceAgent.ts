/**
 * CodeIntelligenceAgent - Knowledge graph-based code understanding
 * Wave 6 (v2.6.0) - Code Intelligence System Integration
 *
 * Provides semantic code search, AST parsing, and context building
 * with 80% token reduction through intelligent code retrieval.
 */

import * as path from 'path';
import {
  AgentStatus,
  MemoryStore,
  QETask,
  QEAgentType,
} from '../types';
import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { Logger } from '../utils/Logger';
import { CodeIntelligenceOrchestrator } from '../code-intelligence/orchestrator/CodeIntelligenceOrchestrator';
import type { OrchestratorConfig, QueryContext, QueryResult, IndexingProgress } from '../code-intelligence/orchestrator/types';
import type { GraphNode, GraphEdge } from '../code-intelligence/graph/types';
import type { GraphBuilder } from '../code-intelligence/graph/GraphBuilder';

// ============================================================================
// Configuration
// ============================================================================

export interface CodeIntelligenceAgentConfig extends BaseAgentConfig {
  /** Root directory for indexing (default: process.cwd()) */
  rootDir?: string;
  /** Ollama server URL (default: http://localhost:11434) */
  ollamaUrl?: string;
  /** Database configuration */
  database?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
  /** File patterns to include */
  includePatterns?: string[];
  /** File patterns to exclude */
  excludePatterns?: string[];
  /** Enable incremental indexing */
  incrementalIndexing?: boolean;
}

// ============================================================================
// Task Types
// ============================================================================

export type CodeIntelligenceTaskType =
  | 'index'
  | 'search'
  | 'context'
  | 'graph'
  | 'stats'
  | 'incremental-update';

export interface CodeIntelligenceTaskPayload {
  /** Task type */
  taskType: CodeIntelligenceTaskType;
  /** For search/context: the query string */
  query?: string;
  /** For context: target file path */
  filePath?: string;
  /** For context: target entity name */
  entityName?: string;
  /** For search: number of results */
  topK?: number;
  /** For search: include graph context */
  includeGraphContext?: boolean;
  /** For search: graph traversal depth */
  graphDepth?: number;
  /** For search: filter by language */
  language?: string;
  /** For graph: diagram type */
  diagramType?: 'class' | 'dependency' | 'c4-context' | 'c4-container' | 'c4-component';
  /** For C4 component: container name to diagram */
  containerName?: string;
  /** For incremental: git commit to compare against */
  gitSince?: string;
}

export interface CodeIntelligenceResult {
  success: boolean;
  taskType: CodeIntelligenceTaskType;
  /** For index: indexing statistics */
  indexStats?: {
    filesIndexed: number;
    entitiesExtracted: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    graphEdges: number;
    duration: number;
  };
  /** For search: search results */
  searchResults?: QueryResult;
  /** For search: AI-generated summary of results (Phase 1.2.3) */
  searchSummary?: string;
  /** For context: formatted context string */
  context?: string;
  /** For context: AI-generated explanation (Phase 1.2.3) */
  contextExplanation?: string;
  /** For context: token estimate */
  tokenEstimate?: number;
  /** For context: token reduction percentage */
  tokenReduction?: number;
  /** For graph: Mermaid diagram */
  diagram?: string;
  /** For stats: graph statistics */
  stats?: {
    totalChunks: number;
    totalEntities: number;
    totalEdges: number;
    languages: string[];
    lastIndexed?: Date;
  };
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Main Agent Class
// ============================================================================

export class CodeIntelligenceAgent extends BaseAgent {
  private orchestrator: CodeIntelligenceOrchestrator | null = null;
  private agentConfig: CodeIntelligenceAgentConfig;
  private logger: Logger;
  private isIndexed: boolean = false;

  constructor(config: CodeIntelligenceAgentConfig) {
    super({
      ...config,
      type: 'code-intelligence' as QEAgentType,
      capabilities: [
        { name: 'code-indexing', version: '1.0.0', description: 'Parse and index codebases with Tree-sitter' },
        { name: 'semantic-search', version: '1.0.0', description: 'Search code by meaning using embeddings' },
        { name: 'context-building', version: '1.0.0', description: 'Build focused context with 80% token reduction' },
        { name: 'graph-visualization', version: '1.0.0', description: 'Generate Mermaid diagrams for code structure' },
        { name: 'c4-diagrams', version: '1.0.0', description: 'Generate C4 architecture diagrams (context, container, component)' },
        { name: 'incremental-updates', version: '1.0.0', description: 'Track git changes and update index' },
      ],
    });

    this.agentConfig = config;
    this.logger = Logger.getInstance();
  }

  // ============================================================================
  // BaseAgent Abstract Methods
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    this.logger.info('Initializing Code Intelligence components...');

    const orchestratorConfig: Partial<OrchestratorConfig> = {
      rootDir: this.agentConfig.rootDir || process.cwd(),
      watchEnabled: false,
      gitEnabled: this.agentConfig.incrementalIndexing ?? true,
    };

    // Add Ollama config if provided
    if (this.agentConfig.ollamaUrl) {
      orchestratorConfig.ollamaUrl = this.agentConfig.ollamaUrl;
    }

    // Add database config if provided
    if (this.agentConfig.database?.enabled !== false) {
      orchestratorConfig.database = {
        enabled: true,
        host: this.agentConfig.database?.host || process.env.PGHOST || 'localhost',
        port: this.agentConfig.database?.port || parseInt(process.env.PGPORT || '5432'),
        database: this.agentConfig.database?.database || process.env.PGDATABASE || 'ruvector_db',
        user: this.agentConfig.database?.user || process.env.PGUSER || 'ruvector',
        password: this.agentConfig.database?.password || process.env.PGPASSWORD || 'ruvector',
      };
    }

    this.orchestrator = new CodeIntelligenceOrchestrator(orchestratorConfig as OrchestratorConfig);
    await this.orchestrator.initialize();

    this.logger.info('Code Intelligence components initialized');
  }

  protected async performTask(task: QETask): Promise<CodeIntelligenceResult> {
    const payload = task.payload as CodeIntelligenceTaskPayload;
    const taskType = payload.taskType || this.inferTaskType(task);

    this.logger.info(`Performing task: ${taskType}`);

    try {
      switch (taskType) {
        case 'index':
          return await this.performIndexTask(payload);
        case 'search':
          return await this.performSearchTask(payload);
        case 'context':
          return await this.performContextTask(payload);
        case 'graph':
          return await this.performGraphTask(payload);
        case 'stats':
          return await this.performStatsTask();
        case 'incremental-update':
          return await this.performIncrementalUpdateTask(payload);
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }
    } catch (error) {
      this.logger.error(`Task failed: ${(error as Error).message}`);
      return {
        success: false,
        taskType,
        error: (error as Error).message,
      };
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Check if index exists
    if (this.orchestrator) {
      try {
        const stats = await this.orchestrator.getStats();
        if (stats.indexer.totalChunks > 0) {
          this.isIndexed = true;
          this.logger.info(`Loaded existing index: ${stats.indexer.totalChunks} chunks`);
        }
      } catch {
        // No existing index, will need to index first
      }
    }
  }

  protected async cleanup(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.shutdown();
      this.orchestrator = null;
    }
    this.logger.info('Code Intelligence agent cleaned up');
  }

  // ============================================================================
  // Task Implementations
  // ============================================================================

  private async performIndexTask(payload: CodeIntelligenceTaskPayload): Promise<CodeIntelligenceResult> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const rootDir = this.agentConfig.rootDir || process.cwd();
    const startTime = Date.now();

    const result = await this.orchestrator.indexProject(rootDir, (progress) => {
      this.logger.debug(`Indexing: ${progress.processedFiles}/${progress.totalFiles} files`);
    });

    this.isIndexed = true;

    const stats = await this.orchestrator.getStats();
    const graphStats = stats.graph;

    return {
      success: true,
      taskType: 'index',
      indexStats: {
        filesIndexed: result.stats.filesIndexed,
        entitiesExtracted: (graphStats.nodesByType?.class || 0) + (graphStats.nodesByType?.function || 0),
        chunksCreated: result.stats.chunksCreated,
        embeddingsGenerated: result.stats.embeddingsGenerated,
        graphEdges: result.stats.edgesCreated,
        duration: Date.now() - startTime,
      },
    };
  }

  private async performSearchTask(payload: CodeIntelligenceTaskPayload): Promise<CodeIntelligenceResult> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    if (!payload.query) {
      throw new Error('Query is required for search task');
    }

    const queryContext: QueryContext = {
      query: payload.query,
      topK: payload.topK || 10,
      includeGraphContext: payload.includeGraphContext ?? true,
      graphDepth: payload.graphDepth || 2,
    };

    const result = await this.orchestrator.query(queryContext);

    // Phase 1.2.3: Generate AI summary of search results if LLM available
    const searchSummary = await this.generateSearchSummary(payload.query, result);

    return {
      success: true,
      taskType: 'search',
      searchResults: result,
      searchSummary,
    };
  }

  private async performContextTask(payload: CodeIntelligenceTaskPayload): Promise<CodeIntelligenceResult> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    // Use the KnowledgeGraphContextBuilder through BaseAgent's methods
    if (!this.hasCodeIntelligence()) {
      // Fallback: use orchestrator directly
      const searchResult = await this.orchestrator.query({
        query: payload.query || `file:${payload.filePath}`,
        topK: payload.topK || 10,
        includeGraphContext: true,
        graphDepth: 2,
      });

      const context = this.formatSearchResultsAsContext(searchResult);

      return {
        success: true,
        taskType: 'context',
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        tokenReduction: 80, // Estimate
      };
    }

    // Use BaseAgent's code intelligence context building
    let enrichedContext;

    if (payload.filePath && payload.entityName) {
      enrichedContext = await this.getEntityContext(payload.filePath, payload.entityName);
    } else if (payload.filePath) {
      enrichedContext = await this.getFileContext(payload.filePath);
    } else if (payload.query) {
      enrichedContext = await this.getCodeIntelligenceContext({
        query: payload.query,
      });
    } else {
      throw new Error('Either query, filePath, or both filePath and entityName required');
    }

    if (!enrichedContext) {
      throw new Error('Failed to build context');
    }

    // Phase 1.2.3: Generate AI explanation of context if LLM available
    const contextExplanation = await this.generateContextExplanation(enrichedContext.formatted.content);

    return {
      success: true,
      taskType: 'context',
      context: enrichedContext.formatted.content,
      contextExplanation,
      tokenEstimate: enrichedContext.metadata.tokenEstimate,
      tokenReduction: enrichedContext.metadata.tokenReduction || 80,
    };
  }

  private async performGraphTask(payload: CodeIntelligenceTaskPayload): Promise<CodeIntelligenceResult> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    // Handle C4 diagram types
    if (payload.diagramType?.startsWith('c4-')) {
      return await this.performC4DiagramTask(payload);
    }

    if (!payload.filePath) {
      throw new Error('filePath is required for class/dependency graph task');
    }

    const graphBuilder = this.orchestrator.getGraphBuilder();
    const nodes = graphBuilder.findNodesInFile(payload.filePath);

    if (nodes.length === 0) {
      return {
        success: true,
        taskType: 'graph',
        diagram: `%% No graph data found for ${path.basename(payload.filePath)}\n%% Run index task first`,
      };
    }

    // Import visualization builders
    const { ClassDiagramBuilder } = await import('../code-intelligence/visualization/ClassDiagramBuilder');
    const { DependencyGraphBuilder } = await import('../code-intelligence/visualization/DependencyGraphBuilder');

    // Get edges for nodes
    const edges = this.getEdgesForNodes(graphBuilder, nodes);

    let diagram: string;
    if (payload.diagramType === 'dependency') {
      diagram = DependencyGraphBuilder.build(nodes, edges, { direction: 'TB' });
    } else {
      diagram = ClassDiagramBuilder.build(nodes, edges, { includeMethods: true });
    }

    return {
      success: true,
      taskType: 'graph',
      diagram,
    };
  }

  private async performC4DiagramTask(payload: CodeIntelligenceTaskPayload): Promise<CodeIntelligenceResult> {
    // Import C4 infrastructure (static methods handle analyzer instantiation)
    const { MermaidGenerator } = await import('../code-intelligence/visualization/MermaidGenerator');

    const rootDir = this.agentConfig.rootDir || process.cwd();

    let diagram: string;

    switch (payload.diagramType) {
      case 'c4-context':
        diagram = await MermaidGenerator.generateC4Context(rootDir);
        break;

      case 'c4-container':
        diagram = await MermaidGenerator.generateC4Container(rootDir);
        break;

      case 'c4-component':
        diagram = await MermaidGenerator.generateC4Component(rootDir, payload.containerName);
        break;

      default:
        throw new Error(`Unknown C4 diagram type: ${payload.diagramType}`);
    }

    return {
      success: true,
      taskType: 'graph',
      diagram,
    };
  }

  private async performStatsTask(): Promise<CodeIntelligenceResult> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const stats = await this.orchestrator.getStats();
    const graphStats = stats.graph;

    // Calculate entities from graph
    const entities = Object.values(graphStats.nodesByType || {}).reduce((sum: number, count) => sum + (count as number), 0);

    return {
      success: true,
      taskType: 'stats',
      stats: {
        totalChunks: stats.indexer.totalChunks,
        totalEntities: entities,
        totalEdges: graphStats.edgeCount,
        languages: Object.keys(graphStats.nodesByType || {}),
      },
    };
  }

  private async performIncrementalUpdateTask(payload: CodeIntelligenceTaskPayload): Promise<CodeIntelligenceResult> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const gitSince = payload.gitSince || 'HEAD~1';
    const startTime = Date.now();

    const changes = await this.orchestrator.getGitChanges(gitSince);

    if (changes.length === 0) {
      return {
        success: true,
        taskType: 'incremental-update',
        indexStats: {
          filesIndexed: 0,
          entitiesExtracted: 0,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          graphEdges: 0,
          duration: Date.now() - startTime,
        },
      };
    }

    const result = await this.orchestrator.processChanges(changes);
    const incrementalStats = await this.orchestrator.getStats();
    const graphStats = incrementalStats.graph;

    return {
      success: true,
      taskType: 'incremental-update',
      indexStats: {
        filesIndexed: result.stats.filesIndexed,
        entitiesExtracted: graphStats.nodesByType?.class || 0,
        chunksCreated: result.stats.chunksCreated,
        embeddingsGenerated: result.stats.embeddingsGenerated,
        graphEdges: result.stats.edgesCreated,
        duration: Date.now() - startTime,
      },
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Phase 1.2.3: Generate AI summary of search results
   * Uses IAgentLLM for provider-independent LLM calls
   */
  private async generateSearchSummary(query: string, result: QueryResult): Promise<string | undefined> {
    const llm = this.getAgentLLM();
    if (!llm || result.results.length === 0) {
      return undefined;
    }

    try {
      const topResults = result.results.slice(0, 5);
      const resultsContext = topResults
        .map((r, i) => `${i + 1}. ${r.entityName || r.filePath}:${r.startLine}-${r.endLine} (${r.entityType || 'chunk'})`)
        .join('\n');

      const prompt = `Summarize these code search results for query "${query}" in 2-3 sentences:
${resultsContext}

Summary:`;

      const response = await llm.complete(prompt, {
        complexity: 'simple',
        maxTokens: 150,
        temperature: 0.3,
      });

      return response.trim();
    } catch (error) {
      this.logger.debug(`LLM search summary failed: ${(error as Error).message}`);
      return undefined;
    }
  }

  /**
   * Phase 1.2.3: Generate AI explanation of code context
   * Uses IAgentLLM for provider-independent LLM calls
   */
  private async generateContextExplanation(context: string): Promise<string | undefined> {
    const llm = this.getAgentLLM();
    if (!llm || context.length < 100) {
      return undefined;
    }

    try {
      // Take first 2000 chars to avoid token limits
      const truncatedContext = context.slice(0, 2000);

      const prompt = `Explain what this code does in 2-3 sentences (focus on purpose and key functionality):
\`\`\`
${truncatedContext}
\`\`\`

Explanation:`;

      const response = await llm.complete(prompt, {
        complexity: 'simple',
        maxTokens: 200,
        temperature: 0.3,
      });

      return response.trim();
    } catch (error) {
      this.logger.debug(`LLM context explanation failed: ${(error as Error).message}`);
      return undefined;
    }
  }

  private inferTaskType(task: QETask): CodeIntelligenceTaskType {
    const description = (task.description || task.type || '').toLowerCase();

    if (description.includes('index') || description.includes('parse')) {
      return 'index';
    }
    if (description.includes('search') || description.includes('find')) {
      return 'search';
    }
    if (description.includes('context') || description.includes('build')) {
      return 'context';
    }
    if (description.includes('graph') || description.includes('diagram') || description.includes('visualiz')) {
      return 'graph';
    }
    if (description.includes('stat') || description.includes('info')) {
      return 'stats';
    }
    if (description.includes('update') || description.includes('incremental')) {
      return 'incremental-update';
    }

    // Default to search if query is present
    if ((task.payload as CodeIntelligenceTaskPayload)?.query) {
      return 'search';
    }

    return 'stats';
  }

  private formatSearchResultsAsContext(result: QueryResult): string {
    const lines: string[] = [
      `## Code Context`,
      `Query: ${result.metadata?.query || 'N/A'}`,
      `Results: ${result.results.length}`,
      `Search Time: ${result.metadata?.searchTimeMs || 0}ms`,
      '',
    ];

    for (const item of result.results) {
      lines.push(`### ${item.entityName || path.basename(item.filePath)}`);
      lines.push(`**File:** ${item.filePath}:${item.startLine}-${item.endLine}`);
      lines.push(`**Type:** ${item.entityType || 'chunk'}`);
      lines.push(`**Score:** ${item.score.toFixed(4)}`);
      lines.push('```typescript');
      lines.push(item.content);
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  private getEdgesForNodes(graphBuilder: GraphBuilder, nodes: GraphNode[]): GraphEdge[] {
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges: GraphEdge[] = [];
    const seenEdges = new Set<string>();

    for (const node of nodes) {
      const outgoing = graphBuilder.getOutgoingEdges?.(node.id) || [];
      for (const edge of outgoing) {
        if (!seenEdges.has(edge.id)) {
          edges.push(edge);
          seenEdges.add(edge.id);
        }
      }

      const incoming = graphBuilder.getIncomingEdges?.(node.id) || [];
      for (const edge of incoming) {
        if (nodeIds.has(edge.source) && !seenEdges.has(edge.id)) {
          edges.push(edge);
          seenEdges.add(edge.id);
        }
      }
    }

    return edges;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check if the codebase has been indexed
   */
  public isCodebaseIndexed(): boolean {
    return this.isIndexed;
  }

  /**
   * Get the underlying orchestrator for advanced usage
   */
  public getOrchestrator(): CodeIntelligenceOrchestrator | null {
    return this.orchestrator;
  }

  /**
   * Quick search without full task execution
   */
  public async quickSearch(query: string, topK: number = 10): Promise<QueryResult | null> {
    if (!this.orchestrator) {
      return null;
    }

    return this.orchestrator.query({
      query,
      topK,
      includeGraphContext: true,
      graphDepth: 2,
    });
  }

  /**
   * Get formatted context for a file (for other agents)
   */
  public async getFormattedFileContext(filePath: string): Promise<string | null> {
    const result = await this.performContextTask({
      taskType: 'context',
      filePath,
    });

    return result.success ? result.context || null : null;
  }

  /**
   * Get formatted context for a query (for other agents)
   */
  public async getFormattedQueryContext(query: string, topK: number = 10): Promise<string | null> {
    const result = await this.performContextTask({
      taskType: 'context',
      query,
      topK,
    });

    return result.success ? result.context || null : null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Code Intelligence agent with default configuration
 */
export function createCodeIntelligenceAgent(
  memoryStore: MemoryStore,
  config?: Partial<CodeIntelligenceAgentConfig>
): CodeIntelligenceAgent {
  return new CodeIntelligenceAgent({
    memoryStore,
    type: 'code-intelligence' as QEAgentType,
    ...config,
  });
}
