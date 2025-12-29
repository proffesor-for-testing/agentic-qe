/**
 * Shared Code Intelligence Service
 *
 * Singleton service that provides Code Intelligence capabilities to all QE agents.
 * Manages the CodeIntelligenceOrchestrator lifecycle and provides easy access to
 * searchEngine and graphBuilder for agent injection.
 *
 * @module code-intelligence/service
 */

import { CodeIntelligenceOrchestrator } from '../orchestrator/CodeIntelligenceOrchestrator.js';
import { OrchestratorConfig, QueryResult } from '../orchestrator/types.js';
import { HybridSearchEngine } from '../search/HybridSearchEngine.js';
import { GraphBuilder } from '../graph/GraphBuilder.js';
import * as path from 'path';

/**
 * Code Intelligence Service Configuration
 */
export interface CodeIntelligenceServiceConfig {
  /** Root directory for code analysis (default: process.cwd()) */
  rootDir?: string;
  /** Enable file watching for incremental updates */
  watchEnabled?: boolean;
  /** Enable Git integration for commit-aware indexing */
  gitEnabled?: boolean;
  /** Ollama URL for embeddings (default: http://localhost:11434) */
  ollamaUrl?: string;
  /** PostgreSQL database configuration */
  database?: {
    enabled: boolean;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
}

/**
 * Components available for agent injection
 */
export interface CodeIntelligenceComponents {
  searchEngine: HybridSearchEngine;
  graphBuilder: GraphBuilder;
  orchestrator: CodeIntelligenceOrchestrator;
}

/**
 * Service status information
 */
export interface CodeIntelligenceServiceStatus {
  initialized: boolean;
  healthy: boolean;
  indexedChunks: number;
  graphNodes: number;
  graphEdges: number;
  lastIndexTime?: Date;
  error?: string;
}

// Singleton instance
let instance: CodeIntelligenceService | null = null;

/**
 * Shared Code Intelligence Service
 *
 * Provides a singleton pattern for Code Intelligence that can be used by:
 * - FleetManager (to inject into agents)
 * - CLI commands (for indexing and querying)
 * - MCP server (for Claude Code integration)
 */
export class CodeIntelligenceService {
  private orchestrator: CodeIntelligenceOrchestrator | null = null;
  private config: CodeIntelligenceServiceConfig;
  private initialized: boolean = false;
  private initializing: Promise<void> | null = null;
  private lastIndexTime?: Date;

  private constructor(config: CodeIntelligenceServiceConfig = {}) {
    // Handle null/undefined config gracefully
    const safeConfig = config ?? {};
    this.config = {
      rootDir: safeConfig.rootDir || process.cwd(),
      watchEnabled: safeConfig.watchEnabled ?? false,
      gitEnabled: safeConfig.gitEnabled ?? true,
      ollamaUrl: safeConfig.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
      database: safeConfig.database ?? {
        enabled: true,
        host: process.env.RUVECTOR_HOST || 'localhost',
        port: parseInt(process.env.RUVECTOR_PORT || '5432'),
        database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
        user: process.env.RUVECTOR_USER || 'ruvector',
        password: process.env.RUVECTOR_PASSWORD || 'ruvector',
      },
    };
  }

  /**
   * Get the singleton instance of CodeIntelligenceService
   *
   * @param config - Optional configuration (only used on first call)
   * @returns The singleton instance
   */
  static getInstance(config?: CodeIntelligenceServiceConfig): CodeIntelligenceService {
    if (!instance) {
      instance = new CodeIntelligenceService(config);
    }
    return instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    if (instance) {
      instance.shutdown().catch(console.error);
      instance = null;
    }
  }

  /**
   * Check if Code Intelligence prerequisites are available
   *
   * @returns Object with availability status for each prerequisite
   */
  static async checkPrerequisites(): Promise<{
    ollama: boolean;
    ollamaModel: boolean;
    postgres: boolean;
    allReady: boolean;
    messages: string[];
  }> {
    const messages: string[] = [];
    let ollama = false;
    let ollamaModel = false;
    let postgres = false;

    // Check Ollama
    try {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      const response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        ollama = true;
        const data = await response.json() as { models?: Array<{ name: string }> };
        const models = data.models || [];
        ollamaModel = models.some((m: { name: string }) => m.name.includes('nomic-embed-text'));
        if (!ollamaModel) {
          messages.push('Ollama running but nomic-embed-text model not found. Run: ollama pull nomic-embed-text');
        }
      }
    } catch {
      messages.push('Ollama not available at http://localhost:11434');
    }

    // Check PostgreSQL/RuVector
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.RUVECTOR_HOST || 'localhost',
        port: parseInt(process.env.RUVECTOR_PORT || '5432'),
        database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
        user: process.env.RUVECTOR_USER || 'ruvector',
        password: process.env.RUVECTOR_PASSWORD || 'ruvector',
        connectionTimeoutMillis: 3000,
      });
      await pool.query('SELECT 1');
      await pool.end();
      postgres = true;
    } catch {
      messages.push('RuVector PostgreSQL not available. Run: docker-compose up -d ruvector');
    }

    return {
      ollama,
      ollamaModel,
      postgres,
      allReady: ollama && ollamaModel && postgres,
      messages,
    };
  }

  /**
   * Initialize the Code Intelligence service
   *
   * @throws Error if prerequisites are not met
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this._doInitialize();
    await this.initializing;
    this.initializing = null;
  }

  private async _doInitialize(): Promise<void> {
    // Check prerequisites
    const prereqs = await CodeIntelligenceService.checkPrerequisites();
    if (!prereqs.allReady) {
      throw new Error(
        `Code Intelligence prerequisites not met:\n${prereqs.messages.join('\n')}`
      );
    }

    // Create orchestrator config with defaults
    const orchestratorConfig: Partial<OrchestratorConfig> = {
      rootDir: this.config.rootDir ?? process.cwd(),
      watchEnabled: this.config.watchEnabled ?? false,
      gitEnabled: this.config.gitEnabled ?? true,
      ollamaUrl: this.config.ollamaUrl ?? 'http://localhost:11434',
      database: this.config.database,
    };

    // Initialize orchestrator
    this.orchestrator = new CodeIntelligenceOrchestrator(orchestratorConfig);
    await this.orchestrator.initialize();
    this.initialized = true;

    console.log('[CodeIntelligenceService] Initialized successfully');
  }

  /**
   * Get components for agent injection
   *
   * @returns Object containing searchEngine, graphBuilder, and orchestrator
   * @throws Error if service not initialized
   */
  getComponents(): CodeIntelligenceComponents {
    if (!this.initialized || !this.orchestrator) {
      throw new Error('CodeIntelligenceService not initialized. Call initialize() first.');
    }

    return {
      searchEngine: this.orchestrator.getSearchEngine(),
      graphBuilder: this.orchestrator.getGraphBuilder(),
      orchestrator: this.orchestrator,
    };
  }

  /**
   * Get agent configuration for BaseAgent codeIntelligence option
   *
   * @returns Configuration object for BaseAgentConfig.codeIntelligence
   */
  getAgentConfig(): {
    enabled: boolean;
    searchEngine?: HybridSearchEngine;
    graphBuilder?: GraphBuilder;
  } {
    if (!this.initialized || !this.orchestrator) {
      return { enabled: false };
    }

    return {
      enabled: true,
      searchEngine: this.orchestrator.getSearchEngine(),
      graphBuilder: this.orchestrator.getGraphBuilder(),
    };
  }

  /**
   * Check if the service is initialized and ready
   */
  isReady(): boolean {
    return this.initialized && this.orchestrator !== null;
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<CodeIntelligenceServiceStatus> {
    if (!this.initialized || !this.orchestrator) {
      return {
        initialized: false,
        healthy: false,
        indexedChunks: 0,
        graphNodes: 0,
        graphEdges: 0,
        error: 'Service not initialized',
      };
    }

    try {
      const stats = await this.orchestrator.getStats();
      return {
        initialized: true,
        healthy: true,
        indexedChunks: stats.indexer.totalChunks,
        graphNodes: stats.graph.nodeCount,
        graphEdges: stats.graph.edgeCount,
        lastIndexTime: this.lastIndexTime,
      };
    } catch (error) {
      return {
        initialized: true,
        healthy: false,
        indexedChunks: 0,
        graphNodes: 0,
        graphEdges: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Index a directory
   *
   * @param directory - Directory to index (relative or absolute)
   * @param onProgress - Optional progress callback
   * @returns Indexing results
   */
  async indexDirectory(
    directory: string,
    onProgress?: (progress: { processedFiles: number; totalFiles: number; chunksCreated: number }) => void
  ): Promise<{
    filesIndexed: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    nodesCreated: number;
    edgesCreated: number;
    totalTimeMs: number;
  }> {
    if (!this.initialized || !this.orchestrator) {
      throw new Error('CodeIntelligenceService not initialized');
    }

    const absolutePath = path.isAbsolute(directory)
      ? directory
      : path.join(this.config.rootDir!, directory);

    const result = await this.orchestrator.indexProject(absolutePath, onProgress);
    this.lastIndexTime = new Date();

    return result.stats;
  }

  /**
   * Search the indexed codebase
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Search results with graph context
   */
  async search(
    query: string,
    options: {
      topK?: number;
      includeGraphContext?: boolean;
      graphDepth?: number;
    } = {}
  ): Promise<QueryResult> {
    if (!this.initialized || !this.orchestrator) {
      throw new Error('CodeIntelligenceService not initialized');
    }

    return this.orchestrator.query({
      query,
      topK: options.topK ?? 10,
      includeGraphContext: options.includeGraphContext ?? true,
      graphDepth: options.graphDepth ?? 2,
    });
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.shutdown();
      this.orchestrator = null;
    }
    this.initialized = false;
    console.log('[CodeIntelligenceService] Shutdown complete');
  }
}

// Export convenience functions
export function getCodeIntelligenceService(config?: CodeIntelligenceServiceConfig): CodeIntelligenceService {
  return CodeIntelligenceService.getInstance(config);
}

export async function initializeCodeIntelligence(config?: CodeIntelligenceServiceConfig): Promise<CodeIntelligenceService> {
  const service = CodeIntelligenceService.getInstance(config);
  await service.initialize();
  return service;
}

export async function checkCodeIntelligencePrerequisites() {
  return CodeIntelligenceService.checkPrerequisites();
}
